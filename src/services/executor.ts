import type { Plan, Task } from '../models/plan.js';
import { sendPromptSync } from './copilot.js';
import type { SessionEvent } from './copilot.js';
import { getReadyTasks } from '../utils/dependency-graph.js';

export interface SessionEventWithTask {
  taskId: string;
  event: SessionEvent;
}

export interface ExecutionCallbacks {
  onTaskStart: (taskId: string) => void;
  onTaskDelta: (taskId: string, delta: string, fullText: string) => void;
  onTaskDone: (taskId: string, result: string) => void;
  onTaskFailed: (taskId: string, error: string) => void;
  onBatchComplete: (batchIndex: number) => void;
  onAllDone: (plan: Plan) => void;
  onSessionEvent?: (eventWithTask: SessionEventWithTask) => void;
}

function buildTaskPrompt(task: Task, plan: Plan, codebaseContext?: string): string {
  const lines = [
    `## Task: ${task.title}`,
    '',
    task.description,
    '',
    '## Acceptance Criteria',
    ...task.acceptanceCriteria.map((ac) => `- ${ac}`),
    '',
    '## Project Context',
    `Project: ${plan.name}`,
    `Description: ${plan.description}`,
    '',
    '## Other Tasks (for context)',
    ...plan.tasks
      .filter((t) => t.id !== task.id)
      .map((t) => `- ${t.id}: ${t.title} [${t.status}]`),
  ];
  if (codebaseContext) {
    lines.push('', codebaseContext);
  }
  return lines.join('\n');
}

const EXECUTOR_SYSTEM_PROMPT = `You are an expert software engineer implementing a task as part of a larger project.
Implement the task fully according to its description and acceptance criteria.
Write the code, create files, and make changes as needed.
After implementation, check that ALL acceptance criteria are met. If any criterion is not satisfied, continue working until it is.
Output a brief summary of what you implemented and confirm each acceptance criterion was met.`;

const INIT_TASK_ID = 'project-init';

function buildInitPrompt(plan: Plan): string {
  const taskSummary = plan.tasks
    .map((t) => `- ${t.id}: ${t.title} — ${t.description}`)
    .join('\n');

  return `You are bootstrapping a new project. Create the following files ONLY if they do not already exist:

1. **README.md** — Include:
   - Project name: ${plan.name}
   - Description: ${plan.description}
   - A summary of the architecture and tech stack (infer from the tasks below)
   - A section listing the planned features/components
   - Basic "Getting Started" placeholder sections (prerequisites, installation, running)

2. **.gitignore** — Create a .gitignore appropriate for the tech stack used in this project (infer from the tasks). Include common patterns for the detected languages/frameworks (e.g., node_modules, __pycache__, .env, dist, build, etc.).

## Project Tasks (for context)
${taskSummary}

Output a brief summary of what you created.`;
}

export interface ExecutionOptions {
  skipInit?: boolean;
  codebaseContext?: string;
}

/** Handle returned by executePlan to allow retrying individual tasks mid-flight. */
export interface ExecutionHandle {
  /** Retry a specific failed task. Safe to call while execution is still in progress. */
  retryTask: (taskId: string) => void;
  /** Promise that resolves when the execution run (including any in-flight retries) completes. */
  done: Promise<Plan>;
}

export function executePlan(
  plan: Plan,
  callbacks: ExecutionCallbacks,
  options: ExecutionOptions = {},
): ExecutionHandle {
  const updatedPlan = { ...plan, tasks: plan.tasks.map((t) => ({ ...t })) };
  let batchIndex = 0;
  const codebaseContext = options.codebaseContext;

  // Track in-flight promises so we know when everything settles
  const inFlight = new Set<Promise<void>>();

  // Retry queue: tasks added here get picked up by the scheduler
  const retryQueue: string[] = [];
  let schedulerRunning = false;
  let resolveAll: ((plan: Plan) => void) | null = null;

  const donePromise = new Promise<Plan>((resolve) => {
    resolveAll = resolve;
  });

  async function executeTask(task: Task): Promise<void> {
    const taskInPlan = updatedPlan.tasks.find((t) => t.id === task.id)!;
    taskInPlan.status = 'in_progress';
    callbacks.onTaskStart(task.id);

    try {
      const prompt = buildTaskPrompt(task, updatedPlan, codebaseContext);
      const result = await sendPromptSync(EXECUTOR_SYSTEM_PROMPT, [
        { role: 'user', content: prompt },
      ], {
        onDelta: (delta, fullText) => {
          callbacks.onTaskDelta(task.id, delta, fullText);
        },
        onSessionEvent: (event) => {
          callbacks.onSessionEvent?.({ taskId: task.id, event });
        },
      });
      taskInPlan.status = 'done';
      taskInPlan.agentResult = result;
      callbacks.onTaskDone(task.id, result);
    } catch (err) {
      taskInPlan.status = 'failed';
      taskInPlan.agentResult = err instanceof Error ? err.message : String(err);
      callbacks.onTaskFailed(task.id, taskInPlan.agentResult!);
    }
  }

  /** Schedule any tasks that are ready. Continues until nothing is runnable. */
  async function schedule(): Promise<void> {
    if (schedulerRunning) return;
    schedulerRunning = true;

    while (true) {
      // Process retry queue first — reset tasks to pending so getReadyTasks picks them up
      while (retryQueue.length > 0) {
        const taskId = retryQueue.shift()!;
        const taskInPlan = updatedPlan.tasks.find((t) => t.id === taskId);
        if (taskInPlan && taskInPlan.status === 'failed') {
          taskInPlan.status = 'pending';
          taskInPlan.agentResult = undefined;
        }
      }

      const ready = getReadyTasks(updatedPlan.tasks);
      if (ready.length === 0) {
        // Nothing ready — if nothing in-flight either, we're done
        if (inFlight.size === 0) break;
        // Otherwise wait for at least one in-flight task to finish, then re-check
        await Promise.race([...inFlight]);
        continue;
      }

      // Launch all ready tasks in parallel
      for (const task of ready) {
        const p = executeTask(task).then(() => {
          inFlight.delete(p);
          callbacks.onBatchComplete(batchIndex);
        });
        inFlight.add(p);
      }
      batchIndex++;

      // Wait for at least one of the just-launched tasks to finish before re-checking
      await Promise.race([...inFlight]);
    }

    schedulerRunning = false;
    callbacks.onAllDone(updatedPlan);
    resolveAll?.(updatedPlan);
  }

  // Kick off execution
  (async () => {
    // Bootstrap: create README.md and .gitignore if needed (skip on retry)
    if (!options.skipInit) {
      callbacks.onTaskStart(INIT_TASK_ID);
      try {
        const initPrompt = buildInitPrompt(updatedPlan);
        const initResult = await sendPromptSync(EXECUTOR_SYSTEM_PROMPT, [
          { role: 'user', content: initPrompt },
        ], {
          onDelta: (delta, fullText) => {
            callbacks.onTaskDelta(INIT_TASK_ID, delta, fullText);
          },
          onSessionEvent: (event) => {
            callbacks.onSessionEvent?.({ taskId: INIT_TASK_ID, event });
          },
        });
        callbacks.onTaskDone(INIT_TASK_ID, initResult);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        callbacks.onTaskFailed(INIT_TASK_ID, errMsg);
        // Non-fatal: continue with actual tasks even if init fails
      }
    }

    await schedule();
  })();

  return {
    retryTask: (taskId: string) => {
      retryQueue.push(taskId);
      // Re-enter the scheduler if it's not already running
      schedule();
    },
    done: donePromise,
  };
}
