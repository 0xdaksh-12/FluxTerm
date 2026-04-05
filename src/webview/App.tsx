import { useEffect, useRef, useCallback, useState } from "react";
import { useFluxTermDocument } from "./hooks/useFluxTermDocument";
import { useShellConfig } from "./hooks/useShellConfig";
import { useNotebook } from "./store/notebookStore";
import { useBlockExecution } from "./hooks/useBlockExecution";
import { Block } from "./components/block";
import { BlockDocument } from "./components/BlockDocument";
import { fluxTermService } from "./services/FluxTermService";
import { FluxTermContext, ResolvedShell } from "../types/MessageProtocol";

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

  // Ghost block: the always-present trailing input slot (not in store)
  const [ghostCommand, setGhostCommand] = useState("");

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

  // Restore saved blocks from previously saved .ftx session
  useEffect(() => {
    if (document.blocks && document.blocks.length > 0 && document.runtimeContext) {
      resetNotebook(document.blocks, document.runtimeContext);
    } else if (docContext.cwd) {
      setRuntimeContext(docContext);
    }
  }, [docContext.cwd]);

  // Wire execution events from extension to notebookStore
  useBlockExecution({ appendOutput, completeBlock, setBlockStatus });

  // Keep a ref to the latest data for the requestSave handler
  const latestDataRef = useRef({ blocks, runtimeContext, document });
  useEffect(() => {
    latestDataRef.current = { blocks, runtimeContext, document };
  }, [blocks, runtimeContext, document]);

  // Handle requestSave from extension
  useEffect(() => {
    const unsubscribe = fluxTermService.subscribe((message: any) => {
      if (message.type === "requestSave") {
        const d = latestDataRef.current;
        fluxTermService.sendSaveResponse({
          ...d.document,
          blocks: d.blocks,
          runtimeContext: d.runtimeContext,
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

  /** Submit from the ghost block: create a fresh store block and execute. */
  const handleGhostSubmit = useCallback(
    (cmd: string) => {
      const shell = displayContext.shell;
      if (!shell || !cmd.trim()) return;
      const blockId = createBlock(cmd, shell, displayContext.cwd, displayContext.branch ?? null);
      fluxTermService.execute(blockId, cmd, shell, displayContext.cwd);
      setGhostCommand("");
      fluxTermService.markDirty();
    },
    [displayContext, createBlock],
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

  /** Insert a new idle block immediately after `afterBlockId`. */
  const handleAddAfter = useCallback(
    (afterBlockId: string) => {
      const shell = displayContext.shell;
      if (!shell) return;
      spliceBlockAfter(afterBlockId, shell, displayContext.cwd, displayContext.branch ?? null);
      fluxTermService.markDirty();
    },
    [displayContext, spliceBlockAfter],
  );

  /** Re-run a completed block (clone with fresh state). */
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

  const handleShellChange = (shell: ResolvedShell) => {
    setSelectedShell(shell);
    updateDocument((draft) => { draft.shell = shell.id; });
  };

  // E2E test hook
  useEffect(() => {
    const handleTestMessage = (e: MessageEvent<any>) => {
      const msg = e.data;
      if (msg.type === "testRunCommand" && msg.command) {
        handleGhostSubmit(msg.command);
      } else if (msg.type === "testInputText" && msg.text) {
        const runningBlock = Array.isArray(blocks)
          ? blocks.find((b) => b.status === "running")
          : null;
        if (runningBlock) fluxTermService.sendInput(runningBlock.id, msg.text);
      }
    };
    window.addEventListener("message", handleTestMessage);
    return () => window.removeEventListener("message", handleTestMessage);
  }, [handleGhostSubmit, blocks]);

  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  const sortedBlocks = [...safeBlocks].sort((a, b) => a.seq - b.seq);
  const isAnyRunning = safeBlocks.some((b) => b.status === "running");

  return (
    <div
      className="h-screen flex flex-col font-mono text-sm antialiased overflow-y-auto"
      style={{
        background: "var(--vscode-editor-background)",
        color: "var(--vscode-editor-foreground)",
        padding: "1rem",
        boxSizing: "border-box",
        gap: "1rem",
      }}
    >
      <BlockDocument
        groupName="Workspace"
        isAnyRunning={isAnyRunning}
        onRunAll={() => {
          // Re-run all done/error blocks in seq order
          sortedBlocks
            .filter((b) => b.status === "done" || b.status === "error")
            .forEach((b) => handleReRun(b.id));
        }}
      >
        {/* Empty state message — shown when there are no real blocks yet */}
        {sortedBlocks.length === 0 && (
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

        {/* Real blocks (idle, running, done, error, killed) */}
        {sortedBlocks.map((block) => (
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
            onAddAfter={() => handleAddAfter(block.id)}
            onKill={() => fluxTermService.killBlock(block.id)}
          />
        ))}

        {/* Ghost block — always present as the trailing entry surface */}
        <Block
          key="ghost"
          block={null}
          isGhost
          ghostCommand={ghostCommand}
          onGhostCommandChange={setGhostCommand}
          onSubmit={handleGhostSubmit}
          context={displayContext}
          availableShells={shells}
          onShellChange={handleShellChange}
          onAddAfter={() => {
            // Ghost has no real block id; insert at true end via a sentinel
            const shell = displayContext.shell;
            if (!shell) return;
            const last = sortedBlocks[sortedBlocks.length - 1];
            if (last) {
              spliceBlockAfter(last.id, shell, displayContext.cwd, displayContext.branch ?? null);
            }
          }}
        />
      </BlockDocument>
    </div>
  );
}
