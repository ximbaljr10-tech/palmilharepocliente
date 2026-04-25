// ============================================================================
// TESTE DE ROTAS - Verificar Coming Soon parcial
// 2026-04-25 - Rotas liberadas: /store/catalogo, /store/cart, /store/checkout, /store/product/:id
// Rotas bloqueadas: / e /store (puro)
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

let passed = 0, failed = 0;
const assert = (cond, label) => {
  if (cond) { passed++; console.log(`  ok    ${label}`); }
  else       { failed++; console.error(`  FAIL  ${label}`); }
};

console.log('\n=== TESTE: Rotas publicas ===');

// Raiz deve ir para ComingSoon
assert(
  /path="\/"\s+element=\{<ComingSoon\s*\/>/.test(APP),
  '/ → ComingSoon (bloqueado)'
);

// /store/* → StoreLayout
assert(
  /path="\/store\/\*"\s+element=\{<StoreLayout\s*\/>/.test(APP),
  '/store/* → StoreLayout (gerencia subrotas)'
);

// Fallback /* → ComingSoon
assert(
  /path="\*"\s+element=\{<ComingSoon\s*\/>/.test(APP),
  'rotas desconhecidas → ComingSoon'
);

// StoreLayout: index deve ser ComingSoon (bloqueia /store puro)
const STORE_LAYOUT_BLOCK = APP.match(/function StoreLayout\(\)[\s\S]*?<\/div>\s*\);\s*\}/);
assert(STORE_LAYOUT_BLOCK !== null, 'StoreLayout encontrado no App.tsx');
if (STORE_LAYOUT_BLOCK) {
  const layoutCode = STORE_LAYOUT_BLOCK[0];
  // index dentro do StoreLayout deve apontar para ComingSoon
  assert(
    /<Route\s+index\s+element=\{<ComingSoon/.test(layoutCode),
    '/store (index) → ComingSoon (mantem bloqueio do /store puro)'
  );

  // Rotas LIBERADAS que devem existir:
  assert(
    /path="catalogo"\s+element=\{<Home/.test(layoutCode),
    '/store/catalogo → Home (LIBERADO para teste)'
  );
  assert(
    /path="product\/:id"\s+element=\{<ProductDetail/.test(layoutCode),
    '/store/product/:id → ProductDetail (LIBERADO)'
  );
  assert(
    /path="cart"\s+element=\{<Cart/.test(layoutCode),
    '/store/cart → Cart (LIBERADO)'
  );
  assert(
    /path="checkout"\s+element=\{<Checkout/.test(layoutCode),
    '/store/checkout → Checkout (LIBERADO)'
  );

  // 2026-04-25 v2: Rotas institucionais agora LIBERADAS (apenas / e /store bloqueados)
  const liberatedPatterns = [
    { path: 'sobre', comp: 'Sobre' },
    { path: 'contato', comp: 'Contato' },
    { path: 'politica-privacidade', comp: 'PoliticaPrivacidade' },
    { path: 'termos-uso', comp: 'TermosUso' },
    { path: 'blog', comp: 'BlogList' },
  ];
  for (const { path, comp } of liberatedPatterns) {
    const rx = new RegExp(`path="${path}"\\s+element=\\{<${comp}`);
    assert(rx.test(layoutCode), `/store/${path} → ${comp} (LIBERADO)`);
  }

  // Admin continua funcionando
  assert(
    /path="\/store\/admin"\s+element=\{<AdminLayout/.test(APP),
    'Admin /store/admin continua acessivel (com rotas filhas)'
  );
}

console.log(`\n=== RESUMO ===\nPassou: ${passed}\nFalhou: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
