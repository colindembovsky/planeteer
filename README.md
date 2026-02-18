# 🌍 Planeteer

```text
 ____  _                  _                
|  _ \| | __ _ _ __   ___| |_ ___  ___ _ __
| |_) | |/ _` | '_ \ / _ \ __/ _ \/ _ \ '__|
|  __/| | (_| | | | |  __/ ||  __/  __/ |   
|_|   |_|\__,_|_| |_|\___|\__\___|\___|_|   
```

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

### Environment Variables

Planeteer supports configuring environment variables that are available to Copilot agents during task execution. This is useful when agents need access to external services via MCP (Model Context Protocol) tools that require API keys, database URLs, or other configuration.

#### Global Environment Variables

Global environment variables apply to all tasks in all plans. Configure them in `.planeteer/settings.json`:

```json
{
  "model": "claude-sonnet-4",
  "globalEnv": {
    "DATABASE_URL": "postgresql://localhost:5432/dev",
    "LOG_LEVEL": "info"
  }
}
```

#### Task-Specific Environment Variables

Individual tasks can have their own environment variables. These override global variables with the same name. To configure task-specific env vars:

1. In the Refine screen, press `/` then `e` to edit a task
2. Navigate to the "Environment Variables" field
3. Press Enter to edit
4. Enter variables as comma-separated `KEY=VALUE` pairs:
   ```
   API_KEY=sk-test-123, REGION=us-west-2
   ```

Task-specific environment variables are saved in the plan JSON file.

#### Security Considerations

⚠️ **Important**: Environment variables containing sensitive data (API keys, passwords, tokens) are stored in plain text in plan files. 

**Best practices:**
- Use global env vars in `.planeteer/settings.json` for sensitive values (add `.planeteer/` to `.gitignore`)
- For production deployments, use environment variables set at the system level instead of storing them in plans
- Planeteer will warn you when saving plans with environment variables that appear sensitive (contain "key", "token", "password", etc.)
- Sensitive values are masked with `***` in the task editor UI

#### How It Works

When a task executes:
1. Global environment variables from settings are loaded
2. Task-specific environment variables override globals with the same name
3. All variables are set in `process.env` before creating the Copilot agent session
4. MCP servers spawned by the Copilot CLI inherit these environment variables (requires Copilot SDK 0.1.25+ with `envValueMode: direct` support)

#### Example Use Cases

- **Database access**: Pass `DATABASE_URL` to agents that need to query or migrate databases
- **API integration**: Provide `API_KEY` for agents using external APIs via MCP tools
- **Multi-environment**: Use different `ENV=development|staging|production` values per task
- **Cloud providers**: Pass `AWS_REGION`, `AZURE_SUBSCRIPTION_ID`, etc. for cloud infrastructure tasks

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
    ├── env-validation.ts  # Environment variable security checks
    └── markdown.ts        # Plan → Markdown renderer
```

## License

MIT
