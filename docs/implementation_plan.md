# UI Refactor: Adopt `dummy/workspace` Design

## Summary

The current two-zone layout (scrollable block history + fixed bottom `InputSection`) is replaced with a continuous notebook model. Blocks are self-contained cards. A persistent "ghost block" always sits at the end of each document group, acting as the creation surface. All hooks, the store, extension code, and types remain untouched. Only the component layer and `App.tsx` change.

---

## Confirmed Decisions

All open questions are resolved:

Tailwind stays. The dummy was written in plain CSS because it is a design prototype, not a constraint on the production code. The production refactor continues to use Tailwind for layout and spacing utilities.

The bottom `InputSection` is fully removed. The ghost block is its replacement.

The Add toolbar button inserts a new idle block immediately after the current block, not at the end.

The document group header shows an editable group name, not the cwd path. The name is static text by default and becomes an editable input on double-click. This is a new concept not present in either the current code or the dummy.

All five `BlockStatus` values (`idle`, `running`, `done`, `error`, `killed`) must be handled in the new block card UI.

Storybook coverage: use judgment per component.

---

## The Ghost Block Model

This is the central interaction paradigm of the new design and the most complex part of the refactor.

A ghost block is a derived UI element that is always appended at the end of each document group. It uses the same `Block` component as a real block but receives an `isGhost={true}` prop. When `isGhost` is true, the component disables output rendering, metadata footer, status indicators, and the Stop/Refresh/Delete toolbar actions. Execution is also disabled.

The ghost block is never persisted to the store. The store contains only real blocks. The renderer appends the ghost by convention.

The ghost block transitions to a real block the moment the user types any character. At that instant, `createBlock` is called with the current context and the ghost is "promoted." A fresh ghost block immediately appears below the promoted block. The promoted block enters the store with `status: running` only after the user submits (Enter or arrow-right button). Between typing and submitting it is a pre-submission block in local React state within `App.tsx`.

This means there are two phases before a command enters the store: (1) the ghost phase, where the block is pure local UI state with `isGhost=true`, and (2) the pre-submission phase, where the user has typed content and the ghost appearance is gone but the block has not yet been dispatched. The store is only updated on dispatch. This keeps the store clean.

Keyboard contract:
- `Enter` (no Shift): submit and dispatch. The local pre-submission block becomes a real store block. A new ghost appears below.
- `Shift+Enter`: insert a newline in the textarea (multi-line command).
- Focus moving down from the last real block lands in the ghost block naturally via tab order.
- If the ghost block is emptied (user typed then deleted all text), it reverts to ghost appearance.
- If a non-ghost block is completely emptied, it is not automatically deleted. Deletion requires the explicit Delete toolbar action.

---

## Proposed Changes

### Layer 0: Types extension (minimal)

#### [MODIFY] `src/webview/components/block/index.ts`

Export the new `Block` component. Keep `OutputBlock` exported temporarily until `App.tsx` no longer references it.

No changes to `src/types/MessageProtocol.ts`.

---

### Layer 1: New `Block` component

This is the core deliverable. It replaces both `OutputBlock` and `InputSection`.

#### [NEW] `src/webview/components/block/Block.tsx`

The component signature:

```ts
interface BlockProps {
  block: FluxTermBlock | null;   // null when isGhost
  isGhost?: boolean;
  // for ghost and idle pre-submit: the controlled command string in parent
  pendingCommand?: string;
  onPendingCommandChange?: (val: string) => void;
  onSubmit?: (cmd: string) => void;

  // context needed to display in the context bar
  context: FluxTermContext;
  availableShells: ResolvedShell[];
  onShellChange: (shell: ResolvedShell) => void;

  // actions
  onDelete?: (id: string) => void;
  onReRun?: (id: string) => void;
  onAddAfter?: () => void;           // "Add" toolbar button
  onKill?: (id: string) => void;
}
```

The Block card structure top to bottom:

**Context bar** (28px height, `var(--vscode-editorWidget-background)` bg, 1px bottom border).

