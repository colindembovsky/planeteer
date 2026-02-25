import React from 'react';
import { Box, Text } from 'ink';
import type { PermissionRequest } from '../services/copilot.js';

interface PermissionPromptProps {
  request: PermissionRequest;
  taskId?: string;
}

const KIND_LABEL: Record<string, string> = {
  shell: 'Run shell command',
  write: 'Write to filesystem',
  read: 'Read from filesystem',
  mcp: 'Call MCP server tool',
  url: 'Fetch URL',
};

export default function PermissionPrompt({ request, taskId }: PermissionPromptProps): React.ReactElement {
  const kindLabel = KIND_LABEL[request.kind] ?? request.kind;
  const toolName = (request as Record<string, unknown>).toolName as string | undefined;
  const details = (request as Record<string, unknown>).details as string | undefined;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginBottom={1}
    >
      <Text color="yellow" bold>⚠ Permission Request</Text>
      {taskId && <Text color="gray">Task: {taskId}</Text>}
      <Box marginTop={1}>
        <Text color="white">Kind: </Text>
        <Text color="yellow">{kindLabel}</Text>
      </Box>
      {toolName && (
        <Box>
          <Text color="white">Tool: </Text>
          <Text color="cyan">{toolName}</Text>
        </Box>
      )}
      {details && (
        <Box>
          <Text color="white">Details: </Text>
          <Text color="gray">{details}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="green" bold>y</Text>
        <Text color="gray"> approve  </Text>
        <Text color="red" bold>n</Text>
        <Text color="gray"> deny</Text>
      </Box>
    </Box>
  );
}
