import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { OutputLine, ResolvedShell } from "../../types/MessageProtocol";
import { Ext } from "../../utils/logger";

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

/** Decoded meta payload emitted by the shell wrapper at command completion. */
interface ParsedMeta {
  exit: number;
  cwd: string;
  branch: string | null;
}

/** Per-process tracking record stored in the registry. */
interface ProcessRecord {
  process: ChildProcessWithoutNullStreams;
  /** Incomplete bytes buffered from stdout until a safe split point. */
  stdoutRemainder: Buffer;
  /** Incomplete bytes buffered from stderr until a safe split point. */
  stderrRemainder: Buffer;
  /** Parsed meta sentinel; populated when the wrapper emits it. */
  meta: ParsedMeta | null;
  /** True once killBlock() has been called. */
  isKilled: boolean;
  /** True once finalize() has been called (prevents double-completion). */
  completed: boolean;
}

/**
 * Prefix for the base64-encoded JSON meta line emitted by the shell wrapper.
 * Must match the prefix used in each ShellAdapter.buildWrapperCommand().
 */
const META_PREFIX = "__FLOW_META__";

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
   * @param shell    - Resolved shell object (path + args). The wrapped command
   *                   is appended after shell.args at spawn time.
   * @param cwd      - Working directory for the process.
   */
  execute(
    blockId: string,
    command: string,
    shell: ResolvedShell,
    cwd: string,
  ): void {
    if (this.registry.has(blockId)) {
      Ext.warn(`[ExecutionEngine] Block ${blockId} is already running`);
      return;
    }

    // Build the wrapper command (sentinel injection)
    const adapter = ShellAdapter.create(shell.path);
    const wrappedCommand = adapter.buildWrapperCommand(command);
    // Append the wrapped command after the base args (e.g. [..."-Command", wrappedCommand])
    const args = [...shell.args, wrappedCommand];

    Ext.info(
      `[ExecutionEngine] Spawning block ${blockId}: ${shell.path} ${args.slice(0, -1).join(" ")} <command>`,
    );

    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(shell.path, args, {
        cwd: normalizeCwd(cwd),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          FORCE_COLOR: "1",
          CLICOLOR_FORCE: "1",
          COLORTERM: "truecolor",
          TERM: "xterm-256color",
        },
        stdio: "pipe",
        windowsHide: true,
        detached: process.platform !== "win32",
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
      stdoutRemainder: Buffer.alloc(0),
      stderrRemainder: Buffer.alloc(0),
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
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], {
          windowsHide: true,
        });
        killer.on("close", (code) => {
          if (code !== 0) {
            Ext.warn(
              `[ExecutionEngine] taskkill failed with code ${code} for block ${blockId}`,
            );
          }
        });
        killer.on("error", (err) => {
          Ext.error(
            `[ExecutionEngine] Failed to spawn taskkill for block ${blockId}:`,
            err,
          );
        });
      } else {
        process.kill(-pid, "SIGTERM");
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

  /**
   * Find a safe byte index to split a buffer such that we don't sever
   * incomplete ANSI sequences or incomplete UTF-8 trailing bytes.
   */
  private findSafeSplitIndex(buf: Buffer): number {
    const limit = Math.max(0, buf.length - 100);

    // 1. Check for incomplete ANSI escape sequences (starts with \x1b)
    for (let i = buf.length - 1; i >= limit; i--) {
      if (buf[i] === 0x1b) {
        if (i + 1 < buf.length && buf[i + 1] === 0x5b) {
          // CSI: \x1b[
          let complete = false;
          for (let j = i + 2; j < buf.length; j++) {
            const charCode = buf[j];
            if (charCode >= 0x40 && charCode <= 0x7e) {
              complete = true;
              break;
            }
          }
          if (!complete) {
            return i;
          }
        } else if (i + 1 === buf.length) {
          // Just \x1b at the end
          return i;
        }
      }
    }

    // 2. Check for incomplete UTF-8 characters (up to 4 bytes back)
    for (let i = buf.length - 1; i >= Math.max(0, buf.length - 4); i--) {
      const byte = buf[i];
      if ((byte & 0xc0) === 0x80) {
        continue; // Continuation byte
      } else if ((byte & 0xe0) === 0xc0) {
        if (buf.length - i < 2) {
          return i;
        }
        break;
      } else if ((byte & 0xf0) === 0xe0) {
        if (buf.length - i < 3) {
          return i;
        }
        break;
      } else if ((byte & 0xf8) === 0xf0) {
        if (buf.length - i < 4) {
          return i;
        }
        break;
      } else {
        break; // 1-byte ASCII or other valid start, stop checking
      }
    }

    return buf.length;
  }

  /** Attach data handlers to stdout and stderr streams. */
  private attachStreamHandlers(blockId: string, record: ProcessRecord) {
    record.process.stdout.on("data", (chunk: Buffer) => {
      this.handleChunk(blockId, record, chunk, "stdout");
    });

    record.process.stderr.on("data", (chunk: Buffer) => {
      this.handleChunk(blockId, record, chunk, "stderr");
    });
  }

  /**
   * Process an incoming data chunk from stdout or stderr.
   *
   * Strategy:
   *  - Accumulate bytes in the remainder buffer as before.
   *  - Find a byte-safe split index (ANSI / UTF-8 boundary).
   *  - Split the safe region on newlines to obtain *complete* lines and a
   *    possible *trailing partial segment* (text after the last newline, with
   *    no terminating newline yet).
   *  - Emit all non-empty complete lines as usual, intercepting meta lines.
   *  - If the trailing segment is non-empty **and** the original chunk did
   *    NOT end with a newline (i.e. the process emitted a prompt without `\n`),
   *    flush it immediately as a visible line and clear the remainder buffer.
   *    This makes interactive prompts (e.g. `input("Enter: ")`) visible in the
   *    webview without waiting for the user to press Enter.
   *  - If the trailing segment is empty (chunk ended with `\n`), keep the
   *    buffer empty — behaviour identical to before.
   */
  private handleChunk(
    blockId: string,
    record: ProcessRecord,
    chunk: Buffer,
    type: "stdout" | "stderr",
  ) {
    const key = type === "stdout" ? "stdoutRemainder" : "stderrRemainder";
    record[key] = Buffer.concat([record[key], chunk]);

    const safeIndex = this.findSafeSplitIndex(record[key]);
    if (safeIndex === 0) {
      return;
    }

    const safeBuf = record[key].subarray(0, safeIndex);
    const safeString = safeBuf.toString("utf-8");

    // Split into lines. `parts` always has at least one element.
    // parts[0..n-2] are complete lines (terminated by \n).
    // parts[n-1]    is the trailing partial segment (may be "").
    const parts = safeString.split(/\r?\n/);
    const completeLines = parts.slice(0, -1);
    const trailingSegment = parts[parts.length - 1];

    // Bytes after the safe split point stay in the buffer regardless.
    const remainingUnsafeBuf = record[key].subarray(safeIndex);

    const visible: OutputLine[] = [];

    // --- Process complete lines (unchanged behaviour) ---
    for (const line of completeLines) {
      if (line.startsWith(META_PREFIX)) {
        const parsed = this.parseMetaLine(line, blockId);
        if (parsed) {
          record.meta = parsed;
        }
      } else if (line.length > 0) {
        visible.push({ type, text: line });
      }
    }

    // --- Handle trailing partial segment ---
    // Emit immediately when non-empty so that prompts like `input("Enter: ")`
    // are displayed in real-time instead of stalling until the next newline.
    // Meta lines should never appear as partial segments in practice, but
    // guard against it anyway to avoid leaking sentinel text.
    if (trailingSegment.length > 0 && !trailingSegment.startsWith(META_PREFIX)) {
      visible.push({ type, text: trailingSegment });
      // Clear the partial segment from the remainder so it is not re-emitted
      // when flushRemainders() is called on process close.
      record[key] = remainingUnsafeBuf;
    } else {
      // No partial segment (or empty) — keep prior buffering behaviour.
      record[key] = Buffer.concat([
        Buffer.from(trailingSegment, "utf-8"),
        remainingUnsafeBuf,
      ]);
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
      const remainderString = record.stdoutRemainder.toString("utf-8");
      if (!remainderString.startsWith(META_PREFIX)) {
        toFlush.push({ type: "stdout", text: remainderString });
      }
      record.stdoutRemainder = Buffer.alloc(0);
    }

    if (record.stderrRemainder.length > 0) {
      const remainderString = record.stderrRemainder.toString("utf-8");
      if (!remainderString.startsWith(META_PREFIX)) {
        toFlush.push({ type: "stderr", text: remainderString });
      }
      record.stderrRemainder = Buffer.alloc(0);
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
  private parseMetaLine(line: string, blockId: string): ParsedMeta | null {
    if (!line.startsWith(META_PREFIX)) {
      return null;
    }
    try {
      const encoded = line.slice(META_PREFIX.length).trim();
      const json = Buffer.from(encoded, "base64").toString("utf-8");
      return JSON.parse(json) as ParsedMeta;
    } catch (err: any) {
      Ext.error(
        `[ExecutionEngine] Failed to parse meta payload for block ${blockId}: ${line}`,
        err,
      );
      return null;
    }
  }

  /** Remove a block's record from the registry. */
  private cleanupRegistry(blockId: string) {
    this.registry.delete(blockId);
  }
}

// ShellAdapter — per-shell command wrapping and argument building

/**
 * Abstract base for shell-specific command wrapping strategies.
 * Subclasses know how to:
 *   1. Wrap a user command with sentinel-emitting code (buildWrapperCommand).
 *   2. Build the argument list to launch the shell binary (buildLaunchArgs).
 */
abstract class ShellAdapter {
  constructor(protected shellPath: string) {}

  /**
   * Factory method. Inspects the shell path to return the correct adapter.
   */
  static create(shellPath: string): ShellAdapter {
    const name =
      shellPath.toLowerCase().replace(/\\/g, "/").split("/").pop() ?? "";

    if (name.startsWith("powershell") || name.startsWith("pwsh")) {
      return new PowerShellAdapter(shellPath);
    }
    if (name === "cmd.exe" || name === "cmd") {
      return new CmdAdapter(shellPath);
    }
    return new PosixAdapter(shellPath);
  }

  /**
   * Wrap the user's command so that after it completes, the shell emits a
   * base64-encoded JSON line containing exit code, cwd, and git branch.
   * Launch args are NOT the adapter's concern — they come from constant.ts.
   */
  abstract buildWrapperCommand(command: string): string;
}

// PowerShell (powershell.exe / pwsh.exe)

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

// POSIX (bash, zsh, sh, fish, …)

class PosixAdapter extends ShellAdapter {
  buildWrapperCommand(command: string): string {
    // Generate a temporary execution script containing the exact execution context
    // and safe HEREDOC wrapper. This allows us to pass a clean file into the
    // `script` PTY generator, creating robust terminal colors dynamically.
    return [
      `__FLOW_TMP=$(mktemp "\${TMPDIR:-/tmp}/flow_cmd.XXXXXX")`,
      `cat << '__FLOW_OUTER_EOF__' > "$__FLOW_TMP"`,
      `[ -f ~/.bashrc ] && source ~/.bashrc 2>/dev/null`,
      `[ -f ~/.zshrc ] && source ~/.zshrc 2>/dev/null`,
      `eval "$(cat << '__FLOW_EOF__'`,
      `${command}`,
      `__FLOW_EOF__`,
      `)"`,
      `__exit=$?`,
      `__cwd=$(pwd)`,
      `__branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")`,
      // printf avoids locale-specific quoting; tr -d '\\n' strips base64 line breaks
      `__json=$(printf '{"exit":%s,"cwd":"%s","branch":"%s"}' "$__exit" "$__cwd" "$__branch")`,
      `__meta=$(printf "%s" "$__json" | base64 | tr -d '\\n')`,
      `echo "${META_PREFIX}$__meta"`,
      `exit $__exit`,
      `__FLOW_OUTER_EOF__`,
      ``,
      `if command -v script >/dev/null 2>&1; then`,
      `  if [ "$(uname)" = "Darwin" ]; then`,
      `    script -q /dev/null "${this.shellPath}" "$__FLOW_TMP"`,
      `  else`,
      `    script -q -e -c "${this.shellPath} $__FLOW_TMP" /dev/null`,
      `  fi`,
      `  __rc=$?`,
      `else`,
      `  "${this.shellPath}" "$__FLOW_TMP"`,
      `  __rc=$?`,
      `fi`,
      `rm -f "$__FLOW_TMP"`,
      `exit $__rc`,
    ].join("\n");
  }

  // Launch args (e.g. -c) defined in constant.ts.
}

// cmd.exe

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
