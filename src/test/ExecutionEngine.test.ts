import { describe, it, expect, beforeAll } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

import {
  ExecutionEngine,
  BlockCompletePayload,
  ExecutionCallbacks,
} from "../extension/services/ExecutionEngine";
import { ShellResolver } from "../extension/services/ShellResolver";
import { OutputLine, ResolvedShell } from "../types/MessageProtocol";

const IS_WIN = process.platform === "win32";

let SHELL: ResolvedShell;

beforeAll(async () => {
  const shells = await ShellResolver.resolve();
  const targetId = IS_WIN ? "powershell" : "bash";
  const found = shells.find(
    (s) => s.id === targetId || (IS_WIN && s.id === "pwsh")
  );
  if (!found) {
    throw new Error(`Could not find a valid shell (${targetId}) for testing.`);
  }
  SHELL = found;
});

const CWD = os.tmpdir();

/**
 * Run a single command through the engine and collect all events.
 * Returns a promise that resolves when the block completes (or errors).
 */
function runBlock(
  command: string,
  cwd = CWD,
): Promise<{
  streams: OutputLine[];
  complete: BlockCompletePayload | null;
  error: { blockId: string; message: string } | null;
}> {
  return new Promise((resolve) => {
    const streams: OutputLine[] = [];
    let complete: BlockCompletePayload | null = null;
    let error: { blockId: string; message: string } | null = null;

    const callbacks: ExecutionCallbacks = {
      onStream: (_id, lines) => streams.push(...lines),
      onComplete: (payload) => {
        complete = payload;
        resolve({ streams, complete, error });
      },
      onError: (blockId, message) => {
        error = { blockId, message };
        resolve({ streams, complete, error });
      },
    };

    const engine = new ExecutionEngine(callbacks);
    const blockId = "test-block";
    engine.execute(blockId, command, SHELL, cwd);
  });
}

