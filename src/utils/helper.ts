import { ShellProfile } from "../types/MessageProtocol";
import { SHELL_PROFILES } from "./constants";

/**
 * Generate a random ID for blocks or other entities
 */
export const generateId = () => crypto.randomUUID();

/**
 * Generate a cryptographically random nonce for CSP
 */
export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

import * as path from "path";

/**
 * Default Shell
 */
export function getDefaultShell(): ShellProfile {
  if (process.platform === "win32") {
    // prefer pwsh > powershell > cmd
    return (
      SHELL_PROFILES.find((s) => s.id === "pwsh") ||
      SHELL_PROFILES.find((s) => s.id === "powershell") ||
      SHELL_PROFILES.find((s) => s.id === "cmd")!
    );
  }

  const envShell = process.env.SHELL;

  if (envShell) {
    const base = path.basename(envShell).toLowerCase();
    const match = SHELL_PROFILES.find((s) => s.command.toLowerCase() === base);
    if (match) {
      return match;
    }
  }

  // fallback to bash
  return SHELL_PROFILES.find((s) => s.id === "bash")!;
}