Left section: shell selector button (codicon-terminal icon + label + chevron-down). Clicking opens the portal dropdown (reuse the existing portal logic from `InputSection`). Disabled when `isGhost` or `status === "running"`.

Right section (flex-1): conditional on status.
- Ghost / idle: show branch (if present) + folder + cwd path, muted.
- Running: replace right section with spinner (`codicon-loading` spin animation) + "Running" label in `--vscode-button-background` colour.
- Done (exit 0): show exit code badge in green tint. Branch + path visible again.
- Error (exit != 0): show exit code badge in `--vscode-testing-iconFailed` colour.
- Killed: show "Killed" label in `--vscode-disabledForeground`.

**Floating action toolbar** (absolute, top-right, opacity 0 → 1 on card hover via CSS `.block-card:hover .block-toolbar`).

Buttons:
- Add (`codicon-add`): always visible, calls `onAddAfter`.
- Stop (`codicon-debug-stop`): visible only when `status === "running"`, calls `onKill`.
- Refresh (`codicon-refresh`): visible when NOT running and block is real (not ghost), calls `onReRun`.
- Search (`codicon-search`): visible when block has output, toggles search bar.
- Delete (`codicon-trash`): visible for real non-running blocks, calls `onDelete`.
- Divider.
- Drag grip (`codicon-gripper`): decorative, future feature.
- Divider.
- More (`codicon-ellipsis`): opens `ContextMenu` (reuse existing).

**Input area** (`var(--vscode-input-background)` bg, flex row).

Left: `$` prompt in `--vscode-button-background` colour, `font-bold`.
Middle: `<textarea>` (controlled, multi-line). `readOnly` when `status` is `done | error | killed`. Ghost and idle are fully editable and focused. `onKeyDown` handles Enter (submit) vs Shift+Enter (newline).
Right: arrow-right run button. Hidden when `isGhost && !pendingCommand`. Disabled when running or no content.

**Output area** (below input, directly).

Rendered only when `block` is not null and has output or is in running/done/error state. Reuses the existing `OutputArea` component without modification.

`(no output)` italic muted text rendered when `status === "done"` and `output.length === 0`.

**Stdin input row** (below output, visible only when `status === "running"`).

Reuses the existing `BlockInput` component without modification, passing `blockId`.

**Metadata footer** (below stdin or output, visible when `status !== "running"` and `status !== "idle"` and exit data exists).

Reuses the exact footer layout from `OutputBlock` (exit code, final cwd if changed, final branch if changed). Same styles.

---

### Layer 2: New `BlockDocument` component

#### [NEW] `src/webview/components/BlockDocument.tsx`

Wraps a list of `Block` cards with a document-level container.

**Document header bar** (36px height, `var(--vscode-editorWidget-background)` bg, 1px bottom border).

Left: folder icon + document group name. On double-click, the name text becomes an `<input>` in place (controlled by local state `isEditingName`). On blur or Enter, the name is committed. The group name is a new concept with no current backing in `FluxTermDocument`. I will store it as a local `useState` string initialized from a prop `groupName` and call an `onGroupNameChange` callback on commit. The parent (`App.tsx`) can decide whether to persist this.

Right: "Run All" button (`codicon-run-all` + label). `onClick` calls `onRunAll` prop. Disabled while any block in the group is running.

**Block list area** (`gap: 1rem`, `padding: 1rem`).

Children are the `Block` components passed in.

---

### Layer 3: Refactor `App.tsx`

#### [MODIFY] `src/webview/App.tsx`

The layout becomes `<div full screen> → <BlockDocument>` (one document group per `.ftx` file, matching the existing single-session model).

Local state additions in `App.tsx`:
- `pendingCommand: string` — the command being typed in the current ghost block.

The rendered block list is: `[...safeBlocks sorted by seq].map(block => <Block .../>)` followed by one `<Block isGhost pendingCommand={pendingCommand} onPendingCommandChange={setPendingCommand} onSubmit={handleRun} />`.

`handleRun` remains as-is. After it is called from the ghost block, `setPendingCommand("")` resets the ghost immediately.

