import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { FluxTermEditorProvider } from "../../extension/providers/FluxTermEditorProvider";
import { FluxTermDocumentSession } from "../../extension/services/FluxTermDocumentSession";
import { ExtMessage, ResolvedShell } from "../../types/MessageProtocol";
import { ShellResolver } from "../../extension/services/ShellResolver";

suite("FluxTerm Electron E2E Workflow Test Suite", () => {
  let testFileUri: vscode.Uri;
  let provider: FluxTermEditorProvider;
  let session: FluxTermDocumentSession;
  let shells: ResolvedShell[] = [];
  let testShell: ResolvedShell;

  suiteSetup(async () => {
    testFileUri = vscode.Uri.file(
      path.join(os.tmpdir(), `e2e-${Date.now()}.ftx`),
    );

    // Get extension API
    const ext = vscode.extensions.getExtension("0xflame-7.fluxterm");
    if (!ext) {
      throw new Error("Extension not found");
    }

    const api = await ext.activate();
    provider = api.getProvider();

    // Resolve shells
    shells = await ShellResolver.resolve();
    const IS_WIN = process.platform === "win32";
    const targetId = IS_WIN ? "powershell" : "bash";
    testShell = shells.find(
      (s) => s.id === targetId || (IS_WIN && s.id === "pwsh"),
    )!;
    assert.ok(testShell, "Test shell should be found");
  });

  suiteTeardown(async () => {
    if (fs.existsSync(testFileUri.fsPath)) {
      fs.unlinkSync(testFileUri.fsPath);
    }
  });

  test("Should launch extension, create file, and resolve session", async () => {
    // Trigger creation via the internal command and override the blocking dialog
    await vscode.commands.executeCommand("fluxterm.newFile", testFileUri);

    // Wait for Webview Panel resolution
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retrieve internal session
    session = provider.getSessionForUri(testFileUri)!;
    assert.ok(session, "Session should be registered and accessible");
  });

  test('Should execute visual "ls" block inside Webview', async () => {
    const lsCmd = process.platform === "win32" ? "Get-ChildItem" : "ls -la";

    const completePromise = new Promise<void>((resolve, reject) => {
      const disp = session.onDidPostMessage.event((msg) => {
        if (msg.type === "blockComplete") {
          disp.dispose();
          if (msg.exitCode === 0) {
            resolve();
          } else {
            reject(new Error("Exit status failed"));
          }
        }
      });
    });

    // Visually trigger UI run
    await session.postToWebview({ type: "testRunCommand", command: lsCmd });
    await completePromise;
    // Pause to let the user visually see the output render in Electron before next block!
    await new Promise((r) => setTimeout(r, 1000));
  });

  test('Should execute visual "echo" block inside Webview', async () => {
    const completePromise = new Promise<void>((resolve, reject) => {
      const disp = session.onDidPostMessage.event((msg) => {
        if (msg.type === "blockComplete") {
          disp.dispose();
          if (msg.exitCode === 0) {
            resolve();
          } else {
            reject();
          }
        }
      });
    });

    await session.postToWebview({
      type: "testRunCommand",
      command: "echo 'FluxTerm E2E Live Test'",
    });
    await completePromise;
    await new Promise((r) => setTimeout(r, 1000));
  });

  test('Should execute programmatic "ls" block and resolve complete payloads', async () => {
    const blockId = "test-block-1";
    const lsCmd = process.platform === "win32" ? "Get-ChildItem" : "ls -la";

    const completePromise = new Promise<ExtMessage>((resolve) => {
      const disp = session.onDidPostMessage.event((msg) => {
        if (msg.type === "blockComplete" && msg.blockId === blockId) {
          disp.dispose();
          resolve(msg);
        }
      });
    });

    // Trigger block execution
    await session.processWebviewMessage({
      type: "execute",
      blockId,
      command: lsCmd,
      shell: testShell,
      cwd: os.tmpdir(),
    });

    const result = await completePromise;
    assert.strictEqual(result.type, "blockComplete");
    // Typescript narrowing
    if (result.type === "blockComplete") {
      assert.strictEqual(result.exitCode, 0);
    }
  });

  test("Should execute programmatic Python loop with prompt stdin", async () => {
    const pyScript =
      "import sys; print('START'); name = input('PROMPT:'); print('HELLO ' + name)";
    const cmd =
      process.platform === "win32"
        ? `python -c "${pyScript}"`
        : `python3 -c "${pyScript}"`;

    const streams: string[] = [];

    const completePromise = new Promise<void>((resolve) => {
      const disp = session.onDidPostMessage.event((msg) => {
        if (msg.type === "stream") {
          msg.lines.forEach((l) => {
            streams.push(l.text);
            // Trigger stdin visually when prompt appears
            if (l.text.includes("PROMPT:")) {
              session.postToWebview({ type: "testInputText", text: "ROBOT" });
            }
          });
        }
        if (msg.type === "blockComplete") {
          disp.dispose();
          resolve();
        }
      });
    });

    await session.postToWebview({ type: "testRunCommand", command: cmd });
    await completePromise;

    const out = streams.join("");
    assert.ok(out.includes("START"), "Should print start");
    assert.ok(
      out.includes("PROMPT:"),
      "Should emit the prompt without freezing",
    );
    assert.ok(out.includes("HELLO ROBOT"), "Should echo and finish evaluation");

    await new Promise((r) => setTimeout(r, 1500));
  });

  test("Should gracefully close the editor and GC session", async () => {
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    // Let VS Code webview disposal handlers fire
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.strictEqual(
      provider.getSessionForUri(testFileUri),
      undefined,
      "Session should be cleaned up on close",
    );
  });
});
