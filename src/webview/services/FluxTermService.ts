import {
  FluxTermDocument,
  ResolvedShell,
  WebviewMessage,
} from "../../types/MessageProtocol";
import { Web } from "../../utils/logger";

interface VsCodeApi {
  postMessage: (message: WebviewMessage) => void;
  getState: () => any;
  setState: (state: any) => void;
}

declare const acquireVsCodeApi: () => VsCodeApi;

/**
 * Singleton bridge between the React webview and the VS Code extension host.
 * All messages crossing the boundary must be typed against MessageProtocol.ts.
 */
class FluxTermService {
  private static instance: FluxTermService;
  private vscode: VsCodeApi;
  private listeners: Set<(message: any) => void> = new Set();

  private constructor() {
    this.vscode = acquireVsCodeApi();
    Web.setVSCode(this.vscode);

    /**
     * Route all extension messages to registered listeners.
     */
    window.addEventListener("message", (event) => {
      this.notifyListeners(event.data);
    });
  }

  public static getInstance(): FluxTermService {
    if (!FluxTermService.instance) {
      FluxTermService.instance = new FluxTermService();
    }
    return FluxTermService.instance;
  }

  /** Register a listener for extension messages. Returns an unsubscribe fn. */
  public subscribe(listener: (message: any) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(message: any) {
    this.listeners.forEach((l) => l(message));
  }

  /** Request the initial document state and live context from the extension. */
  public init(): void {
    this.vscode.postMessage({ type: "init" });
  }

  /**
   * Explicitly save the full notebook state to disk.
   * This is the ONLY way notebook state is persisted — do not call on every
   * execution event.
   */
  public saveDocument(document: FluxTermDocument): void {
    this.vscode.postMessage({ type: "update", document });
  }

  /**
   * Respond to a requestSave with the full notebook state.
   */
  public sendSaveResponse(document: FluxTermDocument): void {
    this.vscode.postMessage({ type: "saveResponse", document });
  }

  /** Notify extension to mark document as dirty without saving data */
  public markDirty(): void {
    this.vscode.postMessage({ type: "markDirty" });
  }

  /** Request the list of shells available on the host machine. */
  public getShellConfig(): void {
    this.vscode.postMessage({ type: "shellConfig" });
  }

  /**
   * Start executing a command in a new isolated shell process.
   * @param blockId - The ID of the block to execute.
   * @param command - The command to execute.
   * @param shell   - The fully resolved shell object (path + args) to use.
   *                  The engine appends the wrapped command after shell.args.
   * @param cwd    - The current working directory.
   */
  public execute(
    blockId: string,
    command: string,
    shell: ResolvedShell,
    cwd: string,
  ): void {
    this.vscode.postMessage({
      type: "execute",
      blockId,
      command,
      shell,
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

  /**
   * Request an immediate listing of child directories at `dirPath`.
   * Used by CwdEditor for autocomplete suggestions.
   * Returns a Promise that resolves with the directory names (not full paths).
   * Times out after 3 s and resolves with [].
   */
  public listDir(dirPath: string): Promise<string[]> {
    const requestId = Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; unsub(); resolve([]); }
      }, 3000);

      const unsub = this.subscribe((msg: any) => {
        if (msg.type === "dirList" && msg.requestId === requestId) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            unsub();
            resolve(msg.entries ?? []);
          }
        }
      });

      this.vscode.postMessage({ type: "listDir", requestId, path: dirPath });
    });
  }

  /** Show a VS Code notification (info / warning / error). */
  public notify(level: "info" | "warning" | "error", message: string): void {
    this.vscode.postMessage({ type: "notify", level, message });
  }
}

export const fluxTermService = FluxTermService.getInstance();
