// React hook that owns the full in-memory notebook state for the webview.
//
// Design:
//   - All block state is local to this hook; the extension never sees it
//     unless the user explicitly saves.
//   - State mutations use Immer so all updates are immutable and predictable.
//   - Block creation freezes the current runtimeContext into the new block.
//   - Block completion updates runtimeContext using a sequence guard to prevent
//     an earlier block that finishes late from overwriting newer context data.

import { useState, useCallback } from "react";
import { produce } from "immer";
import {
  FluxTermBlock,
  BlockStatus,
  FluxTermContext,
  OutputLine,
  ResolvedShell,
} from "../../types/MessageProtocol";
import { generateId } from "../../utils/helper";

// Internal State Shape
interface NotebookState {
  blocks: FluxTermBlock[];
  runtimeContext: FluxTermContext;
  /** Monotonically increasing counter; next block gets `blockSeq + 1`. */
  blockSeq: number;
}

// useNotebook Hook
export interface UseNotebookReturn {
  blocks: FluxTermBlock[];
  runtimeContext: FluxTermContext;
  createBlock: (
    command: string,
    shell: ResolvedShell,
    cwd: string,
    branch: string | null,
    documentId?: string,
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
  /** Remove all blocks belonging to a given document group. */
  deleteBlocksByDocumentId: (documentId: string) => void;
  reRunBlock: (blockId: string) => string | null;
  setRuntimeContext: (ctx: FluxTermContext) => void;
  resetNotebook: (blocks: FluxTermBlock[], runtimeContext: FluxTermContext) => void;
  /**
   * Insert a new idle block immediately after `afterBlockId`.
   * If `afterBlockId` is not found, appends to the end.
   * Returns the new block's id.
   */
  spliceBlockAfter: (
    afterBlockId: string,
    shell: ResolvedShell,
    cwd: string,
    branch: string | null,
    documentId?: string,
  ) => string;
  /**
   * Atomically promote an idle block to running.
   * Sets command, shell, cwd, branch, and status in one Immer pass.
   * Must be called just before dispatching `fluxTermService.execute`.
   */
  promoteIdleBlock: (
    blockId: string,
    command: string,
    shell: ResolvedShell,
    cwd: string,
    branch: string | null,
  ) => void;
}

/**
 * Manages the full in-memory notebook state.
 *
 * @param initialContext - Runtime context to use when the hook first mounts.
 * @param initialBlocks  - Pre-existing blocks to restore (e.g. from saved file).
 */
export function useNotebook(
  initialContext: FluxTermContext,
  initialBlocks: FluxTermBlock[] = [],
): UseNotebookReturn {
  const [state, setState] = useState<NotebookState>(() => ({
    blocks: initialBlocks,
    runtimeContext: initialContext,
    blockSeq: initialBlocks.reduce((max, b) => Math.max(max, b.seq), 0),
  }));

  // Context management
  /**
   * Overwrite the runtimeContext completely.
   * Called when the extension sends the live context on init.
   * Does NOT affect any existing block's frozen properties.
   */
  const setRuntimeContext = useCallback((ctx: FluxTermContext) => {
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
    (blocks: FluxTermBlock[], runtimeContext: FluxTermContext) => {
      setState({
        blocks,
        runtimeContext,
        blockSeq: blocks.reduce((max, b) => Math.max(max, b.seq), 0),
      });
    },
    [],
  );

  // Block lifecycle
  /**
   * Create a new block and freeze the current runtime context into it.
   * Returns the new block's ID so the caller can dispatch an `execute` message.
   */
  const createBlock = useCallback(
    (
      command: string,
      shell: ResolvedShell,
      cwd: string,
      branch: string | null,
      documentId?: string,
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
            documentId,
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
          // that provide a valid string cwd, and whose seq is not stale.
          if (status !== "killed" && typeof finalCwd === "string") {
            const contextSourceSeq =
              (draft.runtimeContext as any).__sourceSeq ?? 0;
            if (b.seq >= contextSourceSeq) {
              draft.runtimeContext = {
                ...draft.runtimeContext,
                cwd: finalCwd,
                branch:
                  typeof finalBranch === "string"
                    ? finalBranch
                    : draft.runtimeContext.branch,
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
   * Running blocks should be killed first via fluxTermService.killBlock().
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

  /** Remove all blocks whose documentId matches the given value (for deleting a whole document group). */
  const deleteBlocksByDocumentId = useCallback((documentId: string) => {
    setState((prev) =>
      produce(prev, (draft) => {
        draft.blocks = draft.blocks.filter(
          (b) => (b.documentId ?? "default") !== documentId,
        );
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
      return createBlock(block.command, block.shell, block.cwd, block.branch, block.documentId);
    },
    [state.blocks, createBlock],
  );

  /**
   * Insert a new idle block immediately after `afterBlockId`.
   * The seq is set to `blockSeq + 1` so it sorts after all existing blocks;
   * the block array is spliced at the correct index to maintain sort stability.
   */
  const spliceBlockAfter = useCallback(
    (
      afterBlockId: string,
      shell: ResolvedShell,
      cwd: string,
      branch: string | null,
      documentId?: string,
    ): string => {
      const id = generateId();
      setState((prev) =>
        produce(prev, (draft) => {
          const idx = draft.blocks.findIndex((b) => b.id === afterBlockId);
          const insertAt = idx === -1 ? draft.blocks.length : idx + 1;
          const seq = draft.blockSeq + 1;
          draft.blockSeq = seq;
          draft.blocks.splice(insertAt, 0, {
            id,
            seq,
            command: "",
            shell,
            cwd,
            branch,
            documentId,
            status: "idle",
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
   * Atomically promote an idle block to running state.
   * Freezes command, shell, cwd, branch into the block and sets status = "running".
   */
  const promoteIdleBlock = useCallback(
    (
      blockId: string,
      command: string,
      shell: ResolvedShell,
      cwd: string,
      branch: string | null,
    ): void => {
      setState((prev) =>
        produce(prev, (draft) => {
          const block = draft.blocks.find((b) => b.id === blockId);
          if (block && block.status === "idle") {
            block.command = command;
            block.shell = shell;
            block.cwd = cwd;
            block.branch = branch;
            block.status = "running";
          }
        }),
      );
    },
    [],
  );

  return {
    blocks: state.blocks,
    runtimeContext: state.runtimeContext,
    createBlock,
    appendOutput,
    setBlockStatus,
    completeBlock,
    deleteBlock,
    deleteBlocksByDocumentId,
    reRunBlock,
    setRuntimeContext,
    resetNotebook,
    spliceBlockAfter,
    promoteIdleBlock,
  };
}
