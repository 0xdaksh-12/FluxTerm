import * as vscode from "vscode";
import { FlowDocument } from "../../types/MessageProtocol";

import { Ext } from "../../utils/logger";
import { ShellResolver } from "./ShellResolver";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class FlowDocumentSession {
  private isDisposed = false;
  private readonly disposables: vscode.Disposable[] = [];
  private isInitial = true;
  private isProcessing = false;
  private queue: Array<() => Promise<void>> = [];

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.setupWebview();
  }

  /**
   * Setup the webview
   */
  private setupWebview() {
    this.panel.webview.onDidReceiveMessage(
      async (message: any) => {
        if (this.isDisposed) {
          return;
        }

        switch (message.type) {
          case "init": {
            const doc = this.parseDocument();
            const cwd = this.getCwd();
            const branch = await this.getGitBranch(cwd);

            this.panel.webview.postMessage({
              type: "init",
              document: doc,
              context: {
                cwd: doc.cwd || cwd,
                branch: doc.branch || branch,
                connection: "local",
                shell: doc.shell || null,
              },
            });

            this.isInitial = false;
            Ext.info("Initialized flow document session");
            break;
          }

          case "update":
            this.enqueue(async () => {
              await this.updateTextDocument(message.document);
            });
            break;

            break;
          case "shellConfig":
            this.enqueue(async () => {
              const shells = await ShellResolver.resolve();
              this.panel.webview.postMessage({
                type: "shellList",
                shells,
              });
            });
            break;

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

    // Handle panel close
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Add a task to the queue and try to process it
   */
  private enqueue(task: () => Promise<void>) {
    this.queue.push(task);
    this.processQueue();
  }

  /**
   * Process the queue sequentially
   */
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
      if (task) {
        try {
          await task();
        } catch (e) {
          Ext.error("Error processing document update task", e);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Parse the document
   */
  private parseDocument(): FlowDocument {
    try {
      const text = this.document.getText();
      if (!text.trim()) {
        return {};
      }
      return JSON.parse(text) as FlowDocument;
    } catch {
      return {};
    }
  }

  /**
   * Send the document to the webview
   */

  /**
   * Update the text document with the given document
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

  private async getGitBranch(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
        cwd,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  public dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
  }
}
