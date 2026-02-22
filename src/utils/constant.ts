import { ShellProfile } from "../types/MessageProtocol";

export const shell: ShellProfile[] = [
  {
    id: "cmd",
    label: "Command Prompt",
    command: "cmd",
    args: ["/d", "/s", "/c"],
    icon: "codicon-terminal-cmd",
  },
  {
    id: "powershell",
    label: "PowerShell",
    command: "powershell",
    args: ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"],
    icon: "codicon-terminal-powershell",
  },
  {
    id: "pwsh",
    label: "PowerShell Core",
    command: "pwsh",
    args: ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"],
    icon: "codicon-terminal-powershell",
  },
  {
    id: "bash",
    label: "Bash",
    command: "bash",
    args: ["-c"],
    icon: "codicon-terminal-bash",
  },
  {
    id: "zsh",
    label: "Zsh",
    command: "zsh",
    args: ["-c"],
    icon: "codicon-terminal-bash",
  },
];
