import React from "react";

interface ColorDef {
  name: string;
  category: string;
  vscodeVar: string;
}

const colors: ColorDef[] = [
  // --- Base ---
  {
    category: "Base",
    name: "Editor Background",
    vscodeVar: "--vscode-editor-background",
  },
  {
    category: "Base",
    name: "Editor Foreground",
    vscodeVar: "--vscode-editor-foreground",
  },
  {
    category: "Base",
    name: "Widget Background",
    vscodeVar: "--vscode-editorWidget-background",
  },
  {
    category: "Base",
    name: "Widget Border",
    vscodeVar: "--vscode-editorWidget-border",
  },

  // --- Input ---
  {
    category: "Input",
    name: "Input Background",
    vscodeVar: "--vscode-input-background",
  },
  {
    category: "Input",
    name: "Input Foreground",
    vscodeVar: "--vscode-input-foreground",
  },
  {
    category: "Input",
    name: "Placeholder",
    vscodeVar: "--vscode-input-placeholderForeground",
  },
  {
    category: "Input",
    name: "Input Border",
    vscodeVar: "--vscode-input-border",
  },
  {
    category: "Input",
    name: "Validation Info",
    vscodeVar: "--vscode-inputValidation-infoBackground",
  },
  {
    category: "Input",
    name: "Validation Warning",
    vscodeVar: "--vscode-inputValidation-warningBackground",
  },
  {
    category: "Input",
    name: "Validation Error",
    vscodeVar: "--vscode-inputValidation-errorBackground",
  },

  // --- Buttons ---
  {
    category: "Button",
    name: "Button Background",
    vscodeVar: "--vscode-button-background",
  },
  {
    category: "Button",
    name: "Button Foreground",
    vscodeVar: "--vscode-button-foreground",
  },
  {
    category: "Button",
    name: "Button Hover",
    vscodeVar: "--vscode-button-hoverBackground",
  },
  {
    category: "Button",
    name: "Secondary Button",
    vscodeVar: "--vscode-button-secondaryBackground",
  },

  // --- Lists & Menus ---
  {
    category: "List/Menu",
    name: "List Hover",
    vscodeVar: "--vscode-list-hoverBackground",
  },
  {
    category: "List/Menu",
    name: "List Active",
    vscodeVar: "--vscode-list-activeSelectionBackground",
  },
  {
    category: "List/Menu",
    name: "Menu Background",
    vscodeVar: "--vscode-menu-background",
  },
  {
    category: "List/Menu",
    name: "Menu Foreground",
    vscodeVar: "--vscode-menu-foreground",
  },
  {
    category: "List/Menu",
    name: "Menu Selection",
    vscodeVar: "--vscode-menu-selectionBackground",
  },

  // --- Status Bar ---
  {
    category: "Status Bar",
    name: "Status Bar Bg",
    vscodeVar: "--vscode-statusBar-background",
  },
  {
    category: "Status Bar",
    name: "Status Bar Fg",
    vscodeVar: "--vscode-statusBar-foreground",
  },
  {
    category: "Status Bar",
    name: "Remote Bg",
    vscodeVar: "--vscode-statusBarItem-remoteBackground",
  },
  {
    category: "Status Bar",
    name: "Error Bg",
    vscodeVar: "--vscode-statusBarItem-errorBackground",
  },

  // --- Terminal ---
  {
    category: "Terminal",
    name: "Terminal Background",
    vscodeVar: "--vscode-terminal-background",
  },
  {
    category: "Terminal",
    name: "Terminal Foreground",
    vscodeVar: "--vscode-terminal-foreground",
  },
  {
    category: "Terminal",
    name: "Ansi Green",
    vscodeVar: "--vscode-terminal-ansiGreen",
  },
  {
    category: "Terminal",
    name: "Ansi Blue",
    vscodeVar: "--vscode-terminal-ansiBlue",
  },
  {
    category: "Terminal",
    name: "Ansi Red",
    vscodeVar: "--vscode-terminal-ansiRed",
  },
  {
    category: "Terminal",
    name: "Ansi Yellow",
    vscodeVar: "--vscode-terminal-ansiYellow",
  },

  // --- Badges ---
  {
    category: "Badge",
    name: "Badge Background",
    vscodeVar: "--vscode-badge-background",
  },
  {
    category: "Badge",
    name: "Badge Foreground",
    vscodeVar: "--vscode-badge-foreground",
  },

  // --- Panel/SideBar ---
  {
    category: "Panel",
    name: "Panel Border",
    vscodeVar: "--vscode-panel-border",
  },
  {
    category: "Panel",
    name: "Sidebar Bg",
    vscodeVar: "--vscode-sideBar-background",
  },
  {
    category: "Panel",
    name: "Activity Bar Bg",
    vscodeVar: "--vscode-activityBar-background",
  },

  // --- Editor ---
  {
    category: "Editor",
    name: "Selection",
    vscodeVar: "--vscode-editor-selectionBackground",
  },
  {
    category: "Editor",
    name: "Cursor",
    vscodeVar: "--vscode-editorCursor-foreground",
  },
  {
    category: "Editor",
    name: "Line Highlight",
    vscodeVar: "--vscode-editor-lineHighlightBackground",
  },
];

const groupedColors = colors.reduce(
  (acc, color) => {
    if (!acc[color.category]) {
      acc[color.category] = [];
    }
    acc[color.category].push(color);
    return acc;
  },
  {} as Record<string, ColorDef[]>,
);

const categories = Object.keys(groupedColors);

export const ColorBlock: React.FC = () => {
  return (
    <div
      className="p-6 w-full font-mono"
      style={{
        backgroundColor: "var(--vscode-editor-background)",
        color: "var(--vscode-editor-foreground)",
      }}
    >
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">VSCode Theme Variables</h2>
        <p
          className="text-sm"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          Visual reference of available theme variables mapped in Tailwind.
        </p>
      </div>

      {categories.map((category) => (
        <div key={category} className="mb-8">
          <h3
            className="text-base font-bold mb-3 pb-2 border-b"
            style={{ color: "var(--vscode-foreground)" }}
          >
            {category}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {groupedColors[category].map((color, idx) => (
              <div
                key={idx}
                className="flex flex-col border rounded overflow-hidden"
                style={{
                  borderColor: "var(--vscode-panel-border)",
                  backgroundColor: "var(--vscode-widget)",
                }}
              >
                {/* Color Preview */}
                <div
                  className="h-12 w-full"
                  style={{
                    backgroundColor: `var(${color.vscodeVar})`,
                  }}
                />

                {/* Details */}
                <div className="p-3 space-y-1">
                  <div
                    className="font-medium text-xs truncate"
                    title={color.name}
                  >
                    {color.name}
                  </div>
                  <code
                    className="text-[10px] block truncate select-all"
                    title={color.vscodeVar}
                    style={{ color: "var(--vscode-descriptionForeground)" }}
                  >
                    {color.vscodeVar}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ColorBlock;
