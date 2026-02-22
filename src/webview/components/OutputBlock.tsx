// =============================================================================
// OutputBlock.tsx
//
// Rich notebook block component that renders the full output of an executed
// command block, along with toolbar actions, per-block stdin, and search.
//
// Sub-components (all local to this file for locality):
//   StatusIcon     — spinner / check / error / slash icons
//   ToolbarButton  — icon button with hover + active state
//   ContextMenu    — right-click menu (copy, re-run, kill, delete)
//   MenuItem / MenuDivider
//   BlockInput     — active stdin input shown only while block is running
//   SearchBar      — text search input with match count
//   OutputArea     — ANSI-rendered output with search highlight
//   OutputBlock    — main container component
// =============================================================================

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
} from "react";
import Ansi from "ansi-to-react";
import { FlowBlock } from "../../types/MessageProtocol";
import { flowService } from "../services/FlowService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function shortenPath(p: string): string {
  return p.replace(/\\/g, "/");
}

// ─── StatusIcon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: FlowBlock["status"] }) {
  if (status === "running") {
    return (
      <span
        className="codicon codicon-loading"
        style={{
          fontSize: "14px",
          color: "var(--vscode-progressBar-background)",
          animation: "spin 2s linear infinite",
        }}
      />
    );
  }
  if (status === "done") {
    return (
      <span
        className="codicon codicon-check"
        style={{ fontSize: "14px", color: "var(--vscode-testing-iconPassed)" }}
      />
    );
  }
  if (status === "error") {
    return (
      <span
        className="codicon codicon-error"
        style={{ fontSize: "14px", color: "var(--vscode-testing-iconFailed)" }}
      />
    );
  }
  if (status === "killed") {
    return (
      <span
        className="codicon codicon-circle-slash"
        style={{ fontSize: "14px", color: "var(--vscode-disabledForeground)" }}
      />
    );
  }
  return null;
}

// ─── ToolbarButton ────────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  icon: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}

const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
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

// ─── MenuItem & MenuDivider ───────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
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
          e.currentTarget.style.color =
            "var(--vscode-menu-selectionForeground)";
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
}

function MenuDivider() {
  return (
    <div
      style={{
        height: "1px",
        margin: "2px 8px",
        backgroundColor:
          "var(--vscode-menu-separatorBackground, var(--vscode-panel-border))",
      }}
    />
  );
}

// ─── ContextMenu ──────────────────────────────────────────────────────────────

