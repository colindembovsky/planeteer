import type { Plan, Task } from '../models/plan.js';
import { sendPromptSync } from './copilot.js';
import { getReadyTasks } from '../utils/dependency-graph.js';

export interface ExecutionCallbacks {
  onTaskStart: (taskId: string) => void;
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
Output a brief summary of what you implemented.`;

export async function executePlan(
  plan: Plan,
  callbacks: ExecutionCallbacks,
): Promise<Plan> {
  const updatedPlan = { ...plan, tasks: plan.tasks.map((t) => ({ ...t })) };
  let batchIndex = 0;

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
        ]);
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
