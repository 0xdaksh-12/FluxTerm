import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
} from "react";
import { createPortal } from "react-dom";
import {
  FluxTermBlock,
  FluxTermContext,
  ResolvedShell,
} from "../../../types/MessageProtocol";
import { fluxTermService } from "../../services/FluxTermService";
import { OutputArea } from "./OutputArea";
import { BlockInput } from "./BlockInput";
import { ContextMenu } from "./ContextMenu";
import { SearchBar } from "./SearchBar";

export interface BlockProps {
  /**
   * The backing store block. `null` for the ghost block (not yet in store).
   */
  block: FluxTermBlock | null;
  /**
   * When true this is the persistent trailing ghost block.
   * The ghost is not in the store — it is controlled via ghostCommand/onGhostCommandChange.
   */
  isGhost?: boolean;
  /** Controlled command value (ghost only — managed by parent). */
  ghostCommand?: string;
  onGhostCommandChange?: (value: string) => void;
  /**
   * Called when the user submits a command.
   * For ghost blocks: parent calls createBlock and resets ghostCommand.
   * For idle store blocks: parent calls promoteIdleBlock then fluxTermService.execute.
   */
  onSubmit: (cmd: string) => void;

  // Context bar
  context: FluxTermContext;
  availableShells: ResolvedShell[];
  onShellChange: (shell: ResolvedShell) => void;

  // Block-level actions (absent for ghost)
  onDelete?: () => void;
  onReRun?: () => void;
  onAddAfter?: () => void;
  onKill?: () => void;
}

