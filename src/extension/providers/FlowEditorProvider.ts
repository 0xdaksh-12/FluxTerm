import * as vscode from "vscode";
import { Ext } from "../../utils/logger";
import { getNonce } from "../../utils/helper";
import { FlowDocumentSession } from "../services/FlowDocumentSession";
import { FlowCustomDocument } from "../models/FlowCustomDocument";
import { FlowDocument } from "../../types/MessageProtocol";

export class FlowEditorProvider implements vscode.CustomEditorProvider<FlowCustomDocument> {
  // Map of webview panel to its session
  private sessions = new Map<vscode.WebviewPanel, FlowDocumentSession>();
  
  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<FlowCustomDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<FlowCustomDocument> {
    // Read initial data from disk
    let documentData: FlowDocument = {};
    try {
      const fileData = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(fileData).toString('utf8');
      if (text.trim()) {
        documentData = JSON.parse(text);
      }
    } catch (e) {
      Ext.warn(`[FlowEditorProvider] Could not parse .flow file at ${uri.fsPath}; starting fresh`);
      documentData = {};
    }

    return new FlowCustomDocument(uri, documentData);
  }

  public async resolveCustomEditor(
    document: FlowCustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Create new session for this document + panel
    const session = new FlowDocumentSession(document, webviewPanel, this.context);
    this.sessions.set(webviewPanel, session);

    // Setup Webview HTML
    this.setupWebview(webviewPanel);

    // Listen for in-memory updates from the webview session to mark document dirty
    const updateDisposable = session.onDidUpdateDocument((newData) => {
      // Update the document's in-memory model
      document.update(newData);

      // Fire the change event to tell VS Code the document is dirty.
      // We provide dummy undo/redo functions as we don't fully support VS Code's undo stack yet.
      this._onDidChangeCustomDocument.fire({
        document,
        undo: () => {},
        redo: () => {},
      });
    });

    // Cleanup on panel disposal
    webviewPanel.onDidDispose(() => {
      Ext.info("Disposing session");
      updateDisposable.dispose();
      session.dispose();
      this.sessions.delete(webviewPanel);
    });
  }

  public async saveCustomDocument(
    document: FlowCustomDocument,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    Ext.info(`[FlowEditorProvider] Saving document: ${document.uri.fsPath}`);
    await this.saveAs(document, document.uri);
  }

  public async saveCustomDocumentAs(
    document: FlowCustomDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    Ext.info(`[FlowEditorProvider] Saving document AS: ${destination.fsPath}`);
    await this.saveAs(document, destination);
  }

  public async revertCustomDocument(
    document: FlowCustomDocument,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    Ext.info(`[FlowEditorProvider] Reverting document: ${document.uri.fsPath}`);
    // Re-read from disk
    const fileData = await vscode.workspace.fs.readFile(document.uri);
    const text = Buffer.from(fileData).toString('utf8');
    let documentData: FlowDocument = {};
    if (text.trim()) {
      try {
        documentData = JSON.parse(text);
      } catch (e) {
        documentData = {};
      }
    }
    document.update(documentData);
    
    // Notify all sessions attached to this document that it reverted
    for (const [panel, session] of this.sessions.entries()) {
      if (session.document.uri.toString() === document.uri.toString()) {
        session.revert(documentData);
      }
    }
  }

  public async backupCustomDocument(
    document: FlowCustomDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    Ext.info(`[FlowEditorProvider] Backing up document: ${document.uri.fsPath}`);
    const backupData = Buffer.from(JSON.stringify(document.documentData, null, 2));
    await vscode.workspace.fs.writeFile(context.destination, backupData);
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          // ignore error if it doesn't exist
        }
      }
    };
  }

  private async saveAs(document: FlowCustomDocument, destination: vscode.Uri): Promise<void> {
    // Find an active session for this document
    let activeSession: FlowDocumentSession | undefined;
    for (const session of this.sessions.values()) {
      if (session.document.uri.toString() === document.uri.toString()) {
        activeSession = session;
        break;
      }
    }

    if (activeSession) {
      await activeSession.save(destination);
    } else {
      // Fallback if no active session
      const json = JSON.stringify(document.documentData, null, 2);
      await vscode.workspace.fs.writeFile(destination, Buffer.from(json));
    }
  }

  /**
   * Configure webview options and load HTML
   */
  private setupWebview(panel: vscode.WebviewPanel) {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        vscode.Uri.joinPath(this.context.extensionUri, "node_modules"),
      ],
    };
    panel.webview.html = this.getHtmlForWebview(panel.webview);
  }

  /**
   * Generate HTML for the webview
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.css"),
    );
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "node_modules",
        "@vscode",
        "codicons",
        "dist",
        "codicon.css",
      ),
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Flow Editor</title>
      <link href="${styleUri}" rel="stylesheet">
      <link href="${codiconsUri}" rel="stylesheet" />
      <style>
        body {
          margin: 0;
          padding: 0;
          overflow: auto;
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          font-family: var(--vscode-font-family);
        }
        #root {
          width: 100%;
          min-height: 100vh;
        }
      </style>
    </head>
    <body>
      <div id="root"></div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}
