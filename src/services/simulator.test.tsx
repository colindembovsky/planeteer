import React from 'react';
import { Box, Text, useInput } from 'ink';
import { describe, expect, it } from 'vitest';
import { simulateSession } from './simulator.js';

function EchoApp(): React.ReactElement {
  const [value, setValue] = React.useState('ready');
  useInput((ch) => {
    if (ch) {
      setValue((prev) => `${prev}${ch}`);
    }
  });
  return (
    <Box>
      <Text>{value}</Text>
    </Box>
  );
}

describe('simulateSession', () => {
  it('replays key input and captures frames', async () => {
    const result = await simulateSession(<EchoApp />, {
      width: 80,
      steps: [
        { input: 'a' },
        { input: 'b' },
      ],
    });

    expect(result.rawFrames.length).toBeGreaterThan(0);
    expect(result.frames.some((f) => f.includes('readya'))).toBe(true);
    expect(result.frames.some((f) => f.includes('readyab'))).toBe(true);
  });
});
