// =============================================================================
// notebookStore.ts
//
// React hook that owns the full in-memory notebook state for the webview.
//
// Design:
//   - All block state is local to this hook; the extension never sees it
//     unless the user explicitly saves.
//   - State mutations use Immer so all updates are immutable and predictable.
//   - Block creation freezes the current runtimeContext into the new block.
//   - Block completion updates runtimeContext using a sequence guard to prevent
//     an earlier block that finishes late from overwriting newer context data.
// =============================================================================

import { useState, useCallback } from "react";
import { produce } from "immer";
import {
  FlowBlock,
  BlockStatus,
  FlowContext,
  OutputLine,
} from "../../types/MessageProtocol";
import { generateId } from "../../utils/helper";

// ─── Internal State Shape ─────────────────────────────────────────────────────

interface NotebookState {
  blocks: FlowBlock[];
  runtimeContext: FlowContext;
  /** Monotonically increasing counter; next block gets `blockSeq + 1`. */
  blockSeq: number;
}

// ─── useNotebook Hook ─────────────────────────────────────────────────────────

export interface UseNotebookReturn {
  blocks: FlowBlock[];
  runtimeContext: FlowContext;
  createBlock: (
    command: string,
    shell: string,
    cwd: string,
    branch: string | null,
  ) => string;
  appendOutput: (blockId: string, lines: OutputLine[]) => void;
  setBlockStatus: (blockId: string, status: BlockStatus) => void;
  completeBlock: (
    blockId: string,
    exitCode: number | null,
    finalCwd: string | null,
    finalBranch: string | null,
    status: "done" | "error" | "killed",
  ) => void;
  deleteBlock: (blockId: string) => void;
  reRunBlock: (blockId: string) => string | null;
  setRuntimeContext: (ctx: FlowContext) => void;
  resetNotebook: (blocks: FlowBlock[], runtimeContext: FlowContext) => void;
}

/**
 * Manages the full in-memory notebook state.
 *
 * @param initialContext - Runtime context to use when the hook first mounts.
 * @param initialBlocks  - Pre-existing blocks to restore (e.g. from saved file).
 */
export function useNotebook(
  initialContext: FlowContext,
  initialBlocks: FlowBlock[] = [],
): UseNotebookReturn {
  const [state, setState] = useState<NotebookState>(() => ({
    blocks: initialBlocks,
    runtimeContext: initialContext,
    blockSeq: initialBlocks.reduce((max, b) => Math.max(max, b.seq), 0),
  }));

  // ─── Context management ─────────────────────────────────────────────────────

  /**
   * Overwrite the runtimeContext completely.
   * Called when the extension sends the live context on init.
   * Does NOT affect any existing block's frozen properties.
   */
  const setRuntimeContext = useCallback((ctx: FlowContext) => {
    setState((prev) =>
      produce(prev, (draft) => {
        draft.runtimeContext = ctx;
      }),
    );
  }, []);

  /**
   * Reset the entire notebook (blocks + context).
   * Used when loading a previously saved document.
   */
  const resetNotebook = useCallback(
    (blocks: FlowBlock[], runtimeContext: FlowContext) => {
      setState({
        blocks,
        runtimeContext,
        blockSeq: blocks.reduce((max, b) => Math.max(max, b.seq), 0),
      });
    },
    [],
  );

  // ─── Block lifecycle ────────────────────────────────────────────────────────

  /**
   * Create a new block and freeze the current runtime context into it.
   * Returns the new block's ID so the caller can dispatch an `execute` message.
   */
  const createBlock = useCallback(
    (
      command: string,
      shell: string,
      cwd: string,
      branch: string | null,
    ): string => {
      const id = generateId();
      setState((prev) =>
        produce(prev, (draft) => {
          const seq = draft.blockSeq + 1;
          draft.blockSeq = seq;
          draft.blocks.push({
            id,
            seq,
            command,
            shell, // frozen at creation
            cwd, // frozen at creation
            branch, // frozen at creation
            status: "running",
            output: [],
            exitCode: null,
            finalCwd: null,
            finalBranch: null,
            createdAt: Date.now(),
          });
        }),
      );
      return id;
    },
    [],
  );

  /**
   * Append streamed output lines to a block's output array.
   * Called for every `stream` message received from the extension.
   */
  const appendOutput = useCallback((blockId: string, lines: OutputLine[]) => {
    setState((prev) =>
      produce(prev, (draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block) {
          block.output.push(...lines);
        }
      }),
    );
  }, []);

  /**
   * Set a block's status without updating completion metadata.
   * Useful for immediate "killed" status before the process exits.
   */
  const setBlockStatus = useCallback((blockId: string, status: BlockStatus) => {
    setState((prev) =>
      produce(prev, (draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block) {
          block.status = status;
        }
      }),
    );
  }, []);

  /**
   * Mark a block as complete and update the global runtimeContext.
   *
   * **Sequence guard**: runtimeContext is updated only if this block's `seq`
   * is >= the seq of whichever block last wrote to the context. This prevents
   * a slow earlier block (lower seq) from overwriting the context after a
   * faster later block (higher seq) has already set a newer path.
   */
  const completeBlock = useCallback(
    (
      blockId: string,
      exitCode: number | null,
      finalCwd: string | null,
      finalBranch: string | null,
      status: "done" | "error" | "killed",
    ) => {
      setState((prev) => {
        const block = prev.blocks.find((b) => b.id === blockId);
        if (!block) {
          return prev;
        }

        return produce(prev, (draft) => {
          const b = draft.blocks.find((bl) => bl.id === blockId)!;
          b.status = status;
          b.exitCode = exitCode;
          b.finalCwd = finalCwd;
          b.finalBranch = finalBranch;

          // Only advance the runtime context for non-killed completions
          // that provide a new cwd, and whose seq is not stale.
          if (status !== "killed" && finalCwd) {
            const contextSourceSeq =
              (draft.runtimeContext as any).__sourceSeq ?? 0;
            if (b.seq >= contextSourceSeq) {
              draft.runtimeContext = {
                ...draft.runtimeContext,
                cwd: finalCwd,
                branch: finalBranch ?? draft.runtimeContext.branch,
              };
              // Store the source seq on the context object for future guards.
              (draft.runtimeContext as any).__sourceSeq = b.seq;
            }
          }
        });
      });
    },
    [],
  );

  /**
   * Remove a block from the list.
   * Running blocks should be killed first via flowService.killBlock().
   */
  const deleteBlock = useCallback((blockId: string) => {
    setState((prev) =>
      produce(prev, (draft) => {
        const idx = draft.blocks.findIndex((b) => b.id === blockId);
        if (idx !== -1) {
          draft.blocks.splice(idx, 1);
        }
      }),
    );
  }, []);

  /**
   * Clone a completed block into a new "running" block using the original
   * block's frozen shell, cwd, and branch.
   * Returns the new block ID or null if the source block is not found.
   */
  const reRunBlock = useCallback(
    (blockId: string): string | null => {
      // Capture the source block properties synchronously before setState
      const block = state.blocks.find((b) => b.id === blockId);
      if (!block) {
        return null;
      }
      return createBlock(block.command, block.shell, block.cwd, block.branch);
    },
    [state.blocks, createBlock],
  );

  return {
    blocks: state.blocks,
    runtimeContext: state.runtimeContext,
    createBlock,
    appendOutput,
    setBlockStatus,
    completeBlock,
    deleteBlock,
    reRunBlock,
    setRuntimeContext,
    resetNotebook,
  };
}
