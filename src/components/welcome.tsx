import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';

const TITLE_ART = [
  ' ____  _                  _                ',
  '|  _ \\| | __ _ _ __   ___| |_ ___  ___ _ __',
  "| |_) | |/ _` | '_ \\ / _ \\ __/ _ \\/ _ \\ '__|",
  '|  __/| | (_| | | | |  __/ ||  __/  __/ |   ',
  '|_|   |_|\\__,_|_| |_|\\___|\\__\\___|\\___|_|   ',
];

const ART_WIDTH = Math.max(...TITLE_ART.map((l) => l.length));

const PLANETS = ['🌍', '🌎', '🌏'];

const SUBTITLE = 'AI-powered project planning & execution';

const GRADIENT = [
  '#4facfe', '#38f9d7', '#43e97b', '#fee140',
  '#fa709a', '#667eea', '#764ba2', '#4facfe',
];

interface WelcomeProps {
  onDone: () => void;
}

export default function Welcome({ onDone }: WelcomeProps): React.ReactElement {
  const [pos, setPos] = useState(-1);
  const [planetIdx, setPlanetIdx] = useState(0);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [phase, setPhase] = useState<'sweep' | 'hold' | 'done'>('sweep');

  const handleDone = useCallback(() => {
    onDone();
  }, [onDone]);

  useEffect(() => {
    const start = setTimeout(() => setPos(0), 300);
    return () => clearTimeout(start);
  }, []);

  useEffect(() => {
    if (phase !== 'sweep' || pos < 0) return;

    if (pos <= ART_WIDTH) {
      const speed = pos < 3 ? 60 : pos > ART_WIDTH - 3 ? 60 : 35;
      const timer = setTimeout(() => {
        setPos((p) => p + 1);
        setPlanetIdx((i) => (i + 1) % PLANETS.length);
      }, speed);
      return () => clearTimeout(timer);
    } else {
      setShowSubtitle(true);
      const holdTimer = setTimeout(() => setPhase('hold'), 600);
      return () => clearTimeout(holdTimer);
    }
  }, [phase, pos]);

  useEffect(() => {
    if (phase !== 'hold') return;
    const timer = setTimeout(() => {
      setPhase('done');
      handleDone();
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, handleDone]);

  const revealCol = pos < 0 ? 0 : pos;
  const done = pos > ART_WIDTH;
  const planet = PLANETS[planetIdx]!;

  return (
    <Box flexDirection="column" paddingY={2} paddingLeft={2}>
      {!done && pos >= 0 && (
        <Box>
          <Text>
            {' '.repeat(Math.max(0, pos))}
            {planet}
          </Text>
        </Box>
      )}

      <Box flexDirection="column">
        {TITLE_ART.map((line, rowIdx) => {
          const padded = line.padEnd(ART_WIDTH);
          return (
            <Text key={rowIdx}>
              {padded.split('').map((char, colIdx) => {
                if (colIdx >= revealCol) return <Text key={colIdx}> </Text>;
                const colorIdx = (colIdx + rowIdx * 2) % GRADIENT.length;
                return (
                  <Text key={colIdx} color={GRADIENT[colorIdx]} bold>
                    {char}
                  </Text>
                );
              })}
            </Text>
          );
        })}
      </Box>

      {showSubtitle && (
        <Box marginTop={1}>
          <Text color="gray" italic>
            {SUBTITLE}
          </Text>
        </Box>
      )}
    </Box>
  );
}
