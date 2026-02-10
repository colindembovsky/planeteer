import type { Plan, Task } from '../models/plan.js';
import { sendPromptSync } from './copilot.js';
import { getReadyTasks } from '../utils/dependency-graph.js';

export interface ExecutionCallbacks {
  onTaskStart: (taskId: string) => void;
  onTaskDelta: (taskId: string, delta: string, fullText: string) => void;
  onTaskDone: (taskId: string, result: string) => void;
  onTaskFailed: (taskId: string, error: string) => void;
  onBatchComplete: (batchIndex: number) => void;
  onAllDone: (plan: Plan) => void;
}

function buildTaskPrompt(task: Task, plan: Plan): string {
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
}

export async function executePlan(
  plan: Plan,
  callbacks: ExecutionCallbacks,
  options: ExecutionOptions = {},
): Promise<Plan> {
  const updatedPlan = { ...plan, tasks: plan.tasks.map((t) => ({ ...t })) };
  let batchIndex = 0;

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
      });
      callbacks.onTaskDone(INIT_TASK_ID, initResult);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      callbacks.onTaskFailed(INIT_TASK_ID, errMsg);
      // Non-fatal: continue with actual tasks even if init fails
    }
  }

  while (true) {
    const ready = getReadyTasks(updatedPlan.tasks);
    if (ready.length === 0) {
      const pending = updatedPlan.tasks.filter((t) => t.status === 'pending');
      if (pending.length === 0) break;
      // If there are pending tasks but none ready, we have a problem
      const failed = updatedPlan.tasks.filter((t) => t.status === 'failed');
      if (failed.length > 0) break; // deps failed
      break;
    }

    // Execute batch in parallel
    const promises = ready.map(async (task) => {
      const taskInPlan = updatedPlan.tasks.find((t) => t.id === task.id)!;
      taskInPlan.status = 'in_progress';
      callbacks.onTaskStart(task.id);

      try {
        const prompt = buildTaskPrompt(task, updatedPlan);
        const result = await sendPromptSync(EXECUTOR_SYSTEM_PROMPT, [
          { role: 'user', content: prompt },
        ], {
          onDelta: (delta, fullText) => {
            callbacks.onTaskDelta(task.id, delta, fullText);
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
    });

    await Promise.all(promises);
    callbacks.onBatchComplete(batchIndex);
    batchIndex++;
  }

  callbacks.onAllDone(updatedPlan);
  return updatedPlan;
}
