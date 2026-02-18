import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Plan } from '../models/plan.js';
import { simulateSession } from '../services/simulator.js';
import HomeScreen from './home.js';
import BreakdownScreen from './breakdown.js';
import RefineScreen from './refine.js';
import ExecuteScreen from './execute.js';
import ValidateScreen from './validate.js';

vi.mock('ink-select-input', () => ({
  default: function SelectInputMock({
    items,
    onHighlight,
  }: {
    items: Array<{ value: string }>;
    onHighlight?: (item: { value: string }) => void;
  }): React.ReactElement | null {
    React.useEffect(() => {
      const preferred = items.find((i) => i.value !== '__new__') ?? items[0];
      if (preferred && onHighlight) onHighlight(preferred);
    }, [items, onHighlight]);
    return null;
  },
}));

vi.mock('ink-text-input', () => ({
  default: function TextInputMock(): React.ReactElement | null {
    return null;
  },
}));

vi.mock('../services/copilot.js', () => ({
  fetchModels: vi.fn(async () => [{ id: 'gpt-5', label: 'GPT-5' }]),
  getModel: vi.fn(() => 'gpt-5'),
  setModel: vi.fn(),
  getModelLabel: vi.fn(() => 'GPT-5'),
}));

vi.mock('../services/persistence.js', () => ({
  listPlans: vi.fn(async () => [{ id: 'plan-1', name: 'Plan One', updatedAt: '2026-02-01T00:00:00.000Z' }]),
  loadPlan: vi.fn(async () => ({
    id: 'plan-1',
    name: 'Plan One',
    description: 'Demo',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    tasks: [],
  })),
  savePlan: vi.fn(async () => undefined),
  summarizePlan: vi.fn(async () => '.planeteer/plan-1.md'),
}));

vi.mock('../services/planner.js', () => ({
  refineWBS: vi.fn(async (tasks: Plan['tasks']) => tasks),
  generateWBS: vi.fn(async () => [
    {
      id: 'task-a',
      title: 'Task A',
      description: '',
      acceptanceCriteria: [],
      dependsOn: [],
      status: 'pending',
    },
  ]),
}));

vi.mock('../services/executor.js', () => ({
  executePlan: vi.fn((plan: Plan, callbacks: Record<string, (...args: unknown[]) => void>) => {
    callbacks.onTaskStart?.('project-init');
    callbacks.onTaskDone?.('project-init', 'Init complete');
    for (const task of plan.tasks) {
      callbacks.onTaskStart?.(task.id);
      callbacks.onTaskDone?.(task.id, `Done: ${task.id}`);
    }
    callbacks.onAllDone?.({
      ...plan,
      tasks: plan.tasks.map((t) => ({ ...t, status: 'done' as const })),
    });
    return { retryTask: vi.fn() };
  }),
}));

vi.mock('../services/validator.js', () => ({
  validatePlan: vi.fn((plan: Plan, callbacks: Record<string, (...args: unknown[]) => void>) => {
    for (const task of plan.tasks) {
      callbacks.onTaskStart?.(task.id);
      callbacks.onTaskDone?.(task.id, {
        taskId: task.id,
        taskTitle: task.title,
        status: 'pass',
        criteriaResults: task.acceptanceCriteria.map((criterion) => ({
          criterion,
          verdict: 'pass',
        })),
        summary: 'All criteria passed.',
      });
    }
    callbacks.onAllDone?.({
      planId: plan.id,
      planName: plan.name,
      generatedAt: '2026-02-01T00:00:00.000Z',
      totalCriteria: 1,
      overallPass: 1,
      overallFail: 0,
      overallPartial: 0,
      overallUnknown: 0,
      taskResults: [{
        taskId: plan.tasks[0]?.id ?? 'task-a',
        taskTitle: plan.tasks[0]?.title ?? 'Task A',
        status: 'pass',
        criteriaResults: [{
          criterion: plan.tasks[0]?.acceptanceCriteria[0] ?? 'criterion',
          verdict: 'pass',
        }],
        summary: 'All criteria passed.',
      }],
    });
  }),
}));

const basePlan: Plan = {
  id: 'plan-1',
  name: 'Plan One',
  description: 'Demo',
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  tasks: [
    {
      id: 'task-a',
      title: 'Task A',
      description: 'A',
      acceptanceCriteria: ['A passes'],
      dependsOn: [],
      status: 'pending',
    },
    {
      id: 'task-b',
      title: 'Task B',
      description: 'B',
      acceptanceCriteria: ['B passes'],
      dependsOn: ['task-a'],
      status: 'pending',
    },
  ],
};

