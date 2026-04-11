import React from "react";
import Ansi from "ansi-to-react";

const MOCK_LL_OUTPUT = [
  "\x1b[4mPermissions\x1b[0m \x1b[4mSize\x1b[0m \x1b[4mUser\x1b[0m  \x1b[4mDate Modified\x1b[0m \x1b[4mName\x1b[0m",
  ".\x1b[1;33mr\x1b[31mw\x1b[90m-\x1b[0m\x1b[33mr\x1b[31mw\x1b[1;90m-\x1b[0m\x1b[33mr\x1b[1;90m--\x1b[0m  \x1b[33m2.1M\x1b[0m \x1b[1;33mdaksh\x1b[0m \x1b[34m15 Mar 16:52\x1b[0m  \x1b[35m a83d694d-1438-4b0e-9f5e-4e7d8b9be62a.png\x1b[0m",
  ".\x1b[1;33mr\x1b[31mw\x1b[90m-\x1b[0m\x1b[33mr\x1b[31mw\x1b[1;90m-\x1b[0m\x1b[33mr\x1b[1;90m--\x1b[0m   \x1b[1;32m12k\x1b[0m \x1b[1;33mdaksh\x1b[0m \x1b[34m22 Mar 12:37\x1b[0m   index.flow",
  ".\x1b[1;33mr\x1b[31mw\x1b[90m-\x1b[0m\x1b[33mr\x1b[31mw\x1b[1;90m-\x1b[0m\x1b[33mr\x1b[1;90m--\x1b[0m   \x1b[1;32m86k\x1b[0m \x1b[1;33mdaksh\x1b[0m \x1b[34m18 Mar 17:35\x1b[0m  \x1b[32m 'Java Assignment-1.pdf'\x1b[0m",
  ".\x1b[1;33mr\x1b[31mw\x1b[90m-\x1b[0m\x1b[33mr\x1b[31mw\x1b[1;90m-\x1b[0m\x1b[33mr\x1b[1;90m--\x1b[0m  \x1b[1;32m100k\x1b[0m \x1b[1;33mdaksh\x1b[0m \x1b[34m18 Mar 17:35\x1b[0m  \x1b[32m 'Java Assignment-2.pdf'\x1b[0m",
  ".\x1b[1;33mr\x1b[31mw\x1b[90m-\x1b[0m\x1b[33mr\x1b[31mw\x1b[1;90m-\x1b[0m\x1b[33mr\x1b[1;90m--\x1b[0m   \x1b[1;32m94k\x1b[0m \x1b[1;33mdaksh\x1b[0m \x1b[34m18 Mar 17:35\x1b[0m  \x1b[32m 'Java Assignment 3.pdf'\x1b[0m",
  ".\x1b[1;33mr\x1b[31mw\x1b[90m-\x1b[0m\x1b[33mr\x1b[31mw\x1b[1;90m-\x1b[0m\x1b[33mr\x1b[1;90m--\x1b[0m   \x1b[32m171\x1b[0m \x1b[1;33mdaksh\x1b[0m \x1b[34m22 Mar 12:58\x1b[0m   output.txt",
  ".\x1b[1;33mr\x1b[31mw\x1b[90m-\x1b[0m\x1b[33mr\x1b[31mw\x1b[1;90m-\x1b[0m\x1b[33mr\x1b[1;90m--\x1b[0m     \x1b[32m0\x1b[0m \x1b[1;33mdaksh\x1b[0m \x1b[34m22 Mar 13:00\x1b[0m   output1.txt",
];

/**
 *
 * No Tailwindcss Use
 */

const availableShells = [
  {
    label: "bash",
    path: "/bin/bash",
    icon: "codicon-terminal-bash",
  },
  {
    label: "zsh",
    path: "/bin/zsh",
    icon: "codicon-terminal-bash",
  },
  {
    label: "fish",
    path: "/bin/fish",
    icon: "codicon-terminal-bash",
  },
  {
    label: "powershell",
    path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    icon: "codicon-terminal-powershell",
  },
  {
    label: "cmd",
    path: "C:\\Windows\\System32\\cmd.exe",
    icon: "codicon-terminal-cmd",
  },
];

export type BlockStatus = "idle" | "running" | "done";

