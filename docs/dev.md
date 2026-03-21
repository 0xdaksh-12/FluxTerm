# Developer Documentation

## Current Application State and Architecture Overview

Flow is currently a functional VS Code custom editor extension with a webview-based notebook UI. It supports block-based command execution with real-time streaming, stdin handling, process control (kill), and context tracking (cwd and git branch).

The architecture is split between three main components:

- **Webview (React UI)**: Handles the presentation and user interaction within the notebook interface.
- **Extension (Message orchestration and state management)**: Acts as the central authority, managing the flow of data and coordinating between the UI and the execution layer.
- **ExecutionEngine (Process execution layer)**: Responsible for spawning shells, managing processes, capturing output streams, and handling graceful process termination.

**Current Stage of Development**:

- **Shell Resolution**: Implemented but actively being refined toward a single source of truth using the `ResolvedShell` object to eliminate duplicated data.
- **Testing**: Fully implemented across three distinct layers. Unit tests using Vitest (Node) for pure logic like ExecutionEngine, Integration tests using Vitest (Node) for components like FlowDocumentSession with mocked VS Code APIs, and Extension tests using Mocha and @vscode/test-cli for end-to-end webview lifecycle.
- **Platform Specifics**: Improvements are in progress, such as utilizing interactive shells for `bash`/`zsh` to preserve user environments (like aliases) while handling TTY limitations gracefully.

### Recent Fixes & Updates

- **Branch Rendering in Webview (InputSection.tsx)**: Fixed a local bug in where the branch indicator was not correctly rendered. The previous implementation incorrectly used the nullish coalescing operator `??`, causing a truthy branch name like `"main"` to render as raw unstyled inline text without the wrapper or icons. Attempting to restrict the type inside the default `div` failed because `false ?? context.branch` evaluates to `false`. The fix now explicitly checks `typeof context.branch === "string" && (...)` ensuring that branch names consistently and safely render the proper icon and flex layouts, ignoring empty state edge-cases.
- **Shell Interactive Mode Fix**: Shell profiles for `bash` and `zsh` were updated to use `-l` (login) instead of `-i` (interactive) due to unpredictable behavior and `zle` errors when run without a real PTY. However, login shells do not always load user-specific setups like aliases or toolchains (`nvm`, `pyenv`) defined in `~/.bashrc` or `~/.zshrc`. To guarantee a consistent and rich user environment across blocks, `PosixAdapter` natively prepends conditional `source ~/.bashrc` and `source ~/.zshrc` (silenced via `2>/dev/null`) directly to the base execution string prior to running the user command. Additionally, the wrapper string uses `.join("\n")` rather than semicolons to execute a robust heredoc `eval`, effectively ensuring `export_aliases`/`aliases` behavior is turned on *before* the user command is locally parsed by the terminal.
- **Collision-Safe ID Generation**: Updated the `generateId` utility to use the native Web Crypto API (`crypto.randomUUID()`) natively available in modern Node and browser environments. This replaces the old `Math.random()` approach which was unsafe during high-concurrency execution and posed a latent risk for block ID collisions in the execution registry.
- **Diagnostics and Telemetry Resiliency**: Added explicit `Ext.error` output tracing for scenarios where the payload syncing meta-line becomes malformed or fails to parse via JSON. Also implemented process observation events (`on('close')`) into Windows `taskkill` directives, closing edge-cases where untracked system execution trees would leak silently as zombies upon unhandled kills.
- **Robust Environment Shell Parsing**: Hardened the shell environment parsing pipeline in `src/utils/helper.ts` to strictly extract the `basename()` of `process.env.SHELL` and verify direct matches to avoid mismatched configuration from overlapping prefixes or long symlink paths.

This summary provides a clear understanding of what is already stable, what is evolving, and where to contribute next.
