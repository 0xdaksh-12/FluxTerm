// SearchBar.tsx — Output search input with match count, shown inside a block.

import React from "react";

interface SearchBarProps {
  query: string;
  matchCount: number;
  onChange: (q: string) => void;
  onClose: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  matchCount,
  onChange,
  onClose,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 6px",
      backgroundColor: "var(--vscode-editorWidget-background)",
      border: "1px solid var(--vscode-panel-border)",
      borderRadius: "4px",
      marginBottom: "8px",
    }}
  >
    <span
      className="codicon codicon-search"
      style={{ fontSize: "12px", opacity: 0.6 }}
    />
    <input
      autoFocus
      type="text"
      value={query}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search output…"
      style={{
        flex: 1,
        background: "transparent",
        border: "none",
        outline: "none",
        color: "var(--vscode-editor-foreground)",
        fontFamily: "inherit",
        fontSize: "12px",
      }}
    />
    {query && (
      <span
        style={{
          fontSize: "10px",
          color: "var(--vscode-descriptionForeground)",
          whiteSpace: "nowrap",
        }}
      >
        {matchCount} match{matchCount !== 1 ? "es" : ""}
      </span>
    )}
    <button
      onClick={onClose}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--vscode-icon-foreground)",
        padding: "0 2px",
      }}
    >
      <span className="codicon codicon-close" style={{ fontSize: "12px" }} />
    </button>
  </div>
);
