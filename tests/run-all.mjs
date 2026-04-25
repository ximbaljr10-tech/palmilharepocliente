// ============================================================================
// RUNNER - Roda todos os testes em sequencia
// 2026-04-25 - npm test
// ============================================================================

import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const testFiles = readdirSync(__dirname)
  .filter(f => f.startsWith('test-') && f.endsWith('.mjs'))
  .sort();

console.log(`\nRodando ${testFiles.length} suite(s) de teste...\n`);

let allPassed = 0, allFailed = 0;
const failedSuites = [];

for (const f of testFiles) {
  console.log(`\n${'='.repeat(70)}\n>>> ${f}\n${'='.repeat(70)}`);
  try {
    const out = execSync(`node ${join(__dirname, f)}`, { encoding: 'utf8' });
    process.stdout.write(out);
    const m = out.match(/Passou:\s*(\d+)[\s\S]*?Falhou:\s*(\d+)/);
    if (m) {
      allPassed += parseInt(m[1], 10);
      allFailed += parseInt(m[2], 10);
    }
  } catch (err) {
    const out = err.stdout?.toString() || '';
    process.stdout.write(out);
    const m = out.match(/Passou:\s*(\d+)[\s\S]*?Falhou:\s*(\d+)/);
    if (m) {
      allPassed += parseInt(m[1], 10);
      allFailed += parseInt(m[2], 10);
    } else {
      allFailed++;
    }
    failedSuites.push(f);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTADO GERAL:`);
console.log(`  Testes passados: ${allPassed}`);
console.log(`  Testes falhos:   ${allFailed}`);
console.log(`  Suites falhas:   ${failedSuites.length === 0 ? 'nenhuma' : failedSuites.join(', ')}`);
console.log(`${'='.repeat(70)}\n`);

process.exit(allFailed > 0 ? 1 : 0);
