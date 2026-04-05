import React, { useState, useRef, useEffect } from "react";

interface BlockDocumentProps {
  /**
   * Display name for this group of blocks.
   * Editable inline on double-click.
   */
  groupName: string;
  onGroupNameChange?: (name: string) => void;
  /** Whether any block in this document is currently running. */
  isAnyRunning?: boolean;
  /** Triggered by the "Run All" button. */
  onRunAll?: () => void;
  children: React.ReactNode;
}

/**
 * Document-level wrapper for a group of blocks.
 *
 * Renders a sticky header bar containing:
 *   - A folder icon + editable group name (double-click to edit)
 *   - A "Run All" button
 *
 * Below the header the block list is rendered with consistent padding and gap.
 */
export const BlockDocument: React.FC<BlockDocumentProps> = ({
  groupName,
  onGroupNameChange,
  isAnyRunning = false,
  onRunAll,
  children,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(groupName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external groupName changes into local edit value when not editing
  useEffect(() => {
    if (!isEditing) setEditValue(groupName);
  }, [groupName, isEditing]);

  // Auto-focus the name input when entering edit mode
  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const commitEdit = () => {
    const trimmed = editValue.trim() || groupName;
    setIsEditing(false);
    setEditValue(trimmed);
    onGroupNameChange?.(trimmed);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") {
      setEditValue(groupName);
      setIsEditing(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "var(--vscode-input-background)",
        border: "1px solid var(--vscode-panel-border)",
        borderRadius: "4px",
        overflow: "hidden",
        width: "100%",
      }}
    >
      {/* Document header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 1rem",
          height: "36px",
          backgroundColor: "var(--vscode-editorWidget-background)",
          borderBottom: "1px solid var(--vscode-panel-border)",
          fontFamily: "var(--vscode-editor-font-family, monospace)",
          userSelect: "none",
        }}
      >
        {/* Left: folder icon + document name */}
        <div className="flex items-center gap-2">
          <span
            className="codicon codicon-folder"
            style={{
              fontSize: "14px",
              color: "var(--vscode-foreground)",
              flexShrink: 0,
            }}
          />
          {isEditing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleNameKeyDown}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--vscode-focusBorder)",
                outline: "none",
                color: "var(--vscode-foreground)",
                fontFamily: "inherit",
                fontSize: "12px",
                fontWeight: 500,
                minWidth: "80px",
                width: `${Math.max(80, editValue.length * 7.5)}px`,
                padding: "0 2px",
              }}
            />
          ) : (
            <span
              style={{
                color: "var(--vscode-foreground)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "text",
              }}
              title="Double-click to rename"
              onDoubleClick={() => setIsEditing(true)}
            >
              {groupName}
            </span>
          )}
        </div>

        {/* Right: Run All button */}
        <button
          onClick={onRunAll}
          disabled={isAnyRunning}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isAnyRunning
              ? "var(--vscode-button-secondaryBackground)"
              : "var(--vscode-button-background)",
            color: isAnyRunning
              ? "var(--vscode-button-secondaryForeground)"
              : "var(--vscode-button-foreground)",
            border: "none",
            padding: "0 12px",
            gap: "6px",
            height: "24px",
            borderRadius: "2px",
            cursor: isAnyRunning ? "not-allowed" : "pointer",
            fontWeight: "bold",
            fontSize: "11px",
            fontFamily: "var(--vscode-font-family)",
            opacity: isAnyRunning ? 0.6 : 1,
            transition: "opacity 150ms",
          }}
          onMouseEnter={(e) => {
            if (!isAnyRunning)
              e.currentTarget.style.backgroundColor =
                "var(--vscode-button-hoverBackground)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = isAnyRunning
              ? "var(--vscode-button-secondaryBackground)"
              : "var(--vscode-button-background)";
          }}
        >
          <span
            className="codicon codicon-run-all"
            style={{ fontSize: "14px" }}
          />
          Run All
        </button>
      </div>

      {/* Block list */}
      <div
        className="flex flex-col"
        style={{ gap: "1rem", padding: "1rem" }}
      >
        {children}
      </div>
    </div>
  );
};

export default BlockDocument;
