// =============================================================================
// ExecutionEngine.ts
//
// Manages isolated shell processes for notebook block executions.
//
// Design principles:
//   - Each block gets its own fresh shell process. No process reuse.
//   - The engine is stateless with respect to notebook data — it only tracks
//     live processes in its registry.
//   - Output is streamed line-by-line via the onStream callback.
//   - After the user command completes, sentinel lines are emitted by the shell
//     wrapper and parsed to extract finalCwd and finalBranch.
//   - Meta lines are filtered from visible output before streaming.
//   - Partial lines (no trailing newline when process closes) are flushed.
// =============================================================================

import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { OutputLine } from "../../types/MessageProtocol";
import { Ext } from "../../utils/logger";

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface BlockCompletePayload {
  blockId: string;
  exitCode: number | null;
  finalCwd: string | null;
  finalBranch: string | null;
  status: "done" | "error" | "killed";
}

export interface ExecutionCallbacks {
  onStream: (blockId: string, lines: OutputLine[]) => void;
  onComplete: (payload: BlockCompletePayload) => void;
  onError: (blockId: string, message: string) => void;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

/** Decoded meta payload emitted by the shell wrapper at command completion. */
interface ParsedMeta {
  exit: number;
  cwd: string;
  branch: string | null;
}

/** Per-process tracking record stored in the registry. */
interface ProcessRecord {
  process: ChildProcessWithoutNullStreams;
  /** Incomplete UTF-8 line buffered from stdout until next newline. */
  stdoutRemainder: string;
  /** Incomplete UTF-8 line buffered from stderr until next newline. */
  stderrRemainder: string;
  /** Parsed meta sentinel; populated when the wrapper emits it. */
  meta: ParsedMeta | null;
  /** True once killBlock() has been called. */
  isKilled: boolean;
  /** True once finalize() has been called (prevents double-completion). */
  completed: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Prefix for the base64-encoded JSON meta line emitted by the shell wrapper.
 * Must match the prefix used in each ShellAdapter.buildWrapperCommand().
 */
const META_PREFIX = "__FLOW_META__";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a POSIX-style path (MSYS/Cygwin) to a Windows native path so that
 * Node's `spawn()` cwd option works correctly on Windows.
 *
 * e.g. "/c/Users/Daksh/projects" → "C:\Users\Daksh\projects"
 */
function normalizeCwd(cwdPath: string): string {
  if (process.platform === "win32") {
    const msys = cwdPath.match(/^\/([a-zA-Z])\/(.*)/);
    if (msys) {
      return `${msys[1].toUpperCase()}:\\${msys[2].replace(/\//g, "\\")}`;
    }
  }
  return cwdPath;
}

// ─── ExecutionEngine ──────────────────────────────────────────────────────────

export class ExecutionEngine {
  /** Live process registry keyed by blockId. */
  private registry = new Map<string, ProcessRecord>();

  constructor(private callbacks: ExecutionCallbacks) {}

  /**
   * Spawn a new isolated shell process to execute the given command.
   * The command is wrapped with sentinel-emitting code so finalCwd and
   * finalBranch can be extracted after the user command completes.
   *
   * @param blockId  - Unique identifier for the block.
   * @param command  - Raw command string typed by the user.
   * @param shellPath - Absolute path to the shell binary.
   * @param cwd      - Working directory for the process.
   */
  execute(
    blockId: string,
    command: string,
    shellPath: string,
    /**
     * Launch args for the shell binary, passed in from the webview.
     * These originate from `constant.ts` (ShellProfile.args) and are
     * resolved by ShellResolver into ResolvedShell.args, then sent
     * with the execute message. The wrapped command is appended last.
     */
    baseArgs: string[],
    cwd: string,
  ): void {
    if (this.registry.has(blockId)) {
      Ext.warn(`[ExecutionEngine] Block ${blockId} is already running`);
      return;
    }

    // Build the wrapper command (sentinel injection); args come from the caller
    const adapter = ShellAdapter.create(shellPath);
    const wrappedCommand = adapter.buildWrapperCommand(command);
    // Append the wrapped command after the base args (e.g. [..."-Command", wrappedCommand])
    const args = [...baseArgs, wrappedCommand];

    Ext.info(
      `[ExecutionEngine] Spawning block ${blockId}: ${shellPath} ${args.slice(0, -1).join(" ")} <command>`,
    );

    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(shellPath, args, {
        cwd: normalizeCwd(cwd),
        stdio: "pipe",
        windowsHide: true,
        // detached is intentionally omitted: taskkill /f /t covers Windows
        // process trees, and on POSIX we use SIGTERM on the process directly.
      }) as ChildProcessWithoutNullStreams;
    } catch (err: any) {
      this.callbacks.onError(
        blockId,
        `Failed to spawn process: ${err.message}`,
      );
      return;
    }

