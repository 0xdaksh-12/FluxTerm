import * as vscode from "vscode";
import { FlowDocument } from "../../types/MessageProtocol";

/**
 * Represents the in-memory state of a .flow document.
 */
export class FlowCustomDocument implements vscode.CustomDocument {
  private _isDisposed = false;

  constructor(
    private readonly _uri: vscode.Uri,
    private _documentData: FlowDocument,
  ) {}

  public get uri(): vscode.Uri {
    return this._uri;
  }

  public get documentData(): FlowDocument {
    return this._documentData;
  }

  /**
   * Updates the in-memory document state (usually when the webview sends an "update").
   */
  public update(newData: FlowDocument) {
    this._documentData = newData;
  }

  public dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
  }
}
