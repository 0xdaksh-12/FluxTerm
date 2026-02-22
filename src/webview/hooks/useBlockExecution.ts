// =============================================================================
// useBlockExecution.ts
//
// Subscribes to execution-related messages from the extension and routes
// them to the appropriate notebookStore mutations.
//
// This hook is the single place that translates raw extension messages into
// typed state transitions. It has no local state of its own.
// =============================================================================

import { useEffect } from "react";
import { flowService } from "../services/FlowService";
import { OutputLine, BlockStatus } from "../../types/MessageProtocol";

interface UseBlockExecutionProps {
  appendOutput: (blockId: string, lines: OutputLine[]) => void;
  completeBlock: (
    blockId: string,
    exitCode: number | null,
    finalCwd: string | null,
    finalBranch: string | null,
    status: "done" | "error" | "killed",
  ) => void;
  setBlockStatus: (blockId: string, status: BlockStatus) => void;
}

/**
 * Routes streaming execution events from the extension to notebookStore.
 *
 * Handled message types:
 *   - "stream"        → appendOutput
 *   - "blockComplete" → completeBlock
 *   - "blockError"    → appendOutput (error line) + setBlockStatus("error")
 */
export function useBlockExecution({
  appendOutput,
  completeBlock,
  setBlockStatus,
}: UseBlockExecutionProps): void {
  useEffect(() => {
    const unsubscribe = flowService.subscribe((message: any) => {
      switch (message.type) {
        case "stream": {
          appendOutput(message.blockId, message.lines);
          break;
        }

        case "blockComplete": {
          completeBlock(
            message.blockId,
            message.exitCode,
            message.finalCwd,
            message.finalBranch,
            message.status,
          );
          break;
        }

        case "blockError": {
          // Surface the error as a visible stderr line, then mark the block.
          appendOutput(message.blockId, [
            { type: "stderr", text: `[Flow Error] ${message.message}` },
          ]);
          setBlockStatus(message.blockId, "error");
          break;
        }

        default:
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [appendOutput, completeBlock, setBlockStatus]);
}
