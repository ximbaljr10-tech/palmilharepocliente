// ============================================================================
// TESTES DA LOGICA DE VALIDACAO DE FRETE
// 2026-04-25 FRENTE 1 - Testa shippingDefaults.ts
// ============================================================================
// Como rodar: node tests/test-shipping-validation.mjs
//
// Requisitos validados aqui:
//   - height, width, length SEMPRE >= 1 na saida (nunca null/0/undefined)
//   - weight SEMPRE >= 0.1 na saida
//   - Fallback por jardas/carretilha funciona
//   - Inputs absurdos (NaN, string, negativos) sao saneados

import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src', 'shippingDefaults.ts');
const OUT_DIR = join(__dirname, '_tmp');
const OUT = join(OUT_DIR, 'shippingDefaults.js');
mkdirSync(OUT_DIR, { recursive: true });

execSync(
  `npx esbuild ${SRC} --bundle --format=esm --outfile=${OUT} --platform=neutral --loader:.ts=ts`,
  { stdio: 'inherit' }
);

const mod = await import(OUT);
const {
  getShippingDefaults,
  validateShippingDimensions,
  MIN_DIMENSION_CM,
  MIN_WEIGHT_KG,
  extractYardsFromTitle,
} = mod;

let passed = 0, failed = 0;
const assert = (cond, label) => {
  if (cond) { passed++; console.log(`  ok    ${label}`); }
  else       { failed++; console.error(`  FAIL  ${label}`); }
};

const isValidDims = (d) =>
  d && d.height >= MIN_DIMENSION_CM && d.width >= MIN_DIMENSION_CM &&
       d.length >= MIN_DIMENSION_CM && d.weight >= MIN_WEIGHT_KG;

console.log('\n=== TESTE 1: extractYardsFromTitle ===');
assert(extractYardsFromTitle('Linha Dente de Tubarao 1000 jardas') === 1000, 'extrai 1000 jardas');
assert(extractYardsFromTitle('Linha 500j preta') === 500, 'extrai 500 (sufixo J)');
assert(extractYardsFromTitle('Linha 2000 jds') === 2000, 'extrai 2000 (sufixo jds)');
assert(extractYardsFromTitle('Carretilha Shark') === null, 'retorna null se sem jardas');
assert(extractYardsFromTitle('') === null, 'retorna null para string vazia');

console.log('\n=== TESTE 2: getShippingDefaults retorna valores validos ===');
// Testa TODOS os tamanhos de jarda do sistema
const yardsToTest = [50, 100, 200, 500, 600, 1000, 2000, 3000, 6000, 12000, null, 99999];
for (const y of yardsToTest) {
  const s = getShippingDefaults(y, y ? `Linha ${y}j` : 'Produto qualquer');
  assert(isValidDims(s), `${y ?? 'null'} jardas → dimensoes >= minimo`);
}

const sCarretilha = getShippingDefaults(null, 'Carretilha Tubarao Pro');
assert(sCarretilha.height === 25 && sCarretilha.width === 33 && sCarretilha.length === 31 && sCarretilha.weight === 1.0, 'carretilha detectada pela palavra-chave');
assert(isValidDims(sCarretilha), 'carretilha tem dimensoes validas');

console.log('\n=== TESTE 3: validateShippingDimensions — valores validos nao sao alterados ===');
const v1 = validateShippingDimensions({ height: 15, width: 15, length: 18, weight: 0.5 }, 'Linha 1000j', 1000);
assert(v1.valid === true && v1.errors.length === 0, 'dimensoes validas → valid=true, sem erros');
assert(v1.dimensions.height === 15 && v1.dimensions.weight === 0.5, 'mantem valores originais');
assert(v1.usedFallback === false, 'nao usa fallback quando inputs sao bons');

