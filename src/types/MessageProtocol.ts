/** A single line of output produced by a running block process. */
export interface OutputLine {
  /** "stdout" = normal output, "stderr" = error output, "stdin" = echoed input */
  type: "stdout" | "stderr" | "stdin";
  text: string;
}

export type BlockStatus = "idle" | "running" | "done" | "error" | "killed";

/**
 * Represents one executed command block in the notebook.
 * Shell path, cwd, and branch are frozen at creation time and never change.
 * Final values (finalCwd, finalBranch, exitCode) are populated on completion.
 */
export interface FlowBlock {
  /** Unique identifier for this block. */
  id: string;
  /** Sequential display number, monotonically increasing. */
  seq: number;
  /** The command string the user submitted. */
  command: string;

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
}

// Runtime Context

/**
 * Global runtime context for the notebook session.
 * Only updated by completed (non-killed) blocks.
 * Used to initialize the next block's frozen properties.
 */
export interface FlowContext {
  cwd: string;
  branch: string | null;
  /** The currently selected resolved shell, or null if not yet chosen. */
  shell: ResolvedShell | null;
  connection: "local" | "remote";
}

/**
 * The full notebook state serialised to the .flow file.
 * Persistence is explicit and controlled — never triggered by streaming events.
 * Blocks and runtimeContext are optional so new/empty files parse gracefully.
 */
export interface FlowDocument {
  /** Saved block list. Populated on explicit save only. */
  blocks?: FlowBlock[];
  /** Saved runtime context. Populated on explicit save only. */
  runtimeContext?: FlowContext;
  /** Preferred shell path, persisted immediately on shell selection change. */
  shell?: string;
  /** Preferred starting cwd, persisted immediately on change. */
  cwd?: string;
  /** Preferred branch label, for display purposes only. */
  branch?: string;
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
  | { type: "update"; document: FlowDocument }
  /** Request the list of available shells on this machine. */
  | { type: "shellConfig" }
  /** Forward a webview console log to the extension output channel. */
  | { type: "log"; message: string }
  /** Respond to a requestSave with the complete current state */
  | { type: "saveResponse"; document: FlowDocument }
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
  | { type: "killBlock"; blockId: string };

// Extension → Webview Messages
export type ExtMessage =
  /** Initial state: saved document + live context (cwd, branch). */
  | { type: "init"; document: FlowDocument; context: FlowContext }
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
  | { type: "blockError"; blockId: string; message: string };
