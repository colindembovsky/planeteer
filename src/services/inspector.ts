import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { sendPromptSync } from './copilot.js';

/** Maximum depth for directory traversal. */
const MAX_DEPTH = 5;

/** Maximum number of files to list in the tree. */
const MAX_FILES = 200;

/** Files/dirs to always skip. */
const IGNORE = new Set([
  'node_modules', '.git', '.planeteer', 'dist', 'build', 'out',
  '.next', '.nuxt', '.svelte-kit', 'coverage', '__pycache__',
  '.venv', 'venv', 'env', '.env', '.DS_Store', 'Thumbs.db',
  '.cache', '.parcel-cache', '.turbo', '.Output',
]);

/** Max bytes to read from any individual file. */
const MAX_FILE_BYTES = 4096;

/** Max number of source files to sample for content. */
const MAX_SOURCE_SAMPLES = 10;

/** Extensions considered interesting enough to sample. */
const SAMPLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.cs', '.cpp', '.c', '.h', '.hpp', '.swift',
  '.vue', '.svelte', '.astro', '.php',
]);

/** Config / metadata files always worth reading. */
const CONFIG_FILES = new Set([
  'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod',
  'Gemfile', 'pom.xml', 'build.gradle', 'requirements.txt',
  'composer.json', 'tsconfig.json', 'Dockerfile',
  'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', 'Makefile', 'README.md',
]);

export interface CodebaseSnapshot {
  /** Whether any source files were found. */
  hasCode: boolean;
  /** Human-readable analysis produced by Copilot. */
  summary: string;
}

const ANALYSIS_SYSTEM_PROMPT = `You are an expert software architect analyzing an existing codebase.
You will be given a file tree and the contents of key files from a project directory.
Produce a concise but thorough analysis covering:

1. **Project Overview** — what this project is and what it does
2. **Tech Stack** — languages, frameworks, libraries, build tools
3. **Architecture** — folder structure conventions, key modules, patterns used
4. **Entry Points** — main files, scripts, CLI commands
5. **Conventions** — naming, module organization, import style, testing approach

FORMAT RULES:
- Use markdown with clear section headers.
- Be concise — aim for 200-400 words total.
- Focus on facts visible in the code, not speculation.
- End with a short bullet list of "Key things to know before making changes".
- Wrap the entire analysis in a section starting with "## Existing Codebase Analysis".
- Include a note reminding the planner to avoid recreating what already exists and to integrate with existing code.`;

/**
 * Scan the current working directory, gather file tree and key file contents,
 * then use Copilot to produce an intelligent analysis of the existing codebase.
 */
export async function inspectCodebase(root?: string): Promise<CodebaseSnapshot> {
  const cwd = root ?? process.cwd();

  // 1. Walk the file tree
  const files: string[] = [];
  await walkDir(cwd, cwd, 0, files);

  const hasCode = files.some((f) => !f.endsWith('/') && SAMPLE_EXTENSIONS.has(extname(f).toLowerCase()));

  if (!hasCode && files.length === 0) {
    return { hasCode: false, summary: '' };
  }

  // 2. Build the tree string
  const tree = files.map((f) => {
    const depth = f.split('/').length - 1;
    const name = f.split('/').pop()!;
    return '  '.repeat(depth) + name;
  }).join('\n');

  // 3. Gather file contents — config files + a sample of source files
  const gathered: { path: string; content: string }[] = [];

  // Config files first (always include if present)
  for (const f of files) {
    if (f.endsWith('/')) continue;
    const basename = f.split('/').pop()!;
    if (CONFIG_FILES.has(basename)) {
      const content = await readFileSafe(join(cwd, f));
      if (content) gathered.push({ path: f, content });
    }
  }

  // Sample source files (spread across the tree for breadth)
  let sampled = 0;
  for (const f of files) {
    if (sampled >= MAX_SOURCE_SAMPLES) break;
    if (f.endsWith('/')) continue;
    const ext = extname(f).toLowerCase();
    if (!SAMPLE_EXTENSIONS.has(ext)) continue;
    // Skip if already gathered as a config file
    if (gathered.some((g) => g.path === f)) continue;
    const content = await readFileSafe(join(cwd, f));
    if (content) {
      gathered.push({ path: f, content });
      sampled++;
    }
  }

  // 4. Build the prompt payload
  const fileContents = gathered
    .map((g) => `### ${g.path}\n\`\`\`\n${g.content}\n\`\`\``)
    .join('\n\n');

  const userPrompt = `Here is the file tree of the project:\n\n\`\`\`\n${tree}\n\`\`\`\n\nHere are the contents of key files:\n\n${fileContents}`;

  // 5. Ask Copilot to analyze
  try {
    const { result: summary } = await sendPromptSync(ANALYSIS_SYSTEM_PROMPT, [
      { role: 'user', content: userPrompt },
    ], { timeoutMs: 60_000 });

    return { hasCode, summary: summary.trim() };
  } catch {
    // Fallback: return a basic summary if Copilot is unavailable
    return { hasCode, summary: buildFallbackSummary(tree, gathered) };
  }
}

// ── helpers ──────────────────────────────────────────────────────────

async function readFileSafe(fullPath: string): Promise<string | null> {
  if (!existsSync(fullPath)) return null;
  try {
    const raw = await readFile(fullPath, 'utf-8');
    return raw.length > MAX_FILE_BYTES
      ? raw.slice(0, MAX_FILE_BYTES) + '\n... (truncated)'
      : raw;
  } catch {
    return null;
  }
}

async function walkDir(
  base: string,
  dir: string,
  depth: number,
  out: string[],
): Promise<void> {
  if (depth > MAX_DEPTH || out.length > MAX_FILES) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // Sort: dirs first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (out.length > MAX_FILES) break;
    if (IGNORE.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

    const rel = relative(base, join(dir, entry.name));

    if (entry.isDirectory()) {
      out.push(rel + '/');
      await walkDir(base, join(dir, entry.name), depth + 1, out);
    } else {
      out.push(rel);
    }
  }
}

/** Minimal fallback when Copilot is unavailable. */
function buildFallbackSummary(
  tree: string,
  files: { path: string; content: string }[],
): string {
  const sections = [
    '## Existing Codebase Analysis',
    '',
    'The working directory already contains files. Take this into account when',
    'planning — avoid recreating what already exists and ensure new work integrates',
    'with the existing code.',
    '',
    '### File Tree',
    '```',
    tree,
    '```',
    '',
  ];

  for (const f of files.slice(0, 5)) {
    sections.push(`### ${f.path}`, '```', f.content, '```', '');
  }

  return sections.join('\n');
}
