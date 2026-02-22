// =============================================================================
// FlowService.ts
//
// Singleton bridge between the React webview and the VS Code extension host.
// All messages crossing the boundary must be typed against MessageProtocol.ts.
// =============================================================================

import { FlowDocument, WebviewMessage } from "../../types/MessageProtocol";
import { Web } from "../../utils/logger";

interface VsCodeApi {
  postMessage: (message: WebviewMessage) => void;
  getState: () => any;
  setState: (state: any) => void;
}

declare const acquireVsCodeApi: () => VsCodeApi;

class FlowService {
  private static instance: FlowService;
  private vscode: VsCodeApi;
  private listeners: Set<(message: any) => void> = new Set();

  private constructor() {
    this.vscode = acquireVsCodeApi();
    Web.setVSCode(this.vscode);

    // Route all extension messages to registered listeners.
    window.addEventListener("message", (event) => {
      this.notifyListeners(event.data);
    });
  }

  public static getInstance(): FlowService {
    if (!FlowService.instance) {
      FlowService.instance = new FlowService();
    }
    return FlowService.instance;
  }

  // ─── Pub/Sub ────────────────────────────────────────────────────────────────

  /** Register a listener for extension messages. Returns an unsubscribe fn. */
  public subscribe(listener: (message: any) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(message: any) {
    this.listeners.forEach((l) => l(message));
  }

  // ─── Outbound Messages ──────────────────────────────────────────────────────

  /** Request the initial document state and live context from the extension. */
  public init(): void {
    this.vscode.postMessage({ type: "init" });
  }

  /**
   * Explicitly save the full notebook state to disk.
   * This is the ONLY way notebook state is persisted — do not call on every
   * execution event.
   */
  public saveDocument(document: FlowDocument): void {
    this.vscode.postMessage({ type: "update", document });
  }

  /** Request the list of shells available on the host machine. */
  public getShellConfig(): void {
    this.vscode.postMessage({ type: "shellConfig" });
  }

  /**
   * Start executing a command in a new isolated shell process.
   * @param args - Shell launch args from ResolvedShell.args (sourced from constant.ts).
   *               The engine appends the wrapped command after these.
   */
  public execute(
    blockId: string,
    command: string,
    shell: string,
    args: string[],
    cwd: string,
  ): void {
    this.vscode.postMessage({
      type: "execute",
      blockId,
      command,
      shell,
      args,
      cwd,
    });
  }

  /** Send user input to a running block's process stdin. */
  public sendInput(blockId: string, text: string): void {
    this.vscode.postMessage({ type: "input", blockId, text });
  }

  /** Terminate the process associated with a running block. */
  public killBlock(blockId: string): void {
    this.vscode.postMessage({ type: "killBlock", blockId });
  }
}

export const flowService = FlowService.getInstance();
