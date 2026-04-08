import React from "react";
import Ansi from "ansi-to-react";
import { FluxTermBlock, OutputLine } from "../../../types/MessageProtocol";

// ─── Shared date formatter ────────────────────────────────────────────────────

function formatSeparatorDate(isoOrMs: string | number): string {
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  if (isNaN(d.getTime())) return String(isoOrMs);
  // e.g. "Tue Apr 8, 21:24:58"
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ─── Separator row ────────────────────────────────────────────────────────────

const SeparatorRow: React.FC<{ text: string; isFirst?: boolean }> = ({
  text,
  isFirst,
}) => {
  const label = formatSeparatorDate(text);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        margin: isFirst ? "4px 0" : "18px 0 4px 0",
        opacity: 0.55,
        userSelect: "none",
      }}
    >
      {/* Left rule */}
      <div
        style={{
          flex: "0 0 12px",
          height: "1px",
          backgroundColor: "var(--vscode-descriptionForeground)",
        }}
      />
      {/* Icon + label */}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "10px",
          fontStyle: "italic",
          color: "var(--vscode-descriptionForeground)",
          whiteSpace: "nowrap",
          fontFamily:
            "var(--vscode-editor-font-family, var(--vscode-terminal-font-family, monospace))",
        }}
      >
        <span
          className="codicon codicon-history"
          style={{ fontSize: "10px" }}
        />
        {label}
      </span>
      {/* Right rule */}
      <div
        style={{
          flex: 1,
          height: "1px",
          backgroundColor: "var(--vscode-descriptionForeground)",
        }}
      />
    </div>
  );
};

// ─── Output line row ──────────────────────────────────────────────────────────

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

// ─── Display row builder ──────────────────────────────────────────────────────

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

// ─── OutputArea ───────────────────────────────────────────────────────────────

export const OutputArea: React.FC<{
  block: FluxTermBlock;
  searchQuery: string;
}> = ({ block, searchQuery }) => {
  const { output, status, clearedAt, clearedAtTime } = block;

  // Slice output to only the visible lines (after the last clear)
  const visibleLines = clearedAt !== null ? output.slice(clearedAt) : output;

  // Empty states
  if (visibleLines.length === 0) {
    if (status === "running") {
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
    if (status === "done") {
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
  const rows = buildDisplayRows(visibleLines);

  return (
    <div
      style={{
        // marginTop: "8px",
        // padding: "4px 8px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        fontFamily:
          "var(--vscode-terminal-font-family, --vscode-editor-font-family, 'Fira Code Nerd Font Mono', monospace)",
        fontSize: "12px",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        color:
          "var(--vscode-terminal-foreground, var(--vscode-editor-foreground))",
        maxHeight: "300px",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Post-clear datetime header: shown only when there is no separator
          already at the top of visible output. If visibleLines[0] is itself
          a separator (the re-run timestamp) we show that instead \u2014 it carries
          more precise information than the clear time. */}
      {clearedAt !== null &&
        clearedAtTime !== null &&
        rows[0]?.line.type !== "separator" && (
          <SeparatorRow text={String(clearedAtTime)} isFirst={true} />
        )}

      {rows.map((row, i) => {
        // Separator lines are rendered as datetime dividers
        if (row.line.type === "separator") {
          return <SeparatorRow key={i} text={row.line.text} isFirst={i === 0} />;
        }

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
