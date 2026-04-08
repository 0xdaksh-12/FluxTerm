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
 *       Blur   → discard changes, exit edit mode
 *       Typing → debounced listDir for autocomplete suggestions
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { fluxTermService } from "../../services/FluxTermService";

//  helpers

/** Split a path into its parent directory and the current segment being typed. */
function splitPath(value: string): { parent: string; segment: string } {
  const trimmed = value;
  // Normalise trailing slash: treat "foo/bar" and "foo/bar/" equally
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash === -1) {
    return { parent: "/", segment: trimmed };
  }
  const parent = trimmed.slice(0, lastSlash + 1); // includes trailing slash
  const segment = trimmed.slice(lastSlash + 1);
  return { parent, segment };
}

/** Use the path as-is for `listDir`; strip trailing slash for display. */
function dirForQuery(value: string): string {
  // If the value ends with "/" query that exact directory
  if (value.endsWith("/")) return value;
  // Otherwise query the parent
  const { parent } = splitPath(value);
  return parent;
}

// Autocomplete Dropdown

interface DropdownProps {
  anchorRect: DOMRect;
  entries: string[];
  segment: string;
  onSelect: (entry: string) => void;
  activeIndex: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const AutocompleteDropdown: React.FC<DropdownProps> = ({
  anchorRect,
  entries,
  segment,
  onSelect,
  activeIndex,
  containerRef,
}) => {
  const lowerSeg = segment.toLowerCase();
  const filtered = entries
    .filter((e) => e.toLowerCase().startsWith(lowerSeg))
    .slice(0, 12);

  if (filtered.length === 0) return null;

  return createPortal(
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      style={{
        position: "fixed",
        top: anchorRect.bottom + 2,
        left: anchorRect.left,
        minWidth: Math.max(200, anchorRect.width),
        maxWidth: 480,
        maxHeight: 220,
        overflowY: "auto",
        backgroundColor: "var(--vscode-menu-background)",
        border:
          "1px solid var(--vscode-menu-border, var(--vscode-panel-border))",
        borderRadius: "4px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        zIndex: 9999,
        padding: "2px 0",
        fontFamily: "var(--vscode-editor-font-family, monospace)",
        fontSize: "11px",
      }}
    >
      {filtered.map((entry, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={entry}
            onMouseDown={(e) => {
              // preventDefault so the input doesn't blur before we handle the click
              e.preventDefault();
              onSelect(entry);
            }}
            style={{
              padding: "3px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
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
          >
            <span
              className="codicon codicon-folder"
              style={{ fontSize: "11px", flexShrink: 0, opacity: 0.75 }}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {/* bold the matching prefix */}
              <strong>{segment}</strong>
              {entry.slice(segment.length)}
            </span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
};

// ─── Tooltip flash ────────────────────────────────────────────────────────────

const FlashTooltip: React.FC<{ visible: boolean }> = ({ visible }) => (
  <span
    style={{
      position: "absolute",
      top: "-22px",
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
      zIndex: 100,
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
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep inputValue synced when cwd prop changes (e.g. external context update)
  useEffect(() => {
    if (!isEditing) {
      setInputValue(cwd);
    }
  }, [cwd, isEditing]);

  // Focus input when edit mode opens
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      updateAnchor();
    }
  }, [isEditing]);

  // Update anchor rect for dropdown positioning
  const updateAnchor = useCallback(() => {
    if (inputRef.current) {
      setAnchorRect(inputRef.current.getBoundingClientRect());
    }
  }, []);

  // Trigger autocomplete with debounce
  const triggerAutocomplete = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const queryDir = dirForQuery(value);
        const entries = await fluxTermService.listDir(queryDir);
        setSuggestions(entries);
        setActiveIndex(-1);
        updateAnchor();
      }, 200);
    },
    [updateAnchor],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    triggerAutocomplete(val);
  };

  /** Validate path, commit if valid, show warning if not. */
  const commitValue = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        exitEditMode(true);
        return;
      }
      setIsValidating(true);

      // Validation strategy: list the parent directory and check whether the
      // leaf name appears in the result.  This lets us distinguish an
      // empty-but-valid directory (entries=[]) from a non-existent path
      // (extension returns error="invalid"), without changing the service API.
      const normalized = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
      const lastSlash = normalized.lastIndexOf("/");
      const parentDir = lastSlash <= 0 ? "/" : normalized.slice(0, lastSlash);
      const leafName = normalized.slice(lastSlash + 1);

      const parentEntries = await fluxTermService.listDir(parentDir);
      // leafName is empty only when trimmed is exactly "/" or ends with "/"
      const isValid = leafName === "" || parentEntries.includes(leafName);

      setIsValidating(false);

      if (isValid) {
        onCommit(trimmed);
        exitEditMode(false);
      } else {
        fluxTermService.notify(
          "warning",
          `FluxTerm: Invalid directory path — "${trimmed}" does not exist.`,
        );
        // Keep edit mode open so the user can correct the path
        inputRef.current?.focus();
      }
    },
    [onCommit],
  );

  const exitEditMode = (revert: boolean) => {
    if (revert) setInputValue(cwd);
    setSuggestions([]);
    setActiveIndex(-1);
    setIsEditing(false);
    setIsValidating(false);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const hasSuggestions = suggestions.length > 0;

    if (e.key === "Escape") {
      e.preventDefault();
      exitEditMode(true);
      return;
    }

    if (e.key === "ArrowDown" && hasSuggestions) {
      e.preventDefault();
      const { segment } = splitPath(inputValue);
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().startsWith(segment.toLowerCase()),
      );
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }

    if (e.key === "ArrowUp" && hasSuggestions) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
      return;
    }

    if (e.key === "Tab" && hasSuggestions) {
      e.preventDefault();
      const { segment } = splitPath(inputValue);
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().startsWith(segment.toLowerCase()),
      );
      const idx = activeIndex >= 0 ? activeIndex : 0;
      if (filtered[idx]) {
        selectSuggestion(filtered[idx]);
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      // If there's an active suggestion, select it first
      if (hasSuggestions && activeIndex >= 0) {
        const { segment } = splitPath(inputValue);
        const filtered = suggestions.filter((s) =>
          s.toLowerCase().startsWith(segment.toLowerCase()),
        );
        if (filtered[activeIndex]) {
          selectSuggestion(filtered[activeIndex]);
          return;
        }
      }
      await commitValue(inputValue);
    }
  };

  const selectSuggestion = (entry: string) => {
    const { parent } = splitPath(inputValue);
    // If input ends with "/", parent already is the full dir
    const newValue = parent + entry + "/";
    setInputValue(newValue);
    setSuggestions([]);
    setActiveIndex(-1);
    triggerAutocomplete(newValue);
    inputRef.current?.focus();
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Don't close if focus moves to the dropdown
    if (
      dropdownRef.current &&
      dropdownRef.current.contains(e.relatedTarget as Node)
    ) {
      return;
    }
    exitEditMode(true);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+click → copy
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

  // Render

  if (isEditing) {
    return (
      <div
        ref={wrapperRef}
        style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0 }}
      >
        <input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            border: "1px solid var(--vscode-focusBorder)",
            borderRadius: "3px",
            padding: "1px 4px",
            fontSize: "11px",
            fontWeight: "600",
            fontFamily: "var(--vscode-editor-font-family, monospace)",
            outline: "none",
          }}
        />
        {isValidating && (
          <span
            className="codicon codicon-loading"
            style={{
              fontSize: "11px",
              marginLeft: "4px",
              animation: "spin 1.5s linear infinite",
              flexShrink: 0,
              opacity: 0.7,
            }}
          />
        )}
        {anchorRect && (
          <AutocompleteDropdown
            anchorRect={anchorRect}
            entries={suggestions}
            segment={splitPath(inputValue).segment}
            onSelect={selectSuggestion}
            activeIndex={activeIndex}
            containerRef={dropdownRef}
          />
        )}
      </div>
    );
  }

  // Display mode
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        flex: 1,
      }}
    >
      <FlashTooltip visible={showFlash} />
      <span
        title={readOnly ? cwd : "Double-click to edit · Ctrl+click to copy"}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className="truncate"
        style={{
          color: "var(--vscode-foreground)",
          fontSize: "12px",
          fontWeight: "600",
          cursor: readOnly ? "default" : "pointer",
          userSelect: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
          // Subtle underline hint that it's interactive
          borderBottom: readOnly ? "none" : "1px dashed transparent",
          transition: "border-color 0.1s",
        }}
        onMouseEnter={(e) => {
          if (!readOnly) {
            (e.currentTarget as HTMLElement).style.borderBottomColor =
              "var(--vscode-descriptionForeground)";
          }
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
