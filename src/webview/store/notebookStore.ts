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
  /**
   * Monotonically increasing counter used ONLY as a sequence guard for
   * `completeBlock`. Never used for visual ordering — block array order is
   * canonical for rendering.
   */
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
  /**
   * Re-run a completed block in-place: append a datetime separator,
   * reset to "running", and return the same block id for execute dispatch.
   * Returns `null` if the block is not found.
   */
  reRunBlockInPlace: (blockId: string) => string | null;
  /**
   * Clear the visible output of a block.
   * Sets `clearedAt` to the current output length and `clearedAtTime` to now.
   * Lines before this index will be hidden in the OutputArea.
   */
  clearBlockOutput: (blockId: string) => void;
  setRuntimeContext: (ctx: FluxTermContext) => void;
  resetNotebook: (
    blocks: FluxTermBlock[],
    runtimeContext: FluxTermContext,
  ) => void;
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
  /**
   * Update the frozen `cwd` on an idle block.
   * Only mutates blocks with status === "idle" — no-op otherwise.
   * Used by CwdEditor when the user edits the path before submitting.
   */
  updateBlockCwd: (blockId: string, cwd: string) => void;
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
   * Does NOT affect any existing block's properties.
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
      // Inject a datetime separator as the very first output line so every
      // run (including the first) has a [Datetime] header at the top.
      const separator: OutputLine = {
        type: "separator",
        text: new Date().toISOString(),
      };
      setState((prev) =>
        produce(prev, (draft) => {
          const seq = draft.blockSeq + 1;
          draft.blockSeq = seq;
          draft.blocks.push({
            id,
            seq,
            command,
            shell,
            cwd,
            branch,
            documentId,
            status: "running",
            output: [separator],
            exitCode: null,
            finalCwd: null,
            finalBranch: null,
            createdAt: Date.now(),
            clearedAt: null,
            clearedAtTime: null,
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
   * **Sequence guard**: runtimeContext is updated only if this block's
   * `lastRunSeq` (set by reRunBlockInPlace) or `seq` (set at creation) is
   * >= the seq of whichever block last wrote to the context. This prevents
   * a slow earlier execution from overwriting the context set by a later one.
   * Using `lastRunSeq` decouples the guard from the visual ordering `seq`.
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
          // that provide a valid cwd, and whose run is not stale.
          if (status !== "killed" && typeof finalCwd === "string") {
            // Prefer lastRunSeq (set by reRunBlockInPlace) over seq so the
            // sequence guard works correctly after in-place re-runs.
            const blockRunSeq = (b as any).lastRunSeq ?? b.seq;
            const contextSourceSeq =
              (draft.runtimeContext as any).__sourceSeq ?? 0;
            if (blockRunSeq >= contextSourceSeq) {
              draft.runtimeContext = {
                ...draft.runtimeContext,
                cwd: finalCwd,
                branch:
                  typeof finalBranch === "string"
                    ? finalBranch
                    : draft.runtimeContext.branch,
              };
              (draft.runtimeContext as any).__sourceSeq = blockRunSeq;
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
   * Re-run a completed block **in-place** (no cloning).
   *
   * 1. Guards against re-running a block that is already running.
   * 2. Appends a datetime separator so old logs are preserved above it.
   * 3. Resets status → "running" and clears completion metadata.
   * 4. Bumps `blockSeq` (the sequence guard counter) WITHOUT touching
   *    `block.seq` — so the block stays in its visual position after re-run.
   *    The new `blockSeq` value is stored on the block as `lastRunSeq` for
   *    the `completeBlock` sequence guard to use.
   * Returns `null` if the block is not found or is already running.
   */
  const reRunBlockInPlace = useCallback((blockId: string): string | null => {
    let found = false;
    setState((prev) =>
      produce(prev, (draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        // Guard: never re-run a block that is already running
        if (!block || block.status === "running") {
          return;
        }
        found = true;
        // Advance the sequence guard counter but do NOT change block.seq.
        // block.seq controls visual ordering; blockSeq guards stale completions.
        const runSeq = draft.blockSeq + 1;
        draft.blockSeq = runSeq;
        (block as any).lastRunSeq = runSeq;
        // Preserve old output, append a datetime separator before new output.
        block.output.push({
          type: "separator",
          text: new Date().toISOString(),
        });
        block.status = "running";
        block.exitCode = null;
        block.finalCwd = null;
        block.finalBranch = null;
        // clearedAt / clearedAtTime are intentionally preserved.
      }),
    );
    return found ? blockId : null;
  }, []);

  /**
   * Hide all current output lines for a block.
   *
   * Sets `clearedAt` to the current output length — OutputArea will only
   * render lines at or after this index. `clearedAtTime` is set to now
   * so a datetime header can be shown before the first post-clear line.
   */
  const clearBlockOutput = useCallback((blockId: string): void => {
    setState((prev) =>
      produce(prev, (draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block) {
          block.clearedAt = block.output.length;
          block.clearedAtTime = Date.now();
        }
      }),
    );
  }, []);

  /**
   * Insert a new idle block immediately after `afterBlockId`.
   *
   * Visual ordering is determined by **array position** — the block is spliced
   * at `idx + 1` which is the canonical render order. `seq` is intentionally
   * NOT bumped here so the block doesn't sort to the end when App.tsx sorts by
   * seq. Instead we assign a fractional seq between the source block and the
   * next one so it always lands in the right slot if sorting ever resumes.
   *
   * Note: App.tsx currently removes the sort entirely (Bug 10 fix) and relies
   * on array order directly, so the seq value here is only used as a guard
   * baseline for this new block's first run.
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
          // Assign a seq that places this block between the source and the
          // next existing block, so the sequence guard works correctly on first run.
          const sourceSeq = idx !== -1 ? draft.blocks[idx].seq : draft.blockSeq;
          const nextSeq =
            insertAt < draft.blocks.length
              ? draft.blocks[insertAt].seq
              : draft.blockSeq + 2;
          const seq = (sourceSeq + nextSeq) / 2;
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
            clearedAt: null,
            clearedAtTime: null,
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
   * Also injects the datetime separator and sets `createdAt` to now, matching
   * the behaviour of `createBlock` for consistent output history headers.
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
            // Inject the datetime separator so promoted blocks have the same
            // output header structure as blocks created via createBlock.
            block.output = [{ type: "separator", text: new Date().toISOString() }];
            block.createdAt = Date.now();
          }
        }),
      );
    },
    [],
  );

  /**
   * Update the `cwd` on an idle block (e.g. user edits the path before submitting).
   * No-op if the block is not idle — cwd on running/done blocks reflects the
   * environment at execution time and is not changed here.
   */
  const updateBlockCwd = useCallback((blockId: string, cwd: string): void => {
    setState((prev) =>
      produce(prev, (draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block && block.status === "idle") {
          block.cwd = cwd;
        }
      }),
    );
  }, []);

  return {
    blocks: state.blocks,
    runtimeContext: state.runtimeContext,
    createBlock,
    appendOutput,
    setBlockStatus,
    completeBlock,
    deleteBlock,
    deleteBlocksByDocumentId,
    reRunBlockInPlace,
    clearBlockOutput,
    setRuntimeContext,
    resetNotebook,
    spliceBlockAfter,
    promoteIdleBlock,
    updateBlockCwd,
  };
}
