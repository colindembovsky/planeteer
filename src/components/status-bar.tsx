import React from 'react';
import { Text, Box } from 'ink';
import { getModelLabel } from '../services/copilot.js';

interface StatusBarProps {
  screen: string;
  hint?: string;
  model?: string;
}

export default function StatusBar({ screen, hint, model }: StatusBarProps): React.ReactElement {
  const displayModel = model || getModelLabel();
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="cyan" bold>{screen}</Text>
      <Text color="gray"> │ </Text>
      <Text color="magenta">🤖 {displayModel}</Text>
      {hint && <Text color="gray"> │ {hint}</Text>}
      <Text color="gray"> │ q: quit</Text>
    </Box>
  );
}