interface ContextMenuProps {
  block: FlowBlock;
  onCopyOutput: () => void;
  onReRun: () => void;
  onKill: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function ContextMenu({
  block,
  onCopyOutput,
  onReRun,
  onKill,
  onDelete,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
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
}

// ─── BlockInput (per-block stdin) ─────────────────────────────────────────────

function BlockInput({ blockId }: { blockId: string }) {
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
        style={{
          color: "var(--vscode-button-background)",
          fontWeight: "bold",
        }}
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
}

// ─── SearchBar ────────────────────────────────────────────────────────────────

function SearchBar({
  query,
  onChange,
  matchCount,
  onClose,
}: {
  query: string;
  onChange: (q: string) => void;
  matchCount: number;
  onClose: () => void;
}) {
  return (
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
}

// ─── OutputArea ───────────────────────────────────────────────────────────────

function OutputArea({
  block,
  searchQuery,
}: {
  block: FlowBlock;
  searchQuery: string;
}) {
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
      {block.output.map((line, i) => {
        const isMatch =
          lowerQuery !== "" && line.text.toLowerCase().includes(lowerQuery);

        const color =
          line.type === "stderr"
            ? "var(--vscode-testing-message-error-lineBackground, #f44747)"
            : line.type === "stdin"
              ? "var(--vscode-button-background)"
              : "var(--vscode-editor-foreground)";

        return (
          <div
            key={i}
            style={{
              color,
              backgroundColor: isMatch ? "rgba(255,197,0,0.15)" : "transparent",
              borderRadius: isMatch ? "2px" : undefined,
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
      })}
    </div>
  );
}

// ─── OutputBlock (main) ───────────────────────────────────────────────────────

export interface OutputBlockProps {
  block: FlowBlock;
  onDelete: (id: string) => void;
  onReRun: (id: string) => void;
}

export const OutputBlock: React.FC<OutputBlockProps> = ({
  block,
  onDelete,
  onReRun,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const isRunning = block.status === "running";

  const searchMatchCount = searchQuery
    ? block.output.filter((l) =>
        l.text.toLowerCase().includes(searchQuery.toLowerCase()),
      ).length
    : 0;

  const handleCopyOutput = useCallback(() => {
    const text = block.output.map((l) => l.text).join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    setShowMenu(false);
  }, [block.output]);

  const handleReRun = useCallback(() => {
    onReRun(block.id);
    setShowMenu(false);
  }, [block.id, onReRun]);

  const handleKill = useCallback(() => {
    flowService.killBlock(block.id);
    setShowMenu(false);
  }, [block.id]);

  const handleDelete = useCallback(() => {
    onDelete(block.id);
    setShowMenu(false);
  }, [block.id, onDelete]);

  // ── Container styling changes with execution status ──
  const containerStyle: React.CSSProperties = {
    position: "relative",
    borderRadius: "6px",
    padding: "10px 12px",
    marginBottom: "2px",
    border: isRunning
      ? "1px solid var(--vscode-progressBar-background, #007acc)"
      : "1px solid transparent",
    backgroundColor: isRunning ? "rgba(0, 122, 204, 0.04)" : "transparent",
    transition: "border-color 0.15s, background-color 0.15s",
  };

  // Running left accent stripe
  const leftAccentStyle: React.CSSProperties | undefined = isRunning
    ? {
        position: "absolute",
        left: 0,
        top: "10px",
        bottom: "10px",
        width: "2px",
        borderRadius: "2px",
        backgroundColor: "var(--vscode-progressBar-background, #007acc)",
      }
    : undefined;

  const indent = isRunning ? "10px" : undefined;

  return (
    <div
      className="group"
      style={containerStyle}
      onMouseEnter={(e) => {
        if (!isRunning) {
          e.currentTarget.style.backgroundColor =
            "var(--vscode-list-hoverBackground)";
          e.currentTarget.style.borderColor = "var(--vscode-panel-border)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isRunning) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.borderColor = "transparent";
        }
      }}
    >
      {/* Running accent stripe */}
      {leftAccentStyle && <div style={leftAccentStyle} />}

      {/* ── Toolbar (top-right, visible on hover or while running) ── */}
      <div
        className="block-toolbar"
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          display: "flex",
          alignItems: "center",
          gap: "2px",
          zIndex: 10,
          backgroundColor: "var(--vscode-editorWidget-background)",
          border: "1px solid var(--vscode-panel-border)",
          borderRadius: "4px",
          padding: "2px",
          opacity: isRunning ? 1 : 0,
        }}
      >
        <ToolbarButton
          icon="codicon-search"
          title="Search output"
          active={showSearch}
          onClick={() => setShowSearch((s) => !s)}
        />
        <ToolbarButton
          icon="codicon-refresh"
          title="Re-run"
          onClick={handleReRun}
        />
        <ToolbarButton
          icon="codicon-trash"
          title="Delete"
          onClick={handleDelete}
        />
        <div
          style={{
            width: "1px",
            height: "16px",
            backgroundColor: "var(--vscode-panel-border)",
            margin: "0 2px",
          }}
        />
        <div style={{ position: "relative" }}>
          <ToolbarButton
            ref={menuButtonRef}
            icon="codicon-ellipsis"
            title="More actions"
            active={showMenu}
            onClick={() => setShowMenu((m) => !m)}
          />
          {showMenu && (
            <ContextMenu
              block={block}
              onCopyOutput={handleCopyOutput}
              onReRun={handleReRun}
              onKill={handleKill}
              onDelete={handleDelete}
              onClose={() => setShowMenu(false)}
            />
          )}
        </div>
      </div>

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "11px",
          color: "var(--vscode-descriptionForeground)",
          marginBottom: "6px",
          userSelect: "none",
          paddingLeft: indent,
        }}
      >
        <span style={{ fontWeight: "bold", opacity: 0.7 }}>#{block.seq}</span>
        <StatusIcon status={block.status} />
        {isRunning ? (
          <span
            style={{
              color: "var(--vscode-progressBar-background)",
              fontWeight: 600,
            }}
          >
            Running
          </span>
        ) : (
          <span>{formatDate(block.createdAt)}</span>
        )}
      </div>

      {/* ── Command row ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "4px 8px",
          fontWeight: 500,
          paddingLeft: indent,
        }}
      >
        <span
          style={{
            color: "var(--vscode-button-background)",
            fontWeight: "bold",
          }}
        >
          [local]
        </span>
        {block.branch && (
          <>
            <span
              className="codicon codicon-git-branch"
              style={{ fontSize: "14px", opacity: 0.6 }}
            />
            <span style={{ color: "var(--vscode-descriptionForeground)" }}>
              {block.branch}
            </span>
          </>
        )}
        <span
          className="codicon codicon-folder-opened"
          style={{ fontSize: "14px", opacity: 0.6 }}
        />
        <span
          style={{ color: "var(--vscode-button-background)" }}
          title={block.cwd}
        >
          {shortenPath(block.cwd)}
        </span>
        <span
          style={{
            color: "var(--vscode-button-background)",
            fontWeight: "bold",
          }}
        >
          $
        </span>
        <span style={{ color: "var(--vscode-editor-foreground)" }}>
          {block.command}
        </span>
        {isRunning && (
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "14px",
              backgroundColor: "var(--vscode-editor-foreground)",
              opacity: 0.5,
              animation: "blink 1s step-start infinite",
            }}
          />
        )}
      </div>

      {/* ── Search bar ── */}
      {showSearch && (
        <div style={{ marginTop: "8px", paddingLeft: indent }}>
          <SearchBar
            query={searchQuery}
            onChange={setSearchQuery}
            matchCount={searchMatchCount}
            onClose={() => {
              setShowSearch(false);
              setSearchQuery("");
            }}
          />
        </div>
      )}

      {/* ── Output ── */}
      <div style={{ paddingLeft: indent }}>
        <OutputArea block={block} searchQuery={searchQuery} />
      </div>

      {/* ── Per-block stdin (running only) ── */}
      {isRunning && (
        <div style={{ paddingLeft: indent }}>
          <BlockInput blockId={block.id} />
        </div>
      )}
    </div>
  );
};

export default OutputBlock;
