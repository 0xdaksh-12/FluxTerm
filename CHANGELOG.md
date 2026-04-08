# Changelog

All notable changes to the `src/` core of the "FluxTerm" extension will be documented in this file, emphasizing development impact and functional changes.
This format follows rigorous open-source repository management standards.

## [Unreleased]

### Features

- **webview**: Interactive CWD path editor in each block's context bar. Double-clicking the path switches to an inline input with directory autocomplete (debounced 200 ms `listDir` round-trips to the extension). Tab/↑↓ navigate the dropdown; Enter commits and validates the path. Invalid paths trigger a VS Code warning notification instead of silently accepting garbage. Ctrl+click (Cmd+click on macOS) copies the path to the clipboard and briefly flashes a "Copied!" tooltip. Running blocks show the path read-only. The edited CWD is threaded through `onSubmit` (`cwdOverride` parameter) so ghost blocks, idle blocks, and completed block re-runs all execute in the overridden directory.
- **protocol**: Added `listDir` / `dirList` request–response pair for CWD autocomplete, and a `notify` message type so the webview can trigger VS Code info/warning/error notifications.
- **extension**: `FluxTermDocumentSession` handles `listDir` (Node `fs.readdir`, subdirs only, hidden dirs excluded) and `notify` (routed to `vscode.window.show*Message`).
- **webview**: Complete UI architecture refactor replacing the two-zone layout (block history list + fixed bottom `InputSection`) with a continuous notebook model. Every block is a self-contained card (`Block`) containing its own context bar, command textarea, output area, and stdin prompt. A persistent ghost block always sits at the end of each document group as the command entry surface.
- **webview**: Introduced `BlockDocument` — a document-level group wrapper with a double-click-editable group name and a "Run All" button.
- **webview**: Multi-document model: the webview now supports multiple named `BlockDocument` groups. Each block is tagged with a `documentId` (stored in `FluxTermBlock`), and the `FluxTermDocument` persists a `documents` array of `{id, name}` metadata. Renaming a document immediately persists via `updateDocument`.
- **webview**: Ghost `BlockDocument` — a visually dimmed, non-editable document card always rendered at the bottom of the page. Submitting a command inside it creates a new real `BlockDocument` group and assigns the block to it. The ghost doc never appears in the store.
- **webview**: Per-block independent shell — each block tracks its own shell via local `localShell` state in `Block.tsx`. The shell selector dropdown in a block's context bar only affects that block. There is no longer a global selected shell. On file open, the initial cwd is sourced from the folder containing the `.ftx` file.
- **webview**: "Add block after" inherits the source block's shell and final cwd/branch — so the new idle block starts in the same environment where the previous command finished.
- **webview**: Delete `BlockDocument` button (`codicon-trash`) in each document header. Removes the document and all its blocks atomically. Disabled while any block in the document is running.
- **webview**: Context bar on each block dynamically swaps between shell/branch/path and a spinning "Running" indicator during execution.
- **webview**: Floating action toolbar (Add, Stop/Refresh, Search, Delete, Drag, More) appears on card hover via CSS using the new `block-tb-btn` utility class.
- **webview**: Added `spliceBlockAfter` store action — inserts an idle block immediately after a target block to power the Add button. Added `promoteIdleBlock` store action — atomically freezes command, shell, cwd, branch and flips status to running.
- **webview**: Fully refactored `workspace.tsx` into a modular `MockDocument` and `MockInputSection` architecture. Replaced all duplicate block code with flexible layouts that support execution states (`idle`, `running`, `done`), interactive multiline input mockups, STDIN blocking components, and native VS Code indicator alignments.
- **webview**: "Re-run in-place" feature: Re-running a command no longer clones the block. Instead, it relies on in-place execution, preserves prior logs via an injected muted datetime separator line `[Datetime]`, and gracefully streams new output.
- **webview**: "Clear output" feature: Users can now selectively clear output of idle or running blocks via the block floating action toolbar. This trims visual output via a calculated `clearedAt` index tracking, injecting a synthetic `[Datetime]` header automatically if streams resume natively.
- **webview**: Added a beautifully styled UI representation of an interactive notebook shell below executed blocks in `App.tsx`.
- **engine**: Implemented Native Terminal Emulator PTY integration (`script` wrapper) on Unix systems to trick terminal binaries into rendering standard color ANSI strings dynamically.
- **webview**: Included complete ANSI terminal color scheme visualization in the `ColorBlock` component.
- **webview**: Modernized `OutputBlock` and `OutputArea` to strictly map `ansi-to-react` HTML colors to VS Code's native theme CSS tokens (`--vscode-terminal-ansi*`).


### Bug Fixes

