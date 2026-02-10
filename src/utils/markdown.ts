import type { Plan, Task } from '../models/plan.js';

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
