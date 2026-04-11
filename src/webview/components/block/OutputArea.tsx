import React from "react";
import Ansi from "ansi-to-react";
import { FluxTermBlock, OutputLine } from "../../../types/MessageProtocol";

// Shared date formatter
function formatSeparatorDate(isoOrMs: string | number): string {
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  if (isNaN(d.getTime())) return String(isoOrMs);
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
      : undefined;

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

interface DisplayRow {
  line: OutputLine;
  inlineInput?: string;
}

function buildDisplayRows(lines: OutputLine[]): DisplayRow[] {
  const rows: DisplayRow[] = [];
  for (const line of lines) {
    if (line.type === "stdin") {
      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        rows[rows.length - 1] = {
          ...last,
          inlineInput:
            last.inlineInput !== undefined
              ? last.inlineInput + " " + line.text
              : line.text,
        };
      } else {
        rows.push({ line: { type: "stdout", text: line.text } });
      }
    } else {
      rows.push({ line });
    }
  }
  return rows;
}

// ─── Run session group (separator + its output lines) ────────────────────────

interface RunGroup {
  /** ISO string / ms timestamp from the separator line */
  separatorText: string;
  rows: DisplayRow[];
}

/**
 * Splits flat display rows into groups, one per separator.
 * Lines before the first separator get their own group with an empty label
 * (shouldn't happen in practice since every real block starts with one).
 */
function buildRunGroups(rows: DisplayRow[]): RunGroup[] {
  const groups: RunGroup[] = [];
  let current: RunGroup | null = null;

  for (const row of rows) {
    if (row.line.type === "separator") {
      if (current) groups.push(current);
      current = { separatorText: row.line.text, rows: [] };
    } else {
      if (!current) current = { separatorText: "", rows: [] };
      current.rows.push(row);
    }
  }
  if (current) groups.push(current);
  return groups;
}

// ─── OutputArea ───────────────────────────────────────────────────────────────

export const OutputArea: React.FC<{
  block: FluxTermBlock;
  searchQuery: string;
}> = ({ block, searchQuery }) => {
  const { output, status, clearedAt, clearedAtTime } = block;

  // Slice to only the visible lines (after the last clear)
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
  const allRows = buildDisplayRows(visibleLines);

  // If the output was cleared and the first visible line is not a separator,
  // prepend a synthetic separator using clearedAtTime so the group gets a label.
  const rowsWithClearHeader: DisplayRow[] =
    clearedAt !== null &&
    clearedAtTime !== null &&
    allRows[0]?.line.type !== "separator"
      ? [
          { line: { type: "separator", text: String(clearedAtTime) } },
          ...allRows,
        ]
      : allRows;

  const groups = buildRunGroups(rowsWithClearHeader);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0",
      }}
    >
      {groups.map((group, gi) => {
        const label = group.separatorText
          ? formatSeparatorDate(group.separatorText)
          : null;

        return (
          <div key={gi}>
            {/* Timestamp label */}
            {label && (
              <span
                style={{
                  display: "block",
                  color: "var(--vscode-descriptionForeground)",
                  fontSize: "10px",
                  fontStyle: "italic",
                  userSelect: "none",
                  marginTop: gi === 0 ? "0" : "14px",
                  marginBottom: "3px",
                  fontFamily:
                    "var(--vscode-editor-font-family, var(--vscode-terminal-font-family, monospace))",
                }}
              >
                [{label}]
              </span>
            )}

            {/* Output block */}
            {group.rows.length > 0 && (
              <div
                style={{
                  padding: "4px 8px 4px 10px",
                  borderLeft:
                    "2px solid var(--vscode-charts-blue, var(--vscode-button-background, #007fd4))",
                  color:
                    "var(--vscode-terminal-foreground, var(--vscode-editor-foreground))",
                  fontFamily:
                    "var(--vscode-terminal-font-family, var(--vscode-editor-font-family, monospace))",
                  fontSize: "12px",
                  lineHeight: "1.5",
                  overflowX: "auto",
                  whiteSpace: "pre",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  borderTopLeftRadius: "2px",
                  borderBottomLeftRadius: "2px",
                  maxHeight: "300px",
                  overflowY: "auto",
                }}
              >
                {group.rows.map((row, ri) => {
                  const highlighted =
                    lowerQuery !== "" &&
                    (row.line.text.toLowerCase().includes(lowerQuery) ||
                      (row.inlineInput?.toLowerCase().includes(lowerQuery) ??
                        false));
                  return (
                    <OutputLineRow
                      key={ri}
                      line={row.line}
                      inlineInput={row.inlineInput}
                      highlighted={highlighted}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
