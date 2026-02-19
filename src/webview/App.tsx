import { useEffect } from "react";
import { Web } from "../utils/logger";
import ColorBlock from "./components/ColorBlock";
import { useFlowDocument } from "./hooks/useFlowDocument";
import { useShellConfig } from "./hooks/useShellConfig";
import { InputSection } from "./components/InputBlock";

export default function App() {
  const { document, updateDocument, context } = useFlowDocument();
  const { shells } = useShellConfig();

  Web.info(`Document: ${JSON.stringify(document)}`);
  Web.info(`Context: ${JSON.stringify(context)}`);

  useEffect(() => {
    // If we have a shell in the document, we should respect it
    // This effect might be redundant if we handle it in render,
    // but ensures consistency if we need side effects.
  }, [document?.shell]);

  const handleShellChange = (path: string) => {
    updateDocument((draft) => {
      draft.shell = path;
    });
  };

  const handleCwdChange = (path: string) => {
    updateDocument((draft) => {
      draft.cwd = path;
    });
  };

  const handleRun = (cmd: string) => {
    Web.info(`Running command: ${cmd}`);
    // Future: implement block creation here
    // increment(); // Reuse existing increment for testing
  };

  // Merge context with document overrides for display
  const displayContext = {
    ...context,
    shell: document?.shell ?? context?.shell ?? null,
    cwd: document?.cwd ?? context?.cwd ?? "",
    branch: document?.branch ?? context?.branch ?? null,
  };

  return (
    <div
      className="h-screen flex flex-col font-mono text-sm antialiased overflow-hidden"
      style={{
        background: "var(--vscode-editor-background)",
        color: "var(--vscode-editor-foreground)",
      }}
    >
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <div
          className="flex flex-col items-center justify-center h-full opacity-50"
          style={{
            color: "var(--vscode-descriptionForeground)",
          }}
        >
          <div className="text-xl mb-2">Welcome to Flow</div>
          <div className="text-sm">Type a command below to start</div>
        </div>
        <ColorBlock />
      </main>

      <InputSection
        context={displayContext}
        availableShells={shells}
        onShellChange={handleShellChange}
        onCwdChange={handleCwdChange}
        onRun={handleRun}
      />
    </div>
  );
}
