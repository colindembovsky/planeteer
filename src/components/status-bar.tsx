import React from 'react';
import { Text, Box, useStdout } from 'ink';
import stringWidth from 'string-width';
import { getModelLabel } from '../services/copilot.js';

interface StatusBarProps {
  screen: string;
  hint?: string;
  model?: string;
}

export default function StatusBar({ screen, hint, model }: StatusBarProps): React.ReactElement {
  const displayModel = model || getModelLabel();
  const { stdout } = useStdout();
  // Parent App uses padding={1} → 2 cols consumed; border chars │…│ take 2 more
  const innerWidth = (stdout?.columns ?? 80) - 4;

  // Build right-side content: "model  hint  q: quit"
  const rightParts: string[] = [displayModel];
  if (hint) rightParts.push(hint);
  rightParts.push('q: quit');
  const rightText = rightParts.join('  ');

  // Left: " Screen", right: "rightText "  (each with 1-char inner padding)
  const leftText = ` ${screen}`;
  const rightWithPad = `${rightText} `;
  // Use stringWidth for accurate column measurement (handles emojis / unicode)
  const gap = Math.max(1, innerWidth - stringWidth(leftText) - stringWidth(rightWithPad));

  const hRule = '─'.repeat(innerWidth);
  // Build exact content line as a single string so Ink Box layout cannot shift it
  const contentLine = `│${leftText}${' '.repeat(gap)}${rightWithPad}│`;

  return (
    <Box flexDirection="column">
      <Text color="gray">{'┌' + hRule + '┐'}</Text>
      <Text color="gray">{contentLine}</Text>
      <Text color="gray">{'└' + hRule + '┘'}</Text>
    </Box>
  );
}
