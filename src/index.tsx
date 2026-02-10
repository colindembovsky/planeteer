#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import App from './app.js';
import type { Screen } from './models/plan.js';
import { listPlans } from './services/persistence.js';

const args = process.argv.slice(2);
const command = args[0] || 'home';

async function main(): Promise<void> {
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
