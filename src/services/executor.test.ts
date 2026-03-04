import { describe, it, expect, vi } from 'vitest';
import type { ExecutionCallbacks, SessionEventWithTask } from './executor.js';
import { suggestModel } from './executor.js';
import type { SessionEvent } from './copilot.js';
import { createTask } from '../models/plan.js';

describe('SessionEventWithTask type', () => {
  it('should correctly structure context change events with task ID', () => {
    const mockEvent: SessionEvent = {
      id: 'evt-123',
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.context_changed',
      data: {
        cwd: '/home/user/project',
        gitRoot: '/home/user/project',
        repository: 'owner/repo',
        branch: 'main',
      },
    };

    const eventWithTask: SessionEventWithTask = {
      taskId: 'task-1',
      event: mockEvent,
    };

    expect(eventWithTask.taskId).toBe('task-1');
    expect(eventWithTask.event.type).toBe('session.context_changed');
    if (eventWithTask.event.type === 'session.context_changed') {
      expect(eventWithTask.event.data.cwd).toBe('/home/user/project');
      expect(eventWithTask.event.data.repository).toBe('owner/repo');
      expect(eventWithTask.event.data.branch).toBe('main');
    }
  });

  it('should handle session.start events with context', () => {
    const mockEvent: SessionEvent = {
      id: 'evt-456',
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.start',
      data: {
        sessionId: 'sess-123',
        version: 1,
        producer: 'test',
        copilotVersion: '0.1.24',
        startTime: new Date().toISOString(),
        context: {
          cwd: '/workspace',
          gitRoot: '/workspace',
          repository: 'test/repo',
          branch: 'feature',
        },
      },
    };

    const eventWithTask: SessionEventWithTask = {
      taskId: 'init-task',
      event: mockEvent,
    };

    expect(eventWithTask.taskId).toBe('init-task');
    expect(eventWithTask.event.type).toBe('session.start');
    if (eventWithTask.event.type === 'session.start' && eventWithTask.event.data.context) {
      expect(eventWithTask.event.data.context.cwd).toBe('/workspace');
      expect(eventWithTask.event.data.context.repository).toBe('test/repo');
    }
  });
});

describe('ExecutionCallbacks with session events', () => {
  it('should define onSessionEvent callback as optional', () => {
    const callbacks: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      // onSessionEvent is optional
    };

    expect(callbacks.onSessionEvent).toBeUndefined();
  });

  it('should accept onSessionEvent callback', () => {
    const sessionEventHandler = vi.fn();
    const callbacks: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      onSessionEvent: sessionEventHandler,
    };

    expect(callbacks.onSessionEvent).toBeDefined();
    expect(typeof callbacks.onSessionEvent).toBe('function');

    // Test that it can be called with the correct structure
    const mockEvent: SessionEvent = {
      id: 'evt-789',
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.context_changed',
      data: {
        cwd: '/test',
      },
    };

    callbacks.onSessionEvent?.({ taskId: 'test-task', event: mockEvent });
    expect(sessionEventHandler).toHaveBeenCalledWith({
      taskId: 'test-task',
      event: mockEvent,
    });
  });
});

describe('suggestModel', () => {
  it('should suggest a fast model for simple tasks', () => {
    const task = createTask({
      id: 'simple-task',
      title: 'Add a comment',
      description: 'Add a one-line comment to the function.',
      acceptanceCriteria: ['Comment is added'],
      dependsOn: [],
    });
    expect(suggestModel(task)).toBe('gpt-5-mini');
  });

  it('should suggest a capable model for tasks with many dependencies', () => {
    const task = createTask({
      id: 'complex-task',
      title: 'Implement authentication',
      description: 'Add auth.',
      acceptanceCriteria: ['Login works'],
      dependsOn: ['task-1', 'task-2', 'task-3'],
    });
    expect(suggestModel(task)).toBe('claude-sonnet-4');
  });

  it('should suggest a capable model for tasks with long descriptions', () => {
    const task = createTask({
      id: 'long-desc-task',
      title: 'Complex refactor',
      description: 'A'.repeat(201),
      acceptanceCriteria: ['Tests pass'],
      dependsOn: [],
    });
    expect(suggestModel(task)).toBe('claude-sonnet-4');
  });

  it('should suggest a capable model for tasks with many acceptance criteria', () => {
    const task = createTask({
      id: 'many-ac-task',
      title: 'Build feature',
      description: 'Short desc.',
      acceptanceCriteria: ['AC1', 'AC2', 'AC3', 'AC4'],
      dependsOn: [],
    });
    expect(suggestModel(task)).toBe('claude-sonnet-4');
  });

  it('should return gpt-5-mini for simple task with few deps, short description, and few criteria', () => {
    const task = createTask({
      id: 'easy-task',
      title: 'Fix typo',
      description: 'Fix typo in README.',
      acceptanceCriteria: ['Typo fixed', 'README updated'],
      dependsOn: ['task-a'],
    });
    expect(suggestModel(task)).toBe('gpt-5-mini');
  });
});

describe('Task model field', () => {
  it('should allow tasks without a model (optional field)', () => {
    const task = createTask({ id: 'no-model', title: 'Task without model' });
    expect(task.model).toBeUndefined();
  });

  it('should allow tasks with a specific model', () => {
    const task = createTask({ id: 'with-model', title: 'Task with model', model: 'gpt-5-mini' });
    expect(task.model).toBe('gpt-5-mini');
  });

  it('should preserve model through createTask spread', () => {
    const task = createTask({ id: 'model-task', title: 'Model task', model: 'claude-sonnet-4' });
    const copy = { ...task };
    expect(copy.model).toBe('claude-sonnet-4');
  });
});