function assertNoFormattingOrFlicker(frames: string[], width: number): void {
  const nonEmptyFrames = frames.filter((f) => f.trim().length > 0);
  expect(nonEmptyFrames.length).toBeGreaterThan(0);

  for (const frame of nonEmptyFrames) {
    expect(frame).not.toContain('\u001B[');
    for (const line of frame.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(width + 2);
    }
  }

  if (nonEmptyFrames.length > 1) {
    const consecutiveDuplicates = nonEmptyFrames
      .slice(1)
      .filter((frame, idx) => frame === nonEmptyFrames[idx]).length;
    expect(consecutiveDuplicates).toBeLessThan(nonEmptyFrames.length);
  }
}

describe('CLI integration simulator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('covers home commands: /x, /v, /r, /z and m', async () => {
    const onLoadPlan = vi.fn();
    const onExecutePlan = vi.fn();
    const onValidatePlan = vi.fn();

    await simulateSession(
      <HomeScreen
        onNewPlan={vi.fn()}
        onLoadPlan={onLoadPlan}
        onExecutePlan={onExecutePlan}
        onValidatePlan={onValidatePlan}
      />,
      {
        width: 100,
        steps: [
          { input: 'm' },
          { input: '\u001B' },
          { input: '/' },
          { input: 'x' },
          { input: '/' },
          { input: 'v' },
          { input: '/' },
          { input: 'r' },
          { input: '/' },
          { input: 'z', waitMs: 40 },
        ],
      },
    );

    expect(onExecutePlan).toHaveBeenCalledWith('plan-1');
    expect(onValidatePlan).toHaveBeenCalledWith('plan-1');
    expect(onLoadPlan).toHaveBeenCalledWith('plan-1');
  });

  it('covers breakdown commands: tab, arrows and enter', async () => {
    const onPlanReady = vi.fn();
    await simulateSession(
      <BreakdownScreen
        scopeDescription="Scope"
        messages={[]}
        existingPlan={basePlan}
        onPlanReady={onPlanReady}
        onBack={vi.fn()}
      />,
      {
        steps: [
          { input: '\u001B[B' },
          { input: '\u001B[A' },
          { input: '\t' },
          { input: '\r' },
        ],
      },
    );

    expect(onPlanReady).toHaveBeenCalled();
  });

  it('covers refine commands: /x /v /s /z and []', async () => {
    const onExecute = vi.fn();
    const onValidate = vi.fn();
    const onPlanUpdated = vi.fn();

    await simulateSession(
      <RefineScreen
        plan={basePlan}
        onPlanUpdated={onPlanUpdated}
        onExecute={onExecute}
        onValidate={onValidate}
        onBack={vi.fn()}
      />,
      {
        steps: [
          { input: ']' },
          { input: '[' },
          { input: '/' },
          { input: 'x' },
          { input: '/' },
          { input: 'v' },
          { input: '/' },
          { input: 's', waitMs: 40 },
          { input: '/' },
          { input: 'z', waitMs: 40 },
        ],
      },
    );

    expect(onExecute).toHaveBeenCalled();
    expect(onValidate).toHaveBeenCalled();
    expect(onPlanUpdated).toHaveBeenCalled();
  });

  it('covers execute commands: x, arrows, r and z', async () => {
    const onDone = vi.fn();
    const result = await simulateSession(
      <ExecuteScreen
        plan={basePlan}
        onDone={onDone}
        onBack={vi.fn()}
      />,
      {
        width: 100,
        steps: [
          { input: 'x', waitMs: 50 },
          { input: '\u001B[C' },
          { input: '\u001B[D' },
          { input: '\u001B[B' },
          { input: '\u001B[A' },
          { input: 'r' },
          { input: 'z', waitMs: 50 },
        ],
      },
    );

    expect(onDone).toHaveBeenCalled();
    assertNoFormattingOrFlicker(result.frames, 100);
  });

  it('covers validate commands: v and arrows', async () => {
    const result = await simulateSession(
      <ValidateScreen plan={basePlan} onBack={vi.fn()} />,
      {
        width: 100,
        steps: [
          { input: 'v', waitMs: 40 },
          { input: '\u001B[B' },
          { input: '\u001B[A' },
        ],
      },
    );

    assertNoFormattingOrFlicker(result.frames, 100);
  });
});
