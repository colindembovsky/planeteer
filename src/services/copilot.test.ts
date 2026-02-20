import { describe, it, expect, vi } from 'vitest';
import type { SessionEventData, StreamCallbacks } from './copilot.js';

describe('SessionEventData', () => {
  it('should have correct type structure', () => {
    const mockEvent: SessionEventData = {
      type: 'tool.execution_start',
      timestamp: new Date().toISOString(),
      data: { toolName: 'test-tool' },
    };

    expect(mockEvent.type).toBe('tool.execution_start');
    expect(mockEvent.timestamp).toBeDefined();
    expect(mockEvent.data).toBeDefined();
  });

  it('should handle tool.execution_complete events', () => {
    const mockEvent: SessionEventData = {
      type: 'tool.execution_complete',
      timestamp: new Date().toISOString(),
      data: {
        toolCallId: 'test-123',
        success: true,
        result: { content: 'Task completed' },
      },
    };

    expect(mockEvent.type).toBe('tool.execution_complete');
    expect(mockEvent.data).toHaveProperty('success');
  });

  it('should handle session.error events', () => {
    const mockEvent: SessionEventData = {
      type: 'session.error',
      timestamp: new Date().toISOString(),
      data: {
        errorType: 'timeout',
        message: 'Request timed out',
      },
    };

    expect(mockEvent.type).toBe('session.error');
    expect((mockEvent.data as { message: string }).message).toBe('Request timed out');
  });

  it('should handle assistant.usage events', () => {
    const mockEvent: SessionEventData = {
      type: 'assistant.usage',
      timestamp: new Date().toISOString(),
      data: {
        model: 'claude-sonnet-4',
        inputTokens: 100,
        outputTokens: 50,
      },
    };

    expect(mockEvent.type).toBe('assistant.usage');
    expect((mockEvent.data as { inputTokens: number }).inputTokens).toBe(100);
  });
});

describe('StreamCallbacks event handling', () => {
  it('should accept onSessionEvent callback in StreamCallbacks', () => {
    const onSessionEvent = vi.fn();
    
    const callbacks: StreamCallbacks = {
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSessionEvent,
    };

    expect(callbacks.onSessionEvent).toBeDefined();
    expect(typeof callbacks.onSessionEvent).toBe('function');
  });

  it('should allow StreamCallbacks without onSessionEvent', () => {
    const callbacks: StreamCallbacks = {
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    expect(callbacks.onSessionEvent).toBeUndefined();
  });

  it('should call onSessionEvent when provided with event data', () => {
    const onSessionEvent = vi.fn();
    
    const callbacks: StreamCallbacks = {
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSessionEvent,
    };

    const mockEvent: SessionEventData = {
      type: 'tool.execution_start',
      timestamp: new Date().toISOString(),
      data: { toolName: 'bash', toolCallId: 'test-123' },
    };

    callbacks.onSessionEvent!(mockEvent);

    expect(onSessionEvent).toHaveBeenCalledWith(mockEvent);
    expect(onSessionEvent).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple sequential events through callback', () => {
    const capturedEvents: SessionEventData[] = [];
    const onSessionEvent = vi.fn((event) => capturedEvents.push(event));
    
    const callbacks: StreamCallbacks = {
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSessionEvent,
    };

    const timestamp = new Date().toISOString();
    
    // Simulate event flow
    const event1: SessionEventData = {
      type: 'tool.execution_start',
      timestamp,
      data: { toolName: 'bash' },
    };
    callbacks.onSessionEvent!(event1);

    const event2: SessionEventData = {
      type: 'tool.execution_progress',
      timestamp,
      data: { progressMessage: 'Running command...' },
    };
    callbacks.onSessionEvent!(event2);

    const event3: SessionEventData = {
      type: 'tool.execution_complete',
      timestamp,
      data: { success: true },
    };
    callbacks.onSessionEvent!(event3);

    expect(onSessionEvent).toHaveBeenCalledTimes(3);
    expect(capturedEvents).toHaveLength(3);
    expect(capturedEvents[0].type).toBe('tool.execution_start');
    expect(capturedEvents[1].type).toBe('tool.execution_progress');
    expect(capturedEvents[2].type).toBe('tool.execution_complete');
  });

  it('should preserve event data structure when forwarding', () => {
    const onSessionEvent = vi.fn();
    
    const callbacks: StreamCallbacks = {
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSessionEvent,
    };

    const complexEvent: SessionEventData = {
      type: 'assistant.usage',
      timestamp: new Date().toISOString(),
      data: {
        model: 'claude-sonnet-4',
        inputTokens: 1500,
        outputTokens: 750,
        cacheReadTokens: 200,
        cost: 0.015,
      },
    };

    callbacks.onSessionEvent!(complexEvent);

    expect(onSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'assistant.usage',
        timestamp: complexEvent.timestamp,
        data: expect.objectContaining({
          model: 'claude-sonnet-4',
          inputTokens: 1500,
          outputTokens: 750,
        }),
      })
    );
  });
});
