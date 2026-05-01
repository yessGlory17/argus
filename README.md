<div align="center">

<br/>

<img src="icon-128.png" alt="Argus Logo" width="160" height="160"/>

<br/>

# **ARGUS**

### *Claude Code Session Debugger & Performance Analyzer*

<br/>

<table>
<tr>
<td align="center" style="border: none; background: transparent;">
<h3>👁️ SEE EVERYTHING</h3>
</td>
<td align="center" style="border: none; background: transparent;">
<h3>🎯 OPTIMIZE EVERYTHING</h3>
</td>
<td align="center" style="border: none; background: transparent;">
<h3>⚡ SAVE TIME</h3>
</td>
</tr>
</table>

<br/>

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-0078d7?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646cff?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![MIT License](https://img.shields.io/badge/License-MIT-success?style=for-the-badge)](LICENSE)

<br/>

**[✨ Features](#-features)** •
**[📸 Screenshots](#-screenshots)** •
**[📦 Installation](#-installation)** •
**[🚀 Usage](#-usage)** •
**[🏗️ Architecture](#️-architecture)** •
**[📊 Stats](#-project-stats)**

</div>

<br/>

> 🔮 **Named after the all-seeing giant of Greek mythology** — Argus watches over your Claude Code sessions, detecting inefficiencies, tracking costs, and optimizing your AI development experience.

<br/>

---

## 🎯 What is Argus?

**Argus** is a powerful VS Code extension that provides **deep insights into Claude Code sessions**, helping developers optimize their AI-assisted workflows through intelligent analysis and beautiful visualizations.

<div align="center">

### 🌟 **Why Choose Argus?**

</div>

<table align="center">
<tr>
<td align="center" width="20%">
<br/>
💸
<br/><br/>
<b>Save Money</b>
<br/><br/>
<sub>Identify wasted API calls and optimize token usage</sub>
<br/><br/>
</td>
<td align="center" width="20%">
<br/>
⚡
<br/><br/>
<b>Speed Up Development</b>
<br/><br/>
<sub>Detect retry loops and duplicate operations</sub>
<br/><br/>
</td>
<td align="center" width="20%">
<br/>
🔬
<br/><br/>
<b>Deep Analysis</b>
<br/><br/>
<sub>Understand how Claude Code works under the hood</sub>
<br/><br/>
</td>
<td align="center" width="20%">
<br/>
📊
<br/><br/>
<b>Visual Insights</b>
<br/><br/>
<sub>Beautiful dashboards with real-time monitoring</sub>
<br/><br/>
</td>
<td align="center" width="20%">
<br/>
🎓
<br/><br/>
<b>Learn & Improve</b>
<br/><br/>
<sub>Understand patterns and optimize your prompts</sub>
<br/><br/>
</td>
</tr>
</table>

---

## ✨ Features

### 🔍 **Intelligent Session Discovery**

<details open>
<summary><b>Click to expand</b></summary>
<br/>

| Feature | Description |
|---------|-------------|
| 🔎 **Automatic Scanning** | Discovers all Claude Code sessions from `~/.claude/projects/` |
| 🎛️ **Smart Filtering** | Filter by model (Opus/Sonnet/Haiku), date presets (1h, 24h, 7d, 30d), or custom calendar range |
| 📅 **Custom Calendar Picker** | Built-in range selector with month navigation, today highlight, and range visualization |
| 📡 **Real-time Monitoring** | Watch sessions update as they progress with live file watching |
| 📂 **Session Grouping** | Group sessions by project or model, with collapsible sections |
| 🔄 **Refresh with Progress** | Manual refresh with progress notification and optimized discovery |

</details>

### 📊 **Comprehensive Analysis Dashboard**

<details open>
<summary><b>7 Powerful Analysis Tabs</b></summary>
<br/>

| Tab | Features |
|-----|----------|
| **📝 Steps** | Full-text search • Multi-select tool filter • Status filter (Success/Failed/Issues) • Sort by time or cost • Per-step duration • Lucide icons per tool type • Inline findings |
| **🔍 Analysis** | 6 intelligent rules: Duplicate Reads • Unused Operations • Retry Loops • Failed Tools • Context Pressure • Compaction Events |
| **💰 Cost** | Step-by-step breakdown • Token visualization • Cache hit ratio • Model attribution • Spending graphs |
| **⚡ Performance** | Efficiency score • Wasted cost calculations • Timing analysis • Bottleneck identification |
| **🌊 Flow** | Interactive dependency graph • File operation flow • Read/Write/Edit tracking • Step relationships |
| **🧠 Context** | Token usage tracking • Cache performance • Window utilization • I/O distribution |
| **💡 Insights** | AI-powered recommendations • Pattern recognition • Optimization suggestions • Best practices |

</details>

### 🎨 **Modern UI/UX**
- **React-powered Webviews**: Smooth, responsive interface built with React 19
- **Custom Dropdowns & Calendar**: Fully styled filter controls — no native browser widgets
- **Interactive Visualizations**: Charts powered by Chart.js and Recharts
- **D3.js Graphs**: Beautiful dependency flow diagrams
- **Dark Mode Native**: Seamlessly integrates with VS Code themes
- **Lucide Icons**: Per-tool-type stroke icons with a pastel color palette
- **Sticky Filters**: Header, tabs, and filters stay fixed while content scrolls

### 🔧 **Developer Experience**

- **Sidebar Webview**: Sessions listed with inline search, model & date filters
- **Command Palette**: Quick access to all features
- **Status Bar Item**: Argus indicator in the status bar
- **Hot Reload**: Vite-powered development for instant updates
- **TypeScript**: Fully typed for better DX and reliability

---

## 📸 Screenshots

<div align="center">

### **Analysis Tab**
*Intelligent detection of duplicate reads, retry loops, and optimization opportunities*

![Analysis Tab](screenshots/analysis.png)

<br/>

### **Cost Tab**
*Detailed breakdown of token usage and API costs per step with interactive charts*

![Cost Tab](screenshots/cost.png)

<br/>

### **Performance Tab**
*Session efficiency scores, wasted cost analysis, and performance metrics*

![Performance Tab](screenshots/performance.png)

<br/>

### **Flow Tab**
*Interactive dependency graph showing file operations and step relationships*

![Flow Tab](screenshots/flow.png)

<br/>

### **Steps Tab**
*Step-by-step execution log with detailed tool call inspection and timing*

![Steps Tab](screenshots/steps.png)

<br/>

### **Context Tab**
*Token usage tracking, cache performance, and context window utilization*

![Context Tab](screenshots/context.png)

<br/>

### **Insights Tab**
*AI-powered recommendations, pattern recognition, and optimization suggestions*

![Insights Tab](screenshots/insights.png)

</div>

---

## 📦 Installation

### Option 1: From VSIX (Recommended)

```bash
# Download the latest .vsix file from releases
code --install-extension argus-0.1.0.vsix
```

### Option 2: From Source

```bash
# Clone the repository
git clone https://github.com/yessGlory17/argus.git
cd argus-vscode

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Build webview
npm run build:webview

# Package extension
npx vsce package

# Install the packaged extension
code --install-extension argus-0.1.0.vsix
```

---

## 🛠️ Development

### Setting Up Development Environment

```bash
# Clone and install
git clone https://github.com/yessGlory17/argus.git
cd argus-vscode
npm install
```

### Running in Development Mode

```bash
# Terminal 1: Watch TypeScript changes
npm run watch

# Terminal 2: Watch webview changes
npm run dev:webview
```

Then press **F5** in VS Code to launch the Extension Development Host.

### Building

```bash
# Compile TypeScript
npm run compile

# Build production webview
npm run build:webview

# Run linter
npm run lint

# Package extension
npx vsce package
```

### Contributing

Contributions are welcome! Please:

1. 🍴 Fork the repository
2. 🌿 Create a feature branch (`git checkout -b feature/amazing-feature`)
3. ✏️ Make your changes
4. ✅ Add tests if applicable
5. 📝 Commit your changes (`git commit -m 'Add amazing feature'`)
6. 🚀 Push to the branch (`git push origin feature/amazing-feature`)
7. 🎉 Open a Pull Request

---

## 🚀 Usage

### Quick Start

<table>
<tr>
<td width="33%" align="center">
<br/>
<h3>1️⃣</h3>
<b>Open VS Code</b>
<br/><br/>
<sub>With the Argus extension installed</sub>
<br/><br/>
</td>
<td width="33%" align="center">
<br/>
<h3>2️⃣</h3>
<b>Find Argus Icon</b>
<br/><br/>
<sub>Look for in the Activity Bar (left sidebar)</sub>
<br/><br/>
</td>
<td width="33%" align="center">
<br/>
<h3>3️⃣</h3>
<b>Explore Sessions</b>
<br/><br/>
<sub>Sessions appear automatically - just click to analyze!</sub>
<br/><br/>
</td>
</tr>
</table>

### Commands

Access via Command Palette (`Ctrl/Cmd + Shift + P`):

| Command | Description |
|---------|-------------|
| `Argus: Refresh Sessions` | Refresh the session list with progress indicator |
| `Argus: Open Session Detail` | Open detailed analysis for a session |
| `Argus: Clear All Filters` | Reset all sidebar filters |
| `Argus: Group by Project` | Group sessions by project directory |
| `Argus: Group by Model` | Group sessions by Claude model |
| `Argus: Flat List` | Remove session grouping |

### Configuration

Customize Argus in VS Code Settings:

```json
{
  "argus.scanDepth": 5,        // Directory depth for scanning (default: 5)
  "argus.language": "en"       // UI language: "en" or "tr"
}
```

---

## 🏗️ Architecture

### Technology Stack

<table>
<tr>
<td width="50%" valign="top">

#### **🔧 Backend (Extension Host)**

![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?style=flat-square&logo=typescript&logoColor=white)
![VS Code](https://img.shields.io/badge/VS%20Code%20API-0078d7?style=flat-square&logo=visual-studio-code&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)

- JSONL Parsing Engine
- Async File System Operations
- Tree Data Provider

</td>
<td width="50%" valign="top">

#### **🎨 Frontend (Webview)**

![React](https://img.shields.io/badge/React-19.2-61dafb?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7.3-646cff?style=flat-square&logo=vite&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-4.5-ff6384?style=flat-square&logo=chart.js&logoColor=white)
![D3.js](https://img.shields.io/badge/D3.js-7.9-f9a03c?style=flat-square&logo=d3.js&logoColor=white)

- Recharts 3.7
- Lucide React Icons
- CSS Modules

</td>
</tr>
</table>

### Project Structure

```
argus-vscode/
├── src/                        # Extension source code
│   ├── extension.ts           # Main entry point & command registration
│   ├── types/                 # TypeScript definitions
│   │   ├── models.ts          # Core data models & filter state
│   │   └── parser.ts          # JSONL parsing types
│   ├── services/              # Business logic layer
│   │   ├── discoveryService.ts    # Session discovery & file system scanning
│   │   ├── parserService.ts       # JSONL streaming parser & cost calculation
│   │   └── analyzerService.ts     # Analysis engine with 6 rules
│   └── providers/             # VS Code API providers
│       ├── sessionListViewProvider.ts     # Sidebar: search, filters, calendar, session list
│       ├── sessionWebviewProviderReact.ts # React webview host & live file watcher
│       └── datePickerPanel.ts             # Custom date picker panel
│
├── webview/                   # React UI
│   ├── src/
│   │   ├── main.tsx          # React entry point
│   │   ├── App.tsx           # Main app with tab routing
│   │   ├── components/       # UI components (11 tabs + utilities)
│   │   │   ├── StepsTab.tsx       # Steps with search, filter dropdowns, icons
│   │   │   ├── AnalysisTab.tsx    # Findings & rule results
│   │   │   ├── CostTab.tsx        # Cost breakdown & charts
│   │   │   ├── FlowTab.tsx        # File operation flow
│   │   │   ├── ContextTab.tsx     # Token & cache analysis
│   │   │   ├── PerformanceTab.tsx # Efficiency scoring
│   │   │   ├── InsightsTab.tsx    # Recommendations
│   │   │   ├── DependencyGraph.tsx # D3-powered graph
│   │   │   ├── SessionNotes.tsx   # Per-session notes
│   │   │   └── ...
│   │   ├── styles/           # Global CSS & theme variables
│   │   └── types/            # Frontend types
│   └── index.html            # Webview template
│
├── package.json              # Extension manifest
├── tsconfig.json            # TypeScript config
└── vite.config.ts           # Vite bundler config
```

### Analysis Engine

Argus uses a **rule-based analysis system**:

```typescript
interface AnalysisRule {
  name: string;
  analyze(steps: Step[]): Finding[];
}

// Built-in Rules:
- DuplicateReadRule       // Detects duplicate file reads
- UnusedReadRule          // Finds unused tool outputs
- RetryLoopRule           // Identifies retry patterns
- FailedToolRule          // Tracks failures
- ContextPressureRule     // Memory pressure detection
- CompactionDetectedRule  // Context compression events
```

---

## 📊 Project Stats

<div align="center">

<table>
<tr>
<td align="center" width="25%">
<br/>
<h3>9,900+</h3>
<sub><b>Lines of Code</b></sub>
<br/><br/>
</td>
<td align="center" width="25%">
<br/>
<h3>40+</h3>
<sub><b>Source Files</b></sub>
<br/><br/>
</td>
<td align="center" width="25%">
<br/>
<h3>11+</h3>
<sub><b>React Components</b></sub>
<br/><br/>
</td>
<td align="center" width="25%">
<br/>
<h3>6</h3>
<sub><b>Analysis Rules</b></sub>
<br/><br/>
</td>
</tr>
<tr>
<td align="center" width="25%">
<br/>
<h3>8+</h3>
<sub><b>Visualization Types</b></sub>
<br/><br/>
</td>
<td align="center" width="25%">
<br/>
<h3>2</h3>
<sub><b>Languages (EN/TR)</b></sub>
<br/><br/>
</td>
<td align="center" width="25%">
<br/>
<h3>12</h3>
<sub><b>Dependencies</b></sub>
<br/><br/>
</td>
<td align="center" width="25%">
<br/>
<h3>10</h3>
<sub><b>Dev Dependencies</b></sub>
<br/><br/>
</td>
</tr>
</table>

</div>

### Key Capabilities

- ✅ **JSONL Parsing**: High-performance streaming parser with early-exit optimization
- ✅ **Cost Calculation**: Accurate token-based cost estimation per step and session
- ✅ **Dependency Tracking**: File operation dependency graph generation with D3.js
- ✅ **Context Metrics**: Cache hit ratio and token utilization analysis
- ✅ **Real-time Updates**: Live session monitoring via file watchers as Claude Code runs
- ✅ **Multi-session Management**: Handle dozens of sessions with grouping and filtering
- ✅ **Advanced Filtering**: Model/date/text search in sidebar, tool/status/sort in Steps tab
- ✅ **Custom Calendar**: Built-in date range picker with range visualization
- ✅ **Step Duration**: Per-step timing calculated from consecutive timestamps
- ✅ **Session Notes**: Persist notes per session for future reference

---

## 🎨 Design Philosophy

Argus follows the **"Ocular Systems"** philosophy:

> *"See everything, understand everything, optimize everything"*

- **Visibility**: Make the invisible visible
- **🎯 Precision**: Accurate, actionable insights
- **⚡ Performance**: Fast, responsive, non-intrusive
- **🎨 Beauty**: Delightful UI that makes analysis enjoyable
- **🔬 Depth**: Surface-level overview to deep technical details

---

## 🔄 Ported from Wails Desktop App

Argus VS Code extension is a complete rewrite of the original Argus desktop application:

### Migration Journey

| Original (Wails) | VS Code Extension |
|-----------------|-------------------|
| Go backend | TypeScript backend |
| React SPA | React Webview |
| Wails bridge | VS Code Extension API |
| Standalone desktop app | Integrated VS Code experience |
| Manual session import | Automatic discovery |

### Why VS Code?

- ✅ **Native Integration**: Works where developers already are
- ✅ **Better UX**: No app switching, seamless workflow
- ✅ **Auto Discovery**: No manual session loading
- ✅ **Theming**: Inherits VS Code theme automatically
- ✅ **Commands**: Accessible via Command Palette

---

## 📚 Use Cases

<table>
<tr>
<td width="33%" valign="top">

### 👨‍💻 For Developers

- ✅ Understand how Claude Code approaches your problems
- ✅ Learn which prompts are most efficient
- ✅ Optimize your interaction patterns
- ✅ Track AI-assisted development costs

</td>
<td width="33%" valign="top">

### 👥 For Teams

- ✅ Audit AI usage across projects
- ✅ Identify best practices
- ✅ Training material for effective Claude Code usage
- ✅ Cost management and budgeting

</td>
<td width="33%" valign="top">

### 🔬 For Researchers

- ✅ Study LLM-based development patterns
- ✅ Analyze tool usage patterns
- ✅ Understand context management strategies
- ✅ Research AI-human collaboration workflows

</td>
</tr>
</table>

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

<div align="center">

<br/>

### 👁️ **Built with Argus, Analyzed by Argus**

<br/>

**Made with ❤️ by developers, for developers**

<br/>
<br/>

[![Report Bug](https://img.shields.io/badge/🐛_Report_Bug-red?style=for-the-badge)](https://github.com/yessGlory17/argus/issues)
[![Request Feature](https://img.shields.io/badge/✨_Request_Feature-blue?style=for-the-badge)](https://github.com/yessGlory17/argus/issues)
[![Documentation](https://img.shields.io/badge/📚_Documentation-green?style=for-the-badge)](https://github.com/yessGlory17/argus/wiki)

<br/>
<br/>

---

<sub>⭐ **Star us on GitHub if you find Argus useful!**</sub>

<br/>

</div>