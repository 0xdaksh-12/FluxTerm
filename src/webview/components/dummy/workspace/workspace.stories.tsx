import type { Meta, StoryObj } from "@storybook/react-vite";
import { varControl, withVarOverrides } from "../../../storybook/vsTheme.mts";
import workspace from "./workspace";

const meta: Meta = {
  title: "Blocks/Workspace",
  component: workspace,
  parameters: { layout: "fullscreen" },

  argTypes: {
    editorBg: varControl("--vscode-editor-background"),
    inputBg: varControl("--vscode-input-background"),
    panelBorder: varControl("--vscode-panel-border"),
  },

  args: {
    editorBg: "--vscode-editor-background",
    inputBg: "--vscode-input-background",
    panelBorder: "--vscode-panel-border",
  },

  decorators: [
    withVarOverrides({
      editorBg: "--vscode-editor-background",
      inputBg: "--vscode-input-background",
      panelBorder: "--vscode-panel-border",
    }),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WidgetBg: Story = {
  args: { editorBg: "--vscode-editorWidget-background" },
};

export const BrightBorder: Story = {
  args: { panelBorder: "--vscode-button-background" },
};

export const TerminalFeel: Story = {
  args: {
    editorBg: "--vscode-terminal-background",
    inputBg: "--vscode-sideBar-background",
  },
};
