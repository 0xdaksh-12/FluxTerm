// StatusIcon.tsx — Visual status indicator for a block's execution state.

import React from "react";
import { BlockStatus } from "../../../types/MessageProtocol";

interface StatusIconProps {
  status: BlockStatus;
}

const ICONS: Record<BlockStatus, { icon: string; color: string } | null> = {
  idle: null,
  running: {
    icon: "codicon-loading",
    color: "var(--vscode-progressBar-background)",
  },
  done: {
    icon: "codicon-check",
    color: "var(--vscode-testing-iconPassed)",
  },
  error: {
    icon: "codicon-error",
    color: "var(--vscode-testing-iconFailed)",
  },
  killed: {
    icon: "codicon-circle-slash",
    color: "var(--vscode-disabledForeground)",
  },
};

export const StatusIcon: React.FC<StatusIconProps> = ({ status }) => {
  const cfg = ICONS[status];
  if (!cfg) {
    return null;
  }

  const isSpinning = status === "running";

  return (
    <span
      className={`codicon ${cfg.icon}`}
      style={{
        fontSize: "14px",
        color: cfg.color,
        animation: isSpinning ? "spin 2s linear infinite" : undefined,
      }}
    />
  );
};
