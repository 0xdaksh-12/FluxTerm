// InputSection.tsx — Command input bar with context display and shell picker.
// Moved from components/InputBlock.tsx → components/input/InputSection.tsx.

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FlowContext, ResolvedShell } from "../../../types/MessageProtocol";
import { Web } from "../../../utils/logger";
import { Tooltip } from "../common/Tooltip";

interface InputSectionProps {
  context: FlowContext;
  onRun: (cmd: string) => void;
  onShellChange: (shell: string) => void;
  onCwdChange?: (cwd: string) => void;
  availableShells: ResolvedShell[];
  isRunning?: boolean;
}

export const InputSection: React.FC<InputSectionProps> = ({
  context,
  onRun,
  onShellChange,
  onCwdChange,
  availableShells,
  isRunning = false,
}) => {
  const [input, setInput] = useState("");
  const [showShellMenu, setShowShellMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    bottom: 0,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showShellMenu &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowShellMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showShellMenu]);

  const hasShell = Boolean(context.shell);

  const handleRun = () => {
    if (!hasShell) return;
    if (input.trim() && !isRunning) {
      onRun(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleRun();
    }
  };

  const getShellName = (path: string) => {
    if (!path) return "";
    const lowerPath = path.toLowerCase().replace(/\\/g, "/");
    const fileName = lowerPath.split("/").pop() || "";
    return fileName.replace(/.*-/, "").replace(/\.exe$/, "");
  };

  const getShellDisplay = () => {
    if (!context.shell) return "No Shell";
    const shellObj = availableShells.find((s) => s.path === context.shell);
    return shellObj ? shellObj.label : getShellName(context.shell);
  };

  const toggleMenu = () => {
    if (!showShellMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.top,
        left: rect.left,
        bottom: window.innerHeight - rect.top,
      });
    }
    setShowShellMenu(!showShellMenu);
  };

  return (
    <div
      style={{
        backgroundColor: "var(--vscode-editor-background)",
        borderTop: "1px solid var(--vscode-panel-border)",
      }}
      className="p-4 shrink-0 relative"
    >
      <div
        style={{
          backgroundColor: "var(--vscode-input-background)",
          border: "1px solid var(--vscode-panel-border)",
        }}
        className="flex flex-col rounded-sm transition-all duration-100 overflow-hidden"
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--vscode-focusBorder)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--vscode-panel-border)";
        }}
      >
        {/* Context Bar */}
        <div
          style={{
            backgroundColor: "var(--vscode-editorWidget-background)",
            borderBottom: "1px solid var(--vscode-panel-border)",
            color: "var(--vscode-descriptionForeground)",
          }}
          className="flex items-center rounded-t-sm gap-2 text-xs px-3 py-1.5 select-none font-mono"
        >
          <span
            style={{ color: "var(--vscode-button-background)" }}
            className="font-bold"
          >
            [{context.connection}]
          </span>
          <div className="flex items-center gap-1">
            <span
              className="codicon codicon-git-branch"
              style={{ fontSize: "14px" }}
            />
            <span>
              {typeof context.branch === "string"
                ? context.branch
                : "no branch"}
            </span>
          </div>
          <Tooltip content="Copy path (Ctrl + Click)">
            <div
              className="flex items-center gap-1 group/cwd cursor-pointer"
              onClick={(e) => {
                if (e.ctrlKey) {
                  navigator.clipboard.writeText(context.cwd);
                } else {
                  onCwdChange && onCwdChange(context.cwd);
                }
              }}
            >
              <span
                className="codicon codicon-folder-opened group-hover/cwd:text-(--vscode-button-background) transition-colors"
                style={{ fontSize: "14px" }}
              />
              <span
                style={{ color: "var(--vscode-button-background)" }}
                className="truncate max-w-[300px] group-hover/cwd:underline"
              >
                {context.cwd}
              </span>
            </div>
          </Tooltip>
        </div>

        {/* Input Area */}
        <div
          style={{ backgroundColor: "var(--vscode-input-background)" }}
          className="flex items-center rounded-b-sm"
        >
          <div className="relative">
            <div
              style={{ borderRight: "1px solid var(--vscode-panel-border)" }}
              className="flex items-center shrink-0"
            >
              <button
                ref={buttonRef}
                onClick={toggleMenu}
                disabled={isRunning}
                style={{ color: "var(--vscode-input-foreground)" }}
                className="flex items-center gap-1.5 px-3 py-2 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                onMouseEnter={(e) => {
                  if (!isRunning) {
                    e.currentTarget.style.backgroundColor =
                      "var(--vscode-list-hoverBackground)";
                    e.currentTarget.style.color =
                      "var(--vscode-editor-foreground)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color =
                    "var(--vscode-input-foreground)";
                }}
              >
                <div className="flex items-center gap-2">
                  {availableShells.length === 0 ? (
                    <>
                      <div
                        style={{
                          backgroundColor: "var(--vscode-icon-foreground)",
                        }}
                        className="w-3 h-3 rounded-full opacity-20 animate-pulse"
                      />
                      <div
                        style={{
                          backgroundColor: "var(--vscode-icon-foreground)",
                        }}
                        className="w-12 h-3 rounded opacity-20 animate-pulse"
                      />
                    </>
                  ) : (
                    <>
                      <span
                        className={`codicon ${
                          availableShells.find((s) => s.path === context.shell)
                            ?.icon || "codicon-terminal"
                        }`}
                        style={{ fontSize: "16px" }}
                      />
                      <span className="text-[11px] font-bold tracking-tight lowercase max-w-[100px] truncate font-mono">
                        {getShellDisplay()}
                      </span>
                    </>
                  )}
                </div>
                <span
                  className="codicon codicon-chevron-down transition-colors group-hover:text-(--vscode-editor-foreground)"
                  style={{
                    fontSize: "14px",
                    color: "var(--vscode-descriptionForeground)",
                  }}
                />
              </button>
            </div>

            {/* Shell Dropdown — rendered via portal to escape overflow:hidden */}
            {showShellMenu &&
              createPortal(
                <div
                  ref={menuRef}
                  style={{
                    position: "fixed",
                    bottom: menuPosition.bottom + 4,
                    left: menuPosition.left,
                    backgroundColor: "var(--vscode-menu-background)",
                    border: "1px solid var(--vscode-menu-border)",
                    boxShadow: "0 2px 8px var(--vscode-widget-shadow)",
                    zIndex: 9999,
                    maxHeight: "320px",
                    overflowY: "auto",
                    minWidth: "280px",
                  }}
                  className="rounded-sm py-1"
                >
                  {availableShells.map((option) => {
                    const isSelected = context.shell === option.path;
                    return (
                      <Tooltip
                        key={option.path}
                        content={option.path}
                        className="block w-full"
                      >
                        <button
                          onClick={() => {
                            Web.info(
                              `[InputSection] Selected shell: ${option.label} -> ${option.path}`,
                            );
                            onShellChange(option.path);
                            setShowShellMenu(false);
                          }}
                          style={{
                            color: "var(--vscode-menu-foreground)",
                            height: "25px",
                          }}
                          className="vscode-menu-item flex items-center w-full px-2 text-[13px] text-left border-none outline-none cursor-pointer transition-colors"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "var(--vscode-menu-selectionBackground)";
                            e.currentTarget.style.color =
                              "var(--vscode-menu-selectionForeground)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                            e.currentTarget.style.color =
                              "var(--vscode-menu-foreground)";
                          }}
                        >
                          {/* Checkmark */}
                          <div
                            className="flex items-center justify-center shrink-0"
                            style={{
                              width: "16px",
                              height: "16px",
                              marginRight: "4px",
                              opacity: isSelected ? 1 : 0,
                            }}
                          >
                            <span className="codicon codicon-check" />
                          </div>
                          {/* Shell icon */}
                          <div
                            className="flex items-center justify-center shrink-0"
                            style={{
                              width: "16px",
                              height: "16px",
                              marginRight: "8px",
                            }}
                          >
                            <span
                              className={`codicon ${
                                option.icon || "codicon-terminal"
                              }`}
                            />
                          </div>
                          {/* Label */}
                          <span className="flex-1 truncate font-mono">
                            {option.label}
                          </span>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>,
                document.body,
              )}
          </div>

          <div className="flex-1 flex items-center gap-2 px-3 py-2">
            <span
              style={{ color: "var(--vscode-button-background)" }}
              className="font-bold"
            >
              $
            </span>
            <input
              ref={inputRef}
              autoFocus
              disabled={isRunning || !hasShell}
              style={{
                backgroundColor: "transparent",
                color: "var(--vscode-editor-foreground)",
                caretColor: "var(--vscode-editorCursor-foreground)",
              }}
              className="flex-1 border-none p-0 focus:ring-0 placeholder-(--vscode-input-placeholderForeground) selection:bg-(--vscode-editor-selectionBackground) font-mono text-sm leading-6 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={
                !hasShell
                  ? "Select a shell to enter commands..."
                  : isRunning
                    ? "Running..."
                    : "Type a command..."
              }
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              onClick={handleRun}
              disabled={!input.trim() || isRunning || !hasShell}
              style={{ color: "var(--vscode-button-background)" }}
              className="rounded p-1 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onMouseEnter={(e) => {
                if (input.trim() && !isRunning && hasShell) {
                  e.currentTarget.style.color =
                    "var(--vscode-button-foreground)";
                  e.currentTarget.style.backgroundColor =
                    "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--vscode-button-background)";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span
                className="codicon codicon-arrow-right"
                style={{ fontSize: "18px" }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
