// BlockInput.tsx — Per-block stdin input, shown only while the block is running.

import React, { useState } from "react";
import { flowService } from "../../services/FlowService";

interface BlockInputProps {
  blockId: string;
}

export const BlockInput: React.FC<BlockInputProps> = ({ blockId }) => {
  const [value, setValue] = useState("");

  const handleSend = () => {
    const text = value.trim();
    if (!text) {
      return;
    }
    flowService.sendInput(blockId, text);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginTop: "8px",
        paddingTop: "8px",
        borderTop: "1px solid var(--vscode-panel-border)",
      }}
    >
      <span
        style={{ color: "var(--vscode-button-background)", fontWeight: "bold" }}
      >
        &gt;
      </span>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Send input to process…"
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--vscode-editor-foreground)",
          caretColor: "var(--vscode-editorCursor-foreground)",
          fontFamily: "inherit",
          fontSize: "12px",
        }}
      />
      <button
        onClick={handleSend}
        disabled={!value.trim()}
        style={{
          background: "transparent",
          border: "none",
          cursor: value.trim() ? "pointer" : "not-allowed",
          color: value.trim()
            ? "var(--vscode-button-background)"
            : "var(--vscode-disabledForeground)",
          padding: "2px 4px",
        }}
      >
        <span className="codicon codicon-send" style={{ fontSize: "14px" }} />
      </button>
    </div>
  );
};
