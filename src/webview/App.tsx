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
    reRunBlock,
    setRuntimeContext,
    resetNotebook,
    spliceBlockAfter,
    promoteIdleBlock,
  } = useNotebook(docContext, []);

  // ── Document Groups ──────────────────────────────────────────────────────
  const [documents, setDocuments] = useState<BlockDocumentMeta[]>([
    { id: "default", name: DEFAULT_DOC_NAME },
  ]);

  // Ghost document trailing entry surface
  const [ghostDocCommand, setGhostDocCommand] = useState("");

  // Per-document ghost block commands
  const [ghostCommands, setGhostCommands] = useState<Record<string, string>>({});

  // Sync runtime context from extension init
  useEffect(() => {
    setRuntimeContext(docContext);
  }, [docContext, setRuntimeContext]);

  // Restore saved blocks + documents from previously saved .ftx session
  useEffect(() => {
    if (document.blocks && document.blocks.length > 0 && document.runtimeContext) {
      resetNotebook(document.blocks, document.runtimeContext);
    } else if (docContext.cwd) {
      setRuntimeContext(docContext);
    }
    if (document.documents && document.documents.length > 0) {
      setDocuments(document.documents);
    }
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

  // Base context (cwd/branch from runtime — NO global shell).
  // Each block has its own shell tracked locally in Block.tsx.
  const baseContext: FluxTermContext = {
    cwd: runtimeContext.cwd || docContext.cwd || "",
    branch: runtimeContext.branch ?? docContext.branch ?? null,
    shell: null,
    connection: runtimeContext.connection ?? "local",
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Persist updated documents list immediately. */
  const persistDocuments = useCallback(
    (updated: BlockDocumentMeta[]) => {
      updateDocument((draft) => { draft.documents = updated; });
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
        // Always keep at least one document
        const final = updated.length > 0
          ? updated
          : [{ id: generateId(), name: DEFAULT_DOC_NAME }];
        persistDocuments(final);
        return final;
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
    (docId: string, cmd: string, shell: ResolvedShell | null) => {
      if (!shell || !cmd.trim()) return;
      const blockId = createBlock(
        cmd,
        shell,
        baseContext.cwd,
        baseContext.branch ?? null,
        docId,
      );
      fluxTermService.execute(blockId, cmd, shell, baseContext.cwd);
      setGhostCommands((prev) => ({ ...prev, [docId]: "" }));
      fluxTermService.markDirty();
    },
    [baseContext, createBlock],
  );

  /** Submit from the ghost BlockDocument — creates a new real document. */
  const handleGhostDocSubmit = useCallback(
    (cmd: string, shell: ResolvedShell | null) => {
      if (!shell || !cmd.trim()) return;
      const newDocId = generateId();
      const newDoc: BlockDocumentMeta = { id: newDocId, name: DEFAULT_DOC_NAME };
      setDocuments((prev) => {
        const updated = [...prev, newDoc];
        persistDocuments(updated);
        return updated;
      });
      const blockId = createBlock(
        cmd,
        shell,
        baseContext.cwd,
        baseContext.branch ?? null,
        newDocId,
      );
      fluxTermService.execute(blockId, cmd, shell, baseContext.cwd);
      setGhostDocCommand("");
      fluxTermService.markDirty();
    },
    [baseContext, createBlock, persistDocuments],
  );

  /**
   * Submit from any non-running store block.
   * `shell` is the block's local shell (may have been changed by the user).
   * Idle: promote in-place. Done/error/killed: clone a fresh block.
   */
  const handleBlockSubmit = useCallback(
    (blockId: string, cmd: string, shell: ResolvedShell | null) => {
      if (!shell || !cmd.trim()) return;
      const orig = blocks.find((b) => b.id === blockId);
      if (!orig) return;

      if (orig.status === "idle") {
        promoteIdleBlock(blockId, cmd, shell, orig.cwd, orig.branch ?? null);
        fluxTermService.execute(blockId, cmd, shell, orig.cwd);
      } else {
        // done / error / killed — create a fresh block in the same document
        const newId = createBlock(
          cmd,
          shell,
          // Use the block's final cwd if available, otherwise its initial cwd
          orig.finalCwd ?? orig.cwd,
          orig.finalBranch ?? orig.branch,
          orig.documentId ?? documents[0]?.id,
        );
        fluxTermService.execute(newId, cmd, shell, orig.finalCwd ?? orig.cwd);
      }
      fluxTermService.markDirty();
    },
    [blocks, promoteIdleBlock, createBlock, documents],
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

  /** Re-run a completed block (clone with fresh state in same doc). */
  const handleReRun = useCallback(
    (blockId: string) => {
      const orig = blocks.find((b) => b.id === blockId);
      if (!orig) return;
      const newId = reRunBlock(blockId);
      if (!newId) return;
      fluxTermService.execute(newId, orig.command, orig.shell, orig.cwd);
      fluxTermService.markDirty();
    },
    [blocks, reRunBlock],
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
  const sortedBlocks = [...safeBlocks].sort((a, b) => a.seq - b.seq);

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
        const docBlocks = sortedBlocks.filter(
          (b) => (b.documentId ?? "default") === doc.id,
        );
        const isAnyRunning = docBlocks.some((b) => b.status === "running");
        const ghostCmd = ghostCommands[doc.id] ?? "";

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
                onShellChange={() => {/* handled locally in Block via localShell */}}
                onSubmit={(cmd, shell) => handleBlockSubmit(block.id, cmd, shell)}
                onDelete={() => {
                  deleteBlock(block.id);
                  fluxTermService.markDirty();
                }}
                onReRun={() => handleReRun(block.id)}
                onAddAfter={() => handleAddAfter(block.id, doc.id)}
                onKill={() => fluxTermService.killBlock(block.id)}
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
              onSubmit={(cmd, shell) => handleGhostSubmit(doc.id, cmd, shell)}
              context={baseContext}
              availableShells={shells}
              onShellChange={() => {/* handled locally in Block via localShell */}}
              onAddAfter={() => {
                const last = docBlocks[docBlocks.length - 1];
                if (last) handleAddAfter(last.id, doc.id);
              }}
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
          onSubmit={(cmd, shell) => handleGhostDocSubmit(cmd, shell)}
          context={baseContext}
          availableShells={shells}
          onShellChange={() => {/* handled locally in Block via localShell */}}
          onAddAfter={() => {}}
        />
      </BlockDocument>
    </div>
  );
}
