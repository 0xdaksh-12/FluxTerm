import * as vscode from "vscode";
import { Ext } from "../../utils/logger";
import { getNonce } from "../../utils/helper";
import { FlowDocumentSession } from "../services/FlowDocumentSession";

export class FlowEditorProvider implements vscode.CustomTextEditorProvider {
  // Key by panel, not URI — supports multiple editors for the same document
  private sessions = new Map<vscode.WebviewPanel, FlowDocumentSession>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ) {
    // Create a new session for this document
    const session = new FlowDocumentSession(
      document,
      webviewPanel,
      this.context,
    );
    this.sessions.set(webviewPanel, session);

    // Setup Webview HTML
    this.setupWebview(webviewPanel);

    // Cleanup on panel disposal
    webviewPanel.onDidDispose(() => {
      Ext.info("Disposing sessions");
      session.dispose();
      this.sessions.delete(webviewPanel);
    });
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
