# Change Log

All notable changes to the "FluxTerm" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- **Webview UI & Store Testing**: Integrated `vitest` with `jsdom` and `@testing-library/react` to verify frontend state management (Zustand), messaging services, and React component rendering (OutputArea, App).
- **Electron E2E Integration Testing**: Added `@vscode/test-cli` automated UI lifecycle tests. Bypassed UI save dialogs during test loops and extracted Webview message orchestration hooks, directly enabling real programmatic simulations of custom editors, Python scripts, terminal execution piping, and Garbage Collection natively inside the VS Code host.
- **E2E Integration Testing**: Added codebase-wide E2E verifications for Python 3 interactive scripting (`stdin`, prompt handling) and native shell alias executions (`ls`, `ll`) across platforms, validating the absence of structural regressions post FluxTerm refactor.
- **Unit Testing**: Implemented comprehensive unit tests using Vitest across ExecutionEngine (Core, Internals, Edge Cases) and utilities (Logger, ID, Nonces). Validated buffer safety (UTF8/ANSI) and ShellAdapter abstractions.

### Changed

- **Codebase Structural Rename**: Refactored the entire project structure to replace all internal `Flow`/`xflow` references with `FluxTerm`/`fluxterm` (e.g., `FlowEditorProvider` -> `FluxTermEditorProvider`, `FlowCustomDocument` -> `FluxTermCustomDocument`). This aligns all internal class names, filenames, and service hooks with the official extension name.
- **Protocol Type Rename**: Renamed `FlowDocument`, `FlowBlock`, and `FlowContext` types in `MessageProtocol.ts` to `FluxTermDocument`, `FluxTermBlock`, and `FluxTermContext` for full naming consistency across the extension/webview protocol boundary.
- **Service Singleton Rename**: Renamed the exported `flowService` singleton from `FluxTermService.ts` to `fluxTermService`. Updated all webview hooks (`useFluxTermDocument`, `useShellConfig`, `useBlockExecution`), React components (`OutputBlock`, `BlockInput`), and `App.tsx` to use the new identifier.
- **File Extension Unification**: Resolved inconsistency between `.fluxterm` (used in dialogs/tests) and `.ftx` (registered in `package.json`). All dialogs, test fixture URIs, and comments now consistently use `.ftx` as the canonical file extension.
- **Env Var Rename**: Renamed `XFLOW_DEV_RELOAD` environment variable to `FLUXTERM_DEV_RELOAD` in `extension.ts`.

- **ExecutionEngine Shell Sentinel Rename**: Renamed the internal shell meta line prefix from `__FLOW_META__` to `__FTX_META__` in `ExecutionEngine.ts`. Updated all shell-level variable names in `PosixAdapter` (`__FLOW_TMP` → `__FTX_TMP`, `flow_cmd.*` → `ftx_cmd.*`, `__FLOW_OUTER_EOF__` → `__FTX_OUTER_EOF__`, `__FLOW_EOF__` → `__FTX_EOF__`) and in `CmdAdapter` (`flow_meta.txt` → `ftx_meta.txt`). Updated temp directory prefix in `ExecutionEngine.test.ts` from `flow-test-` to `ftx-test-`.

## [1.0.0] - 2026-03-24

### Added

- Added `LICENSE` file automatically applying Apache-2.0 license to the project
- Prepared `package.json` for marketplace publishing (version `1.0.0`, publisher `0xflame-7`, repository links, keywords)
- Renamed extension from `flow` to `fluxterm` (Display Name: **FluxTerm**) to avoid marketplace identifier collisions
- Updated file extension from `.ftx` to `.fluxterm`
- Added new elegant and modern application icon in `assets/icon.png`

### Changed

- Bumped `engines.vscode` requirement from `^1.10.5` to `^1.110.0` to match `@types/vscode` compatibility.
- Upgraded various `devDependencies` (including `esbuild`, `eslint`, `tailwindcss`, `vitest`, and `@types/*`) to their latest versions.
- Moved all runtime `dependencies` to `devDependencies` to enforce zero-dependency bundling natively via `esbuild`.
- Configured `vsce` ignoring to bypass runtime `node_modules` bloat, effectively slashing `.vsix` size.

### Fixed

