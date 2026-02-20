#!/usr/bin/env node
import React from 'react';
import { readFile } from 'node:fs/promises';
import { render } from 'ink';
import App from './app.js';
import type { Screen } from './models/plan.js';
import { listPlans } from './services/persistence.js';
import { simulateSession } from './services/simulator.js';
import { loadModelPreference, ensureSkillsDirectory } from './services/copilot.js';

const args = process.argv.slice(2);
const command = args[0] || 'home';

async function main(): Promise<void> {
  await loadModelPreference();
  await ensureSkillsDirectory();

  if (command === 'list') {
    const plans = await listPlans();
    if (plans.length === 0) {
      console.log('No saved plans. Run `planeteer new` to create one.');
    } else {
      console.log('Saved plans:');
      for (const p of plans) {
        console.log(`  ${p.id}  ${p.name}  (${p.updatedAt.slice(0, 10)})`);
      }
    }
    return;
  }

  if (command === 'simulate') {
    if (!args[1]) {
      console.error('Usage: planeteer simulate <script.json>');
      process.exit(1);
    }

    let script: {
      initialScreen?: Screen;
      initialPlanId?: string;
      steps: { input: string; waitMs?: number }[];
      width?: number;
      height?: number;
      settleMs?: number;
    };
    try {
      script = JSON.parse(await readFile(args[1], 'utf8')) as typeof script;
    } catch {
      throw new Error(`Invalid JSON in simulation script file: ${args[1]}`);
    }

    const result = await simulateSession(
      React.createElement(App, {
        initialScreen: script.initialScreen,
        initialPlanId: script.initialPlanId,
      }),
      {
        steps: script.steps,
        width: script.width,
        height: script.height,
        settleMs: script.settleMs,
      },
    );

    process.stdout.write(result.frames.join('\n---FRAME---\n'));
    return;
  }

  let initialScreen: Screen = 'welcome';
  let initialPlanId: string | undefined;

  if (command === 'new') {
    initialScreen = 'clarify';
  } else if (command === 'load' && args[1]) {
    initialPlanId = args[1];
  }

  render(React.createElement(App, { initialScreen, initialPlanId }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
