import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const THINKING_VERBS = [
  'Thinking',
  'Pondering',
  'Analyzing',
  'Considering',
  'Reasoning',
  'Evaluating',
  'Reflecting',
  'Mulling it over',
  'Working through it',
  'Brainstorming',
];

interface SpinnerProps {
  label?: string;
  color?: string;
}

export default function Spinner({ label, color = 'yellow' }: SpinnerProps): React.ReactElement {
  const [frame, setFrame] = useState(0);
  const [verbIndex, setVerbIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setVerbIndex((prev) => (prev + 1) % THINKING_VERBS.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const displayLabel = label || THINKING_VERBS[verbIndex]!;

  return (
    <Text color={color}>
      {SPINNER_FRAMES[frame]} {displayLabel}...
    </Text>
  );
}
