/**
 * CwdEditor — interactive CWD path display in the block context bar.
 *
 * Interactions:
 *   - Hover          → tooltip: "Double-click to edit · Ctrl+click to copy"
 *   - Ctrl/Cmd+click → copy path to clipboard; flash "Copied!" tooltip
 *   - Double-click   → enter edit mode (input + autocomplete dropdown)
 *   - Edit mode:
 *       Enter  → validate path; commit on success, show VS Code warning on failure
 *       Escape → discard changes, exit edit mode
 *       Blur   → discard changes, exit edit mode (unless focus moved to dropdown)
 *       Typing → debounced listDir for autocomplete suggestions
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { fluxTermService } from "../../services/FluxTermService";

// Helpers

/** Split a typed value into the parent dir and the current segment. */
function splitPath(value: string): { parent: string; segment: string } {
  const lastSlash = value.lastIndexOf("/");
  if (lastSlash === -1) return { parent: "/", segment: value };
  return {
    parent: value.slice(0, lastSlash + 1), // includes trailing slash
    segment: value.slice(lastSlash + 1),
  };
}

/** Directory to query for autocomplete based on what the user has typed. */
function dirForQuery(value: string): string {
  if (value.endsWith("/")) return value;
  const { parent } = splitPath(value);
  return parent;
}

// Flash tooltip ("Copied!")

const FlashTooltip: React.FC<{ visible: boolean }> = ({ visible }) => (
  <span
    style={{
      position: "absolute",
      bottom: "calc(100% + 4px)",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: "var(--vscode-editorWidget-background)",
      border: "1px solid var(--vscode-panel-border)",
      borderRadius: "3px",
      padding: "2px 6px",
      fontSize: "10px",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.2s ease",
      zIndex: 200,
      color: "var(--vscode-foreground)",
    }}
  >
    Copied!
  </span>
);

// CwdEditor

export interface CwdEditorProps {
  /** Current CWD value to display / start editing from. */
  cwd: string;
  /** When true the path is displayed only — no editing or copy interactions. */
  readOnly?: boolean;
  /** Called when the user commits a new (validated) path. */
  onCommit: (newCwd: string) => void;
}

