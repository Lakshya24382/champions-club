import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const steps = [
  ['db:init', 'scripts/initDb.js'],
  ['db:seed', 'scripts/seed.js'],
  ['db:shop:init', 'scripts/initShop.js'],
  ['db:shop:seed', 'scripts/seedShop.js'],
  ['db:bar:init', 'scripts/initBar.js'],
  ['db:bar:seed', 'scripts/seedBar.js'],
  ['db:crm:init', 'scripts/initCrm.js'],
  ['db:crm:seed', 'scripts/seedCrm.js'],
  ['db:fin:init', 'scripts/initFinance.js'],
  ['db:fin:seed', 'scripts/seedFinance.js'],
];

for (const [name, script] of steps) {
  console.log(`\n▶ ${name}`);
  await run(process.execPath, ['--env-file=.env', script], { stdio: 'inherit' });
}
console.log('\n✓ Champions Club database is ready.');
