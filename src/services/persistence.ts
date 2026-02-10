import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Plan } from '../models/plan.js';
import { planToMarkdown } from '../utils/markdown.js';

const PLAN_DIR = '.planeteer';

async function ensureDir(): Promise<string> {
  const dir = join(process.cwd(), PLAN_DIR);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function savePlan(plan: Plan): Promise<void> {
  const dir = await ensureDir();
  plan.updatedAt = new Date().toISOString();

  const jsonPath = join(dir, `${plan.id}.json`);
  await writeFile(jsonPath, JSON.stringify(plan, null, 2), 'utf-8');

  const mdPath = join(dir, `${plan.id}.md`);
  await writeFile(mdPath, planToMarkdown(plan), 'utf-8');
}

export async function loadPlan(id: string): Promise<Plan | null> {
  const dir = await ensureDir();
  const jsonPath = join(dir, `${id}.json`);
  if (!existsSync(jsonPath)) return null;

  const raw = await readFile(jsonPath, 'utf-8');
  return JSON.parse(raw) as Plan;
}

export async function listPlans(): Promise<{ id: string; name: string; updatedAt: string }[]> {
  const dir = await ensureDir();
  const files = await readdir(dir);
  const plans: { id: string; name: string; updatedAt: string }[] = [];

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'prompt-history.json' || file === 'settings.json') continue;
    try {
      const raw = await readFile(join(dir, file), 'utf-8');
      const plan = JSON.parse(raw) as Plan;
      if (!plan.id || !plan.name || !plan.updatedAt) continue;
      plans.push({ id: plan.id, name: plan.name, updatedAt: plan.updatedAt });
    } catch {
      // skip malformed files
    }
  }

  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deletePlan(id: string): Promise<void> {
  const dir = await ensureDir();
  const { unlink } = await import('node:fs/promises');
  const jsonPath = join(dir, `${id}.json`);
  const mdPath = join(dir, `${id}.md`);
  if (existsSync(jsonPath)) await unlink(jsonPath);
  if (existsSync(mdPath)) await unlink(mdPath);
}
