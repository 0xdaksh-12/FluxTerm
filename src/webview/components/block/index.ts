// barrel index — re-export everything from the block/ directory so
// consumers can import from "components/block" without knowing internals.

export { OutputBlock } from "./OutputBlock";
export type { OutputBlockProps } from "./OutputBlock";

export { StatusIcon } from "./StatusIcon";
export { ToolbarButton } from "./ToolbarButton";
export type { ToolbarButtonProps } from "./ToolbarButton";

export { ContextMenu, MenuItem, MenuDivider } from "./ContextMenu";
export type { ContextMenuProps } from "./ContextMenu";

export { BlockInput } from "./BlockInput";
export { SearchBar } from "./SearchBar";
export { OutputArea } from "./OutputArea";
