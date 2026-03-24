import { useEffect, useRef, useCallback } from "react";
import { useFluxTermDocument } from "./hooks/useFluxTermDocument";
import { useShellConfig } from "./hooks/useShellConfig";
import { useNotebook } from "./store/notebookStore";
import { useBlockExecution } from "./hooks/useBlockExecution";
import { InputSection } from "./components/input";
import { OutputBlock } from "./components/block";
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
/* Show block toolbar on row hover or when it contains focus */
.group:hover .block-toolbar,
.block-toolbar:focus-within {
  opacity: 1 !important;
}
`;

export default function App() {
  const {
    document,
    context: docContext,
    updateDocument,
    saveDocument,
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
  } = useNotebook(docContext, []);

  // When the extension sends init, sync the runtimeContext and restore any
  // previously saved blocks.
  useEffect(() => {
    setRuntimeContext(docContext);
  }, [docContext, setRuntimeContext]);

  // After shells are resolved, restore the saved shell preference (stored as id
  // in FluxTermDocument.shell). The webview matches it against the live shell list.
  useEffect(() => {
    if (shells.length === 0) {
      return;
    }
    if (document.shell) {
      const saved = shells.find((s) => s.id === document.shell);
      if (saved) {
        setSelectedShell(saved);
        return;
      }
    }
    // No preference or no match — default to the first available shell.
    if (!selectedShell) {
      setSelectedShell(shells[0]);
    }
  }, [shells, document.shell]);

  // If the saved document contains blocks from a previous session, restore them.
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
    // Run only once after docContext is first populated (empty cwd means not yet
    // received from extension).
  }, [docContext.cwd]);

  //  Wire execution events from extension to notebookStore
  useBlockExecution({ appendOutput, completeBlock, setBlockStatus });

  // Keep a ref to the latest document state for immediate access during requestSave
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

  // Inject CSS animations once
  const styleInjected = useRef(false);
  if (!styleInjected.current) {
    styleInjected.current = true;
    const style = window.document.createElement("style");
    style.textContent = ANIM_CSS;
    window.document.head.appendChild(style);
  }

  //  Merged context for the InputSection
  // Prefer runtime-detected values; fall back to document preferences.
  const displayContext: FluxTermContext = {
    cwd: runtimeContext.cwd || document.cwd || "",
    branch: runtimeContext.branch ?? document.branch ?? null,
    shell: selectedShell,
    connection: runtimeContext.connection ?? "local",
  };

  const handleRun = useCallback((cmd: string) => {
    const shell = displayContext.shell;
    if (!shell) {
      return;
    }
    const blockId = createBlock(
      cmd,
      shell,
      displayContext.cwd,
      displayContext.branch ?? null,
    );
    fluxTermService.execute(blockId, cmd, shell, displayContext.cwd);
  }, [displayContext, createBlock]);

  // E2E testing hook to allow headless runner to inject interactions visually into React
  useEffect(() => {
    const handleTestMessage = (e: MessageEvent<any>) => {
      const msg = e.data;
      if (msg.type === "testRunCommand" && msg.command) {
        handleRun(msg.command);
      } else if (msg.type === "testInputText" && msg.text) {
        const runningBlock = Array.isArray(blocks) ? blocks.find((b) => b.status === "running") : null;
        if (runningBlock) {
          fluxTermService.sendInput(runningBlock.id, msg.text);
        }
      }
    };
    window.addEventListener("message", handleTestMessage);
    return () => window.removeEventListener("message", handleTestMessage);
  }, [handleRun, blocks]);

  const handleReRun = (blockId: string) => {
    const orig = blocks.find((b) => b.id === blockId);
    if (!orig) {
      return;
    }
    const newId = reRunBlock(blockId);
    if (!newId) {
      return;
    }
    fluxTermService.execute(newId, orig.command, orig.shell, orig.cwd);
  };

  const handleShellChange = (shell: ResolvedShell) => {
    setSelectedShell(shell);
    // Persist only the shell id so the preference survives reload.
    updateDocument((draft) => {
      draft.shell = shell.id;
    });
  };

  const handleCwdChange = (cwd: string) => {
    // Auto-persist the cwd preference immediately
    updateDocument((draft) => {
      draft.cwd = cwd;
    });
  };

  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  const isAnyRunning = safeBlocks.some((b) => b.status === "running");

  return (
    <div
      className="h-screen flex flex-col font-mono text-sm antialiased"
      style={{
        background: "var(--vscode-editor-background)",
        color: "var(--vscode-editor-foreground)",
        overflow: "hidden",
      }}
    >
      <main className="flex-1 overflow-y-auto" style={{ padding: "12px 16px" }}>
        {safeBlocks.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-full opacity-40"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            <span
              className="codicon codicon-terminal"
              style={{ fontSize: "32px", marginBottom: "12px" }}
            />
            <div className="text-base mb-1">FluxTerm Notebook</div>
            <div className="text-xs">
              Type a command below to create a block
            </div>
          </div>
        )}

        {[...safeBlocks]
          .sort((a, b) => a.seq - b.seq)
          .map((block, idx) => (
            <div key={block.id}>
              <OutputBlock
                block={block}
                onDelete={(id) => {
                  deleteBlock(id);
                  fluxTermService.markDirty();
                }}
                onReRun={handleReRun}
              />
              {idx < safeBlocks.length - 1 && (
                <div
                  style={{
                    height: "1px",
                    backgroundColor: "var(--vscode-panel-border)",
                    opacity: 0.3,
                    margin: "8px 2px",
                  }}
                />
              )}
            </div>
          ))}

        {/* Spacer above the input bar */}
        <div style={{ height: "24px" }} />
      </main>

      {/* Input bar */}
      <InputSection
        context={displayContext}
        availableShells={shells}
        onShellChange={handleShellChange}
        onCwdChange={handleCwdChange}
        onRun={handleRun}
        isRunning={isAnyRunning}
      />
    </div>
  );
}
