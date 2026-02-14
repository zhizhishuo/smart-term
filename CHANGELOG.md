# Changelog

All notable changes to this project are documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned

- P1 shell integration (command boundary/cwd detection/navigation)
- P2 collaboration, plugin architecture, intelligent assistance

## [2.0.0] - 2026-02-10

### Added

- Electron architecture (`xterm.js + node-pty`)
- SSH management page with dedup, edit, delete, connect
- SFTP dual-panel transfers with drag-and-drop
- Local<->Remote and Local<->Local transfer support
- Recursive directory transfer support
- Transfer queue and retry
- Transfer conflict strategies: overwrite/skip/rename
- Transfer recovery (resume interrupted jobs)
- Jump host support
- Keychain integration (`keytar`)
- `known_hosts` trust verification
- Audit log page and backend events
- Improved monitor sidebar and workspace navigation
- ESC closes active overlays/pages

### Changed

- Refactored UI from floating dialogs into workspace pages
- Unified workspace header and secondary action areas

### Notes

- Manual regression is still required before each release.
