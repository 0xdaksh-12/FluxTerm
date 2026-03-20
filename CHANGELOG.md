# Change Log

All notable changes to the "flow" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Added `vitest.config.mts` and `vitest.config.webview.mts` to support webview testing using Vitest as per the project rules

### Changed

- **Shell architecture refactor** — `ResolvedShell` is now the single runtime shell object end-to-end
  - `FlowBlock.shell`: `string` (path) → `ResolvedShell` (full object frozen at block creation)
  - `FlowContext.shell`: `string | null` → `ResolvedShell | null`
  - `WebviewMessage.execute`: removed separate `args: string[]` field; `shell: ResolvedShell` carries both path and args
  - `ExecutionEngine.execute()`: signature from `(shellPath, baseArgs, …)` → `(shell: ResolvedShell, …)`
  - `FlowService.execute()`: signature from `(shell: string, args: string[], …)` → `(shell: ResolvedShell, …)`
  - `notebookStore.createBlock()`: `shell` param is now `ResolvedShell`
  - `App.tsx`: removed `.find()` lookups to recover args; passes full `ResolvedShell` everywhere
  - `InputSection.tsx`: `onShellChange` callback now passes the full `ResolvedShell` instead of a path string
  - `FlowDocument.shell` remains `string` (shell `id`) for JSON serialization; webview matches it to the live shell list on load
  - `FlowDocumentSession`: extension send `shell: null` in init context; webview restores selection from saved `id` + shell list
- Renamed `src/utils/constant.ts` -> `src/utils/constants.ts` adhering to the rule that any source of truth must be in `constants.ts`
- Excluded vitest configs from `tsconfig.json` to fix `rootDir` errors

## [0.0.1] - 2026-02-22

### Added

- Shell detection for Windows (cmd, powershell, pwsh, bash, zsh) using `where.exe` or `which`
- Shell selector dropdown in Webview
- `pwsh` support in shell configuration
- `useShellConfig` hook for managing shell selection state
- `Tooltip` component for enhanced UI feedback
- CWD path copy functionality via Ctrl+Click
- Hover effects and tooltips for CWD and shell list items

### Fixed

- Webview logs not appearing in Extension Host/Debug Console
- `ResolvedShell` type definition to only expose necessary fields to webview
