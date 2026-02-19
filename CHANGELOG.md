# Change Log

All notable changes to the "flow" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

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
