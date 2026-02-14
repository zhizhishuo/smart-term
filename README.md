# Smart-Term (Electron)

[English](#english) | [中文](#中文)

---

## English

Smart-Term is a desktop terminal application for development and operations workflows.
It is built with `Electron + xterm.js + node-pty + ssh2` and combines terminal sessions, SSH management, file transfer, and security capabilities in one workspace.

### Highlights

- Multi-tab terminal for local and SSH sessions
- Centralized SSH configs (save/edit/delete/deduplicate/quick connect)
- Jump host (bastion) support
- Dual-panel file browser for local/remote paths
- Drag-and-drop transfer including R2R
- Recursive directory transfer
- Transfer queue, failed-item retry, and conflict strategies
- Transfer recovery after interruption
- Security: `keytar` secrets, `known_hosts` trust, and audit logs

### Tech Stack

- Electron
- `@xterm/xterm` + `@xterm/addon-fit`
- `node-pty`
- `ssh2`
- `keytar`

### Requirements

- Node.js 20+
- npm 10+
- macOS / Linux / Windows

Native modules may require local build tools on first install (for example, Xcode Command Line Tools on macOS).

### Quick Start

```bash
npm install
npm start
```

### Build

```bash
npm run build
```

### Development Checks

```bash
npm run check
```

### Project Structure

```text
smart-term-electron/
├── src/
│   ├── main.js        # Electron main process (PTY/SSH/SFTP/IPC)
│   ├── preload.js     # secure bridge
│   ├── renderer.js    # UI state and interaction logic
│   └── index.html     # layout and styles
├── scripts/
│   └── fix-node-pty-permissions.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── RELEASE_PROCESS.md
│   ├── UPGRADE_POLICY.md
│   └── GITHUB_SETUP.md
├── .github/workflows/ci.yml
└── package.json
```

### Security Model

- Secrets are stored in OS keychain via `keytar`, not plain project files
- New hosts are verified through `known_hosts` trust checks
- Critical actions are recorded in audit logs (connect, transfer, delete, failure)

### Data and Storage

Runtime data is stored in Electron `userData` paths, including non-sensitive app settings and operation history.
Sensitive fields (password/private key passphrase) are managed by `keytar`.

### Release and Versioning

This project follows SemVer (`MAJOR.MINOR.PATCH`):

- `MAJOR`: breaking changes
- `MINOR`: backward-compatible features
- `PATCH`: backward-compatible fixes

References:

- `docs/UPGRADE_POLICY.md`
- `docs/RELEASE_PROCESS.md`
- `CHANGELOG.md`

### Roadmap

- P1: shell integration (command boundaries, cwd detection, navigation)
- P2: collaboration (session sharing and team workflows)
- P2: plugin architecture
- P2: intelligent assistance (explain/risk confirmation/troubleshooting)

### Contributing

Issues and pull requests are welcome.
Please read `CONTRIBUTING.md` before contributing.

### License

MIT License. See `LICENSE`.

---

## 中文

Smart-Term 是一个面向开发与运维场景的桌面终端应用。
它基于 `Electron + xterm.js + node-pty + ssh2` 构建，将终端会话、SSH 管理、文件传输与安全能力统一到同一个工作区。

### 核心能力

- 多标签终端，支持本地与 SSH 会话
- 集中式 SSH 配置管理（保存、编辑、删除、去重、快速连接）
- 支持跳板机（Jump Host）
- 双面板文件浏览，统一本地/远程操作体验
- 支持拖拽传输，包含远程到远程（R2R）
- 支持目录递归传输
- 支持传输队列、失败项重试、冲突策略（覆盖/跳过/重命名）
- 支持中断任务恢复
- 安全增强：`keytar` 凭据、`known_hosts` 主机信任、审计日志

### 技术栈

- Electron
- `@xterm/xterm` + `@xterm/addon-fit`
- `node-pty`
- `ssh2`
- `keytar`

### 环境要求

- Node.js 20+
- npm 10+
- macOS / Linux / Windows

首次安装时，原生依赖可能需要本地编译工具链（例如 macOS 的 Xcode Command Line Tools）。

### 快速开始

```bash
npm install
npm start
```

### 构建

```bash
npm run build
```

### 开发检查

```bash
npm run check
```

### 项目结构

```text
smart-term-electron/
├── src/
│   ├── main.js        # Electron 主进程（PTY/SSH/SFTP/IPC）
│   ├── preload.js     # 安全桥接层
│   ├── renderer.js    # UI 状态与交互逻辑
│   └── index.html     # 布局与样式
├── scripts/
│   └── fix-node-pty-permissions.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── RELEASE_PROCESS.md
│   ├── UPGRADE_POLICY.md
│   └── GITHUB_SETUP.md
├── .github/workflows/ci.yml
└── package.json
```

### 安全模型

- 敏感凭据通过 `keytar` 存储到系统钥匙串，不以明文写入项目文件
- 新主机连接通过 `known_hosts` 进行指纹校验
- 关键操作会写入审计日志（连接、传输、删除、失败）

### 数据与存储

运行数据存储在 Electron `userData` 路径中，包含非敏感设置与操作历史。
密码、私钥口令等敏感字段由 `keytar` 管理。

### 发布与版本

项目采用 SemVer（`MAJOR.MINOR.PATCH`）版本规范：

- `MAJOR`：不兼容变更
- `MINOR`：向后兼容的新功能
- `PATCH`：向后兼容的缺陷修复

参考文档：

- `docs/UPGRADE_POLICY.md`
- `docs/RELEASE_PROCESS.md`
- `CHANGELOG.md`

### 路线图

- P1：shell integration（命令边界、cwd 检测、导航体验）
- P2：协作能力（会话共享与团队流程）
- P2：插件体系
- P2：智能辅助（解释、风险确认、排障建议）

### 贡献

欢迎提交 Issue 和 PR。
贡献前请阅读 `CONTRIBUTING.md`。

### 许可证

MIT License. See `LICENSE`.
