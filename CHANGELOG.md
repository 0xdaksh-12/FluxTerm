# Changelog

All notable changes to the `src/` core of the "FluxTerm" extension will be documented in this file, emphasizing development impact and functional changes.
This format follows rigorous open-source repository management standards.

## [Unreleased]

### Features

- **webview**: Fully refactored `workspace.tsx` into a modular `MockDocument` and `MockInputSection` architecture. Replaced all duplicate block code with flexible layouts that support execution states (`idle`, `running`, `done`), interactive multiline input mockups, STDIN blocking components, and native VS Code indicator alignments.
- **webview**: Added a beautifully styled UI representation of an interactive notebook shell below executed blocks in `App.tsx`.
- **engine**: Implemented Native Terminal Emulator PTY integration (`script` wrapper) on Unix systems to trick terminal binaries into rendering standard color ANSI strings dynamically.
- **webview**: Included complete ANSI terminal color scheme visualization in the `ColorBlock` component.
- **webview**: Modernized `OutputBlock` and `OutputArea` to strictly map `ansi-to-react` HTML colors to VS Code's native theme CSS tokens (`--vscode-terminal-ansi*`).

### Bug Fixes

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
