# Architecture Overview

## Runtime Layers

- **Main Process**: `src/main.js`
  - PTY lifecycle
  - SSH/SFTP connections
  - file transfer engine
  - audit logging
  - settings/history persistence
- **Preload**: `src/preload.js`
  - narrow and explicit IPC bridge
- **Renderer**: `src/renderer.js`
  - view state and interactions
  - queue UI, progress, retry
  - workspace page routing

## Core Modules

- **Terminal**
  - Local shell via `node-pty`
  - SSH terminal via `ssh2` shell stream
- **SFTP Transfer**
  - remote/local abstraction
  - recursive collection and streaming copy
  - conflict strategy handling
  - queued execution
- **Security**
  - credentials in keychain (`keytar`)
  - host verification via `known_hosts`
  - jump host chain
- **Observability**
  - structured audit events
  - transfer progress and failure diagnostics

## Persistence

- App settings/history/configs under Electron `userData`
- UI session and transient recovery in `localStorage`