`handleAddAfter(afterBlockId: string)`: The only difference from ghost submission is that the new idle block is inserted after a specific block. Since the store does not support ordering by anything other than `seq`, inserting after a specific block means the new block gets a `seq` between the target block and the next. This is a gap in the current store design.

> [!IMPORTANT]
> **Store insertion order issue**: The current store always pushes new blocks to the end (`draft.blocks.push(...)`). When the user clicks Add on a middle block, we want the new block to appear after it visually. This requires either inserting at a specific index in the array (a store change) or re-sorting by creation time with sub-seq ordering. The cleanest and least disruptive approach is to add a `spliceBlockAfter(afterBlockId: string): string` action to `notebookStore.ts` that inserts a new idle block (with `status: "idle"`, no command, no output) at the correct position. This is a minimal targeted store change. **I need to add this to the store.** This is the only store change in the entire refactor.

The `handleRunAll` callback iterates over all idle blocks in order and calls `handleRun` on each. Since idle blocks in the new model are represented as the ghost (pre-submission state), "Run All" only makes sense for existing done/idle document blocks. For the initial version I will treat it as re-running all done/error blocks in sequence.

The removed `<InputSection>` component is deleted from the JSX and import.

The empty-state message (currently shown when `safeBlocks.length === 0`) is still shown inside the `BlockDocument` body when there are no real blocks, alongside the ghost block.

---

### Layer 4: Store addition (targeted, minimal)

#### [MODIFY] `src/webview/store/notebookStore.ts`

Add one new exported action: `spliceBlockAfter(afterBlockId: string): string`. This creates a new block with `status: "idle"`, empty command, empty output, and inserts it directly after the block with id `afterBlockId` in the `draft.blocks` array. It assigns a `seq` value of `draft.blockSeq + 1` and increments `blockSeq`. Returns the new block id.

This is the only change to the store. All existing actions, the `CompleteBlock` sequence guard, and the block shape remain unchanged.

`FluxTermBlock.status` already includes "idle" in `MessageProtocol.ts`'s `BlockStatus` type, so no type change is needed.

---

### Layer 5: Delete old components

After `App.tsx` no longer imports them:

#### [DELETE] `src/webview/components/input/InputSection.tsx`
#### [DELETE] `src/webview/components/input/InputSection.stories.tsx`
#### [DELETE] `src/webview/components/input/index.ts`
#### [DELETE] `src/webview/components/block/OutputBlock.tsx`

These are entirely superseded by `Block.tsx`.

---

### Layer 6: CSS additions in `styles.css`

Add the block-toolbar hover rule so Tailwind `group` is not required for this specific interaction, keeping it consistent with the existing `.group:hover .block-toolbar` rule already present in `ANIM_CSS` in `App.tsx`. This rule moves from the runtime-injected `ANIM_CSS` string into the proper `styles.css` file:

```css
.block-card:hover .block-toolbar,
.block-toolbar:focus-within {
  opacity: 1 !important;
}
```

---

## Verification Plan

### Build
Run `pnpm run compile` (esbuild). Zero TypeScript errors required.

### Unit tests
Run `pnpm run test:webview`. The `notebookStore` tests must still pass. Verify the new `spliceBlockAfter` action with a targeted unit test added alongside the existing store tests.

### Storybook
Run `pnpm storybook`. Verify the `Blocks/Workspace` story renders in all four variants (Default, WidgetBg, BrightBorder, TerminalFeel). Add a `Blocks/Block` story covering idle, running (with mock output), done (with output), done (no output), error, killed, and ghost states.

### Manual (VS Code extension host)
Open a `.ftx` file. Confirm: ghost block at bottom is visible and accepts input. Type a command, press Enter, confirm running state in context bar. Confirm output streams into the same card. Confirm done state shows output with left-accent border. Confirm a new ghost block appears after completion. Confirm the Add button inserts a block immediately after. Confirm the Delete action removes a done block. Confirm the shell dropdown works from inside the context bar. Confirm double-clicking the document group name makes it editable.
