import React from 'react';
import { Text, Box } from 'ink';
import type { Task } from '../models/plan.js';

interface TaskTreeProps {
  tasks: Task[];
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

interface TreeNode {
  task: Task;
  children: TreeNode[];
}

function buildForest(tasks: Task[]): { roots: TreeNode[]; flatOrder: Task[] } {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const nodeMap = new Map<string, TreeNode>();
  const childIds = new Set<string>();

  // Create nodes
  for (const task of tasks) {
    nodeMap.set(task.id, { task, children: [] });
  }

  // Build parent→child edges (a task's dependsOn are its parents)
  for (const task of tasks) {
    if (task.dependsOn.length > 0) {
      // Attach to the first dependency as primary parent
      const parentId = task.dependsOn[0]!;
      const parentNode = nodeMap.get(parentId);
      if (parentNode) {
        parentNode.children.push(nodeMap.get(task.id)!);
        childIds.add(task.id);
      }
    }
  }

  // Roots are tasks that aren't children of anyone
  const roots = tasks
    .filter((t) => !childIds.has(t.id))
    .map((t) => nodeMap.get(t.id)!);

  // Compute flat ordering for selection index
  const flatOrder: Task[] = [];
  function flatten(node: TreeNode): void {
    flatOrder.push(node.task);
    node.children.forEach(flatten);
  }
  roots.forEach(flatten);

  return { roots, flatOrder };
}

function renderNode(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  flatOrder: Task[],
  selectedIndex?: number,
): React.ReactElement[] {
  const elements: React.ReactElement[] = [];
  const flatIndex = flatOrder.indexOf(node.task);
  const isSelected = flatIndex === selectedIndex;
  const icon = STATUS_ICONS[node.task.status] || '?';
  const color = STATUS_COLORS[node.task.status] || 'white';

  const connector = isRoot ? '' : isLast ? '└── ' : '├── ';
  const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');

  elements.push(
    <Box key={node.task.id} flexDirection="column">
      <Box>
        <Text color="gray">{prefix}{connector}</Text>
        <Text color={color}>{icon} </Text>
        <Text bold={isSelected} inverse={isSelected}>
          {node.task.id}
        </Text>
        <Text color="gray"> — </Text>
        <Text>{node.task.title}</Text>
        {node.task.dependsOn.length > 1 && (
          <Text color="gray"> (also ← {node.task.dependsOn.slice(1).join(', ')})</Text>
        )}
      </Box>
      {isSelected && (
        <Box marginLeft={2} flexDirection="column">
          <Text color="gray">{childPrefix}  {node.task.description}</Text>
          {node.task.acceptanceCriteria.length > 0 && (
            <Box flexDirection="column">
              <Text color="cyan">{childPrefix}  Acceptance Criteria:</Text>
              {node.task.acceptanceCriteria.map((ac, j) => (
                <Text key={j} color="gray">{childPrefix}    • {ac}</Text>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>,
  );

  node.children.forEach((child, i) => {
    const childIsLast = i === node.children.length - 1;
    elements.push(
      ...renderNode(child, childPrefix, childIsLast, false, flatOrder, selectedIndex),
    );
  });

  return elements;
}

export default function TaskTree({ tasks, selectedIndex }: TaskTreeProps): React.ReactElement {
  const { roots, flatOrder } = buildForest(tasks);

  return (
    <Box flexDirection="column">
      {roots.map((root, i) => {
        const isLast = i === roots.length - 1;
        return (
          <React.Fragment key={root.task.id}>
            {renderNode(root, '', isLast, true, flatOrder, selectedIndex)}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