    const record: ProcessRecord = {
      process: proc,
      stdoutRemainder: "",
      stderrRemainder: "",
      meta: null,
      isKilled: false,
      completed: false,
    };

    this.registry.set(blockId, record);
    this.attachStreamHandlers(blockId, record);

    proc.on("close", (code) => {
      this.finalize(blockId, code);
    });

    proc.on("error", (err) => {
      Ext.error(`[ExecutionEngine] Process error for block ${blockId}:`, err);
      this.flushRemainders(blockId, record);
      this.cleanupRegistry(blockId);
      this.callbacks.onError(blockId, err.message);
    });
  }

  /**
   * Write user-provided text to the stdin of a running block's process.
   * Ignored silently if the block is not running or stdin is closed.
   *
   * @param blockId - The block whose process should receive the input.
   * @param text    - The input text (a newline is appended automatically).
   */
  writeInput(blockId: string, text: string): void {
    const rec = this.registry.get(blockId);
    if (!rec || rec.completed || rec.isKilled) {
      Ext.warn(
        `[ExecutionEngine] No active process for block ${blockId} to write input to`,
      );
      return;
    }
    if (!rec.process.stdin.writable) {
      return;
    }
    try {
      rec.process.stdin.write(text + "\n");
      // Echo the input line back to the stream so the webview can display it
      this.callbacks.onStream(blockId, [{ type: "stdin", text }]);
    } catch (err: any) {
      Ext.error(
        `[ExecutionEngine] Failed to write input to block ${blockId}:`,
        err,
      );
    }
  }

  /**
   * Terminate the process associated with a block.
   * On Windows, the entire process tree is killed via taskkill.
   * On POSIX, SIGTERM is sent to the process.
   *
   * @param blockId - The block whose process should be terminated.
   */
  killBlock(blockId: string): void {
    const rec = this.registry.get(blockId);
    if (!rec || rec.completed) {
      Ext.warn(
        `[ExecutionEngine] No active process to kill for block ${blockId}`,
      );
      return;
    }

    rec.isKilled = true;

    const pid = rec.process.pid;
    if (pid === undefined) {
      return;
    }

    try {
      if (process.platform === "win32") {
        // Kill the entire process tree so child processes don't linger
        spawn("taskkill", ["/pid", String(pid), "/f", "/t"], {
          windowsHide: true,
        });
      } else {
        rec.process.kill("SIGTERM");
      }
    } catch (err: any) {
      Ext.error(`[ExecutionEngine] Error killing block ${blockId}:`, err);
    }
  }