- Removed stdin echo in `ExecutionEngine.writeInput` — typed input was displayed as a redundant `> text` line in output. Input is now silently forwarded to the process stdin without surfacing as a visible stream line.
- **Stdin inline append** — restored stdin echo (`{ type: "stdin" }`) and updated `OutputArea` webview component to visually merge each stdin line onto the preceding output line via `buildDisplayRows`. Typed input now appears appended on the same row as the prompt (e.g. `Enter your name: daksh`) matching real terminal behaviour, instead of being rendered as a separate `> text` line.
- Refactored `ExecutionEngine.handleChunk` stream pipeline to immediately emit trailing partial segments (text after the last newline in a chunk) instead of buffering them until the next newline arrives. Previously: partial remainder was always held in the buffer → prompt text from `input("Enter: ")` was never shown until user typed and pressed Enter. Now: if a chunk's final segment is non-empty (no trailing `\n`), it is flushed as a visible output line and the remainder is cleared, enabling real-time display of interactive prompts without a PTY. Complete lines and meta-sentinel interception are unaffected. `flushRemainders()` is guarded against double-emission because the cleared buffer means it has nothing left to flush for that segment.
- Refactored `ExecutionEngine` output handling to process stdout/stderr internally as raw `Buffer` streams instead of utf-8 chunked strings. This fixes a critical flaw where ANSI escape sequences were randomly truncated or split across data chunks during real-time emission, causing consistent CSS/style breakage in the webview. It also handles incomplete UTF-8 bytes tracking natively.
- Removed hardcoded `--color=always | cat -v` in `ExecutionEngine.ts` to fix broken terminal color rendering and prevent raw ANSI escape codes from cluttering output.
- Removed `-i` flag from bash and zsh shell profiles in `constants.ts` to prevent "cannot set terminal process group" and "no job control" warnings in non-TTY pipe environments.
- Fixed git branch rendering logic in `InputSection.tsx` webview component to properly display the branch name and icon only when it is a valid string.

### Added

- Native Terminal Emulator PTY integration in `ExecutionEngine`: On Unix systems (macOS/Linux), bash and zsh commands are now executed securely within a native `script` wrapper (`script -q /dev/null`). This flawlessly tricks system binaries recursively into rendering standard color strings (`isTTY=true`) natively, effectively simulating true terminal behaviors inside the engine without brittle parsing layers.
- Included the complete ANSI terminal color scheme (standard and bright) in the `ColorBlock` webview component for testing and visualizing `--vscode-terminal-ansi*` variables.
- Upgraded `OutputBlock` and `OutputArea` webview rendering layer to match a native VS Code Terminal-like UI experience.
  - Applied semantic styling for `stdout`, `stderr`, and `stdin` streams using appropriate VS Code CSS variables.
  - Hardcoded `ansi-to-react` HTML colors are now explicitly mapped via CSS to their native VS Code theme variables (`--vscode-terminal-ansi*`), fixing washed-out texts.
  - Improved visual grouping in block headers and command rows, now including the resolved shell name/label.
  - Added a new subtle execution metadata footer to surface exit codes, resulting CWD paths, and post-execution git branch changes for completed or error-state blocks.
- Implemented a comprehensive testing strategy dividing tests into three distinct categories:
  - Unit Tests (Vitest) in `src/tests/unit` for `ExecutionEngine` and `ShellResolver`
  - Integration Tests (Vitest) in `src/tests/integration` with mocked VS Code context for `FluxTermDocumentSession`
  - Extension Tests (Mocha/@vscode/test-cli) in `src/tests/extension` for `FluxTermEditorProvider` and webview integration
- Added "Current Application State and Architecture Overview" to `docs/dev.md` detailing the webview, orchestration, and execution engine architecture.
- Added `vitest.config.mts` and `vitest.config.webview.mts` to support webview testing using Vitest as per the project rules

### Changed

- Re-organized test directory from `src/test` to `src/tests/` and updated `Package.json` scripts (`test:unit`, `test:integration`, `test:extension`) to segregate testing environments clearly
- **Shell architecture refactor** — `ResolvedShell` is now the single runtime shell object end-to-end
  - `FlowBlock.shell`: `string` (path) → `ResolvedShell` (full object frozen at block creation)
  - `FlowContext.shell`: `string | null` → `ResolvedShell | null`
  - `WebviewMessage.execute`: removed separate `args: string[]` field; `shell: ResolvedShell` carries both path and args
  - `ExecutionEngine.execute()`: signature from `(shellPath, baseArgs, …)` → `(shell: ResolvedShell, …)`
  - `FluxTermService.execute()`: signature from `(shell: string, args: string[], …)` → `(shell: ResolvedShell, …)`
  - `notebookStore.createBlock()`: `shell` param is now `ResolvedShell`
  - `App.tsx`: removed `.find()` lookups to recover args; passes full `ResolvedShell` everywhere
  - `InputSection.tsx`: `onShellChange` callback now passes the full `ResolvedShell` instead of a path string
  - `FlowDocument.shell` remains `string` (shell `id`) for JSON serialization; webview matches it to the live shell list on load
  - `FluxTermDocumentSession`: extension send `shell: null` in init context; webview restores selection from saved `id` + shell list
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
- **VS Code Dirty State Lifecycle**: Transitioned extension from `CustomTextEditorProvider` to `CustomEditorProvider`. Edits (e.g. executing blocks, updating inputs) are now securely cached in-memory and visibly set the document as dirty (●) without triggering auto-saves. Actual disk I/O only occurs on explicit user actions (`Ctrl+S`, `Ctrl+Shift+S`, or Save prompt on close), resolving corrupted synchronization issues.

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