export const Block = forwardRef<HTMLDivElement, BlockProps>(
  (
    {
      block,
      isGhost = false,
      ghostCommand = "",
      onGhostCommandChange,
      onSubmit,
      context,
      availableShells,
      onShellChange,
      onDelete,
      onReRun,
      onAddAfter,
      onKill,
    },
    ref,
  ) => {
    const status = block?.status ?? "idle";
    const isRunning = status === "running";
    const isDone = status === "done";
    const isError = status === "error";
    const isKilled = status === "killed";
    // Editable when ghost or idle store block
    const isEditable = isGhost || status === "idle";

    // Local command for idle store blocks (not ghost — ghost is parent-controlled)
    const [localCommand, setLocalCommand] = useState(block?.command ?? "");

    const commandValue = isGhost ? ghostCommand : isEditable ? localCommand : (block?.command ?? "");
    const setCommandValue = isGhost
      ? (v: string) => onGhostCommandChange?.(v)
      : (v: string) => setLocalCommand(v);

    const [isFocused, setIsFocused] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showShellMenu, setShowShellMenu] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const [showContextMenu, setShowContextMenu] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const shellButtonRef = useRef<HTMLButtonElement>(null);
    const shellMenuRef = useRef<HTMLDivElement>(null);

    // Auto-resize textarea height to content
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, [commandValue]);

    // Close shell dropdown on outside click
    useEffect(() => {
      if (!showShellMenu) return;
      const handle = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          shellMenuRef.current &&
          !shellMenuRef.current.contains(target) &&
          shellButtonRef.current &&
          !shellButtonRef.current.contains(target)
        ) {
          setShowShellMenu(false);
        }
      };
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }, [showShellMenu]);

    const handleSubmit = useCallback(() => {
      if (!commandValue.trim() || isRunning) return;
      onSubmit(commandValue);
      // Ghost parent resets ghostCommand; idle local state will be cleared by
      // promoteIdleBlock making the block non-idle (status → running).
    }, [commandValue, isRunning, onSubmit]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const openShellMenu = () => {
      if (isRunning || !shellButtonRef.current) return;
      const rect = shellButtonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.left });
      setShowShellMenu(true);
    };

    const searchMatchCount = searchQuery
      ? (block?.output ?? []).filter((l) =>
          l.text.toLowerCase().includes(searchQuery.toLowerCase()),
        ).length
      : 0;

    const handleCopyOutput = useCallback(() => {
      if (!block) return;
      navigator.clipboard
        .writeText(block.output.map((l) => l.text).join("\n"))
        .catch(() => {});
    }, [block]);

    const handleKillInternal = useCallback(() => {
      if (block) fluxTermService.killBlock(block.id);
    }, [block]);

    // Card border colour reflects status
    const cardBorder = isError
      ? "var(--vscode-testing-iconFailed, #f14c4c)"
      : isKilled
        ? "var(--vscode-disabledForeground)"
        : isFocused
          ? "var(--vscode-focusBorder)"
          : "var(--vscode-panel-border)";

    // Context bar right-side content
    const renderContextRight = () => {
      if (isRunning) {
        return (
          <div
            className="flex items-center gap-1.5 flex-1 px-2"
            style={{ color: "var(--vscode-button-background)" }}
          >
            <span
              className="codicon codicon-loading"
              style={{ fontSize: "12px", animation: "spin 1.5s linear infinite" }}
            />
            <span style={{ fontSize: "11px", fontWeight: "bold" }}>Running</span>
          </div>
        );
      }

      const displayBranch = block?.branch ?? context.branch;
      const displayCwd = block?.cwd ?? context.cwd;

      return (
        <>
          {displayBranch && (
            <div
              className="flex items-center gap-1 px-2 shrink-0"
              style={{
                borderRight: "1px solid var(--vscode-panel-border)",
                color: "var(--vscode-descriptionForeground)",
              }}
            >
              <span
                className="codicon codicon-git-branch"
                style={{ fontSize: "12px" }}
              />
              <span style={{ fontSize: "11px" }}>{displayBranch}</span>
            </div>
          )}
          <div
            className="flex items-center gap-1 flex-1 px-2 min-w-0"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            <span
              className="codicon codicon-folder-opened"
              style={{ fontSize: "12px" }}
            />
            <span
              className="truncate"
              style={{ color: "var(--vscode-button-background)", fontSize: "11px" }}
            >
              {displayCwd}
            </span>
          </div>
        </>
      );
    };

    const hasOutput = (block?.output.length ?? 0) > 0;
    // Ghost block is slightly dimmed when empty to hint it is a placeholder
    const ghostDim = isGhost && !ghostCommand;

    return (
      <div
        ref={ref}
        className="block-card-wrapper"
        style={{ position: "relative", width: "100%", opacity: ghostDim ? 0.55 : 1 }}
      >
        {/* ── Floating action toolbar ── */}
        <div
          className="block-toolbar"
          style={{
            position: "absolute",
            top: "-4px",
            right: "0px",
            display: "flex",
            alignItems: "center",
            gap: "2px",
            zIndex: 30,
            backgroundColor: "var(--vscode-editorWidget-background)",
            border: "1px solid var(--vscode-panel-border)",
            borderRadius: "6px",
            padding: "4px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
            opacity: 0,
            pointerEvents: "none",
            transition: "opacity 0.15s ease",
          }}
        >
          {/* Add */}
          <button
            className="block-tb-btn"
            title="Add block below"
            onClick={onAddAfter}
          >
            <span className="codicon codicon-add" style={{ fontSize: "14px" }} />
          </button>

          {/* Stop / Refresh */}
          {isRunning ? (
            <button
              className="block-tb-btn"
              title="Kill process"
              onClick={onKill ?? handleKillInternal}
            >
              <span
                className="codicon codicon-debug-stop"
                style={{
                  fontSize: "14px",
                  color: "var(--vscode-testing-iconFailed, #f14c4c)",
                }}
              />
            </button>
          ) : !isGhost && (isDone || isError || isKilled) ? (
            <button className="block-tb-btn" title="Re-run" onClick={onReRun}>
              <span
                className="codicon codicon-refresh"
                style={{ fontSize: "14px" }}
              />
            </button>
          ) : null}

          {/* Search — only when there is output */}
          {hasOutput && (
            <button
              className="block-tb-btn"
              title="Search output"
              style={{
                backgroundColor: showSearch
                  ? "var(--vscode-toolbar-activeBackground)"
                  : undefined,
              }}
              onClick={() => setShowSearch((s) => !s)}
            >
              <span
                className="codicon codicon-search"
                style={{ fontSize: "14px" }}
              />
            </button>
          )}

          {/* Delete */}
          {!isGhost && !isRunning && (
            <button className="block-tb-btn" title="Delete block" onClick={onDelete}>
              <span
                className="codicon codicon-trash"
                style={{ fontSize: "14px" }}
              />
            </button>
          )}

          <div
            style={{
              width: "1px",
              height: "16px",
              backgroundColor: "var(--vscode-panel-border)",
              margin: "0 2px",
            }}
          />

          {/* Drag grip (decorative) */}
          <button
            className="block-tb-btn"
            title="Reorder (coming soon)"
            style={{ cursor: "grab" }}
          >
            <span
              className="codicon codicon-gripper"
              style={{ fontSize: "14px" }}
            />
          </button>

          <div
            style={{
              width: "1px",
              height: "16px",
              backgroundColor: "var(--vscode-panel-border)",
              margin: "0 2px",
            }}
          />

          {/* More */}
          <div style={{ position: "relative" }}>
            <button
              className="block-tb-btn"
              title="More actions"
              style={{
                backgroundColor: showContextMenu
                  ? "var(--vscode-toolbar-activeBackground)"
                  : undefined,
              }}
              onClick={() => setShowContextMenu((m) => !m)}
            >
              <span
                className="codicon codicon-ellipsis"
                style={{ fontSize: "14px" }}
              />
            </button>
            {showContextMenu && block && (
              <ContextMenu
                block={block}
                onCopyOutput={() => {
                  handleCopyOutput();
                  setShowContextMenu(false);
                }}
                onReRun={() => {
                  onReRun?.();
                  setShowContextMenu(false);
                }}
                onKill={() => {
                  handleKillInternal();
                  setShowContextMenu(false);
                }}
                onDelete={() => {
                  onDelete?.();
                  setShowContextMenu(false);
                }}
                onClose={() => setShowContextMenu(false)}
              />
            )}
          </div>
        </div>

        {/* ── Main card ── */}
        <div
          className="block-card"
          style={{
            backgroundColor: "var(--vscode-input-background)",
            border: `1px solid ${cardBorder}`,
            borderRadius: "4px",
            overflow: "hidden",
            transition: "border-color 100ms, opacity 150ms",
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsFocused(false);
            }
          }}
        >
          {/* Context bar */}
          <div
            className="flex items-stretch select-none"
            style={{
              backgroundColor: "var(--vscode-editorWidget-background)",
              borderBottom: "1px solid var(--vscode-panel-border)",
              height: "28px",
              fontSize: "12px",
              fontFamily: "var(--vscode-editor-font-family, monospace)",
              userSelect: "none",
            }}
          >
            {/* Shell selector */}
            <button
              ref={shellButtonRef}
              className="flex items-center gap-1 px-3 shrink-0"
              style={{
                color: "var(--vscode-foreground)",
                border: "none",
                borderRight: "1px solid var(--vscode-panel-border)",
                background: "transparent",
                cursor: isRunning ? "default" : "pointer",
                opacity: isRunning ? 0.7 : 1,
              }}
              onClick={openShellMenu}
              disabled={isRunning}
            >
              <span
                className={`codicon ${context.shell?.icon ?? "codicon-terminal"}`}
                style={{ fontSize: "14px" }}
              />
              <span style={{ fontSize: "11px", fontWeight: "bold" }}>
                {availableShells.length === 0 ? "…" : (context.shell?.label ?? "shell")}
              </span>
              {!isRunning && (
                <span
                  className="codicon codicon-chevron-down"
                  style={{
                    fontSize: "11px",
                    color: "var(--vscode-descriptionForeground)",
                    marginLeft: "1px",
                  }}
                />
              )}
            </button>

            {/* Right section */}
            <div className="flex items-center flex-1 min-w-0">
              {renderContextRight()}
            </div>
          </div>

          {/* Input area */}
          <div
            className="flex items-start gap-2 px-3 py-2"
            style={{ backgroundColor: "var(--vscode-input-background)" }}
          >
            <span
              style={{
                color: "var(--vscode-button-background)",
                fontWeight: "bold",
                fontSize: "12px",
                lineHeight: "1.4",
                paddingTop: "1px",
                flexShrink: 0,
              }}
            >
              $
            </span>
            <textarea
              ref={textareaRef}
              autoFocus={isGhost || status === "idle"}
              readOnly={!isEditable}
              rows={1}
              value={commandValue}
              onChange={(e) => !isEditable ? undefined : setCommandValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isGhost ? "Type a command..." : undefined}
              style={{
                backgroundColor: "transparent",
                color: "var(--vscode-editor-foreground)",
                caretColor: "var(--vscode-editorCursor-foreground)",
                flex: 1,
                border: "none",
                padding: 0,
                outline: "none",
                fontFamily: "var(--vscode-editor-font-family, monospace)",
                fontSize: "12px",
                lineHeight: "1.4",
                resize: "none",
                overflow: "hidden",
                cursor: isEditable ? "text" : "default",
              }}
            />
            {isEditable && (
              <button
                onClick={handleSubmit}
                disabled={!commandValue.trim()}
                style={{
                  color: commandValue.trim()
                    ? "var(--vscode-button-background)"
                    : "var(--vscode-disabledForeground, #666)",
                  border: "none",
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2px",
                  cursor: commandValue.trim() ? "pointer" : "not-allowed",
                  borderRadius: "4px",
                  flexShrink: 0,
                }}
              >
                <span
                  className="codicon codicon-arrow-right"
                  style={{ fontSize: "18px" }}
                />
              </button>
            )}
          </div>

          {/* Search bar */}
          {showSearch && (
            <div className="px-3 pb-2">
              <SearchBar
                query={searchQuery}
                matchCount={searchMatchCount}
                onChange={setSearchQuery}
                onClose={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                }}
              />
            </div>
          )}

          {/* Output area */}
          {block && (isDone || isError || isRunning) && (
            <div
              style={{
                marginBottom: isDone || isError ? "4px" : 0,
                padding: "4px 8px 4px 12px",
                marginLeft: "12px",
                borderLeft: isDone
                  ? "2px solid var(--vscode-charts-blue, var(--vscode-button-background, #007fd4))"
                  : isError
                    ? "2px solid var(--vscode-testing-iconFailed, #f14c4c)"
                    : "none",
                borderTopLeftRadius: "2px",
                borderBottomLeftRadius: "2px",
              }}
            >
              <OutputArea block={block} searchQuery={searchQuery} />
            </div>
          )}

          {/* Killed indicator */}
          {isKilled && (
            <div
              style={{
                padding: "4px 12px 12px 24px",
                fontSize: "12px",
                fontStyle: "italic",
                opacity: 0.5,
              }}
            >
              Process killed.
            </div>
          )}

          {/* Stdin input row — running blocks only */}
          {isRunning && block && (
            <div style={{ padding: "0 12px 12px 12px" }}>
              <BlockInput blockId={block.id} />
            </div>
          )}

          {/* Execution metadata footer */}
          {!isRunning &&
            !isGhost &&
            block &&
            (block.exitCode !== null ||
              (block.finalCwd && block.finalCwd !== block.cwd) ||
              (block.finalBranch && block.finalBranch !== block.branch)) && (
              <div
                className="flex flex-wrap gap-3 px-3 pb-3"
                style={{
                  fontSize: "10px",
                  color: "var(--vscode-descriptionForeground)",
                  opacity: 0.7,
                  fontFamily: "var(--vscode-editor-font-family, monospace)",
                  userSelect: "none",
                }}
              >
                {block.exitCode !== null && (
                  <span
                    style={{
                      color:
                        block.exitCode === 0
                          ? "var(--vscode-testing-iconPassed)"
                          : "var(--vscode-testing-iconFailed)",
                    }}
                  >
                    Exit: {block.exitCode}
                  </span>
                )}
                {block.finalCwd && block.finalCwd !== block.cwd && (
                  <span>CWD: {block.finalCwd}</span>
                )}
                {block.finalBranch && block.finalBranch !== block.branch && (
                  <span className="flex items-center gap-1">
                    <span
                      className="codicon codicon-git-branch"
                      style={{ fontSize: "10px" }}
                    />
                    {block.finalBranch}
                  </span>
                )}
              </div>
            )}
        </div>

        {/* Shell dropdown portal */}
        {showShellMenu &&
          createPortal(
            <div
              ref={shellMenuRef}
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                backgroundColor: "var(--vscode-menu-background)",
                border: "1px solid var(--vscode-menu-border)",
                boxShadow: "0 2px 8px var(--vscode-widget-shadow)",
                zIndex: 9999,
                maxHeight: "320px",
                overflowY: "auto",
                minWidth: "200px",
                borderRadius: "4px",
                padding: "4px 0",
              }}
            >
              {availableShells.map((shell) => {
                const isSelected = context.shell?.id === shell.id;
                return (
                  <button
                    key={shell.id}
                    onClick={() => {
                      onShellChange(shell);
                      setShowShellMenu(false);
                    }}
                    className="flex items-center w-full px-2"
                    style={{
                      color: "var(--vscode-menu-foreground)",
                      height: "28px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "13px",
                      fontFamily: "var(--vscode-editor-font-family, monospace)",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--vscode-menu-selectionBackground)";
                      e.currentTarget.style.color =
                        "var(--vscode-menu-selectionForeground)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color =
                        "var(--vscode-menu-foreground)";
                    }}
                  >
                    <span
                      className="codicon codicon-check"
                      style={{
                        fontSize: "12px",
                        opacity: isSelected ? 1 : 0,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      className={`codicon ${shell.icon ?? "codicon-terminal"}`}
                      style={{ fontSize: "14px", flexShrink: 0 }}
                    />
                    <span className="flex-1 truncate">{shell.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )}
      </div>
    );
  },
);

Block.displayName = "Block";
export default Block;
