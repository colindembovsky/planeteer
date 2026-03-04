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

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate task list |
| `⏎` | Submit input / proceed to next screen |
| `Esc` | Go back |
| `⇥` | Toggle view (Tree / Batches / Skills) |
| `Space` | Toggle skill on/off (Skills view) |
| `/` | Command mode (refine screen) |
| `s` | Save plan (refine screen) |
| `x` | Start execution (refine/execute screen) |
| `q` | Quit |

## Custom Copilot Skills

Planeteer supports custom Copilot skills for domain-specific planning. Skills help Copilot generate better work breakdowns by providing context about specific project types.

### Using Skills

Skills are automatically loaded from the `.github/skills/` directory. On first run, this directory is created with example skills. To use skills:

1. View active skills in the **Refine** screen by pressing `⇥` to cycle to the Skills view
2. Use `↑`/`↓` to navigate and `Space` to toggle skills on/off
3. Skills are applied during work breakdown generation and refinement

### Creating Skills

Create a new YAML file in `.github/skills/` with this structure:

```yaml
name: my-custom-skill
description: Brief description of what this skill helps with

instructions: |
  When planning this type of project, follow these guidelines:
  
  1. **Category 1**: Guidelines for this aspect
     - Specific point 1
     - Specific point 2
  
  2. **Category 2**: More guidelines
     - Another point
     - Another point
  
  General advice about task structure, dependencies, etc.

examples:
  - input: "Example project description"
    tasks:
      - Task 1 that would be generated
      - Task 2 that would be generated
      - Task 3 that would be generated
```

### Skill Examples

**Example 1: Web Application Skill**

```yaml
name: web-app
description: Expert in web application development

instructions: |
  Break down web projects into frontend, backend, database, and deployment:
  
  1. **Frontend**: Component structure, routing, state management
  2. **Backend**: API design, business logic, authentication
  3. **Database**: Schema design, migrations, seed data
  4. **Infrastructure**: CI/CD, containerization, cloud deployment
  
  Maximize parallelism between frontend and backend work.

examples:
  - input: "Build a task management web app"
    tasks:
      - Setup React frontend with TypeScript
      - Design REST API for task CRUD
      - Implement PostgreSQL schema
      - Add JWT authentication
      - Deploy to cloud platform
```

**Example 2: Data Pipeline Skill**

```yaml
name: data-pipeline
description: Expert in ETL and data processing workflows

instructions: |
  Structure data pipelines with these phases:
  
  1. **Extraction**: Data sources, connectors, scheduling
  2. **Transformation**: Cleaning, validation, enrichment
  3. **Loading**: Destination setup, batch vs streaming
  4. **Monitoring**: Logging, alerts, data quality checks
  
  Consider idempotency, error handling, and reprocessing.

examples:
  - input: "Build ETL pipeline from API to data warehouse"
    tasks:
      - Implement API data extractor
      - Create transformation functions
      - Setup data warehouse schema
      - Add error handling and retries
      - Configure monitoring and alerts
```

### Skill Best Practices

- **One skill per domain**: Create focused skills (e.g., `mobile-app`, `ml-pipeline`) rather than generic ones
- **Clear instructions**: Be specific about task breakdown patterns and dependencies
- **Provide examples**: Include 2-3 representative examples with typical task structures
- **Enable selectively**: Toggle skills on/off based on your current project type

### Built-in Example

Two example skills are included in the repository to help you get started:
- **example-web-app-skill.yaml** - Web application development best practices
- **example-data-pipeline-skill.yaml** - ETL and data processing workflow patterns

These files are automatically available in `.github/skills/` and can be used as templates for creating your own custom skills.

## Tool Overrides

Planeteer registers custom hooks for the built-in Copilot agent tools (`edit_file`, `read_file`, `grep`) to enforce workspace safety, improve performance, and provide better observability during plan execution.

### What the overrides do

| Tool | Behaviour |
|------|-----------|
| `edit_file` / `str_replace_editor` | **Denies** any write to a path outside `process.cwd()` to prevent accidental modification of system files |
| `read_file` | Warns the agent when a file exceeds the configured size limit (default 100 KB) and caches successfully-read files to avoid redundant I/O |
| `grep` | Injects `exclude_dirs` (e.g. `node_modules`, `.git`, `dist`) into the tool arguments so searches stay scoped to project files |

### Execute screen stats

While a plan is executing, per-task tool usage is shown inline:

- 📖 **reads** — number of `read_file` calls
- ✏️  **edits** — number of `edit_file` / `str_replace_editor` calls
- 🔍 **greps** — number of `grep` calls

### Configuration

Create `.planeteer/config.json` to customise or disable overrides:

```json
{
  "enabled": true,
  "editFile": { "enabled": true },
  "readFile": { "enabled": true, "maxSizeKb": 100 },
  "grep": {
    "enabled": true,
    "excludePatterns": ["node_modules", ".git", "dist", ".planeteer", "coverage", ".next", "__pycache__"]
  }
}
```

Set `"enabled": false` at the top level to turn off all overrides, or set `"enabled": false` inside an individual section to disable just that override.

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
