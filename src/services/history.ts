import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const PLAN_DIR = '.planeteer';
const HISTORY_FILE = 'prompt-history.json';
const MAX_HISTORY = 100;

async function historyPath(): Promise<string> {
  const dir = join(process.cwd(), PLAN_DIR);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return join(dir, HISTORY_FILE);
}

export async function loadHistory(): Promise<string[]> {
  const path = await historyPath();
  if (!existsSync(path)) return [];

  try {
    const raw = await readFile(path, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function addToHistory(prompt: string): Promise<void> {
  const history = await loadHistory();

  // Deduplicate: remove previous occurrence if it exists
  const filtered = history.filter((h) => h !== prompt);
  filtered.push(prompt);

  // Cap at max
  const trimmed = filtered.slice(-MAX_HISTORY);

  const path = await historyPath();
  await writeFile(path, JSON.stringify(trimmed, null, 2), 'utf-8');
}
