// ============================================================================
// TESTE DE ROTAS - Site 100% no ar (2026-04-25 v3)
// ----------------------------------------------------------------------------
// ComingSoon foi DESATIVADO. Tudo aponta para a homepage real (StoreLanding).
//   - "/"        → RedirectToStore (Navigate to="/store")
//   - "/store"   → StoreLanding (homepage real)
//   - "/store/*" → StoreLayout (catalogo, cart, checkout, blog, etc.)
//   - "*"        → RedirectToStore (qualquer rota desconhecida vai pra home)
// Admin "/store/admin/*" continua intacto.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

let passed = 0, failed = 0;
const assert = (cond, label) => {
  if (cond) { passed++; console.log(`  ok    ${label}`); }
  else       { failed++; console.error(`  FAIL  ${label}`); }
};

console.log('\n=== TESTE: Rotas publicas (site no ar) ===');

// Raiz deve redirecionar para /store (RedirectToStore = Navigate)
assert(
  /path="\/"\s+element=\{<RedirectToStore\s*\/>/.test(APP),
  '/ → RedirectToStore (site no ar, redireciona pra home)'
);

// /store/* → StoreLayout
assert(
  /path="\/store\/\*"\s+element=\{<StoreLayout\s*\/>/.test(APP),
  '/store/* → StoreLayout (gerencia subrotas)'
);

// Fallback /* → RedirectToStore
assert(
  /path="\*"\s+element=\{<RedirectToStore\s*\/>/.test(APP),
  'rotas desconhecidas → RedirectToStore (volta pra home)'
);

// Helper RedirectToStore precisa existir e usar <Navigate>
assert(
  /function\s+RedirectToStore\s*\([^)]*\)\s*\{[\s\S]*?<Navigate\s+to="\/store"\s+replace\s*\/>/.test(APP),
  'RedirectToStore implementado com <Navigate to="/store" replace />'
);

// StoreLayout: index deve ser StoreLanding (homepage real)
const STORE_LAYOUT_BLOCK = APP.match(/function StoreLayout\(\)[\s\S]*?<\/div>\s*\);\s*\}/);
assert(STORE_LAYOUT_BLOCK !== null, 'StoreLayout encontrado no App.tsx');

if (STORE_LAYOUT_BLOCK) {
  const layoutCode = STORE_LAYOUT_BLOCK[0];

  // index dentro do StoreLayout = StoreLanding (homepage real)
  assert(
    /<Route\s+index\s+element=\{<StoreLanding/.test(layoutCode),
    '/store (index) → StoreLanding (homepage real, ComingSoon desativado)'
  );

  // Rotas LIBERADAS:
  assert(
    /path="catalogo"\s+element=\{<Home/.test(layoutCode),
    '/store/catalogo → Home'
  );
  assert(
    /path="product\/:id"\s+element=\{<ProductDetail/.test(layoutCode),
    '/store/product/:id → ProductDetail'
  );
  assert(
    /path="cart"\s+element=\{<Cart/.test(layoutCode),
    '/store/cart → Cart'
  );
  assert(
    /path="checkout"\s+element=\{<Checkout/.test(layoutCode),
    '/store/checkout → Checkout'
  );

  // Rotas institucionais
  const liberatedPatterns = [
    { path: 'sobre', comp: 'Sobre' },
    { path: 'contato', comp: 'Contato' },
    { path: 'politica-privacidade', comp: 'PoliticaPrivacidade' },
    { path: 'termos-uso', comp: 'TermosUso' },
    { path: 'blog', comp: 'BlogList' },
  ];
  for (const { path, comp } of liberatedPatterns) {
    const rx = new RegExp(`path="${path}"\\s+element=\\{<${comp}`);
    assert(rx.test(layoutCode), `/store/${path} → ${comp}`);
  }

  // Subroutas desconhecidas dentro de /store/* voltam para StoreLanding
  assert(
    /<Route\s+path="\*"\s+element=\{<StoreLanding/.test(layoutCode),
    '/store/(desconhecida) → StoreLanding (sem ComingSoon)'
  );
}

// Admin continua funcionando
assert(
  /path="\/store\/admin"\s+element=\{<AdminLayout/.test(APP),
  'Admin /store/admin continua acessivel (com rotas filhas)'
);

console.log(`\n=== RESUMO ===\nPassou: ${passed}\nFalhou: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
