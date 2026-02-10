import React from 'react';
import { Text, Box } from 'ink';
import type { Task } from '../models/plan.js';

interface BatchViewProps {
  tasks: Task[];
  batches: string[][];
  selectedIndex?: number;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  in_progress: '◑',
  done: '●',
  failed: '✗',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'gray',
  in_progress: 'yellow',
  done: 'green',
  failed: 'red',
};

export default function BatchView({ tasks, batches, selectedIndex }: BatchViewProps): React.ReactElement {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Compute flat ordering across all batches for selection index
  const flatOrder: Task[] = [];
  for (const batch of batches) {
    for (const id of batch) {
      const task = taskMap.get(id);
      if (task) flatOrder.push(task);
    }
  }

  let globalIndex = 0;

  return (
    <Box flexDirection="column">
      {batches.map((batch, batchIdx) => (
        <Box key={batchIdx} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="magenta" bold>
              Batch {batchIdx + 1}
            </Text>
            <Text color="gray">
              {' '}— {batch.length} task{batch.length !== 1 ? 's' : ''} (parallel)
            </Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {batch.map((taskId) => {
              const task = taskMap.get(taskId);
              if (!task) return null;
              const currentIdx = globalIndex++;
              const isSelected = currentIdx === selectedIndex;
              const icon = STATUS_ICONS[task.status] || '?';
              const color = STATUS_COLORS[task.status] || 'white';
              const isLastInBatch = taskId === batch[batch.length - 1];
              const connector = isLastInBatch ? '└── ' : '├── ';

              return (
                <Box key={task.id} flexDirection="column">
                  <Box>
                    <Text color="gray">{connector}</Text>
                    <Text color={color}>{icon} </Text>
                    <Text bold={isSelected} inverse={isSelected}>
                      {task.id}
                    </Text>
                    <Text color="gray"> — </Text>
                    <Text>{task.title}</Text>
                    {task.dependsOn.length > 0 && (
                      <Text color="gray"> (← {task.dependsOn.join(', ')})</Text>
                    )}
                  </Box>
                  {isSelected && (
                    <Box marginLeft={6} flexDirection="column">
                      {task.description && <Text color="gray">{task.description}</Text>}
                      {task.acceptanceCriteria.length > 0 && (
                        <Box flexDirection="column">
                          <Text color="cyan">Acceptance Criteria:</Text>
                          {task.acceptanceCriteria.map((ac, j) => (
                            <Text key={j} color="gray">  • {ac}</Text>
                          ))}
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
          {batchIdx < batches.length - 1 && (
            <Box marginLeft={2}>
              <Text color="gray">  ↓</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
