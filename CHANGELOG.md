# Change Log

All notable changes to the "flow" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Fixed

- Fixed git branch rendering logic in `InputSection.tsx` webview component to properly display the branch name and icon only when it is a valid string.

### Added

- Implemented a comprehensive testing strategy dividing tests into three distinct categories:
  - Unit Tests (Vitest) in `src/tests/unit` for `ExecutionEngine` and `ShellResolver`
  - Integration Tests (Vitest) in `src/tests/integration` with mocked VS Code context for `FlowDocumentSession`
  - Extension Tests (Mocha/@vscode/test-cli) in `src/tests/extension` for `FlowEditorProvider` and webview integration
- Added "Current Application State and Architecture Overview" to `docs/dev.md` detailing the webview, orchestration, and execution engine architecture.
- Added `vitest.config.mts` and `vitest.config.webview.mts` to support webview testing using Vitest as per the project rules

### Changed

- Re-organized test directory from `src/test` to `src/tests/` and updated `Package.json` scripts (`test:unit`, `test:integration`, `test:extension`) to segregate testing environments clearly
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
- Replaced `-i` (interactive) with `-l` (login) mode for `bash` and `zsh` profiles to prevent ZLE errors and unpredictable stdin handling in non-TTY environments. To retain user-specific configurations (aliases, exports) typically loaded in interactive shells, `PosixAdapter.buildWrapperCommand()` now conditionally sources `~/.bashrc` and `~/.zshrc` explicitly prior to executing commands, and uses a multi-line explicit `eval` block to ensure `shopt expand_aliases` and `setopt aliases` correctly parse the user commands.
- Enhanced shell detection in `getDefaultShell` to exact-match executable base names via `path.basename` prioritizing strict matches over fragile substr matches.
- Improved runtime telemetry by surfacing `ExecutionEngine` base64 payload JSON parsing failures explicitly as `Ext.error`s to aid debugging block sync issues.
- Added stream status observation to `taskkill` routines on Windows enabling explicit tracking of process tree shutdown success/failures.
- Replaced `Math.random()`-based ID generation in `generateId` with `crypto.randomUUID()` to ensure globally unique identifiers and eliminate state collision risks across high-frequency block interactions.
- Improved process termination on POSIX by using detached process groups (`process.kill(-pid)`) so that `SIGTERM` kills the whole tree and prevents orphans
- Updated `ExecutionEngine.test.ts` to dynamically find a shell path using `ShellResolver` rather than hardcoding paths
- Replaced the deprecated `which` command with POSIX standard `command -v` for shell resolution on Linux and macOS

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
