/** A single line of output produced by a running block process. */
export interface OutputLine {
  /**
   * "stdout" = normal output, "stderr" = error output, "stdin" = echoed input
   * "separator" = synthetic datetime divider injected at run start / re-run
   */
  type: "stdout" | "stderr" | "stdin" | "separator";
  text: string;
}

export type BlockStatus = "idle" | "running" | "done" | "error" | "killed";

/**
 * Represents one executed command block in the notebook.
 * Shell path, cwd, and branch are frozen at creation time and never change.
 * Final values (finalCwd, finalBranch, exitCode) are populated on completion.
 */
export interface FluxTermBlock {
  /** Unique identifier for this block. */
  id: string;
  /** Sequential display number, monotonically increasing. */
  seq: number;
  /** The command string the user submitted. */
  command: string;

  /**
   * ID of the BlockDocument this block belongs to.
   * Blocks without a documentId belong to the default (first) document.
   */
  documentId?: string;

  // Frozen at creation
  /** Resolved shell used when this block was created (path + args frozen together). */
  shell: ResolvedShell;
  /** Working directory at the time this block was created. */
  cwd: string;
  /** Git branch at the time this block was created. */
  branch: string | null;

  // Runtime state
  status: BlockStatus;
  /** Streamed output lines accumulated during execution. */
  output: OutputLine[];

  // Completion metadata (null until block completes)
  /** Process exit code. null while running or if process was killed before exit. */
  exitCode: number | null;
  /** Working directory after the command completed (from sentinel). */
  finalCwd: string | null;
  /** Git branch after the command completed (from sentinel). */
  finalBranch: string | null;

  /** Unix ms timestamp of block creation. */
  createdAt: number;

  /**
   * Index into `output[]` at the moment the user clicked "clear".
   * Lines before this index are hidden in the OutputArea.
   * `null` means no clear has been applied.
   */
  clearedAt: number | null;

  /**
   * `Date.now()` at the moment clear was clicked.
   * Used to render a synthetic datetime header before the first visible
   * output line that arrives after a clear. `null` if never cleared.
   */
  clearedAtTime: number | null;
}

// Runtime Context

/**
 * Global runtime context for the notebook session.
 * Only updated by completed (non-killed) blocks.
 * Used to initialize the next block's frozen properties.
 */
export interface FluxTermContext {
  cwd: string;
  branch: string | null;
  /** The currently selected resolved shell, or null if not yet chosen. */
  shell: ResolvedShell | null;
  connection: "local" | "remote";
}

/**
 * The full notebook state serialised to the .ftx file.
 * Persistence is explicit and controlled — never triggered by streaming events.
 * Blocks and runtimeContext are optional so new/empty files parse gracefully.
 */
/** Metadata for a named document group (BlockDocument). */
export interface BlockDocumentMeta {
  id: string;
  name: string;
}

export interface FluxTermDocument {
  /** Saved block list. Populated on explicit save only. */
  blocks?: FluxTermBlock[];
  /** Saved runtime context. Populated on explicit save only. */
  runtimeContext?: FluxTermContext;
  /** Preferred shell path, persisted immediately on shell selection change. */
  shell?: string;
  /** Preferred starting cwd, persisted immediately on change. */
  cwd?: string;
  /** Preferred branch label, for display purposes only. */
  branch?: string;
  /** Named document groups (BlockDocuments) — persisted on name change. */
  documents?: BlockDocumentMeta[];
}

// Shell Config
export type ShellProfile = {
  id: string;
  label: string;
  command: string;
  args: string[];
  ignorePath?: string[];
  icon?: string;
};

/** Shell launch args, resolved and stored alongside the path. */
export type ResolvedShell = {
  id: string;
  label: string;
  path: string;
  args: string[];
  icon?: string;
};

// Webview → Extension Messages
export type WebviewMessage =
  /** Request initial document state + live context from extension. */
  | { type: "init" }
  /** Explicit save: persist the full notebook state to disk. */
  | { type: "update"; document: FluxTermDocument }
  /** Request the list of available shells on this machine. */
  | { type: "shellConfig" }
  /** Forward a webview console log to the extension output channel. */
  | { type: "log"; message: string }
  /** Respond to a requestSave with the complete current state */
  | { type: "saveResponse"; document: FluxTermDocument }
  /** Notify the extension that the document has changed in-memory and should be marked dirty */
  | { type: "markDirty" }
  /** Start executing a command in a new isolated shell process. */
  | {
      type: "execute";
      blockId: string;
      command: string;
      /**
       * The fully resolved shell object (path + args) selected by the user.
       * Resolved by ShellResolver on the extension side and sent to the webview
       * via `shellList`. The webview sends the entire object back here — the
       * engine consumes shell.path and shell.args directly.
       */
      shell: ResolvedShell;
      cwd: string;
    }
  /** Send user input to a running block's stdin. */
  | { type: "input"; blockId: string; text: string }
  /** Kill the process associated with a running block. */
  | { type: "killBlock"; blockId: string }
  /**
   * Request a directory listing for CWD autocomplete.
   * The extension responds with a `dirList` message carrying the same requestId.
   */
  | { type: "listDir"; requestId: string; path: string }
  /** Show a VS Code notification (info / warning / error). */
  | { type: "notify"; level: "info" | "warning" | "error"; message: string };

// Extension → Webview Messages
export type ExtMessage =
  /** Initial state: saved document + live context (cwd, branch). */
  | { type: "init"; document: FluxTermDocument; context: FluxTermContext }
  /** Available shells resolved from the host machine. */
  | { type: "shellList"; shells: ResolvedShell[] }
  /** Request the webview to send back its latest document state for saving. */
  | { type: "requestSave" }
  /** Streamed stdout/stderr lines from a running block. */
  | { type: "stream"; blockId: string; lines: OutputLine[] }
  /** Block process completed (done, error, or killed). */
  | {
      type: "blockComplete";
      blockId: string;
      exitCode: number | null;
      finalCwd: string | null;
      finalBranch: string | null;
      status: "done" | "error" | "killed";
    }
  /** Block process failed to spawn or encountered an unrecoverable error. */
  | { type: "blockError"; blockId: string; message: string }
  /**
   * Response to a `listDir` request.
   * `entries` contains immediate child directory names (not full paths).
   * `error` is set when the path doesn't exist or isn't a directory.
   */
  | { type: "dirList"; requestId: string; entries: string[]; error?: string };
