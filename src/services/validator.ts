import type { Plan, Task } from '../models/plan.js';
import { sendPromptSync } from './copilot.js';

export type CriterionVerdict = 'pass' | 'fail' | 'partial' | 'unknown';

export interface CriterionResult {
  criterion: string;
  verdict: CriterionVerdict;
  actual: string;
}

export interface TaskValidationResult {
  taskId: string;
  taskTitle: string;
  status: Task['status'];
  criteriaResults: CriterionResult[];
  summary: string;
}

export interface ValidationReport {
  planName: string;
  timestamp: string;
  taskResults: TaskValidationResult[];
  overallPass: number;
  overallFail: number;
  overallPartial: number;
  overallUnknown: number;
  totalCriteria: number;
}

export interface ValidationCallbacks {
  onTaskStart: (taskId: string) => void;
  onTaskDelta: (taskId: string, delta: string, fullText: string) => void;
  onTaskDone: (taskId: string, result: TaskValidationResult) => void;
  onTaskError: (taskId: string, error: string) => void;
  onAllDone: (report: ValidationReport) => void;
}

const VALIDATOR_SYSTEM_PROMPT = `You are a QA engineer validating whether a task implementation meets its acceptance criteria.
You will be given a task with its acceptance criteria and the agent's implementation result.

For EACH acceptance criterion, determine if it was met, partially met, failed, or unknown (if you cannot tell from the available information).

CRITICAL: Your response must be ONLY a raw JSON object (no markdown fencing, no commentary).
The JSON object must have this exact structure:
{
  "criteriaResults": [
    {
      "criterion": "the exact acceptance criterion text",
      "verdict": "pass" | "fail" | "partial" | "unknown",
      "actual": "brief description of what was actually implemented or observed"
    }
  ],
  "summary": "1-2 sentence overall summary of the validation"
}

The very first character of your response MUST be {`;

function buildValidationPrompt(task: Task, plan: Plan): string {
  const lines = [
    `## Task: ${task.title}`,
    `**ID:** ${task.id}`,
    `**Status:** ${task.status}`,
    '',
    `## Description`,
    task.description,
    '',
    '## Acceptance Criteria (EXPECTED)',
    ...task.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`),
    '',
    '## Implementation Result (ACTUAL)',
    task.agentResult || '(no implementation result recorded)',
    '',
    '## Project Context',
    `Project: ${plan.name}`,
    `Description: ${plan.description}`,
  ];
  return lines.join('\n');
}

function parseValidationResponse(text: string, task: Task): TaskValidationResult {
  try {
    // Strip markdown fencing if present
    let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Find the JSON object
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }

    const parsed = JSON.parse(cleaned) as {
      criteriaResults: CriterionResult[];
      summary: string;
    };

    return {
      taskId: task.id,
      taskTitle: task.title,
      status: task.status,
      criteriaResults: parsed.criteriaResults ?? [],
      summary: parsed.summary ?? 'Validation complete',
    };
  } catch {
    // Fallback: mark all criteria as unknown
    return {
      taskId: task.id,
      taskTitle: task.title,
      status: task.status,
      criteriaResults: task.acceptanceCriteria.map((ac) => ({
        criterion: ac,
        verdict: 'unknown' as CriterionVerdict,
        actual: 'Could not parse validation response',
      })),
      summary: 'Validation response could not be parsed',
    };
  }
}

export async function validatePlan(
  plan: Plan,
  callbacks: ValidationCallbacks,
): Promise<ValidationReport> {
  const taskResults: TaskValidationResult[] = [];

  // Validate each task sequentially (to avoid overwhelming the API)
  for (const task of plan.tasks) {
    // Skip tasks that were never executed
    if (task.status === 'pending') {
      const skippedResult: TaskValidationResult = {
        taskId: task.id,
        taskTitle: task.title,
        status: task.status,
        criteriaResults: task.acceptanceCriteria.map((ac) => ({
          criterion: ac,
          verdict: 'unknown' as CriterionVerdict,
          actual: 'Task was not executed',
        })),
        summary: 'Skipped — task was not executed',
      };
      taskResults.push(skippedResult);
      callbacks.onTaskDone(task.id, skippedResult);
      continue;
    }

    callbacks.onTaskStart(task.id);

    try {
      const prompt = buildValidationPrompt(task, plan);
      const result = await sendPromptSync(VALIDATOR_SYSTEM_PROMPT, [
        { role: 'user', content: prompt },
      ], {
        onDelta: (delta, fullText) => {
          callbacks.onTaskDelta(task.id, delta, fullText);
        },
      });

      const validationResult = parseValidationResponse(result, task);
      taskResults.push(validationResult);
      callbacks.onTaskDone(task.id, validationResult);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      callbacks.onTaskError(task.id, errMsg);

      const errorResult: TaskValidationResult = {
        taskId: task.id,
        taskTitle: task.title,
        status: task.status,
        criteriaResults: task.acceptanceCriteria.map((ac) => ({
          criterion: ac,
          verdict: 'unknown' as CriterionVerdict,
          actual: `Validation error: ${errMsg}`,
        })),
        summary: `Validation failed: ${errMsg}`,
      };
      taskResults.push(errorResult);
    }
  }

  const overallPass = taskResults.reduce(
    (sum, tr) => sum + tr.criteriaResults.filter((c) => c.verdict === 'pass').length, 0,
  );
  const overallFail = taskResults.reduce(
    (sum, tr) => sum + tr.criteriaResults.filter((c) => c.verdict === 'fail').length, 0,
  );
  const overallPartial = taskResults.reduce(
    (sum, tr) => sum + tr.criteriaResults.filter((c) => c.verdict === 'partial').length, 0,
  );
  const overallUnknown = taskResults.reduce(
    (sum, tr) => sum + tr.criteriaResults.filter((c) => c.verdict === 'unknown').length, 0,
  );
  const totalCriteria = taskResults.reduce(
    (sum, tr) => sum + tr.criteriaResults.length, 0,
  );

  const report: ValidationReport = {
    planName: plan.name,
    timestamp: new Date().toISOString(),
    taskResults,
    overallPass,
    overallFail,
    overallPartial,
    overallUnknown,
    totalCriteria,
  };

  callbacks.onAllDone(report);
  return report;
}
