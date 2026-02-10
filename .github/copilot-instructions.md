# Planeteer — Copilot Instructions

## Build & Run

```bash
npm run build        # TypeScript compile to dist/
npm run dev          # Watch mode
npm start            # Run the app (node dist/index.js)
npm test             # Run tests with vitest
npm run test:watch   # Watch mode tests
npx vitest run src/utils/dependency-graph.test.ts  # Single test file
```

## Architecture

Planeteer is a TUI app built with **Ink** (React for terminals) and **TypeScript** that uses the **GitHub Copilot SDK** (`@github/copilot-sdk`) for AI-powered project planning and execution.

### User Flow

1. **Home** → New plan or load saved plan
2. **Clarify** → Multi-turn chat with Copilot to nail down project scope
3. **Breakdown** → Copilot generates a work breakdown structure (tasks with acceptance criteria and dependencies)
4. **Refine** → User edits tasks/dependencies, asks Copilot for changes
5. **Execute** → Tasks dispatched to Copilot agents in parallel batches respecting the dependency DAG

### Key Layers

- **`src/screens/`** — Ink screen components, one per user flow step. Each screen manages its own state and receives callbacks from the `<App>` shell for navigation.
- **`src/services/copilot.ts`** — Single wrapper around `@github/copilot-sdk`. All SDK calls go through here so API changes only affect one file. Provides both streaming (`sendPrompt`) and sync (`sendPromptSync`) interfaces.
- **`src/services/planner.ts`** — Prompt engineering layer. Contains system prompts for clarification, WBS generation (structured JSON output), and refinement. Never calls the SDK directly — uses `copilot.ts`.
- **`src/services/executor.ts`** — Walks the dependency DAG in topological order, dispatching parallel batches of tasks to Copilot agent sessions. Each batch waits for all tasks to complete before the next batch starts.
- **`src/services/persistence.ts`** — Saves/loads plans as JSON in `.planeteer/` directory. Also generates a companion Markdown file for human readability.
- **`src/utils/dependency-graph.ts`** — Topological sort, cycle detection, parallel batch computation, ready-task calculation. Pure functions, no side effects.
- **`src/models/plan.ts`** — TypeScript types (`Plan`, `Task`, `ChatMessage`, `Screen`) and factory functions (`createPlan`, `createTask`).

### Navigation Pattern

`src/app.tsx` is the root component and acts as a screen router. It holds the current `Screen` state and passes callback props to each screen for transitions. Global keybindings (like `q` to quit) live here.

## Conventions

- **Copilot SDK isolation**: All `@github/copilot-sdk` imports must go through `src/services/copilot.ts`. No other file should import from the SDK directly — it's in technical preview and the API may change.
- **Prompt engineering**: System prompts live in `src/services/planner.ts` as module-level constants. WBS generation prompts must request raw JSON output (no markdown fencing) so responses can be parsed with `JSON.parse`.
- **Dependency graph**: Tasks use `dependsOn: string[]` referencing other task IDs. The graph must be a valid DAG — `detectCycles()` should be called before execution. `computeBatches()` returns parallel execution groups.
- **Persistence format**: Plans are saved as both `.json` (machine-readable, used by the app) and `.md` (human-readable, for review) in the `.planeteer/` directory.
- **Component style**: Screens are in `src/screens/`, reusable UI pieces in `src/components/`. Screens receive navigation callbacks as props; they don't import the router or other screens.
- **ESM**: The project uses ES modules (`"type": "module"` in package.json). Use `.js` extensions in import paths even for TypeScript files.