export const CwdEditor: React.FC<CwdEditorProps> = ({
  cwd,
  readOnly = false,
  onCommit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(cwd);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showFlash, setShowFlash] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether focus is inside our whole component (input or dropdown)
  const focusInsideRef = useRef(false);

  // Keep inputValue in sync when cwd changes externally (and we're not editing)
  useEffect(() => {
    if (!isEditing) setInputValue(cwd);
  }, [cwd, isEditing]);

  // Focus & select input when edit mode opens
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      // Immediately fetch suggestions for the current value
      triggerAutocomplete(inputRef.current.value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const triggerAutocomplete = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const queryDir = dirForQuery(value);
      const entries = await fluxTermService.listDir(queryDir);
      setSuggestions(entries);
      setActiveIndex(-1);
    }, 150);
  }, []);

  const exitEditMode = useCallback(
    (revert: boolean) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (revert) setInputValue(cwd);
      setSuggestions([]);
      setActiveIndex(-1);
      setIsEditing(false);
      setIsValidating(false);
    },
    [cwd],
  );

  /** Validate path and commit it, or show a VS Code warning on failure. */
  const commitValue = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        exitEditMode(true);
        return;
      }
      setIsValidating(true);

      // Validate: list the parent directory and confirm the leaf exists.
      const normalized = trimmed.endsWith("/")
        ? trimmed.slice(0, -1)
        : trimmed;
      const lastSlash = normalized.lastIndexOf("/");
      const parentDir = lastSlash <= 0 ? "/" : normalized.slice(0, lastSlash);
      const leafName = normalized.slice(lastSlash + 1);

      const parentEntries = await fluxTermService.listDir(parentDir);
      // leafName is empty only for "/" or paths that end with "/"
      const isValid = leafName === "" || parentEntries.includes(leafName);

      setIsValidating(false);

      if (isValid) {
        onCommit(trimmed);
        exitEditMode(false);
      } else {
        fluxTermService.notify(
          "warning",
          `FluxTerm: Invalid directory — "${trimmed}" does not exist.`,
        );
        inputRef.current?.focus();
      }
    },
    [onCommit, exitEditMode],
  );

  const selectSuggestion = useCallback(
    (entry: string) => {
      const { parent } = splitPath(inputValue);
      const newValue = parent + entry + "/";
      setInputValue(newValue);
      setSuggestions([]);
      setActiveIndex(-1);
      triggerAutocomplete(newValue);
      // Keep focus on input
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [inputValue, triggerAutocomplete],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    triggerAutocomplete(val);
  };

  const filteredSuggestions = (() => {
    const { segment } = splitPath(inputValue);
    const lower = segment.toLowerCase();
    return suggestions
      .filter((s) => s.toLowerCase().startsWith(lower))
      .slice(0, 10);
  })();

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const hasSuggestions = filteredSuggestions.length > 0;

    if (e.key === "Escape") {
      e.preventDefault();
      exitEditMode(true);
      return;
    }

    if (e.key === "ArrowDown" && hasSuggestions) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
      return;
    }

    if (e.key === "ArrowUp" && hasSuggestions) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
      return;
    }

    if (e.key === "Tab" && hasSuggestions) {
      e.preventDefault();
      const idx = activeIndex >= 0 ? activeIndex : 0;
      if (filteredSuggestions[idx]) selectSuggestion(filteredSuggestions[idx]);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (hasSuggestions && activeIndex >= 0 && filteredSuggestions[activeIndex]) {
        selectSuggestion(filteredSuggestions[activeIndex]);
        return;
      }
      await commitValue(inputValue);
    }
  };

  // Blur: close only if focus left the whole component (input + dropdown)
  const handleBlur = () => {
    // Give the dropdown click time to register before closing
    setTimeout(() => {
      if (!focusInsideRef.current) {
        exitEditMode(true);
      }
    }, 150);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    if (e.ctrlKey || e.metaKey) {
      navigator.clipboard.writeText(cwd).catch(() => {});
      setShowFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setShowFlash(false), 1500);
    }
  };

  const handleDoubleClick = () => {
    if (readOnly) return;
    setInputValue(cwd);
    setIsEditing(true);
  };

  // ── Render: edit mode ──────────────────────────────────────────────────────

  if (isEditing) {
    return (
      <div
        ref={wrapperRef}
        style={{ position: "relative", flex: 1, minWidth: 0 }}
        onFocus={() => { focusInsideRef.current = true; }}
        onBlur={() => { focusInsideRef.current = false; }}
      >
        {/* Input row */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            spellCheck={false}
            placeholder="Enter directory path…"
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              border: "1px solid var(--vscode-focusBorder)",
              borderRadius: "3px",
              padding: "1px 6px",
              fontSize: "11px",
              fontWeight: 500,
              fontFamily: "var(--vscode-editor-font-family, monospace)",
              outline: "none",
            }}
          />
          {isValidating && (
            <span
              className="codicon codicon-loading"
              style={{
                fontSize: "11px",
                flexShrink: 0,
                opacity: 0.7,
                animation: "spin 1.5s linear infinite",
              }}
            />
          )}
        </div>

        {/* Autocomplete dropdown — rendered inline, absolutely positioned */}
        {filteredSuggestions.length > 0 && (
          <div
            // mousedown fires before blur; setting focusInsideRef true here
            // prevents the blur handler from closing the editor
            onMouseDown={() => { focusInsideRef.current = true; }}
            style={{
              position: "absolute",
              top: "calc(100% + 2px)",
              left: 0,
              right: 0,
              zIndex: 9999,
              backgroundColor: "var(--vscode-menu-background)",
              border: "1px solid var(--vscode-menu-border, var(--vscode-panel-border))",
              borderRadius: "4px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              maxHeight: "180px",
              overflowY: "auto",
              padding: "2px 0",
              fontFamily: "var(--vscode-editor-font-family, monospace)",
              fontSize: "11px",
            }}
          >
            {filteredSuggestions.map((entry, i) => {
              const isActive = i === activeIndex;
              const { segment } = splitPath(inputValue);
              return (
                <div
                  key={entry}
                  onMouseDown={(e) => {
                    // Prevent blur from firing before click is handled
                    e.preventDefault();
                    selectSuggestion(entry);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "3px 10px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    backgroundColor: isActive
                      ? "var(--vscode-menu-selectionBackground)"
                      : "transparent",
                    color: isActive
                      ? "var(--vscode-menu-selectionForeground)"
                      : "var(--vscode-menu-foreground)",
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span
                    className="codicon codicon-folder"
                    style={{ fontSize: "11px", flexShrink: 0, opacity: 0.75 }}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    <strong>{segment}</strong>
                    {entry.slice(segment.length)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Render: display mode ───────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        flex: 1,
        minWidth: 0,
      }}
    >
      <FlashTooltip visible={showFlash} />
      <span
        title={
          readOnly
            ? cwd
            : "Double-click to edit · Ctrl+click to copy"
        }
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{
          color: "var(--vscode-foreground)",
          fontSize: "12px",
          fontWeight: 600,
          cursor: readOnly ? "default" : "pointer",
          userSelect: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
          borderBottom: readOnly ? "none" : "1px dashed transparent",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!readOnly)
            (e.currentTarget as HTMLElement).style.borderBottomColor =
              "var(--vscode-descriptionForeground)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderBottomColor =
            "transparent";
        }}
      >
        {cwd}
      </span>
    </div>
  );
};

export default CwdEditor;
