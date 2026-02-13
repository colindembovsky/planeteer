import { describe, it, expect, vi } from 'vitest';
import type { SessionEventData } from './copilot.js';

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