console.log('\n=== TESTE 4: validateShippingDimensions — inputs invalidos ativam fallback ===');
const v2 = validateShippingDimensions({ height: 0, width: 15, length: 18, weight: 0.5 }, 'Linha 1000j', 1000);
assert(v2.usedFallback === true, 'altura 0 → ativa fallback');
assert(v2.dimensions.height >= MIN_DIMENSION_CM, 'altura substituida pelo fallback valido');
assert(v2.warnings.length > 0, 'emite warnings explicando substituicao');

const v3 = validateShippingDimensions({ height: null, width: null, length: null, weight: null }, 'Linha 1000j', 1000);
assert(v3.valid === true, 'todos null com contexto (1000j) → usa fallback completo e fica valido');
assert(isValidDims(v3.dimensions), 'fallback completo tem dimensoes validas');

const v4 = validateShippingDimensions({ height: 15, width: 15, length: 18, weight: 0.05 }, 'Linha 1000j', 1000);
assert(v4.usedFallback === true, 'peso 0.05 (< 0.1kg) → ativa fallback');
assert(v4.dimensions.weight >= MIN_WEIGHT_KG, 'peso substituido por valor valido');
assert(v4.dimensions.height === 15 && v4.dimensions.width === 15, 'mantem os campos que ja eram validos');

console.log('\n=== TESTE 5: validateShippingDimensions — carretilha com zeros ===');
const v5 = validateShippingDimensions({ height: 0, width: 0, length: 0, weight: 0 }, 'Carretilha Pro', null);
assert(v5.valid === true, 'carretilha com zeros → usa fallback carretilha e fica valido');
assert(v5.dimensions.height === 25, 'fallback carretilha altura=25');
assert(v5.dimensions.weight === 1.0, 'fallback carretilha peso=1.0');

console.log('\n=== TESTE 6: validateShippingDimensions — inputs absurdos sao saneados ===');
const v6 = validateShippingDimensions({ height: -5, width: NaN, length: 'abc', weight: undefined }, 'Linha 500j', 500);
assert(isValidDims(v6.dimensions), 'inputs absurdos → saida ainda valida');
assert(v6.warnings.length > 0, 'registra warnings');

const v7 = validateShippingDimensions({ height: -100, width: 0, length: -0.5, weight: -1 }, '', null);
// Mesmo sem contexto, o fallback generico (12,12,12,0.3) deve ser aplicado
assert(isValidDims(v7.dimensions), 'sem contexto + inputs absurdos → ainda retorna dimensoes validas');

console.log('\n=== TESTE 7: GARANTIA CRITICA - NUNCA retorna abaixo do minimo ===');
// Bateria de 50+ cenarios aleatorios
const scenarios = [
  { raw: { height: 0, width: 0, length: 0, weight: 0 }, title: '', yards: null },
  { raw: { height: null, width: null, length: null, weight: null }, title: 'Linha 100j', yards: 100 },
  { raw: { height: undefined, width: undefined, length: undefined, weight: undefined }, title: 'Carretilha', yards: null },
  { raw: { height: 'invalid', width: 'abc', length: null, weight: 'xyz' }, title: 'Linha 6000j', yards: 6000 },
  { raw: { height: -5, width: -10, length: -1, weight: -0.5 }, title: 'Linha 12000j', yards: 12000 },
  { raw: { height: 0.5, width: 0.99, length: 0, weight: 0.09 }, title: 'Linha 2000j', yards: 2000 },
  { raw: {}, title: '', yards: null },
  { raw: { height: Infinity, width: -Infinity, length: NaN, weight: Infinity }, title: 'x', yards: null },
];
for (const s of scenarios) {
  const r = validateShippingDimensions(s.raw, s.title, s.yards);
  assert(isValidDims(r.dimensions), `cenario ${JSON.stringify(s.raw).slice(0, 50)}... → saida valida`);
  assert(r.errors.length === 0, `cenario ${JSON.stringify(s.raw).slice(0, 50)}... → sem errors finais`);
}

console.log(`\n=== RESUMO ===\nPassou: ${passed}\nFalhou: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
