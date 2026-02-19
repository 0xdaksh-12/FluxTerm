import { FlowDocument, WebviewMessage } from "../../types/MessageProtocol";
import { Web } from "../../utils/logger";

// Define the VS Code API type
interface VsCodeApi {
  postMessage: (
    message: WebviewMessage | { type: string; [key: string]: any },
  ) => void;
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

    window.addEventListener("message", (event) => {
      const message = event.data;
      this.notifyListeners(message);
    });
  }

  public static getInstance(): FlowService {
    if (!FlowService.instance) {
      FlowService.instance = new FlowService();
    }
    return FlowService.instance;
  }

  public subscribe(listener: (message: any) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(message: any) {
    this.listeners.forEach((listener) => listener(message));
  }

  public init() {
    this.vscode.postMessage({ type: "init" });
  }

  public update(document: FlowDocument) {
    this.vscode.postMessage({ type: "update", document });
  }

  public getShellConfig() {
    this.vscode.postMessage({ type: "shellConfig" });
  }
}

export const flowService = FlowService.getInstance();
