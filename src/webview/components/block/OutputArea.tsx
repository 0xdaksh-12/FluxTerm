// OutputArea.tsx — Renders a block's streamed output lines with ANSI support
// and optional search-query highlighting.

import React from "react";
import Ansi from "ansi-to-react";
import { FlowBlock, OutputLine } from "../../../types/MessageProtocol";

interface OutputAreaProps {
  block: FlowBlock;
  searchQuery: string;
}

// ─── Line renderer ────────────────────────────────────────────────────────────

interface LineProps {
  line: OutputLine;
  highlighted: boolean;
}

const OutputLine: React.FC<LineProps> = ({ line, highlighted }) => {
  const color =
    line.type === "stderr"
      ? "var(--vscode-testing-message-error-lineBackground, #f44747)"
      : line.type === "stdin"
        ? "var(--vscode-button-background)"
        : "var(--vscode-editor-foreground)";

  return (
    <div
      style={{
        color,
        backgroundColor: highlighted ? "rgba(255,197,0,0.15)" : "transparent",
        borderRadius: highlighted ? "2px" : undefined,
      }}
    >
      {line.type === "stdin" ? (
        <span>
          <span style={{ opacity: 0.6 }}>&gt; </span>
          {line.text}
        </span>
      ) : (
        <Ansi>{line.text}</Ansi>
      )}
    </div>
  );
};

// ─── OutputArea ───────────────────────────────────────────────────────────────

export const OutputArea: React.FC<OutputAreaProps> = ({
  block,
  searchQuery,
}) => {
  if (block.output.length === 0) {
    if (block.status === "running") {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            opacity: 0.5,
            paddingLeft: "8px",
            marginTop: "8px",
            fontSize: "12px",
          }}
        >
          <span
            className="codicon codicon-loading"
            style={{ fontSize: "12px", animation: "spin 1.5s linear infinite" }}
          />
          <span>Waiting for output…</span>
        </div>
      );
    }
    if (block.status === "done") {
      return (
        <div
          style={{
            opacity: 0.4,
            paddingLeft: "8px",
            marginTop: "8px",
            fontSize: "12px",
            fontStyle: "italic",
          }}
        >
          (no output)
        </div>
      );
    }
    return null;
  }

  const lowerQuery = searchQuery.toLowerCase();

  return (
    <div
      style={{
        marginTop: "8px",
        paddingLeft: "8px",
        borderLeft: "2px solid var(--vscode-panel-border)",
        fontFamily:
          "var(--vscode-editor-font-family, 'JetBrains Mono', monospace)",
        fontSize: "12px",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {block.output.map((line, i) => (
        <OutputLine
          key={i}
          line={line}
          highlighted={
            lowerQuery !== "" && line.text.toLowerCase().includes(lowerQuery)
          }
        />
      ))}
    </div>
  );
};
