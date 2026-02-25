import { describe, it, expect, vi } from 'vitest';
import type { ExecutionCallbacks, SessionEventWithTask } from './executor.js';
import type { SessionEvent } from './copilot.js';
import { COMPACTION_THRESHOLD } from './copilot.js';

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

  it('should handle session.usage_info events with task ID', () => {
    const mockEvent: SessionEvent = {
      id: 'evt-usage-1',
      timestamp: new Date().toISOString(),
      parentId: null,
      ephemeral: true,
      type: 'session.usage_info',
      data: {
        tokenLimit: 128000,
        currentTokens: 102400,
        messagesLength: 42,
      },
    };

    const eventWithTask: SessionEventWithTask = {
      taskId: 'task-abc',
      event: mockEvent,
    };

    expect(eventWithTask.taskId).toBe('task-abc');
    expect(eventWithTask.event.type).toBe('session.usage_info');
    if (eventWithTask.event.type === 'session.usage_info') {
      expect(eventWithTask.event.data.tokenLimit).toBe(128000);
      expect(eventWithTask.event.data.currentTokens).toBe(102400);
      expect(eventWithTask.event.data.messagesLength).toBe(42);
    }
  });

  it('should handle session.compaction_start events', () => {
    const mockEvent: SessionEvent = {
      id: 'evt-compact-start',
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.compaction_start',
      data: {},
    };

    const eventWithTask: SessionEventWithTask = {
      taskId: 'task-xyz',
      event: mockEvent,
    };

    expect(eventWithTask.taskId).toBe('task-xyz');
    expect(eventWithTask.event.type).toBe('session.compaction_start');
  });

  it('should handle session.compaction_complete events', () => {
    const mockEvent: SessionEvent = {
      id: 'evt-compact-done',
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.compaction_complete',
      data: {
        success: true,
        preCompactionTokens: 102400,
        postCompactionTokens: 8192,
        messagesRemoved: 45,
        tokensRemoved: 94208,
      },
    };

    const eventWithTask: SessionEventWithTask = {
      taskId: 'task-xyz',
      event: mockEvent,
    };

    expect(eventWithTask.event.type).toBe('session.compaction_complete');
    if (eventWithTask.event.type === 'session.compaction_complete') {
      expect(eventWithTask.event.data.success).toBe(true);
      expect(eventWithTask.event.data.messagesRemoved).toBe(45);
      expect(eventWithTask.event.data.preCompactionTokens).toBe(102400);
      expect(eventWithTask.event.data.postCompactionTokens).toBe(8192);
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

  it('should receive and forward compaction events via onSessionEvent', () => {
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

    const compactionStartEvent: SessionEvent = {
      id: 'compact-start-1',
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.compaction_start',
      data: {},
    };

    const compactionCompleteEvent: SessionEvent = {
      id: 'compact-done-1',
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.compaction_complete',
      data: {
        success: true,
        preCompactionTokens: 100000,
        postCompactionTokens: 5000,
        messagesRemoved: 30,
        tokensRemoved: 95000,
      },
    };

    callbacks.onSessionEvent?.({ taskId: 'task-1', event: compactionStartEvent });
    callbacks.onSessionEvent?.({ taskId: 'task-1', event: compactionCompleteEvent });

    expect(sessionEventHandler).toHaveBeenCalledTimes(2);
    expect(sessionEventHandler.mock.calls[0]![0].event.type).toBe('session.compaction_start');
    expect(sessionEventHandler.mock.calls[1]![0].event.type).toBe('session.compaction_complete');
    if (sessionEventHandler.mock.calls[1]![0].event.type === 'session.compaction_complete') {
      expect(sessionEventHandler.mock.calls[1]![0].event.data.messagesRemoved).toBe(30);
    }
  });
});

describe('COMPACTION_THRESHOLD', () => {
  it('should be 0.8 (80% context utilization)', () => {
    expect(COMPACTION_THRESHOLD).toBe(0.8);
  });

  it('should be in the valid range 0.0–1.0', () => {
    expect(COMPACTION_THRESHOLD).toBeGreaterThan(0);
    expect(COMPACTION_THRESHOLD).toBeLessThan(1);
  });
});