  /**
   * Kill all running processes and clear the registry.
   * Called when the editor panel is disposed.
   */
  dispose(): void {
    for (const id of this.registry.keys()) {
      this.killBlock(id);
    }
    this.registry.clear();
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  /** Attach data handlers to stdout and stderr streams. */
  private attachStreamHandlers(blockId: string, record: ProcessRecord) {
    record.process.stdout.setEncoding("utf-8");
    record.process.stderr.setEncoding("utf-8");

    record.process.stdout.on("data", (chunk: string) => {
      this.handleChunk(blockId, record, chunk, "stdout");
    });

    record.process.stderr.on("data", (chunk: string) => {
      this.handleChunk(blockId, record, chunk, "stderr");
    });
  }

  /**
   * Process an incoming data chunk from stdout or stderr.
   * Lines are split on newlines; the last fragment (no newline yet) is held
   * in the remainder until the next chunk or process close.
   * Meta lines are parsed and stored; visible lines are streamed.
   */
  private handleChunk(
    blockId: string,
    record: ProcessRecord,
    chunk: string,
    type: "stdout" | "stderr",
  ) {
    const key = type === "stdout" ? "stdoutRemainder" : "stderrRemainder";
    record[key] += chunk;

    const lines = record[key].split(/\r?\n/);
    // Last element is the incomplete fragment — keep it for next chunk
    record[key] = lines.pop() ?? "";

    const visible: OutputLine[] = [];
    for (const line of lines) {
      if (line.startsWith(META_PREFIX)) {
        // Parse and store meta; don't surface to output
        const parsed = this.parseMetaLine(line);
        if (parsed) {
          record.meta = parsed;
        }
      } else if (line.length > 0) {
        visible.push({ type, text: line });
      }
    }

    if (visible.length > 0) {
      this.callbacks.onStream(blockId, visible);
    }
  }

  /**
   * Flush any partial line remaining in stdout/stderr remainder buffers.
   * Called on process close to ensure no output is silently discarded.
   */
  private flushRemainders(blockId: string, record: ProcessRecord) {
    const toFlush: OutputLine[] = [];

    if (record.stdoutRemainder.length > 0) {
      if (!record.stdoutRemainder.startsWith(META_PREFIX)) {
        toFlush.push({ type: "stdout", text: record.stdoutRemainder });
      }
      record.stdoutRemainder = "";
    }

    if (record.stderrRemainder.length > 0) {
      if (!record.stderrRemainder.startsWith(META_PREFIX)) {
        toFlush.push({ type: "stderr", text: record.stderrRemainder });
      }
      record.stderrRemainder = "";
    }

    if (toFlush.length > 0) {
      this.callbacks.onStream(blockId, toFlush);
    }
  }

  /**
   * Called when the process emits its 'close' event.
   * Flushes remaining output, parses meta, and emits the completion payload.
   */
  private finalize(blockId: string, code: number | null) {
    const rec = this.registry.get(blockId);
    if (!rec || rec.completed) {
      return;
    }

    rec.completed = true;

    // Flush any partial lines that didn't end with a newline
    this.flushRemainders(blockId, rec);

    const meta = rec.meta;
    const exitCode = meta?.exit ?? code ?? null;

    const safeBranch = typeof meta?.branch === "string" ? meta?.branch : null;

    const safeCwd = typeof meta?.cwd === "string" ? meta?.cwd : null;

    const payload: BlockCompletePayload = {
      blockId,
      exitCode,
      finalCwd: safeCwd,
      finalBranch: safeBranch,
      status: rec.isKilled ? "killed" : exitCode === 0 ? "done" : "error",
    };

    this.cleanupRegistry(blockId);
    this.callbacks.onComplete(payload);
  }

  /**
   * Decode a base64-encoded JSON meta line emitted by the shell wrapper.
   * Returns null if the line is malformed.
   */
  private parseMetaLine(line: string): ParsedMeta | null {
    if (!line.startsWith(META_PREFIX)) {
      return null;
    }
    try {
      const encoded = line.slice(META_PREFIX.length).trim();
      const json = Buffer.from(encoded, "base64").toString("utf-8");
      return JSON.parse(json) as ParsedMeta;
    } catch {
      return null;
    }
  }

  /** Remove a block's record from the registry. */
  private cleanupRegistry(blockId: string) {
    this.registry.delete(blockId);
  }
}

// =============================================================================
// ShellAdapter — per-shell command wrapping and argument building
// =============================================================================

/**
 * Abstract base for shell-specific command wrapping strategies.
 * Subclasses know how to:
 *   1. Wrap a user command with sentinel-emitting code (buildWrapperCommand).
 *   2. Build the argument list to launch the shell binary (buildLaunchArgs).
 */
abstract class ShellAdapter {
  /**
   * Factory method. Inspects the shell path to return the correct adapter.
   */
  static create(shellPath: string): ShellAdapter {
    const name =
      shellPath.toLowerCase().replace(/\\/g, "/").split("/").pop() ?? "";

    if (name.startsWith("powershell") || name.startsWith("pwsh")) {
      return new PowerShellAdapter();
    }
    if (name === "cmd.exe" || name === "cmd") {
      return new CmdAdapter();
    }
    return new PosixAdapter();
  }