const MockInputSection = ({
  title,
  command = "",
  hasOutput = true,
  status = "idle",
  requiresInput = false,
}: {
  title?: string;
  command?: string;
  hasOutput?: boolean;
  status?: BlockStatus;
  requiresInput?: boolean;
}) => {
  return (
    <div
      className="action-toolbar-wrapper"
      style={{ position: "relative", width: "100%" }}
    >
      <style>{`
        .action-toolbar-wrapper {
          position: relative;
        }
        .action-toolbar {
          position: absolute;
          top: -4px;
          right: 0px;
          display: flex;
          align-items: center;
          gap: 2px;
          z-index: 30;
          background-color: #252526;
          border: 1px solid #3c3c3c;
          border-radius: 6px;
          padding: 4px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          opacity: 0.2;
          transition: all 0.2s ease-in-out;
        }
        .action-toolbar-wrapper:hover .action-toolbar {
          opacity: 1;
        }
        .action-icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          color: #858585;
          background: transparent;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
          width: 24px;
          height: 24px;
        }
        .action-icon-btn:hover {
          background-color: #3c3c3c;
          color: #ffffff;
        }
        .action-icon-btn.drag-handle {
          cursor: grab;
        }
        .action-divider {
          width: 1px;
          height: 16px;
          background-color: #333333;
          margin: 0 2px;
        }
      `}</style>
      <div className="action-toolbar">
        <button className="action-icon-btn" title="Add">
          <span
            className="codicon codicon-add"
            style={{ fontSize: "14px" }}
          ></span>
        </button>
        {status === "running" ? (
          <button className="action-icon-btn" title="Stop">
            <span
              className="codicon codicon-debug-stop"
              style={{
                fontSize: "14px",
                color: "var(--vscode-testing-iconFailed, #f14c4c)",
              }}
            ></span>
          </button>
        ) : (
          <button className="action-icon-btn" title="Re-run">
            <span
              className="codicon codicon-refresh"
              style={{ fontSize: "14px" }}
            ></span>
          </button>
        )}
        <button className="action-icon-btn" title="Search">
          <span
            className="codicon codicon-search"
            style={{ fontSize: "14px" }}
          ></span>
        </button>
        <button className="action-icon-btn" title="Delete">
          <span
            className="codicon codicon-trash"
            style={{ fontSize: "14px" }}
          ></span>
        </button>
        <div className="action-divider"></div>
        <button className="action-icon-btn drag-handle" title="Drag to split">
          <span
            className="codicon codicon-gripper"
            style={{ fontSize: "14px" }}
          ></span>
        </button>
        <div className="action-divider"></div>
        <button className="action-icon-btn" title="More">
          <span
            className="codicon codicon-more"
            style={{ fontSize: "14px" }}
          ></span>
        </button>
      </div>
      <div
        style={{
          backgroundColor: "var(--vscode-input-background)",
          border: "1px solid var(--vscode-panel-border)",
          display: "flex",
          flexDirection: "column",
          borderRadius: "4px",
          overflow: "hidden",
          transition: "all 100ms",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--vscode-focusBorder)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--vscode-panel-border)";
        }}
      >
        {/* Context Bar */}
        <div
          style={{
            backgroundColor: "var(--vscode-editorWidget-background)",
            borderBottom: "1px solid var(--vscode-panel-border)",
            color: "var(--vscode-descriptionForeground)",
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            height: "28px",
            fontSize: "12px",
            fontFamily: "var(--vscode-editor-font-family, monospace)",
            userSelect: "none",
          }}
        >
          {/* Shell Dropdown */}
          <button
            style={{
              color: "var(--vscode-foreground)",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              padding: "0 0.75rem",
              border: "none",
              borderRight: "1px solid var(--vscode-panel-border)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <span
              className="codicon codicon-terminal"
              style={{ fontSize: "14px" }}
            />
            <span style={{ fontSize: "11px", fontWeight: "bold" }}>bash</span>
            <span
              className="codicon codicon-chevron-down"
              style={{
                fontSize: "12px",
                color: "var(--vscode-descriptionForeground)",
                marginLeft: "2px",
              }}
            />
          </button>

          {status === "running" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0 0.5rem",
                color: "var(--vscode-button-background)",
                flex: 1,
              }}
            >
              <span
                className="codicon codicon-loading"
                style={{
                  fontSize: "12px",
                  animation: "spin 1.5s linear infinite",
                }}
              />
              <span style={{ fontSize: "11px", fontWeight: "bold" }}>
                Running
              </span>
            </div>
          ) : (
            <>
              {/* Branch */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0 0.5rem",
                  borderRight: "1px solid var(--vscode-panel-border)",
                }}
              >
                <span
                  className="codicon codicon-git-branch"
                  style={{ fontSize: "12px" }}
                />
                <span style={{ fontSize: "11px" }}>main</span>
              </div>

              {/* Path */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0 0.5rem",
                  cursor: "pointer",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span
                  className="codicon codicon-folder-opened"
                  style={{ fontSize: "12px" }}
                />
                <span
                  style={{
                    color: "var(--vscode-button-background)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: "11px",
                  }}
                >
                  /home/daksh/Desktop/FUCK/FluxTerm
                </span>
              </div>
            </>
          )}
        </div>
        {/* Input Area */}
        <div
          style={{
            backgroundColor: "var(--vscode-input-background)",
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            padding: "0.6rem 0.75rem",
            gap: "0.5rem",
          }}
        >
          <span
            style={{
              color: "var(--vscode-button-background)",
              fontWeight: "bold",
              fontSize: "12px",
              lineHeight: "1.4",
            }}
          >
            $
          </span>
          <textarea
            autoFocus
            style={{
              backgroundColor: "transparent",
              color: "var(--vscode-editor-foreground)",
              caretColor: "var(--vscode-editorCursor-foreground)",
              flex: 1,
              border: "none",
              padding: 0,
              outline: "none",
              fontFamily: "var(--vscode-editor-font-family, monospace)",
              fontSize: "12px",
              lineHeight: "1.4",
              resize: "none",
              overflow: "hidden",
            }}
            rows={command ? command.split("\n").length : 1}
            defaultValue={command}
            placeholder="Type a command..."
          />
          <button
            style={{
              color: "var(--vscode-button-background)",
              border: "none",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.25rem",
              cursor: "pointer",
              borderRadius: "4px",
            }}
          >
            <span
              className="codicon codicon-arrow-right"
              style={{ fontSize: "18px" }}
            />
          </button>
        </div>

        {status === "done" && !hasOutput && (
          <div
            style={{
              padding: "4px 8px 4px 12px",
              marginLeft: "12px",
              marginBottom: "12px",
              fontSize: "12px",
              fontStyle: "italic",
              opacity: 0.4,
            }}
          >
            (no output)
          </div>
        )}
        {status === "done" && hasOutput && (
          <div>
            <span
              style={{
                color: "var(--vscode-descriptionForeground)",
                fontSize: "12px",
                marginLeft: "12px",
              }}
            >
              [11:57:56 PM]
            </span>
            <div
              style={{
                marginTop: "0",
                marginBottom: "12px",
                padding: "4px 8px 4px 12px",
                marginLeft: "12px",
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
              }}
            >
              {MOCK_LL_OUTPUT.map((line, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    backgroundColor: "transparent",
                  }}
                >
                  <Ansi useClasses>{line}</Ansi>
                </div>
              ))}
            </div>
          </div>
        )}

        {requiresInput && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
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
              type="text"
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
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--vscode-button-background)",
                padding: "2px 4px",
              }}
            >
              <span
                className="codicon codicon-send"
                style={{ fontSize: "14px" }}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const MockDocument = ({
  children,
  path = "/home/usr/bin",
}: {
  children: React.ReactNode;
  path?: string;
}) => {
  return (
    <div
      style={{
        backgroundColor: "var(--vscode-input-background)",
        border: "1px solid var(--vscode-panel-border)",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 1rem",
          height: "36px",
          backgroundColor: "var(--vscode-editorWidget-background, transparent)",
          borderBottom: "1px solid var(--vscode-panel-border)",
          fontFamily: "var(--vscode-editor-font-family, monospace)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "var(--vscode-descriptionForeground)",
            fontSize: "12px",
          }}
        >
          <span
            className="codicon codicon-folder"
            style={{ fontSize: "14px", color: "var(--vscode-foreground)" }}
          />
          <span style={{ color: "var(--vscode-foreground)", fontWeight: 500 }}>
            {path}
          </span>
        </div>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--vscode-button-background)",
            color: "var(--vscode-button-foreground)",
            border: "none",
            padding: "4px 12px",
            gap: "6px",
            height: "24px",
            borderRadius: "2px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "11px",
          }}
        >
          <span
            className="codicon codicon-run-all"
            style={{ fontSize: "14px" }}
          />
          Run All
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          padding: "1rem",
        }}
      >
        {children}
      </div>
    </div>
  );
};

function workspace() {
  return (
    <div
      style={{
        backgroundColor: "var(--vscode-editor-background)",
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "1rem",
        gap: "1rem",
        boxSizing: "border-box",
      }}
    >
      <MockDocument path="/home/usr/bin">
        <MockInputSection
          command="echo 'Hello World!'"
          status="done"
          hasOutput={false}
        />
        <MockInputSection command="ll" status="running" />
        <MockInputSection
          command="python main.py"
          status="running"
          requiresInput={true}
        />
        <MockInputSection
          command={"for i in {1..5}\ndo\n  echo $i\ndone"}
          status="idle"
        />
      </MockDocument>
      <MockDocument path="/home/usr/bin">
        <MockInputSection command="ls -la" status="done" hasOutput={true} />
      </MockDocument>
    </div>
  );
}

export default workspace;
