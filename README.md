# Antigravity Core ⚡

> Smart multi-account & credit manager for Antigravity — auto-switches accounts and models when credits run low.

![Version](https://img.shields.io/badge/version-1.0.0-7C3AED)
![License](https://img.shields.io/badge/license-MIT-16A34A)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-2563EB)

---

## Features

### 🔄 Auto Switch
Automatically switches models and accounts when credits run low — zero downtime, zero manual intervention.

- **Smart Decision Tree**: Current model exhausted → next model → next account → warning
- **Configurable Threshold**: Set your own credit threshold for triggering switches
- **Model Priority**: Drag-and-drop to reorder which models get tried first
- **Polling Engine**: Monitors credits every N seconds (configurable)

### 📊 Sidebar Dashboard
A beautiful dark-themed sidebar panel in the VS Code Activity Bar showing:

- **Active Account Card** — email, status, current model, credits progress bar
- **Auto Switch Toggle** — enable/disable with pulsing status indicator
- **Accounts List** — all accounts with model credit pills and quick actions
- **Switch Settings** — threshold, interval, priority order (collapsible)
- **Switch History** — timeline of all switches with reasons (collapsible)

### 📈 Status Bar
Always-visible status bar item showing:
- Current model + credit count
- Color-coded: 🟢 Green (>20) | 🟡 Amber (1-20) | 🔴 Red (0)
- Animated "Switching..." indicator during transitions

### 📦 Import / Export
- Export all account sessions to JSON
- Import sessions from JSON backup

---

## Screenshots

| Sidebar Dashboard | Auto Switch Settings |
|---|---|
| Dark professional theme matching VS Code | Configurable threshold, interval, and model priority |

---

## Installation

### From Open VSX (Recommended)
1. Open **Cursor**, **VSCodium**, **Windsurf**, or any Open VSX compatible editor
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **"Antigravity Core"**
4. Click **Install**

### From VSIX
```bash
code --install-extension antigravity-core-1.0.0.vsix
```

---

## Usage

1. After installation, look for the **⚡** icon in the Activity Bar (left sidebar)
2. Click it to open the **Antigravity Core** panel
3. Your accounts and credits will appear automatically
4. Toggle **Auto Switch** to enable automatic model/account switching

### Commands

| Command | Description |
|---------|-------------|
| `Antigravity Core: Refresh Credits` | Re-fetch credit balances |
| `Antigravity Core: Toggle Auto Switch` | Enable/disable auto switching |
| `Antigravity Core: Add Account` | Add a new Antigravity account |
| `Antigravity Core: Export All Sessions` | Export sessions to JSON |

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `antigravityHub.autoSwitch.enabled` | `true` | Enable auto-switching |
| `antigravityHub.autoSwitch.creditThreshold` | `5` | Switch when credits ≤ this value |
| `antigravityHub.autoSwitch.checkIntervalSeconds` | `30` | Polling interval in seconds |
| `antigravityHub.autoSwitch.preferHighestCredits` | `true` | Prefer account with most credits |
| `antigravityHub.autoSwitch.showNotifications` | `true` | Show notification on switch |
| `antigravityHub.autoSwitch.modelPriority` | `[claude-sonnet, ...]` | Model switch priority order |

---

## Auto Switch Decision Tree

```
Credits > threshold? ──── YES ──── Do nothing ✓
         │
         NO
         │
    Current model has ──── YES ──── Switch to next model
    alternatives?                   (same account) ✓
         │
         NO
         │
    Other accounts ──── YES ──── Switch to next account
    have credits?                (with most credits) ✓
         │
         NO
         │
    ⚠ All exhausted ──── Show warning notification
```

---

## Development

```bash
# Clone the repo
git clone https://github.com/AntgravityCore/antigravity-core.git
cd antigravity-core

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-compile on save)
npm run watch

# Package as VSIX
npx @vscode/vsce package

# Run in VS Code (press F5 in VS Code with this folder open)
```

---

## Architecture

```
src/
├── extension.ts          — Entry point, registers everything
├── creditMonitor.ts      — Polls credits at intervals
├── autoSwitch.ts         — Smart switch decision tree
├── modelPriority.ts      — Model priority ordering
├── statusBar.ts          — Status bar item manager
├── historyLog.ts         — Switch history (globalState)
├── webviewProvider.ts    — WebviewViewProvider for sidebar
└── webview/
    └── panel.html        — Complete sidebar UI (HTML+CSS+JS)
```

---

## License

[MIT](LICENSE) © Antigravity Core

---

**Made with ⚡ by Antigravity Core**
