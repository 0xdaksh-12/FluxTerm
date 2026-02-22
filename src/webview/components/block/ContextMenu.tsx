// ContextMenu.tsx — Right-click / "more" action menu for a block.
// Includes MenuItem and MenuDivider as co-located helpers.

import React, { useRef, useEffect } from "react";
import { FlowBlock } from "../../../types/MessageProtocol";

// ─── MenuItem ─────────────────────────────────────────────────────────────────

interface MenuItemProps {
  icon: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  label,
  danger,
  disabled,
  onClick,
}) => (
  <button
    disabled={disabled}
    onClick={onClick}
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 12px",
      background: "transparent",
      border: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      color: danger
        ? "var(--vscode-errorForeground)"
        : "var(--vscode-menu-foreground)",
      fontSize: "12px",
      fontFamily: "inherit",
      opacity: disabled ? 0.4 : 1,
      textAlign: "left",
    }}
    onMouseEnter={(e) => {
      if (!disabled) {
        e.currentTarget.style.backgroundColor =
          "var(--vscode-menu-selectionBackground)";
        e.currentTarget.style.color = "var(--vscode-menu-selectionForeground)";
      }
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = "transparent";
      e.currentTarget.style.color = danger
        ? "var(--vscode-errorForeground)"
        : "var(--vscode-menu-foreground)";
    }}
  >
    <span className={`codicon ${icon}`} style={{ fontSize: "13px" }} />
    {label}
  </button>
);

// ─── MenuDivider ──────────────────────────────────────────────────────────────

export const MenuDivider: React.FC = () => (
  <div
    style={{
      height: "1px",
      margin: "2px 8px",
      backgroundColor:
        "var(--vscode-menu-separatorBackground, var(--vscode-panel-border))",
    }}
  />
);

// ─── ContextMenu ──────────────────────────────────────────────────────────────

export interface ContextMenuProps {
  block: FlowBlock;
  onCopyOutput: () => void;
  onReRun: () => void;
  onKill: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  block,
  onCopyOutput,
  onReRun,
  onKill,
  onDelete,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: "4px",
        backgroundColor: "var(--vscode-menu-background)",
        border: "1px solid var(--vscode-menu-border)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        zIndex: 100,
        minWidth: "180px",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      <MenuItem
        icon="codicon-copy"
        label="Copy Output"
        onClick={onCopyOutput}
      />
      <MenuItem icon="codicon-refresh" label="Re-run" onClick={onReRun} />
      <MenuDivider />
      <MenuItem
        icon="codicon-circle-slash"
        label="Kill Process"
        disabled={block.status !== "running"}
        danger
        onClick={onKill}
      />
      <MenuDivider />
      <MenuItem
        icon="codicon-trash"
        label="Delete Block"
        danger
        onClick={onDelete}
      />
    </div>
  );
};
