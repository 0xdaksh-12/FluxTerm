// =============================================================================
// useFlowDocument.ts
//
// Manages document-level state: the saved FlowDocument and the live FlowContext
// received from the extension on init.
//
// Responsibilities:
//   - Request initial state from the extension on mount.
//   - Store the document preferences (shell, cwd, branch) and saved blocks.
//   - Store the live context (working directory and git branch detected by the
//     extension at open time).
//   - Provide updateDocument() for immediate preference changes that should
//     auto-persist (e.g. shell selection).
//   - Provide saveDocument() for the explicit notebook save action.
// =============================================================================

import { useEffect, useState, useCallback } from "react";
import { produce } from "immer";
import { flowService } from "../services/FlowService";
import {
  FlowDocument,
  FlowContext,
  FlowBlock,
} from "../../types/MessageProtocol";

const DEFAULT_CONTEXT: FlowContext = {
  cwd: "",
  branch: null,
  shell: null,
  connection: "local",
};

export interface UseFlowDocumentReturn {
  /** The persisted document preferences (shell, cwd, branch) and optional saved blocks. */
  document: FlowDocument;
  /** The live runtime context detected by the extension (real cwd, git branch). */
  context: FlowContext;
  /**
   * Update document preferences using an Immer producer.
   * Changes are immediately persisted to disk (suitable for preference fields
   * like shell selection — not for block output streaming).
   */
  updateDocument: (producer: (draft: FlowDocument) => void) => void;
  /**
   * Explicitly save the full notebook state to disk.
   * Call this only on deliberate user save actions, not on execution events.
   */
  saveDocument: (blocks: FlowBlock[], runtimeContext: FlowContext) => void;
}

export const useFlowDocument = (): UseFlowDocumentReturn => {
  const [document, setDocument] = useState<FlowDocument>({});
  const [context, setContext] = useState<FlowContext>(DEFAULT_CONTEXT);

  useEffect(() => {
    const unsubscribe = flowService.subscribe((message: any) => {
      if (message.type === "init") {
        // doc may include saved blocks/runtimeContext from a previous explicit save
        setDocument(message.document ?? {});
        setContext(message.context ?? DEFAULT_CONTEXT);
      } else if (message.type === "update") {
        // Extension echoes back after writing — keep local state in sync
        if (message.document) {
          setDocument(message.document);
        }
        if (message.context) {
          setContext(message.context);
        }
      }
    });

    // Kick-start: ask the extension for the initial state and live context.
    flowService.init();

    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Update a preference field (e.g. shell selection) and auto-persist.
   * Uses an Immer producer for safe immutable updates.
   */
  const updateDocument = useCallback(
    (producer: (draft: FlowDocument) => void) => {
      setDocument((prev) => {
        const next = produce(prev, producer);
        // Auto-persist preference changes immediately
        flowService.saveDocument(next);
        return next;
      });
    },
    [],
  );

  /**
   * Persist the full notebook state to disk.
   * This is an intentional user action — not triggered by streaming events.
   */
  const saveDocument = useCallback(
    (blocks: FlowBlock[], runtimeContext: FlowContext) => {
      setDocument((prev) => {
        const next: FlowDocument = {
          ...prev,
          blocks,
          runtimeContext,
        };
        flowService.saveDocument(next);
        return next;
      });
    },
    [],
  );

  return { document, context, updateDocument, saveDocument };
};
