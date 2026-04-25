// ============================================================================
// TESTE DE ARQUITETURA - Garantir que nao existem tabelas de frete duplicadas
// 2026-04-25 FRENTE 1 - Zero duplicacao de dimensoes
// ============================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'src');

function walkSource(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walkSource(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const allFiles = walkSource(ROOT);

let passed = 0, failed = 0;
const assert = (cond, label) => {
  if (cond) { passed++; console.log(`  ok    ${label}`); }
  else       { failed++; console.error(`  FAIL  ${label}`); }
};

console.log('\n=== TESTE: nao ha mais switch(yards) duplicado fora de shippingDefaults.ts ===');

// Padroes suspeitos de duplicacao:
// 1. switch com case 1000: ... case 2000:
// 2. carretilha com height: 25, width: 33

const SUSPICIOUS_PATTERNS = [
  /case\s+1000\s*:\s*return\s*\{\s*height/i,
  /case\s+500\s*:\s*return\s*\{\s*height/i,
  /height:\s*25\s*,\s*width:\s*33\s*,\s*length:\s*31/,  // assinatura carretilha
];

const ALLOWED_FILES = [
  'src/shippingDefaults.ts',  // fonte unica
];

for (const f of allFiles) {
  const rel = relative(join(__dirname, '..'), f).replace(/\\/g, '/');
  if (ALLOWED_FILES.some(a => rel === a)) continue;

  const content = readFileSync(f, 'utf8');
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(content)) {
      assert(false, `${rel} contem padrao de tabela duplicada: ${pattern}`);
    }
  }
}

// Se chegou aqui sem falhas, todos passaram
if (failed === 0) {
  assert(true, 'nenhum arquivo fora de shippingDefaults.ts tem tabela de frete duplicada');
}

console.log('\n=== TESTE: frontend nao chama Superfrete diretamente ===');
// Regra: Superfrete API so e chamada pelo backend (route.ts). Frontend passa via /store/shipping-quote.
const SUPERFRETE_API = /api\.superfrete\.com|superfrete\.com\/v\d/i;
for (const f of allFiles) {
  const rel = relative(join(__dirname, '..'), f).replace(/\\/g, '/');
  const content = readFileSync(f, 'utf8');
  if (SUPERFRETE_API.test(content)) {
    assert(false, `${rel} chama Superfrete diretamente - deve ir via backend`);
  }
}
if (failed === 0) assert(true, 'nenhum arquivo do frontend chama Superfrete diretamente');

console.log('\n=== TESTE: calculateShipping usa products[] nao package ===');
const apiFile = readFileSync(join(ROOT, 'api.ts'), 'utf8');
assert(
  apiFile.includes('products,') || apiFile.includes('products:'),
  'api.ts envia products[] para o backend'
);
assert(
  !apiFile.includes('package: {') || apiFile.match(/package:/g)?.length < 3,
  'api.ts NAO monta package manualmente (calculo e da Superfrete)'
);

console.log(`\n=== RESUMO ===\nPassou: ${passed}\nFalhou: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