- **webview** [Bug 1]: `handleBlockSubmit` was sending `orig.command` (frozen at first run) to the engine instead of `cmd` (the user's current textarea text) for done/error/killed block re-submissions. Edited commands now execute correctly.
- **webview** [Bug 2]: Re-run moved blocks to the bottom of the document because `reRunBlockInPlace` bumped `block.seq` to the highest value and App.tsx sorts by `seq`. Fixed by separating the sequence guard counter (`blockSeq`/`lastRunSeq`) from the visual ordering field (`seq`). `block.seq` is no longer mutated on re-run.
- **webview** [Bug 3]: `promoteIdleBlock` never injected the datetime separator or updated `createdAt`, so promoted idle blocks showed no timestamp header. Fixed to match `createBlock` behaviour.
- **webview** [Bug 4]: Ghost blocks inherited `runtimeContext.cwd` (global, cross-document) instead of the last `finalCwd` of the same document. Fixed by computing `lastDocCwd` per-document from `docBlocks`.
- **webview** [Bug 6]: Search match count included hidden/cleared output lines. Fixed to count only `visibleOutput` (sliced at `clearedAt`).
- **webview** [Bug 7]: "Copy Output" copied all output including pre-clear lines. Fixed to copy only visible lines.
- **webview** [Bug 8]: `OutputArea` post-clear header was always shown, then blindly hid the first separator — which could be the re-run's own run timestamp. Fixed: post-clear header is only shown when `rows[0]` is not already a separator.
- **webview** [Bug 9]: Context menu "Re-run" was always enabled — clicking it on a running block corrupted state. Fixed by adding `disabled={block.status === "running"}` and a guard in `reRunBlockInPlace`.
- **webview** [Bug 10]: `spliceBlockAfter` assigned `seq = blockSeq + 1` causing the new idle block to sort to the bottom. Fixed by: (1) removing the `sort((a,b) => a.seq - b.seq)` in App.tsx — array order is canonical; (2) assigning a fractional seq between source and next block in `spliceBlockAfter`.
- **extension** [Bug 11]: `ExecutionEngine.dispose()` called `registry.clear()` synchronously before async `taskkill` callbacks fired, causing `finalize()` to no-op and leaving processes alive. Removed the synchronous clear — each process removes its own entry via the `close` event.
- **webview** [Bug 12]: Dead `"update"` message branch in `useFluxTermDocument` removed — the extension never sends this message type.
- **webview** [Bug 13]: `baseContext.shell` was hardcoded `null`. Now inherits from `runtimeContext.shell` so ghost blocks can default to the last-used shell.

- **webview**: Fixed `BlockDocument` name not persisting — `onGroupNameChange` is now wired to `updateDocument` in `App.tsx` and the `documents` array is included in every `saveResponse`.
- **webview**: Fixed non-scrollable webview — removed the `h-screen` + `overflow-y-auto` fixed-height container. The page now grows naturally with content; `html` and `body` have `overflow-y: auto` and `height: 100%` in `styles.css`.
- **webview**: Capped `OutputArea` height at `300px` with `overflow-y: auto` so long command outputs don't push the entire layout off-screen.
- **webview**: Removed the "FluxTerm Notebook / Type a command below to get started" empty-state placeholder — the ghost block already serves as the entry surface.
- **webview**: Block input is now editable in all states except while the command is actively `running`. After `done`, `error`, or `killed`, the user can edit the command text and press Enter to clone and re-execute the block with the modified command. Submitting an edited `idle` block still promotes it in-place; submitting a completed block creates a fresh block in the same document.
- **storybook**: Renamed `vsTheme.ts` to `vsTheme.mts` to resolve a TypeScript ESM/CJS module mismatch. Under `moduleResolution: Node16`, importing from the pure-ESM `@storybook/react-vite` package inside a file treated as CommonJS (due to no `"type": "module"` in `package.json`) raised a `resolution-mode` attribute error. The `.mts` extension explicitly signals ESM to TypeScript regardless of `package.json#type`.
- **webview**: Resolved an issue where codicons failed to load in development by conditionally resolving the webview URI based on the extension mode.
- **engine**: Removed unintended `stdin` echoes in `writeInput` to prevent duplicate terminal outputs.
- **engine**: Refactored the `handleChunk` stream pipeline to immediately emit trailing partial output segments. This guarantees real-time rendering of interactive prompts (e.g., Python's `input()`).
- **engine**: Transitioned standard output accumulators from utf-8 strings to raw `Buffer` streams utilizing a custom `findSafeSplitIndex` parser. This prevents the abrupt slicing of inline ANSI escape codes across chunks.
- **webview**: Fixed git branch logic in `InputSection.tsx`, correctly suppressing invalid empty string states.
- **webview**: Updated `OutputArea` to visually merge `stdin` typed inputs directly onto the preceding prompt lines, perfectly mimicking standard graphical terminals.
- **engine**: Replaced `-i` with `-l` for bash/zsh shell profiles and explicitly injected `source ~/.bashrc` evaluations prior to user command sequences.

### Refactors & Architecture

- **extension**: Converted manual `FLUXTERM_DEV_RELOAD` environment variable checks into native VS Code `context.extensionMode` evaluations to trigger dev auto-reloads.

- **core**: Renamed structural codebase and variable references globally from `Flow`/`xflow` to `FluxTerm`/`fluxterm`.
- **protocol**: Refactored schema types to `FluxTermDocument`, `FluxTermBlock`, and `FluxTermContext`.
- **engine**: Upgraded `ExecutionEngine` to pass a solitary `ResolvedShell` runtime object end-to-end instead of fragmented binary path strings.
- **engine**: Swapped `Math.random()` ID generator for the collision-safe Web Crypto API `crypto.randomUUID()`.
- **vs-code**: Transitioned the extension lifecycle to use `CustomEditorProvider` to securely manage dirty state cache behavior (●) without triggering disruptive auto-saves.

## [1.0.0] - 2026-03-24

### Features

- **webview**: Added an integrated shell selector dropdown interface.
- **webview**: Implemented CWD path copying capabilities via standard Ctrl+Click workflows.
- **extension**: Enabled robust OS-level detection logic for `cmd`, `powershell`, `pwsh`, `bash`, and `zsh`.

### Bug Fixes

- **protocol**: Stripped unneeded properties from the `ResolvedShell` type, ensuring a minimal security footprint exposed to the untrusted Webview UI.
- **extension**: Resolved silent outputs by properly routing Webview console streams back into the Extension Host Debug Console.
