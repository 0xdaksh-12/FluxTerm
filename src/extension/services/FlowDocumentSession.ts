// =============================================================================
// FlowDocumentSession.ts
//
// Manages the lifecycle of a single .flow document editor panel.
//
// Responsibilities:
//   - Set up the webview and handle all incoming messages from it.
//   - Delegate block execution to the ExecutionEngine.
//   - Emit structured messages back to the webview via a typed `post()` helper.
//   - Detect the initial live context (cwd, git branch) before sending init.
//   - Persist FlowDocument to disk only when the webview sends an 'update'.
//
// This class deliberately holds NO notebook state (blocks, runtimeContext).
// All notebook state lives in the webview's notebookStore.
// =============================================================================

import * as vscode from "vscode";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

import {
  FlowDocument,
  WebviewMessage,
  ExtMessage,
  FlowContext,
} from "../../types/MessageProtocol";
import { Ext } from "../../utils/logger";
import { ShellResolver } from "./ShellResolver";
import { ExecutionEngine } from "./ExecutionEngine";

const execAsync = promisify(exec);

export class FlowDocumentSession {
  private isDisposed = false;
  private readonly disposables: vscode.Disposable[] = [];

  /** Serialised queue for document-write operations. */
  private isProcessing = false;
  private queue: Array<() => Promise<void>> = [];

  /** Execution engine owned by this session. */
  private readonly engine: ExecutionEngine;

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    // Wire up the engine's callbacks to post typed messages to the webview.
    this.engine = new ExecutionEngine({
      onStream: (blockId, lines) => {
        this.post({ type: "stream", blockId, lines });
      },
      onComplete: (payload) => {
        this.post({
          type: "blockComplete",
          blockId: payload.blockId,
          exitCode: payload.exitCode,
          finalCwd: payload.finalCwd,
          finalBranch: payload.finalBranch,
          status: payload.status,
        });
      },
      onError: (blockId, message) => {
        // Use the dedicated blockError type — not a stream line.
        this.post({ type: "blockError", blockId, message });
      },
    });

    this.setupMessageHandlers();
  }

  // ─── Webview Message Handling ───────────────────────────────────────────────

  private setupMessageHandlers() {
    this.panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        if (this.isDisposed) {
          return;
        }

        switch (message.type) {
          // ── Init ─────────────────────────────────────────────────────────────
          case "init": {
            // Resolve the live context asynchronously so we can provide
            // the real cwd and git branch rather than stale or empty values.
            const savedDoc = this.parseDocument();
            const liveCwd = this.getCwd();
            const liveBranch = await this.getGitBranch(liveCwd);

            const context: FlowContext = {
              cwd: liveCwd,
              branch: liveBranch,
              // Prefer the shell preference stored in the document, if any.
              shell: savedDoc.shell ?? null,
              connection: "local",
            };

            this.post({ type: "init", document: savedDoc, context });
            Ext.info("[Session] Sent init with live context");
            break;
          }

          // ── Explicit save ────────────────────────────────────────────────────
          case "update":
            // Enqueue so concurrent saves are serialised and never interleaved.
            this.enqueue(async () => {
              await this.updateTextDocument(message.document);
              Ext.info("[Session] Document saved to disk");
            });
            break;

          // ── Shell config ─────────────────────────────────────────────────────
          case "shellConfig":
            this.enqueue(async () => {
              const shells = await ShellResolver.resolve();
              this.post({ type: "shellList", shells });
            });
            break;

          // ── Block execution ───────────────────────────────────────────────────
          case "execute": {
            const { blockId, command, shell, args, cwd } = message;
            Ext.info(`[Session] Execute block ${blockId}: ${command}`);
            // Args originate from constant.ts, resolved via ShellResolver,
            // sent by the webview — the engine appends the wrapped command.
            this.engine.execute(blockId, command, shell, args, cwd);
            break;
          }

          // ── Stdin ─────────────────────────────────────────────────────────────
          case "input": {
            const { blockId, text } = message;
            Ext.info(`[Session] Input for block ${blockId}`);
            this.engine.writeInput(blockId, text);
            break;
          }

          // ── Kill ──────────────────────────────────────────────────────────────
          case "killBlock": {
            const { blockId } = message;
            Ext.info(`[Session] Kill block ${blockId}`);
            this.engine.killBlock(blockId);
            break;
          }

          // ── Log relay ─────────────────────────────────────────────────────────
          case "log":
            Ext.info(message.message);
            break;

          default:
            break;
        }
      },
      null,
      this.disposables,
    );

    // Dispose the session when the panel is closed.
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Add a task to the queue and try to process it
   */
  private enqueue(task: () => Promise<void>) {
    this.queue.push(task);
    this.processQueue();
  }

  /** Drain the queue sequentially; each task awaits the previous one. */
  private async processQueue() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    while (this.queue.length > 0) {
      if (this.isDisposed) {
        break;
      }
      const task = this.queue.shift();
      if (!task) {
        continue;
      }
      try {
        await task();
      } catch (e) {
        Ext.error("[Session] Error in queued task", e);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Parse the .flow file as JSON.
   * Returns an empty FlowDocument if the file is blank or invalid JSON.
   * The returned document may have `blocks` and `runtimeContext` if a previous
   * explicit save was made.
   */
  private parseDocument(): FlowDocument {
    try {
      const text = this.document.getText().trim();
      if (!text) {
        return {};
      }
      return JSON.parse(text) as FlowDocument;
    } catch {
      // Corrupt JSON — return empty; the user can still start fresh.
      Ext.warn("[Session] Could not parse .flow file; starting fresh");
      return {};
    }
  }

  /**
   * Write `doc` to the text document using a WorkspaceEdit.
   * VS Code's undo/redo stack is preserved.
   */
  private async updateTextDocument(doc: FlowDocument) {
    const edit = new vscode.WorkspaceEdit();
    const json = JSON.stringify(doc, null, 2);

    const fullRange = new vscode.Range(
      this.document.positionAt(0),
      this.document.positionAt(this.document.getText().length),
    );

    edit.replace(this.document.uri, fullRange, json);
    await vscode.workspace.applyEdit(edit);
  }

  private getCwd(): string {
    if (this.document.uri.scheme === "file") {
      return path.dirname(this.document.uri.fsPath);
    }
    return this.document.uri.path;
  }

  /** Run `git rev-parse --abbrev-ref HEAD` in the given directory. */
  private async getGitBranch(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
        cwd,
      });
      const branch = stdout.trim();
      return branch === "HEAD" || branch === "" ? null : branch;
    } catch {
      return null;
    }
  }

  // ─── Message Posting ─────────────────────────────────────────────────────────

  /**
   * Post a typed message to the webview.
   * Guards against posting after the panel has been disposed.
   */
  private post(message: ExtMessage) {
    if (!this.isDisposed) {
      this.panel.webview.postMessage(message);
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  public dispose() {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.engine.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
  }
}
