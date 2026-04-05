import React from "react";
import Ansi from "ansi-to-react";
import { FluxTermBlock, OutputLine } from "../../../types/MessageProtocol";

interface LineProps {
  line: OutputLine;
  /** Text typed by the user, appended inline after the line (e.g. prompt answer). */
  inlineInput?: string;
  highlighted: boolean;
}

const OutputLineRow: React.FC<LineProps> = ({
  line,
  inlineInput,
  highlighted,
}) => {
  const color =
    line.type === "stderr"
      ? "var(--vscode-testing-iconFailed, var(--vscode-terminal-ansiRed, #f14c4c))"
      : "var(--vscode-editor-foreground)";

  return (
    <div
      style={{
        color,
        backgroundColor: highlighted ? "rgba(255,197,0,0.15)" : "transparent",
        borderRadius: highlighted ? "2px" : undefined,
        display: "flex",
        flexWrap: "wrap",
      }}
    >
      <Ansi useClasses>{line.text}</Ansi>
      {inlineInput !== undefined && (
        <span
          style={{
            color: "var(--vscode-button-background)",
            marginLeft: "0.25ch",
            opacity: 0.9,
          }}
        >
          {inlineInput}
        </span>
      )}
    </div>
  );
};

// Not used any longger
/** Standalone row for a stdin line that has no preceding prompt to attach to. */
const StandaloneStdinRow: React.FC<{ text: string; highlighted: boolean }> = ({
  text,
  highlighted,
}) => (
  <div
    style={{
      color: "var(--vscode-button-background)",
      backgroundColor: highlighted ? "rgba(255,197,0,0.15)" : "transparent",
      borderRadius: highlighted ? "2px" : undefined,
    }}
  >
    {text}
  </div>
);

// Build display rows — merge each stdin line onto the preceding output line.
interface DisplayRow {
  line: OutputLine;
  inlineInput?: string;
}

function buildDisplayRows(lines: OutputLine[]): DisplayRow[] {
  const rows: DisplayRow[] = [];

  for (const line of lines) {
    if (line.type === "stdin") {
      if (rows.length > 0) {
        // Append to the last row's inlineInput (handles multiple inputs)
        const last = rows[rows.length - 1];
        rows[rows.length - 1] = {
          ...last,
          inlineInput:
            last.inlineInput !== undefined
              ? last.inlineInput + " " + line.text
              : line.text,
        };
      } else {
        // No preceding line — render as a standalone row using a dummy stdout line
        rows.push({ line: { type: "stdout", text: line.text } });
      }
    } else {
      rows.push({ line });
    }
  }

  return rows;
}

export const OutputArea: React.FC<{
  block: FluxTermBlock;
  searchQuery: string;
}> = ({ block, searchQuery }) => {
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
  const rows = buildDisplayRows(block.output);

  return (
    <div
      style={{
        marginTop: "8px",
        padding: "4px 8px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        fontFamily:
          "var(--vscode-terminal-font-family, --vscode-editor-font-family, 'Fira Code Nerd Font Mono', monospace)",
        fontSize: "12px",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        color: "var(--vscode-terminal-foreground, var(--vscode-editor-foreground))",
        maxHeight: "300px",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {rows.map((row, i) => {
        const highlighted =
          lowerQuery !== "" &&
          (row.line.text.toLowerCase().includes(lowerQuery) ||
            (row.inlineInput?.toLowerCase().includes(lowerQuery) ?? false));

        return (
          <OutputLineRow
            key={i}
            line={row.line}
            inlineInput={row.inlineInput}
            highlighted={highlighted}
          />
        );
      })}
    </div>
  );
};
