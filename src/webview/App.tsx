// Root notebook application component.
//
// Wires all hooks together and passes props down to the InputSection and
// per-block OutputBlock components. This is the single place where:
//   - Document preferences (shell, cwd) are derived for the InputSection.
//   - Block execution is initiated (createBlock → flowService.execute).
//   - Explicit notebook saves are triggered (saveDocument).

import { useEffect, useRef, useCallback } from "react";
import { useFlowDocument } from "./hooks/useFlowDocument";
import { useShellConfig } from "./hooks/useShellConfig";
import { useNotebook } from "./store/notebookStore";
import { useBlockExecution } from "./hooks/useBlockExecution";
import { InputSection } from "./components/input";
import { OutputBlock } from "./components/block";
import { flowService } from "./services/FlowService";
import { FlowContext } from "../types/MessageProtocol";

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
  } = useFlowDocument();
  const { shells } = useShellConfig();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docContext.cwd]);

  //  Wire execution events from extension to notebookStore
  useBlockExecution({ appendOutput, completeBlock, setBlockStatus });

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
  const displayContext: FlowContext = {
    cwd: runtimeContext.cwd || document.cwd || "",
    branch: runtimeContext.branch ?? document.branch ?? null,
    shell: document.shell ?? runtimeContext.shell ?? null,
    connection: runtimeContext.connection ?? "local",
  };

  const handleRun = (cmd: string) => {
    const shell = displayContext.shell;
    if (!shell) {
      return;
    }
    // Look up the resolved shell to get its args (defined in constant.ts,
    // resolved by ShellResolver, carried in ResolvedShell.args).
    const resolvedShell = shells.find((s) => s.path === shell);
    const shellArgs = resolvedShell?.args ?? [];

    const blockId = createBlock(
      cmd,
      shell,
      displayContext.cwd,
      displayContext.branch ?? null,
    );
    flowService.execute(blockId, cmd, shell, shellArgs, displayContext.cwd);
  };

  const handleReRun = (blockId: string) => {
    const orig = blocks.find((b) => b.id === blockId);
    if (!orig) {
      return;
    }
    // Resolve args from the shell list for the block's frozen shell path.
    const resolvedShell = shells.find((s) => s.path === orig.shell);
    const shellArgs = resolvedShell?.args ?? [];

    const newId = reRunBlock(blockId);
    if (!newId) {
      return;
    }
    flowService.execute(newId, orig.command, orig.shell, shellArgs, orig.cwd);
  };

  const handleShellChange = (shellPath: string) => {
    // Auto-persist the shell preference immediately
    updateDocument((draft) => {
      draft.shell = shellPath;
    });
  };

  const handleCwdChange = (cwd: string) => {
    // Auto-persist the cwd preference immediately
    updateDocument((draft) => {
      draft.cwd = cwd;
    });
  };

  const handleSave = useCallback(() => {
    saveDocument(blocks, runtimeContext);
  }, [blocks, runtimeContext, saveDocument]);

  // Global save shortcut (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

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
            <div className="text-base mb-1">Flow Notebook</div>
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
                onDelete={deleteBlock}
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
