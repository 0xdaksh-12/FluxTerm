// ToolbarButton.tsx — Icon button for the block toolbar.

import React, { forwardRef } from "react";

export interface ToolbarButtonProps {
  icon: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ icon, title, active, onClick }, ref) => (
    <button
      ref={ref}
      title={title}
      onClick={onClick}
      style={{
        background: active
          ? "var(--vscode-toolbar-activeBackground)"
          : "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--vscode-icon-foreground)",
        padding: "3px 4px",
        borderRadius: "3px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor =
          "var(--vscode-toolbar-hoverBackground)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = active
          ? "var(--vscode-toolbar-activeBackground)"
          : "transparent";
      }}
    >
      <span className={`codicon ${icon}`} style={{ fontSize: "14px" }} />
    </button>
  ),
);

ToolbarButton.displayName = "ToolbarButton";
