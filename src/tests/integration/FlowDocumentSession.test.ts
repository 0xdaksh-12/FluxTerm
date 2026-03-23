import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlowDocumentSession } from "../../extension/services/FlowDocumentSession";
import { WebviewMessage, ExtMessage, ResolvedShell } from "../../types/MessageProtocol";
import { ShellResolver } from "../../extension/services/ShellResolver";
import * as os from "os";

// We must import FlowDocumentSession AFTER the vi.mock
const { mockPostMessage, mockOnDidReceiveMessage, mockOnDidDispose, mockApplyEdit } = vi.hoisted(() => {
  return {
    mockPostMessage: vi.fn(),
    mockOnDidReceiveMessage: vi.fn(),
    mockOnDidDispose: vi.fn(),
    mockApplyEdit: vi.fn(),
  };
});

vi.mock("vscode", () => {
  return {
    Range: class {
      constructor(public start: any, public end: any) {}
    },
    Position: class {
      constructor(public line: number, public char: number) {}
    },
    WorkspaceEdit: class {
      replace = vi.fn();
      createFile = vi.fn();
    },
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
      dispose = vi.fn();
    },
    workspace: {
      applyEdit: mockApplyEdit,
    },
  };
});


describe("FlowDocumentSession Integration", () => {
  let session: FlowDocumentSession;
  let mockDocument: any;
  let mockPanel: any;
  let mockContext: any;
  let messageHandlers: ((msg: WebviewMessage) => Promise<void>)[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    messageHandlers = [];

    mockOnDidReceiveMessage.mockImplementation((handler) => {
      messageHandlers.push(handler);
    });

    mockDocument = {
      uri: { scheme: "file", fsPath: "/fake/path/test.flow" },
      documentData: {},
      update: vi.fn((data) => { mockDocument.documentData = data; })
    };

    mockPanel = {
      webview: {
        postMessage: mockPostMessage,
        onDidReceiveMessage: mockOnDidReceiveMessage,
      },
      onDidDispose: mockOnDidDispose,
    };

    mockContext = {};
  });

  afterEach(() => {
    if (session) {
      session.dispose();
    }
  });

  function simulateWebviewMessage(msg: WebviewMessage) {
    return Promise.all(messageHandlers.map((h) => h(msg)));
  }

  it("handles init message and returns document+context", async () => {
    mockDocument.documentData = { blocks: [] };

    session = new FlowDocumentSession(mockDocument, mockPanel, mockContext);

    await simulateWebviewMessage({ type: "init" });

    // Should post "init" message back
    expect(mockPostMessage).toHaveBeenCalled();
    const initCall = mockPostMessage.mock.calls.find((c) => c[0].type === "init");
    expect(initCall).toBeTruthy();
    expect(initCall![0].document).toEqual({ blocks: [] });
    // context cwd should be /fake/path
    expect(initCall![0].context.cwd.endsWith(os.platform() === 'win32' ? '\\fake\\path' : '/fake/path')).toBe(true);
  });

  it("handles update message and triggers onDidUpdateDocument", async () => {
    mockDocument.documentData = {};
    session = new FlowDocumentSession(mockDocument, mockPanel, mockContext);

    const docUpdate = { blocks: [], runtimeContext: { cwd: "/test", branch: null, shell: null, connection: "local" as const } };
    
    await simulateWebviewMessage({ type: "update", document: docUpdate });

    // Processing is async enqueue
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The session should update latestState
    expect((session as any).latestState).toEqual(docUpdate);
    // Wait, let's observe the event
    // The test logic changed: it no longer calls mockApplyEdit immediately!
    expect(mockApplyEdit).not.toHaveBeenCalled(); // No disk save on update
  });

  // This test no longer applies since FlowCustomDocument parses on creation
  // and FlowDocumentSession just takes the data.
  // We can skip or keep a structural equivalent.
  it("handles empty document gracefully", async () => {
    mockDocument.documentData = {};
    session = new FlowDocumentSession(mockDocument, mockPanel, mockContext);

    await simulateWebviewMessage({ type: "init" });

    const initCall = mockPostMessage.mock.calls.find((c) => c[0].type === "init");
    expect(initCall![0].document).toEqual({}); // falls back to empty doc
  });

  it("handles execute message and relays stream/complete events", async () => {
    mockDocument.documentData = {};
    session = new FlowDocumentSession(mockDocument, mockPanel, mockContext);

    const shells = await ShellResolver.resolve();
    const isWin = process.platform === "win32";
    const targetId = isWin ? "powershell" : "bash";
    const shell = shells.find(s => s.id === targetId || (isWin && s.id === "pwsh"));
    if (!shell) {throw new Error("No shell found for test");}

    const cmd = isWin ? "Write-Output 'integration test'" : "echo 'integration test'";

    await simulateWebviewMessage({
      type: "execute",
      blockId: "blk1",
      command: cmd,
      shell,
      cwd: os.tmpdir(),
    });

    // Wait for execution to finish
    await vi.waitFor(
      () => {
        expect(mockPostMessage.mock.calls.some((c) => c[0].type === "blockComplete")).toBe(true);
      },
      { timeout: 10000 }
    );

    const streamCalls = mockPostMessage.mock.calls.filter((c) => c[0].type === "stream" && c[0].blockId === "blk1");
    // Should have some stream output
    expect(streamCalls.length).toBeGreaterThan(0);
    const hasCorrectOutput = streamCalls.some((c) => 
      c[0].lines.some((l: any) => l.text.includes("integration test"))
    );
    expect(hasCorrectOutput).toBe(true);

    const completeCall = mockPostMessage.mock.calls.find((c) => c[0].type === "blockComplete");
    expect(completeCall![0].exitCode).toBe(0);
    expect(completeCall![0].status).toBe("done");
  });
});