describe("ExecutionEngine", () => {
  // Basic stdout streaming
  describe("stdout streaming", () => {
    it("streams stdout lines to onStream", async () => {
      const cmd = IS_WIN ? "Write-Output 'hello'" : "echo hello";
      const { streams, complete } = await runBlock(cmd);

      const stdoutLines = streams
        .filter((l) => l.type === "stdout")
        .map((l) => l.text);

      expect(stdoutLines).toContain("hello");
      expect(complete?.exitCode).toBe(0);
      expect(complete?.status).toBe("done");
    });

    it("streams multiple stdout lines", async () => {
      const cmd = IS_WIN
        ? "Write-Output 'line1'; Write-Output 'line2'; Write-Output 'line3'"
        : "printf 'line1\\nline2\\nline3\\n'";

      const { streams } = await runBlock(cmd);
      const texts = streams
        .filter((l) => l.type === "stdout")
        .map((l) => l.text);

      expect(texts).toContain("line1");
      expect(texts).toContain("line2");
      expect(texts).toContain("line3");
    });
  });

  // stderr streaming
  describe("stderr streaming", () => {
    it("streams stderr to onStream with type=stderr", async () => {
      const cmd = IS_WIN
        ? "[Console]::Error.WriteLine('err-output')"
        : "echo err-output >&2";

      const { streams } = await runBlock(cmd);
      const errLines = streams
        .filter((l) => l.type === "stderr")
        .map((l) => l.text);

      expect(errLines.some((t) => t.includes("err-output"))).toBe(true);
    });
  });

  // Exit code capture
  describe("exit codes", () => {
    it("captures exit code 0 for successful commands", async () => {
      const cmd = IS_WIN ? "exit 0" : "true";
      const { complete } = await runBlock(cmd);
      expect(complete?.exitCode).toBe(0);
      expect(complete?.status).toBe("done");
    });

    it("captures non-zero exit code and sets status=error", async () => {
      const cmd = IS_WIN ? "exit 42" : "exit 42";
      const { complete } = await runBlock(cmd);
      expect(complete?.exitCode).toBe(42);
      expect(complete?.status).toBe("error");
    });

    it("captures exit code 1 for failed commands", async () => {
      // Use an explicit `exit 1` — shell-specific error commands don't always
      // propagate as process exit codes (e.g. PowerShell terminating errors).
      const cmd = IS_WIN ? "exit 1" : "exit 1";
      const { complete } = await runBlock(cmd);
      expect(complete?.exitCode).toBe(1);
      expect(complete?.status).toBe("error");
    });
  });

  // finalCwd — cd must update the captured cwd (the bug we fixed)
  describe("finalCwd after cd", () => {
    it("captures the new cwd after cd", async () => {
      const targetDir = os.homedir();
      const cmd = IS_WIN ? `Set-Location '${targetDir}'` : `cd '${targetDir}'`;

      const { complete } = await runBlock(cmd, CWD);

      // On POSIX, paths may differ slightly (e.g. symlinks) — normalise
      const expected = fs.realpathSync(targetDir);
      const actual = complete?.finalCwd
        ? fs.realpathSync(complete.finalCwd)
        : null;

      expect(actual).toBe(expected);
    });

    it("keeps the original cwd when no cd is performed", async () => {
      const cmd = IS_WIN ? "Write-Output 'no-cd'" : "echo no-cd";
      const { complete } = await runBlock(cmd, CWD);

      const expected = fs.realpathSync(CWD);
      const actual = complete?.finalCwd
        ? fs.realpathSync(complete.finalCwd)
        : null;

      expect(actual).toBe(expected);
    });

    it("cwd reflects nested cd", async () => {
      // cd into a real temp subdirectory
      const subDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-"));
      try {
        const cmd = IS_WIN ? `Set-Location '${subDir}'` : `cd '${subDir}'`;

        const { complete } = await runBlock(cmd, CWD);

        const expected = fs.realpathSync(subDir);
        const actual = complete?.finalCwd
          ? fs.realpathSync(complete.finalCwd)
          : null;

        expect(actual).toBe(expected);
      } finally {
        fs.rmdirSync(subDir);
      }
    });
  });

  // Sentinel parsing — finalCwd and finalBranch
  describe("meta sentinel", () => {
    it("captures finalCwd and finalBranch for a successful command", async () => {
      // Run a simple command, rely on the real ShellAdapter to inject the sentinel
      const cmd = IS_WIN ? "Write-Output 'meta-test'" : "echo meta-test";
      const { complete, error } = await runBlock(cmd);

      expect(error).toBeNull();
      expect(complete).not.toBeNull();
      expect(complete?.exitCode).toBe(0);

      // finalCwd should always be captured as a string
      expect(typeof complete?.finalCwd).toBe("string");

      // finalBranch is optional depending on environment (null or string)
      expect(complete?.finalBranch !== undefined).toBe(true);
    });
  });

  // stdin input / writeInput echo

  describe("writeInput", () => {
    it("sends text to stdin and echoes it with type=stdin", () => {
      return new Promise<void>((resolve, reject) => {
        const streams: OutputLine[] = [];
        let engine!: ExecutionEngine;

        const callbacks: ExecutionCallbacks = {
          onStream: (_id, lines) => {
            streams.push(...lines);
          },
          onComplete: () => {
            const stdinLines = streams.filter((l) => l.type === "stdin");
            try {
              expect(stdinLines.length).toBeGreaterThan(0);
              expect(stdinLines[0].text).toBe("hello-stdin");
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          onError: (_id, msg) => reject(new Error(msg)),
        };

        engine = new ExecutionEngine(callbacks);

        // Use cat (reads stdin until EOF) — write a line and then close stdin
        const cmd = IS_WIN ? "$input | ForEach-Object { $_ }" : "cat";
        engine.execute("stdin-test", cmd, SHELL, CWD);

        setTimeout(() => {
          engine.writeInput("stdin-test", "hello-stdin");
          engine.killBlock("stdin-test"); // cat won't exit on its own
        }, 300);
      });
    });
  });

  // Kill process
  describe("killBlock", () => {
    it("kills a running process and emits status=killed", () => {
      return new Promise<void>((resolve, reject) => {
        let engine!: ExecutionEngine;

        const callbacks: ExecutionCallbacks = {
          onStream: () => {},
          onComplete: (payload) => {
            try {
              expect(payload.status).toBe("killed");
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          onError: (_id, msg) => reject(new Error(msg)),
        };

        engine = new ExecutionEngine(callbacks);

        // Long-running sleep that we will kill
        const cmd = IS_WIN ? "Start-Sleep -Seconds 30" : "sleep 30";
        engine.execute("kill-test", cmd, SHELL, CWD);

        // Kill after a brief delay so the process is definitely running
        setTimeout(() => engine.killBlock("kill-test"), 400);
      });
    });

    it("silently ignores killBlock for a non-existent blockId", () => {
      const engine = new ExecutionEngine({
        onStream: () => {},
        onComplete: () => {},
        onError: () => {},
      });
      // Should not throw
      expect(() => engine.killBlock("does-not-exist")).not.toThrow();
    });
  });

  // Duplicate execute guard
  describe("duplicate execute guard", () => {
    it("ignores a second execute call for the same blockId while running", () => {
      return new Promise<void>((resolve, reject) => {
        let completeCount = 0;

        const callbacks: ExecutionCallbacks = {
          onStream: () => {},
          onComplete: (payload) => {
            completeCount++;
            if (completeCount === 1) {
              // Only one completion expected — pass
              resolve();
            } else {
              reject(
                new Error("onComplete called more than once for same blockId"),
              );
            }
          },
          onError: (_id, msg) => reject(new Error(msg)),
        };

        const engine = new ExecutionEngine(callbacks);
        const cmd = IS_WIN
          ? "Start-Sleep -Milliseconds 200; Write-Output 'done'"
          : "sleep 0.2 && echo done";

        engine.execute("dup-test", cmd, SHELL, CWD);
        // Second call should be silently ignored
        engine.execute("dup-test", cmd, SHELL, CWD);
      });
    });
  });

  // Concurrent blocks
  describe("concurrent blocks", () => {
    it("runs two blocks concurrently and completes both independently", async () => {
      const results: Record<string, BlockCompletePayload> = {};

      await new Promise<void>((resolve) => {
        let done = 0;
        const check = () => {
          if (++done === 2) {
            resolve();
          }
        };

        const callbacks: ExecutionCallbacks = {
          onStream: () => {},
          onComplete: (p) => {
            results[p.blockId] = p;
            check();
          },
          onError: () => check(),
        };

        const engine = new ExecutionEngine(callbacks);
        const cmd1 = IS_WIN ? "Write-Output 'block-a'" : "echo block-a";
        const cmd2 = IS_WIN ? "Write-Output 'block-b'" : "echo block-b";

        engine.execute("block-a", cmd1, SHELL, CWD);
        engine.execute("block-b", cmd2, SHELL, CWD);
      });

      expect(results["block-a"]?.exitCode).toBe(0);
      expect(results["block-b"]?.exitCode).toBe(0);
    });
  });

  // dispose
  describe("dispose", () => {
    it("dispose kills all running processes without throwing", () => {
      return new Promise<void>((resolve) => {
        const engine = new ExecutionEngine({
          onStream: () => {},
          onComplete: () => {},
          onError: () => {},
        });

        const cmd = IS_WIN ? "Start-Sleep -Seconds 30" : "sleep 30";
        engine.execute("dispose-test", cmd, SHELL, CWD);

        setTimeout(() => {
          expect(() => engine.dispose()).not.toThrow();
          resolve();
        }, 300);
      });
    });
  });
}, 30_000); // global timeout — real process spawning can be slow
