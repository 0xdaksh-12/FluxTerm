export interface FlowDocument {
  shell?: string;
  cwd?: string;
  branch?: string;
}

export type ShellProfile = {
  id: string;
  label: string;
  command: string;
  args: string[];
  ignorePath?: string[];
  icon?: string;
};

export type ResolvedShell = {
  id: string;
  label: string;
  path: string;
  icon?: string;
};

export interface FlowContext {
  cwd: string;
  branch: string | null;
  shell: string | null;
  connection: "local" | "remote";
}

export type ExtMessage =
  | {
      type: "init";
      document: FlowDocument;
      context: FlowContext;
    }
  | {
      type: "update";
      document: FlowDocument;
    }
  | {
      type: "shellList";
      shells: ResolvedShell[];
    };

export type WebviewMessage =
  | {
      type: "init";
    }
  | {
      type: "update";
      document: FlowDocument;
    }
  | {
      type: "shellConfig";
    };
