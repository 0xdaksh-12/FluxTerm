import type { Meta, StoryObj } from "@storybook/react-vite";
import Workspace from "./workspace";

const meta: Meta<typeof Workspace> = {
  title: "Webview/Workspace",
  component: Workspace,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof Workspace>;

export const Default: Story = {};
