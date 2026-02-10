import React from 'react';
import { Box, Text } from 'ink';

interface StreamingTextProps {
  text: string;
  maxLines?: number;
  label?: string;
  color?: string;
}

/**
 * Displays streaming text output, showing the last N lines.
 * Useful for showing progress on long-running model responses.
 */
export default function StreamingText({
  text,
  maxLines = 6,
  label,
  color = 'gray',
}: StreamingTextProps): React.ReactElement {
  const lines = text.split('\n');
  const totalLines = lines.length;
  const visibleLines = lines.slice(-maxLines);
  const truncated = totalLines > maxLines;

  return (
    <Box flexDirection="column">
      {label && (
        <Box marginBottom={0}>
          <Text color="cyan" bold>{label}</Text>
          <Text color="gray"> ({text.length} chars, {totalLines} lines)</Text>
        </Box>
      )}
      {truncated && (
        <Text color="gray" dimColor>  ··· {totalLines - maxLines} lines above ···</Text>
      )}
      {visibleLines.map((line, i) => (
        <Text key={i} color={color} wrap="truncate">
          {line}
        </Text>
      ))}
    </Box>
  );
}
