import { describe, it, expect, vi } from 'vitest';
import type { ExecutionCallbacks, SessionEventWithTask } from './executor.js';
import type { SessionEvent, PermissionRequest, PermissionRequestResult, PermissionHandler } from './copilot.js';

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

describe('ExecutionCallbacks with permission handler', () => {
  it('should define onPermissionRequest callback as optional', () => {
    const callbacks: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      // onPermissionRequest is optional
    };

    expect(callbacks.onPermissionRequest).toBeUndefined();
  });

  it('should accept and call onPermissionRequest for approval', async () => {
    const approveResult: PermissionRequestResult = { kind: 'approved' };
    const permissionHandler: PermissionHandler = vi.fn().mockResolvedValue(approveResult);

    const callbacks: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      onPermissionRequest: permissionHandler,
    };

    expect(callbacks.onPermissionRequest).toBeDefined();

    const request: PermissionRequest = { kind: 'shell', toolCallId: 'tc-1' };
    const invocation = { sessionId: 'sess-abc' };
    const result = await callbacks.onPermissionRequest?.(request, invocation);

    expect(permissionHandler).toHaveBeenCalledWith(request, invocation);
    expect(result).toEqual(approveResult);
    expect(result?.kind).toBe('approved');
  });

  it('should accept and call onPermissionRequest for denial', async () => {
    const denyResult: PermissionRequestResult = { kind: 'denied-interactively-by-user' };
    const permissionHandler: PermissionHandler = vi.fn().mockResolvedValue(denyResult);

    const callbacks: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      onPermissionRequest: permissionHandler,
    };

    const request: PermissionRequest = { kind: 'write', toolCallId: 'tc-2' };
    const invocation = { sessionId: 'sess-def' };
    const result = await callbacks.onPermissionRequest?.(request, invocation);

    expect(result?.kind).toBe('denied-interactively-by-user');
  });

  it('should handle all supported permission kinds', () => {
    const kinds: PermissionRequest['kind'][] = ['shell', 'write', 'read', 'mcp', 'url'];
    kinds.forEach((kind) => {
      const request: PermissionRequest = { kind };
      expect(request.kind).toBe(kind);
    });
  });
});
