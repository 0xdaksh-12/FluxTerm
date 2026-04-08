import { useEffect, useState, useCallback } from "react";
import { produce } from "immer";
import { fluxTermService } from "../services/FluxTermService";
import {
  FluxTermDocument,
  FluxTermContext,
  FluxTermBlock,
} from "../../types/MessageProtocol";

const DEFAULT_CONTEXT: FluxTermContext = {
  cwd: "",
  branch: null,
  shell: null,
  connection: "local",
};

export interface UseFluxTermDocumentReturn {
  /** The persisted document preferences (shell, cwd, branch) and optional saved blocks. */
  document: FluxTermDocument;
  /** The live runtime context detected by the extension (real cwd, git branch). */
  context: FluxTermContext;
  /**
   * Update document preferences using an Immer producer.
   * Changes are immediately persisted to disk (suitable for preference fields
   * like shell selection — not for block output streaming).
   */
  updateDocument: (producer: (draft: FluxTermDocument) => void) => void;
  /**
   * Explicitly save the full notebook state to disk.
   * Call this only on deliberate user save actions, not on execution events.
   */
  saveDocument: (blocks: FluxTermBlock[], runtimeContext: FluxTermContext) => void;
}

/**
 * Manages document-level state: the saved FluxTermDocument and the live FluxTermContext
 * received from the extension on init.
 *
 * Responsibilities:
 *   - Request initial state from the extension on mount.
 *   - Store the document preferences (shell, cwd, branch) and saved blocks.
 *   - Store the live context (working directory and git branch detected by the
 *     extension at open time).
 *   - Provide updateDocument() for immediate preference changes that should
 *     auto-persist (e.g. shell selection).
 *   - Provide saveDocument() for the explicit notebook save action.
 */
export const useFluxTermDocument = (): UseFluxTermDocumentReturn => {
  const [document, setDocument] = useState<FluxTermDocument>({});
  const [context, setContext] = useState<FluxTermContext>(DEFAULT_CONTEXT);

  useEffect(() => {
    const unsubscribe = fluxTermService.subscribe((message: any) => {
      if (message.type === "init") {
        // doc may include saved blocks/runtimeContext from a previous explicit save
        setDocument(message.document ?? {});
        setContext(message.context ?? DEFAULT_CONTEXT);
      }
      // Note: the extension does NOT send an "update" message to the webview.
      // Document state is managed locally and persisted via explicit save only.
    });

    // Kick-start: ask the extension for the initial state and live context.
    fluxTermService.init();

    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Update a preference field (e.g. shell selection) and auto-persist.
   * Uses an Immer producer for safe immutable updates.
   */
  const updateDocument = useCallback(
    (producer: (draft: FluxTermDocument) => void) => {
      setDocument((prev) => {
        const next = produce(prev, producer);
        // Auto-persist preference changes immediately
        fluxTermService.saveDocument(next);
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
    (blocks: FluxTermBlock[], runtimeContext: FluxTermContext) => {
      setDocument((prev) => {
        const next: FluxTermDocument = {
          ...prev,
          blocks,
          runtimeContext,
        };
        fluxTermService.saveDocument(next);
        return next;
      });
    },
    [],
  );

  return { document, context, updateDocument, saveDocument };
};
