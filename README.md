# 🌍 Planeteer

AI-powered work breakdown and parallel execution TUI. Describe what you want to build, and Planeteer uses the GitHub Copilot SDK to clarify your intent, generate a structured work breakdown with dependencies, and execute tasks in parallel via Copilot agents.

## Prerequisites

- **Node.js 22+**
- **GitHub Copilot CLI** installed and authenticated (`npm install -g @github/copilot && copilot auth`)

## Quick Start

```bash
npm install
npm run build
npm start            # Launch the TUI (home screen)
```

## Usage

```bash
# Interactive — opens the home screen
planeteer

# Jump straight to creating a new plan
planeteer new

# Load a previously saved plan
planeteer load <plan-id>

# List all saved plans
planeteer list
```

### Workflow

1. **Clarify** — Describe your project in natural language. Copilot asks clarifying questions until the scope is clear.
2. **Breakdown** — Copilot generates a work breakdown structure: tasks with descriptions, acceptance criteria, and dependencies.
3. **Refine** — Navigate the task tree, edit details, or type refinement requests (e.g., "split the auth task into login and signup"). Press `s` to save, `x` to execute.
4. **Execute** — Tasks are dispatched to Copilot agents in parallel batches that respect the dependency graph. Progress is shown in real time.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate task list |
| `⏎` | Submit input / proceed to next screen |
| `Esc` | Go back |
| `s` | Save plan (refine screen) |
| `x` | Start execution (refine/execute screen) |
| `q` | Quit |

## Development

### Build & Run

```bash
npm run build          # Compile TypeScript → dist/
npm run dev            # Watch mode (recompiles on change)
npm start              # Run the compiled app
```

### Test

```bash
npm test               # Run all tests (vitest)
npm run test:watch     # Watch mode

# Run a single test file
npx vitest run src/utils/dependency-graph.test.ts
```

### Lint

```bash
npm run lint           # ESLint
```

### Debugging

#### VS Code

Add this launch configuration to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Planeteer",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/index.js",
      "args": ["new"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "sourceMaps": true,
      "console": "integratedTerminal",
      "preLaunchTask": "npm: build"
    },
    {
      "name": "Planeteer (attach)",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    }
  ]
}
```

#### Node.js Inspector

```bash
# Build first, then run with --inspect-brk to pause on start
npm run build
node --inspect-brk dist/index.js new

# In another terminal, open Chrome DevTools:
# chrome://inspect → click "inspect" on the target
```

#### Debug a Specific Service

Since Ink renders to the terminal, debugging UI components interactively can be tricky. For service-level debugging:

```bash
# Test the dependency graph in isolation
node --inspect-brk -e "
  import { computeBatches, detectCycles } from './dist/utils/dependency-graph.js';
  const tasks = [
    { id: 'a', dependsOn: [], status: 'pending' },
    { id: 'b', dependsOn: ['a'], status: 'pending' },
  ];
  console.log(computeBatches(tasks));
"
```

#### Environment Variables

| Variable | Description |
|----------|-------------|
| `DEBUG=planeteer:*` | Enable debug logging (when implemented) |
| `NODE_OPTIONS=--inspect` | Attach debugger to running process |

### Persistence

Plans are saved to `.planeteer/` in the current working directory:

- `<plan-id>.json` — Machine-readable plan (used by the app)
- `<plan-id>.md` — Human-readable Markdown export

## Project Structure

```
src/
├── index.tsx              # CLI entry point & arg parsing
├── app.tsx                # Root component & screen router
├── screens/
│   ├── home.tsx           # New plan / load existing
│   ├── clarify.tsx        # Multi-turn intent clarification
│   ├── breakdown.tsx      # WBS display & dependency graph
│   ├── refine.tsx         # Task editing & AI refinement
│   └── execute.tsx        # Parallel execution & progress
├── components/
│   ├── status-bar.tsx     # Bottom bar with keybindings
│   └── task-tree.tsx      # Tree view with status indicators
├── services/
│   ├── copilot.ts         # Copilot SDK wrapper (single point of contact)
│   ├── planner.ts         # Prompt engineering for planning
│   ├── executor.ts        # DAG-aware parallel task dispatch
│   └── persistence.ts     # JSON/Markdown save & load
├── models/
│   └── plan.ts            # Types: Plan, Task, ChatMessage
└── utils/
    ├── dependency-graph.ts # Topological sort & cycle detection
    └── markdown.ts        # Plan → Markdown renderer
```

## License

MIT
