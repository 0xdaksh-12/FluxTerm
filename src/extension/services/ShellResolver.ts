import { shell } from "../../utils/constant";
import { ResolvedShell, ShellProfile } from "../../types/MessageProtocol";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class ShellResolver {
  static async resolve(): Promise<ResolvedShell[]> {
    const platform = process.platform;
    const resolver = platform === "win32" ? "where.exe" : "which";

    const results: ResolvedShell[] = [];

    for (const profile of shell) {
      try {
        const command = `${resolver} ${profile.command}`;

        const { stdout } = await execAsync(command);

        const paths = stdout
          .split(/\r?\n/)
          .map((p) => p.trim())
          .filter(Boolean);

        const validPath = paths.find((p) => {
          const normalized = p.toLowerCase().replace(/\\/g, "/");

          // Ignore Windows WSL forwarders
          if (profile.id === "bash" && process.platform === "win32") {
            if (
              normalized.includes("/windows/system32/") ||
              normalized.includes("/windowsapps")
            ) {
              return false;
            }
          }
          return true;
        });

        if (validPath) {
          results.push({
            id: profile.id,
            label: profile.label,
            path: validPath,
            args: profile.args,
            icon: profile.icon,
          });
        }
      } catch {
        // shell not found → skip silently
      }
    }

    return results;
  }
}
