import { useEffect, useRef, useCallback, useState } from "react";
import { useFluxTermDocument } from "./hooks/useFluxTermDocument";
import { useShellConfig } from "./hooks/useShellConfig";
import { useNotebook } from "./store/notebookStore";
import { useBlockExecution } from "./hooks/useBlockExecution";
import { Block } from "./components/block";
import { BlockDocument } from "./components/BlockDocument";
import { fluxTermService } from "./services/FluxTermService";
import {
  FluxTermContext,
  ResolvedShell,
  BlockDocumentMeta,
} from "../types/MessageProtocol";
import { generateId } from "../utils/helper";

const ANIM_CSS = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
`;

/** Default document name used when none is specified. */
const DEFAULT_DOC_NAME = "Workspace";

export default function App() {
  const {
    document,
    context: docContext,
    updateDocument,
  } = useFluxTermDocument();

  // `shells` = list of available shells from the extension.
  // There is NO global selected shell — each block tracks its own shell locally.
  const { shells } = useShellConfig();

  const {
    blocks,
    runtimeContext,
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
  } = useNotebook(docContext, []);

  //  Document Groups
  // Empty on new files — the ghost BlockDocument is the sole entry surface.
  const [documents, setDocuments] = useState<BlockDocumentMeta[]>([]);

  // Ghost document trailing entry surface
  const [ghostDocCommand, setGhostDocCommand] = useState("");

  // Per-document ghost block commands
  const [ghostCommands, setGhostCommands] = useState<Record<string, string>>(
    {},
  );

  // Per-document ghost block CWD overrides (edited via CwdEditor)
  const [ghostCwds, setGhostCwds] = useState<Record<string, string>>({});

  // Ghost BlockDocument's ghost block CWD override
  const [ghostDocCwd, setGhostDocCwd] = useState("");

  // Sync runtime context from extension init
  useEffect(() => {
    setRuntimeContext(docContext);
  }, [docContext, setRuntimeContext]);

  // Restore saved blocks + documents from previously saved .ftx session
  useEffect(() => {
    if (
      document.blocks &&
      document.blocks.length > 0 &&
      document.runtimeContext
    ) {
      resetNotebook(document.blocks, document.runtimeContext);
    } else if (docContext.cwd) {
      setRuntimeContext(docContext);
    }

    if (document.documents && document.documents.length > 0) {
      // Normal restore: documents were persisted
      setDocuments(document.documents);
    } else if (document.blocks && document.blocks.length > 0) {
      // Legacy format: blocks exist but no documents array saved.
      // Synthesise document groups from the block documentIds.
      const seen = new Set<string>();
      const synth: BlockDocumentMeta[] = [];
      for (const b of document.blocks as any[]) {
        const id = b.documentId ?? "default";
        if (!seen.has(id)) {
          seen.add(id);
          synth.push({ id, name: DEFAULT_DOC_NAME });
        }
      }
      setDocuments(synth);
    }
    // New file: documents stays [], ghost BlockDocument is shown
  }, [docContext.cwd]);

  // Wire execution events from extension to notebookStore
  useBlockExecution({ appendOutput, completeBlock, setBlockStatus });

  // Keep a ref to the latest data for the requestSave handler
  const latestDataRef = useRef({ blocks, runtimeContext, document, documents });
  useEffect(() => {
    latestDataRef.current = { blocks, runtimeContext, document, documents };
  }, [blocks, runtimeContext, document, documents]);

  // Handle requestSave from extension
  useEffect(() => {
    const unsubscribe = fluxTermService.subscribe((message: any) => {
      if (message.type === "requestSave") {
        const d = latestDataRef.current;
        fluxTermService.sendSaveResponse({
          ...d.document,
          blocks: d.blocks,
          runtimeContext: d.runtimeContext,
          documents: d.documents,
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Inject animation CSS once
  const styleInjected = useRef(false);
  if (!styleInjected.current) {
    styleInjected.current = true;
    const style = window.document.createElement("style");
    style.textContent = ANIM_CSS;
    window.document.head.appendChild(style);
  }

  // Base context (cwd/branch/shell from runtime).
  // shell is inherited from runtimeContext so ghost blocks can default to it.
  // Each real block still tracks its own shell locally in Block.tsx.
  const baseContext: FluxTermContext = {
    cwd: runtimeContext.cwd || docContext.cwd || "",
    branch: runtimeContext.branch ?? docContext.branch ?? null,
    shell: runtimeContext.shell ?? null,
    connection: runtimeContext.connection ?? "local",
  };

  /** Persist updated documents list immediately. */
  const persistDocuments = useCallback(
    (updated: BlockDocumentMeta[]) => {
      updateDocument((draft) => {
        draft.documents = updated;
      });
    },
    [updateDocument],
  );

  /** Rename a document group and persist. */
  const handleDocumentRename = useCallback(
    (docId: string, name: string) => {
      setDocuments((prev) => {
        const updated = prev.map((d) => (d.id === docId ? { ...d, name } : d));
        persistDocuments(updated);
        return updated;
      });
    },
    [persistDocuments],
  );

  /** Delete a document group and all its blocks. */
  const handleDeleteDocument = useCallback(
    (docId: string) => {
      deleteBlocksByDocumentId(docId);
      setDocuments((prev) => {
        const updated = prev.filter((d) => d.id !== docId);
        // Allow empty — the ghost BlockDocument at the bottom is the re-entry surface
        persistDocuments(updated);
        return updated;
      });
      fluxTermService.markDirty();
    },
    [deleteBlocksByDocumentId, persistDocuments],
  );

  /**
   * Submit from a real document's ghost block.
   * `shell` comes from the Block component's local shell state.
   */
  const handleGhostSubmit = useCallback(
    (
      docId: string,
      cmd: string,
      shell: ResolvedShell | null,
      cwdOverride?: string,
    ) => {
      if (!shell || !cmd.trim()) return;
      const effectiveCwd = cwdOverride ?? ghostCwds[docId] ?? baseContext.cwd;
      const blockId = createBlock(
        cmd,
        shell,
        effectiveCwd,
        baseContext.branch ?? null,
        docId,
      );
      fluxTermService.execute(blockId, cmd, shell, effectiveCwd);
      setGhostCommands((prev) => ({ ...prev, [docId]: "" }));
      // Clear the CWD override after submit — next ghost inherits fresh context
      setGhostCwds((prev) => ({ ...prev, [docId]: "" }));
      fluxTermService.markDirty();
    },
    [baseContext, createBlock, ghostCwds],
  );

  /** Submit from the ghost BlockDocument — creates a new real document. */
  const handleGhostDocSubmit = useCallback(
    (cmd: string, shell: ResolvedShell | null, cwdOverride?: string) => {
      if (!shell || !cmd.trim()) return;
      const newDocId = generateId();
      const newDoc: BlockDocumentMeta = {
        id: newDocId,
        name: DEFAULT_DOC_NAME,
      };
      setDocuments((prev) => {
        const updated = [...prev, newDoc];
        persistDocuments(updated);
        return updated;
      });
      const effectiveCwd = cwdOverride ?? (ghostDocCwd || baseContext.cwd);
      const blockId = createBlock(
        cmd,
        shell,
        effectiveCwd,
        baseContext.branch ?? null,
        newDocId,
      );
      fluxTermService.execute(blockId, cmd, shell, effectiveCwd);
      setGhostDocCommand("");
      setGhostDocCwd("");
      fluxTermService.markDirty();
    },
    [baseContext, createBlock, persistDocuments, ghostDocCwd],
  );

  /**
   * Submit from any non-running store block.
   * `shell` is the block's local shell (may have been changed by the user).
   * `cwdOverride` is set when the user edited the CWD via CwdEditor before submitting.
   * Idle: promote in-place. Done/error/killed: re-run in-place with the NEW cmd.
   */
  const handleBlockSubmit = useCallback(
    (
      blockId: string,
      cmd: string,
      shell: ResolvedShell | null,
      cwdOverride?: string,
    ) => {
      if (!shell || !cmd.trim()) return;
      const orig = blocks.find((b) => b.id === blockId);
      if (!orig) return;

      if (orig.status === "idle") {
        const effectiveCwd = cwdOverride ?? orig.cwd;
        promoteIdleBlock(
          blockId,
          cmd,
          shell,
          effectiveCwd,
          orig.branch ?? null,
        );
        fluxTermService.execute(blockId, cmd, shell, effectiveCwd);
      } else {
        // done / error / killed — re-run the same block in-place.
        // BUG 1 FIX: use `cmd` (the user's current textarea text), not
        // `orig.command` (the command frozen in the store from the last run).
        const sameId = reRunBlockInPlace(blockId);
        if (!sameId) return;
        const effectiveCwd = cwdOverride ?? orig.finalCwd ?? orig.cwd;
        fluxTermService.execute(sameId, cmd, shell, effectiveCwd);
      }
      fluxTermService.markDirty();
    },
    [blocks, promoteIdleBlock, reRunBlockInPlace],
  );

  /**
   * Insert a new idle block immediately after `afterBlockId`.
   * Inherits shell and cwd from the source block — not from a global context.
   */
  const handleAddAfter = useCallback(
    (afterBlockId: string, docId: string) => {
      const orig = blocks.find((b) => b.id === afterBlockId);
      if (!orig) return;
      // Inherit the source block's shell and its post-execution cwd/branch
      spliceBlockAfter(
        afterBlockId,
        orig.shell,
        orig.finalCwd ?? orig.cwd,
        orig.finalBranch ?? orig.branch,
        docId,
      );
      fluxTermService.markDirty();
    },
    [blocks, spliceBlockAfter],
  );

  /** Re-run a completed block in-place (same block, preserved output + datetime separator). */
  const handleReRun = useCallback(
    (blockId: string) => {
      const orig = blocks.find((b) => b.id === blockId);
      if (!orig) return;
      const sameId = reRunBlockInPlace(blockId);
      if (!sameId) return;
      fluxTermService.execute(
        sameId,
        orig.command,
        orig.shell,
        orig.finalCwd ?? orig.cwd,
      );
      fluxTermService.markDirty();
    },
    [blocks, reRunBlockInPlace],
  );

  /** Clear the visible output of a block (sets clearedAt to current output length). */
  const handleClearOutput = useCallback(
    (blockId: string) => {
      clearBlockOutput(blockId);
      fluxTermService.markDirty();
    },
    [clearBlockOutput],
  );

  // E2E test hook
  useEffect(() => {
    const handleTestMessage = (e: MessageEvent<any>) => {
      const msg = e.data;
      if (msg.type === "testRunCommand" && msg.command) {
        // Use first available shell for test commands
        handleGhostDocSubmit(msg.command, shells[0] ?? null);
      } else if (msg.type === "testInputText" && msg.text) {
        const runningBlock = Array.isArray(blocks)
          ? blocks.find((b) => b.status === "running")
          : null;
        if (runningBlock) fluxTermService.sendInput(runningBlock.id, msg.text);
      }
    };
    window.addEventListener("message", handleTestMessage);
    return () => window.removeEventListener("message", handleTestMessage);
  }, [handleGhostDocSubmit, blocks, shells]);

  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  // BUG 10 FIX: Do NOT sort by seq — array insertion order from the store IS
  // the canonical visual order. spliceBlockAfter uses array.splice() to place
  // blocks correctly; re-sorting undoes that.
  const orderedBlocks = safeBlocks;

  return (
    <div
      className="flex flex-col font-mono text-sm antialiased"
      style={{
        background: "var(--vscode-editor-background)",
        color: "var(--vscode-editor-foreground)",
        padding: "1rem",
        boxSizing: "border-box",
        gap: "1rem",
        minHeight: "100%",
      }}
    >
      {/* Real documents */}
      {documents.map((doc) => {
        const docBlocks = orderedBlocks.filter(
          (b) => (b.documentId ?? "default") === doc.id,
        );
        const isAnyRunning = docBlocks.some((b) => b.status === "running");
        const ghostCmd = ghostCommands[doc.id] ?? "";
        // BUG 4 FIX: ghost block CWD inherits from the last completed block in
        // THIS document — not from the global runtimeContext (which could be
        // contaminated by completions from other documents).
        const lastDocCwd =
          docBlocks.filter((b) => b.finalCwd).at(-1)?.finalCwd ??
          baseContext.cwd;

        return (
          <BlockDocument
            key={doc.id}
            groupName={doc.name}
            onGroupNameChange={(name) => handleDocumentRename(doc.id, name)}
            isAnyRunning={isAnyRunning}
            onRunAll={() => {
              docBlocks
                .filter((b) => b.status === "done" || b.status === "error")
                .forEach((b) => handleReRun(b.id));
            }}
            onDelete={() => handleDeleteDocument(doc.id)}
          >
            {/* Real blocks — each gets its own per-block context (shell from frozen block.shell) */}
            {docBlocks.map((block) => (
              <Block
                key={block.id}
                block={block}
                context={{ ...baseContext, shell: block.shell }}
                availableShells={shells}
                onShellChange={() => {
                  /* handled locally in Block via localShell */
                }}
                onSubmit={(cmd, shell, cwdOverride) =>
                  handleBlockSubmit(block.id, cmd, shell, cwdOverride)
                }
                onDelete={() => {
                  deleteBlock(block.id);
                  fluxTermService.markDirty();
                }}
                onReRun={() => handleReRun(block.id)}
                onClearOutput={() => handleClearOutput(block.id)}
                onAddAfter={() => handleAddAfter(block.id, doc.id)}
                onKill={() => fluxTermService.killBlock(block.id)}
                onCwdChange={(newCwd) => {
                  // For idle blocks, persist the CWD into the store so it survives re-renders.
                  // For completed blocks it is kept in Block's localCwd state only.
                  if (block.status === "idle") updateBlockCwd(block.id, newCwd);
                }}
              />
            ))}

            {/* Ghost Block — trailing entry surface for this document */}
            <Block
              key={`ghost-${doc.id}`}
              block={null}
              isGhost
              ghostCommand={ghostCmd}
              onGhostCommandChange={(v) =>
                setGhostCommands((prev) => ({ ...prev, [doc.id]: v }))
              }
              onSubmit={(cmd, shell, cwdOverride) =>
                handleGhostSubmit(doc.id, cmd, shell, cwdOverride)
              }
              context={{ ...baseContext, cwd: lastDocCwd }}
              availableShells={shells}
              onShellChange={() => {
                /* handled locally in Block via localShell */
              }}
              onAddAfter={() => {
                const last = docBlocks[docBlocks.length - 1];
                if (last) handleAddAfter(last.id, doc.id);
              }}
              onCwdChange={(newCwd) =>
                setGhostCwds((prev) => ({ ...prev, [doc.id]: newCwd }))
              }
            />
          </BlockDocument>
        );
      })}

      {/* Ghost BlockDocument — always at the bottom, dimmed */}
      <BlockDocument
        key="ghost-doc"
        groupName={DEFAULT_DOC_NAME}
        isGhost
        isAnyRunning={false}
        onRunAll={() => {}}
      >
        <Block
          key="ghost-doc-block"
          block={null}
          isGhost
          ghostCommand={ghostDocCommand}
          onGhostCommandChange={setGhostDocCommand}
          onSubmit={(cmd, shell, cwdOverride) =>
            handleGhostDocSubmit(cmd, shell, cwdOverride)
          }
          context={baseContext}
          availableShells={shells}
          onShellChange={() => {
            /* handled locally in Block via localShell */
          }}
          onAddAfter={() => {}}
          onCwdChange={(newCwd) => setGhostDocCwd(newCwd)}
        />
      </BlockDocument>
    </div>
  );
}