  /**
   * Wrap the user's command so that after it completes, the shell emits a
   * base64-encoded JSON line containing exit code, cwd, and git branch.
   * Launch args are NOT the adapter's concern — they come from constant.ts.
   */
  abstract buildWrapperCommand(command: string): string;
}

// ─── PowerShell (powershell.exe / pwsh.exe) ───────────────────────────────────

class PowerShellAdapter extends ShellAdapter {
  buildWrapperCommand(command: string): string {
    // Run the user command first, then capture exit code, cwd, and branch.
    // ConvertTo-Json -Compress produces a single-line JSON object.
    // The JSON is base64-encoded to avoid issues with special characters in paths.
    return [
      `${command}`,
      `$__exit = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }`,
      `$__cwd = (Get-Location).Path`,
      `$__branch = (git rev-parse --abbrev-ref HEAD 2>$null)`,
      `$__metaObj = [ordered]@{ exit=[int]$__exit; cwd=$__cwd; branch=$__branch }`,
      `$__json = $__metaObj | ConvertTo-Json -Compress`,
      `$__bytes = [System.Text.Encoding]::UTF8.GetBytes($__json)`,
      `$__meta = [Convert]::ToBase64String($__bytes)`,
      `Write-Output "${META_PREFIX}$__meta"`,
      `exit $__exit`,
    ].join("; ");
  }

  // Launch args (e.g. -NoLogo, -NoProfile…) are defined in constant.ts.
  // The engine appends the wrapped command to whatever baseArgs the webview sends.
}

// ─── POSIX (bash, zsh, sh, fish, …) ──────────────────────────────────────────

class PosixAdapter extends ShellAdapter {
  buildWrapperCommand(command: string): string {
    // Run the user command directly (no subshell) so that `cd` and any other
    // directory-changing command propagates to the sentinel's $(pwd) capture.
    // A subshell would isolate the `cd` effect — defeating the whole point.
    return [
      command,
      `__exit=$?`,
      `__cwd=$(pwd)`,
      `__branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")`,
      // printf avoids locale-specific quoting; tr -d '\n' strips base64 line breaks
      `__json=$(printf '{"exit":%s,"cwd":"%s","branch":"%s"}' "$__exit" "$__cwd" "$__branch")`,
      `__meta=$(printf "%s" "$__json" | base64 | tr -d '\\n')`,
      `echo "${META_PREFIX}$__meta"`,
      `exit $__exit`,
    ].join("; ");
  }

  // Launch args (e.g. -c) defined in constant.ts.
}

// ─── cmd.exe ──────────────────────────────────────────────────────────────────

class CmdAdapter extends ShellAdapter {
  buildWrapperCommand(command: string): string {
    // cmd.exe has no native base64 — we shell out to PowerShell for encoding.
    return [
      `${command}`,
      `set __exit=%ERRORLEVEL%`,
      `for /f "delims=" %%i in ('cd') do set __cwd=%%i`,
      `for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set __branch=%%i`,
      `powershell -NoProfile -Command "$obj=[ordered]@{exit=[int]'%__exit%';cwd='%__cwd%';branch='%__branch%'};$j=$obj|ConvertTo-Json -Compress;$b=[Text.Encoding]::UTF8.GetBytes($j);[Convert]::ToBase64String($b)" > "%TEMP%\\flow_meta.txt"`,
      `set /p __meta=<"%TEMP%\\flow_meta.txt"`,
      `echo ${META_PREFIX}%__meta%`,
      `exit /b %__exit%`,
    ].join(" & ");
  }

  // Launch args (e.g. /d, /s, /c) defined in constant.ts.
}
