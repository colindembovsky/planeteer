import React from 'react';
import { Text, Box } from 'ink';

interface StatusBarProps {
  screen: string;
  hint?: string;
}

export default function StatusBar({ screen, hint }: StatusBarProps): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="cyan" bold>{screen}</Text>
      {hint && <Text color="gray"> │ {hint}</Text>}
      <Text color="gray"> │ q: quit</Text>
    </Box>
  );
}
