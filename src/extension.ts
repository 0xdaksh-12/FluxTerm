import * as vscode from "vscode";

import { FlowEditorProvider } from "./extension/providers/FlowEditorProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "flow" is now active!');

  // Register the custom editor provider for .flow files
  const provider = new FlowEditorProvider(context);
  const editorProvider = vscode.window.registerCustomEditorProvider(
    "flow.editor",
    provider,
  );

  // Register command to create new .flow file
  const newFileCommand = vscode.commands.registerCommand(
    "flow.newFile",
    async () => {
      const uri = await vscode.window.showSaveDialog({
        filters: { "Flow Files": ["flow"] },
        defaultUri: vscode.Uri.file("untitled.flow"),
      });

      if (uri) {
        // Write default document structure
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(JSON.stringify({}, null, 2)),
        );
        // Open with Flow editor
        await vscode.commands.executeCommand(
          "vscode.openWith",
          uri,
          "flow.editor",
        );
      }
    },
  );

  // Add all disposables to subscriptions
  context.subscriptions.push(editorProvider, newFileCommand);

  // Development: Auto-reload on file changes
  if (process.env.FLOW_DEV_RELOAD === "true") {
    const watcher = vscode.workspace.createFileSystemWatcher("**/dist/**/*.js");
    watcher.onDidChange(() => {
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    });
    context.subscriptions.push(watcher);
  }
}

export function deactivate() {}
