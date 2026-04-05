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
  const { shells, selectedShell, setSelectedShell } = useShellConfig();

  const {
    blocks,
    runtimeContext,
    createBlock,
    appendOutput,
    setBlockStatus,
    completeBlock,
    deleteBlock,
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

  // Ghost document: trailing entry surface (ghost block command)
  const [ghostDocCommand, setGhostDocCommand] = useState("");

  // Per-document ghost block commands
  const [ghostCommands, setGhostCommands] = useState<Record<string, string>>(
    {},
  );

  // Sync runtime context from extension init
  useEffect(() => {
    setRuntimeContext(docContext);
  }, [docContext, setRuntimeContext]);

  // Restore saved shell preference
  useEffect(() => {
    if (shells.length === 0) return;
    if (document.shell) {
      const saved = shells.find((s) => s.id === document.shell);
      if (saved) { setSelectedShell(saved); return; }
    }
    if (!selectedShell) setSelectedShell(shells[0]);
  }, [shells, document.shell]);

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

  // Merged display context for the context bar
  const displayContext: FluxTermContext = {
    cwd: runtimeContext.cwd || document.cwd || "",
    branch: runtimeContext.branch ?? document.branch ?? null,
    shell: selectedShell,
    connection: runtimeContext.connection ?? "local",
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleShellChange = (shell: ResolvedShell) => {
    setSelectedShell(shell);
    updateDocument((draft) => { draft.shell = shell.id; });
  };

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

  /** Submit from a real document's ghost block. */
  const handleGhostSubmit = useCallback(
    (docId: string, cmd: string) => {
      const shell = displayContext.shell;
      if (!shell || !cmd.trim()) return;
      const blockId = createBlock(
        cmd,
        shell,
        displayContext.cwd,
        displayContext.branch ?? null,
        docId,
      );
      fluxTermService.execute(blockId, cmd, shell, displayContext.cwd);
      setGhostCommands((prev) => ({ ...prev, [docId]: "" }));
      fluxTermService.markDirty();
    },
    [displayContext, createBlock],
  );

  /** Submit from the ghost BlockDocument — creates a new real document. */
  const handleGhostDocSubmit = useCallback(
    (cmd: string) => {
      const shell = displayContext.shell;
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
        displayContext.cwd,
        displayContext.branch ?? null,
        newDocId,
      );
      fluxTermService.execute(blockId, cmd, shell, displayContext.cwd);
      setGhostDocCommand("");
      fluxTermService.markDirty();
    },
    [displayContext, createBlock, persistDocuments],
  );

  /** Submit from an idle store block (created via Add button). */
  const handleIdleBlockSubmit = useCallback(
    (blockId: string, cmd: string) => {
      const shell = displayContext.shell;
      if (!shell || !cmd.trim()) return;
      promoteIdleBlock(blockId, cmd, shell, displayContext.cwd, displayContext.branch ?? null);
      fluxTermService.execute(blockId, cmd, shell, displayContext.cwd);
      fluxTermService.markDirty();
    },
    [displayContext, promoteIdleBlock],
  );

  /** Insert a new idle block immediately after `afterBlockId` in the same doc. */
  const handleAddAfter = useCallback(
    (afterBlockId: string, docId: string) => {
      const shell = displayContext.shell;
      if (!shell) return;
      spliceBlockAfter(
        afterBlockId,
        shell,
        displayContext.cwd,
        displayContext.branch ?? null,
        docId,
      );
      fluxTermService.markDirty();
    },
    [displayContext, spliceBlockAfter],
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
        handleGhostDocSubmit(msg.command);
      } else if (msg.type === "testInputText" && msg.text) {
        const runningBlock = Array.isArray(blocks)
          ? blocks.find((b) => b.status === "running")
          : null;
        if (runningBlock) fluxTermService.sendInput(runningBlock.id, msg.text);
      }
    };
    window.addEventListener("message", handleTestMessage);
    return () => window.removeEventListener("message", handleTestMessage);
  }, [handleGhostDocSubmit, blocks]);

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
          >
            {/* Empty state */}
            {docBlocks.length === 0 && (
              <div
                className="flex flex-col items-center justify-center py-8 opacity-40"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                <span
                  className="codicon codicon-terminal"
                  style={{ fontSize: "32px", marginBottom: "12px" }}
                />
                <div className="text-base mb-1">FluxTerm Notebook</div>
                <div className="text-xs">
                  Type a command below to get started
                </div>
              </div>
            )}

            {/* Real blocks */}
            {docBlocks.map((block) => (
              <Block
                key={block.id}
                block={block}
                context={displayContext}
                availableShells={shells}
                onShellChange={handleShellChange}
                onSubmit={(cmd) => handleIdleBlockSubmit(block.id, cmd)}
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
              onSubmit={(cmd) => handleGhostSubmit(doc.id, cmd)}
              context={displayContext}
              availableShells={shells}
              onShellChange={handleShellChange}
              onAddAfter={() => {
                const shell = displayContext.shell;
                if (!shell) return;
                const last = docBlocks[docBlocks.length - 1];
                if (last) {
                  handleAddAfter(last.id, doc.id);
                }
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
          onSubmit={handleGhostDocSubmit}
          context={displayContext}
          availableShells={shells}
          onShellChange={handleShellChange}
          onAddAfter={() => {}}
        />
      </BlockDocument>
    </div>
  );
}
