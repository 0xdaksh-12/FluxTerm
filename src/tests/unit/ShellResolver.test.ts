import { describe, it, expect } from "vitest";
import { ShellResolver } from "../../extension/services/ShellResolver";

describe("ShellResolver", () => {
  it("resolves at least one valid shell on the current platform", async () => {
    const shells = await ShellResolver.resolve();
    expect(shells.length).toBeGreaterThan(0);
    
    // Every shell should have essential properties
    for (const shell of shells) {
      expect(shell.id).toBeTruthy();
      expect(shell.label).toBeTruthy();
      expect(shell.path).toBeTruthy();
      expect(Array.isArray(shell.args)).toBe(true);
      expect(shell.icon).toBeTruthy();
    }
  });

  it("handles platform-specific resolution logic", async () => {
    const shells = await ShellResolver.resolve();
    const isWin = process.platform === "win32";

    if (isWin) {
      // Windows should prioritize PowerShell or CMD
      const hasCmdOrPwsh = shells.some(s => s.id === "cmd" || s.id === "powershell" || s.id === "pwsh");
      expect(hasCmdOrPwsh).toBe(true);

      // It should NOT contain WSL forwarders for bash
      const bash = shells.find(s => s.id === "bash");
      if (bash) {
        const normalized = bash.path.toLowerCase().replace(/\\/g, "/");
        expect(normalized).not.toContain("/windows/system32/");
        expect(normalized).not.toContain("/windowsapps/");
      }
    } else {
      // POSIX should have bash or zsh
      const hasPOSIX = shells.some(s => s.id === "bash" || s.id === "zsh");
      expect(hasPOSIX).toBe(true);
    }
  });
});
