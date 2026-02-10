import type { ChatMessage, Task } from '../models/plan.js';
import { sendPrompt, sendPromptSync, type StreamCallbacks } from './copilot.js';

const CLARIFY_SYSTEM_PROMPT = `You are an expert project planner helping a user clarify the scope of their project.
Ask focused clarifying questions to understand:
- What the user wants to build
- Key features and constraints
- Technology preferences
- What's in scope vs out of scope

FORMAT RULES:
- Ask ONE question at a time.
- After your question, provide 3-5 suggested answer options the user can pick from.
- Use this exact format:

<question>Your clarifying question here?</question>
<options>
- Option A description
- Option B description
- Option C description
</options>

- The user may pick an option or type a custom answer.
- When you have enough context (usually after 3-5 questions), respond with:

<scope_clear>
A concise summary of the agreed project scope.
</scope_clear>

Do NOT use markdown fencing. Do NOT include extra commentary outside the tags.`;

export interface ClarificationResult {
  question: string;
  options: string[];
  scopeClear?: string;
}

export function parseClarificationResponse(text: string): ClarificationResult {
  const scopeMatch = text.match(/<scope_clear>([\s\S]*?)<\/scope_clear>/);
  if (scopeMatch) {
    return {
      question: '',
      options: [],
      scopeClear: scopeMatch[1]!.trim(),
    };
  }

  // Detect old-style or fallback scope markers
  if (text.includes('SCOPE_CLEAR')) {
    const scopeDescription = text.split('SCOPE_CLEAR').pop()?.trim() || text;
    return {
      question: '',
      options: [],
      scopeClear: scopeDescription,
    };
  }

  const questionMatch = text.match(/<question>([\s\S]*?)<\/question>/);
  const optionsMatch = text.match(/<options>([\s\S]*?)<\/options>/);

  const question = questionMatch ? questionMatch[1]!.trim() : text.trim();
  const options = optionsMatch
    ? optionsMatch[1]!
        .split('\n')
        .map((l) => l.replace(/^[\s-]*/, '').trim())
        .filter(Boolean)
    : [];

  return { question, options };
}

const WBS_SYSTEM_PROMPT = `You are an expert project planner. Given a project description, generate a work breakdown structure as a JSON array of tasks.

Each task must have:
- "id": short kebab-case identifier
- "title": concise task title
- "description": what needs to be done (1-3 sentences)
- "acceptanceCriteria": array of testable criteria
- "dependsOn": array of task IDs this task depends on (empty if none)

Rules:
- Create 5-15 tasks depending on complexity
- Tasks should be small enough for a single agent to implement
- Dependencies must form a valid DAG (no cycles)
- Maximize parallelism: only add dependencies that are truly required
- Output ONLY the JSON array, no markdown fencing or explanation`;

const REFINE_SYSTEM_PROMPT = `You are an expert project planner. The user has a work breakdown and wants to refine it.
You will be given the current task list as JSON and the user's refinement request.
Output the complete updated JSON array of tasks with the changes applied.
Output ONLY the JSON array, no markdown fencing or explanation.`;

export async function streamClarification(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
): Promise<void> {
  return sendPrompt(CLARIFY_SYSTEM_PROMPT, messages, callbacks);
}

/** Extract a JSON array from a response that may contain surrounding prose. */
function extractJsonArray(text: string): string {
  // Strip markdown fencing
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // If it already starts with '[', use it directly
  if (cleaned.startsWith('[')) return cleaned;

  // Find the first '[' and last ']' to extract the JSON array
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }

  // Fallback: return as-is and let JSON.parse give a descriptive error
  return cleaned;
}

export async function generateWBS(
  scopeDescription: string,
  onDelta?: (delta: string, fullText: string) => void,
): Promise<Task[]> {
  const result = await sendPromptSync(WBS_SYSTEM_PROMPT, [
    { role: 'user', content: scopeDescription },
  ], { onDelta });

  const jsonStr = extractJsonArray(result);
  const tasks = JSON.parse(jsonStr) as Task[];
  return tasks.map((t) => ({ ...t, status: 'pending' as const }));
}

export async function refineWBS(
  currentTasks: Task[],
  refinementRequest: string,
  onDelta?: (delta: string, fullText: string) => void,
): Promise<Task[]> {
  const result = await sendPromptSync(REFINE_SYSTEM_PROMPT, [
    {
      role: 'user',
      content: `Current tasks:\n${JSON.stringify(currentTasks, null, 2)}\n\nRefinement request: ${refinementRequest}`,
    },
  ], { onDelta });

  const jsonStr = extractJsonArray(result);
  const tasks = JSON.parse(jsonStr) as Task[];
  return tasks.map((t) => ({ ...t, status: 'pending' as const }));
}
