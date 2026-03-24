import * as vscode from "vscode";

import { FluxTermEditorProvider } from "./extension/providers/FluxTermEditorProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "fluxterm" is now active!');

  // Register the custom editor provider for .ftx files
  const provider = new FluxTermEditorProvider(context);
  const editorProvider = vscode.window.registerCustomEditorProvider(
    "fluxterm.editor",
    provider,
    {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    },
  );

  // Register command to create new .ftx file
  const newFileCommand = vscode.commands.registerCommand(
    "fluxterm.newFile",
    async (uriArg?: vscode.Uri) => {
      const uri = uriArg && uriArg instanceof vscode.Uri ? uriArg : await vscode.window.showSaveDialog({
        filters: { "FluxTerm Files": ["ftx"] },
        defaultUri: vscode.Uri.file("untitled.ftx"),
      });

      if (uri) {
        // Write default document structure
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(JSON.stringify({}, null, 2)),
        );
        // Open with FluxTerm editor
        await vscode.commands.executeCommand(
          "vscode.openWith",
          uri,
          "fluxterm.editor",
        );
      }
    },
  );

  // Add all disposables to subscriptions
  context.subscriptions.push(editorProvider, newFileCommand);

  // Development: Auto-reload on file changes
  if (process.env.FLUXTERM_DEV_RELOAD === "true") {
    const watcher = vscode.workspace.createFileSystemWatcher("**/dist/**/*.js");
    watcher.onDidChange(() => {
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    });
    context.subscriptions.push(watcher);
  }

  // Return API for headess E2E electron testing 
  return {
    getProvider: () => provider,
  };
}
export function deactivate() {}
