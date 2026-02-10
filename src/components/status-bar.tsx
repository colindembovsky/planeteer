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
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between" width="100%">
      <Box>
        <Text color="cyan" bold>{screen}</Text>
      </Box>
      <Box>
        <Text color="magenta">🤖 {displayModel}</Text>
      </Box>
      {hint && (
        <Box>
          <Text color="gray">{hint}</Text>
        </Box>
      )}
      <Box>
        <Text color="gray">q: quit</Text>
      </Box>
    </Box>
  );
}
