import { describe, it, expect, vi } from 'vitest';
import type { ExecutionCallbacks, SessionEventWithTask } from './executor.js';
import type { SessionEvent } from './copilot.js';

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
