import type { Plan, Task } from '../models/plan.js';

interface TreeNode {
  task: Task;
  children: TreeNode[];
}

function buildForest(tasks: Task[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const childIds = new Set<string>();

  for (const task of tasks) {
    nodeMap.set(task.id, { task, children: [] });
  }

  for (const task of tasks) {
    if (task.dependsOn.length > 0) {
      const parentId = task.dependsOn[0]!;
      const parentNode = nodeMap.get(parentId);
      if (parentNode) {
        parentNode.children.push(nodeMap.get(task.id)!);
        childIds.add(task.id);
      }
    }
  }

  return tasks
    .filter((t) => !childIds.has(t.id))
    .map((t) => nodeMap.get(t.id)!);
}

function renderTreeLines(node: TreeNode, prefix: string, isLast: boolean, isRoot: boolean): string[] {
  const connector = isRoot ? '' : isLast ? '└── ' : '├── ';
  const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
  const statusIcon = node.task.status === 'done' ? '●' : node.task.status === 'failed' ? '✗' : '○';
  const deps = node.task.dependsOn.length > 1
    ? ` (also ← ${node.task.dependsOn.slice(1).join(', ')})`
    : '';

  const lines: string[] = [];
  lines.push(`${prefix}${connector}${statusIcon} **${node.task.id}** — ${node.task.title}${deps}`);

  node.children.forEach((child, i) => {
    const childIsLast = i === node.children.length - 1;
    lines.push(...renderTreeLines(child, childPrefix, childIsLast, false));
  });

  return lines;
}

export function planToMarkdown(plan: Plan): string {
  const lines: string[] = [];
  lines.push(`# ${plan.name}`);
  lines.push('');
  if (plan.description) {
    lines.push(plan.description);
    lines.push('');
  }
  lines.push(`> Created: ${plan.createdAt}`);
  lines.push(`> Updated: ${plan.updatedAt}`);
  lines.push('');

  // Dependency tree
  lines.push('## Work Breakdown Tree');
  lines.push('');
  lines.push('```');
  const roots = buildForest(plan.tasks);
  roots.forEach((root, i) => {
    const isLast = i === roots.length - 1;
    lines.push(...renderTreeLines(root, '', isLast, true));
  });
  lines.push('```');
  lines.push('');

  lines.push('## Tasks');
  lines.push('');

  for (const task of plan.tasks) {
    lines.push(`### ${task.id}: ${task.title}`);
    lines.push('');
    if (task.description) {
      lines.push(task.description);
      lines.push('');
    }
    if (task.acceptanceCriteria.length > 0) {
      lines.push('**Acceptance Criteria:**');
      for (const ac of task.acceptanceCriteria) {
        lines.push(`- [ ] ${ac}`);
      }
      lines.push('');
    }
    if (task.dependsOn.length > 0) {
      lines.push(`**Depends on:** ${task.dependsOn.join(', ')}`);
      lines.push('');
    }
    lines.push(`**Status:** ${task.status}`);
    lines.push('');
  }

  return lines.join('\n');
}
