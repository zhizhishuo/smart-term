# Smart-Term Implementation Design

## 1. Document Purpose

This document describes the final implemented design for Smart-Term (Electron edition), including architecture, core workflows, data model, and key engineering decisions used in the current production codebase.

## 2. Product Scope

Smart-Term is a multi-tab intelligent terminal focused on:

- local terminal and SSH terminal sessions
- dual-pane SFTP transfer (local/remote, remote/remote)
- transfer queue, progress, retry, conflict strategies
- SSH profile management and secure credential persistence
- session save/restore and audit/history support
- Chinese/English UI switching

## 3. Final Technology Stack

- **Runtime**: Electron
- **Terminal rendering**: xterm.js
- **Local PTY**: node-pty
- **SSH/SFTP**: ssh2
- **Bridge**: preload + IPC
- **Persistence**:
  - `app.getPath('userData')` JSON files for settings/history/audit/session metadata
  - keychain via `keytar` when available
  - credential fallback store when keychain is unavailable

## 4. Runtime Architecture

### 4.1 Main Process (`src/main.js`)

Responsibilities:

- local PTY lifecycle
- SSH/SFTP connection lifecycle
- transfer execution and progress events
- settings/history/audit persistence
- security handling (host trust, credential storage)

Design decisions:

- Per-tab SSH sessions are modeled as independent session objects (`sessionId -> session`).
- Active terminal output routing is controlled by current tab/session activation.
- A single tab switch does not destroy other SSH sessions.

### 4.2 Preload (`src/preload.js`)

Responsibilities:

- expose minimal, explicit terminal APIs to renderer
- isolate renderer from direct Node.js access
- provide event subscriptions (`onData`, `onStatus`, transfer progress, etc.)

### 4.3 Renderer (`src/renderer.js` + `src/index.html`)

Responsibilities:

- page-level UI state and tab management
- SSH profile CRUD and connection flows
- dual-pane file browser and drag/drop transfer UX
- i18n text rendering and dynamic status updates

Design decisions:

- each UI tab preserves its own terminal output buffer for visual continuity
- switching tabs restores corresponding buffer instead of global clear
- terminal size sync is re-applied during critical transitions (theme switch/tab restore)

## 5. SSH Session Model

### 5.1 Session Isolation

- each successful SSH connect returns a unique `sessionId`
- tab stores and uses its own `sessionId`
- activating a tab attempts `activateSSH(sessionId)` first
- closing a tab disconnects only that tab’s session

### 5.2 Reconnect and Disconnect

- manual disconnect targets current tab session
- quick reconnect first closes current session (if any), then reconnects to same target
- switching between tabs should not force-close other alive SSH sessions

## 6. SFTP Dual-Pane Design

### 6.1 Interaction Model

- left and right panels can independently connect to local or SSH target
- supports:
  - local -> remote
  - remote -> local
  - remote -> remote
  - local -> local

### 6.2 UX Enhancements Implemented

- profile select can auto-connect panel
- list-near toolbar for `Go Up` / `Refresh`
- direct path jump input (`/tmp`, custom path + Enter)
- centered transfer progress popup
- responsive toolbar layout for narrow windows

### 6.3 Transfer Reliability

- queue-based transfer execution
- conflict policy: overwrite / skip / rename
- failed item list with retry (single and batch)
- interrupted transfer recovery

## 7. Credential & Security Strategy

- SSH secrets stored in keychain (`keytar`) when available
- fallback credential file used only when keychain is unavailable
- saved profile connect flow auto-loads password/private key/passphrase
- host trust flow verifies fingerprint and stores trusted host data

## 8. Internationalization

- two locales: `zh-CN`, `en-US`
- static and dynamic UI texts are translated via key-based packs
- transfer/connection runtime messages are localized
- language switch refreshes view text and relevant panel controls

## 9. Data Persistence Overview

Stored under user data directory:

- settings
- command history
- audit logs
- SSH profiles (non-secret fields)
- known hosts
- optional secret fallback file (non-keychain environments)

## 10. Known Constraints

- terminal full-state replay is buffer-based and not a full PTY snapshot
- very long-running sessions may trim local UI buffer for performance
- keychain fallback file should be treated as a compatibility path, not preferred secure storage

## 11. Future Optimization Directions

- persistent per-tab terminal scrollback serialization
- stronger secret encryption for fallback mode
- richer shell integration (command boundaries + cwd timeline visualization)
- optional per-tab resource monitor and command insight
