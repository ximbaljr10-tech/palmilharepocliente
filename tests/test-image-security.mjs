// ============================================================================
// TESTES DE SEGURANCA DE UPLOAD DE IMAGENS
// 2026-04-25 FRENTE 3 - Testa validacao de magic bytes e sanitize
// ============================================================================

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src', 'admin', 'products', 'utils', 'upload.ts');
const OUT_DIR = join(__dirname, '_tmp');
const SRC_COPY = join(OUT_DIR, 'upload.ts');
const OUT = join(OUT_DIR, 'upload.js');
mkdirSync(OUT_DIR, { recursive: true });

// Faz uma copia do upload.ts substituindo o import do adminApi por uma constante local
let src = readFileSync(SRC, 'utf8');
src = src.replace(
  /import\s*\{\s*MEDUSA_URL\s*\}\s*from\s*['"][^'"]+['"];?/,
  `const MEDUSA_URL = "http://localhost:9000";`
);
writeFileSync(SRC_COPY, src);

execSync(
  `npx esbuild ${SRC_COPY} --bundle --format=esm --outfile=${OUT} --platform=neutral --loader:.ts=ts`,
  { stdio: 'inherit' }
);

const mod = await import(OUT);
const { validateImageFile, validateImageFileDeep, sanitizeFileName } = mod;

let passed = 0, failed = 0;
const assert = (cond, label) => {
  if (cond) { passed++; console.log(`  ok    ${label}`); }
  else       { failed++; console.error(`  FAIL  ${label}`); }
};

function makeFile(bytes, name, type) {
  const u8 = new Uint8Array(bytes);
  return new File([u8], name, { type });
}

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
const PNG_HEADER  = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_HEADER  = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

const pad = (bytes, total) => [...bytes, ...new Array(Math.max(0, total - bytes.length)).fill(0)];

console.log('\n=== TESTE: validateImageFile (MIME + tamanho) ===');
assert(validateImageFile(makeFile(pad(JPEG_HEADER, 200), 'ok.jpg', 'image/jpeg')) === null, 'JPEG valido passa');
assert(typeof validateImageFile(makeFile(pad(JPEG_HEADER, 200), 'x.exe', 'application/exe')) === 'string', 'MIME nao-imagem rejeita');
assert(typeof validateImageFile(makeFile([0xff], 'tiny.jpg', 'image/jpeg')) === 'string', 'arquivo <100 bytes rejeita');

console.log('\n=== TESTE: validateImageFileDeep (magic bytes) ===');
const okJpeg = await validateImageFileDeep(makeFile(pad(JPEG_HEADER, 200), 'img.jpg', 'image/jpeg'));
assert(okJpeg === null, 'JPEG com magic bytes corretos passa');

const okPng = await validateImageFileDeep(makeFile(pad(PNG_HEADER, 200), 'img.png', 'image/png'));
assert(okPng === null, 'PNG com magic bytes corretos passa');

const okGif = await validateImageFileDeep(makeFile(pad(GIF_HEADER, 200), 'img.gif', 'image/gif'));
assert(okGif === null, 'GIF com magic bytes corretos passa');

const okWebp = await validateImageFileDeep(makeFile(pad(WEBP_HEADER, 200), 'img.webp', 'image/webp'));
assert(okWebp === null, 'WEBP com magic bytes corretos passa');

// ATAQUE: script PHP/HTML disfarcado de JPEG
const phpPayload = Array.from('<?php system($_GET["cmd"]); ?>').map(c => c.charCodeAt(0));
const badScript = await validateImageFileDeep(makeFile(pad(phpPayload, 200), 'evil.jpg', 'image/jpeg'));
assert(typeof badScript === 'string', 'script PHP disfarcado de JPEG → REJEITADO (seguranca)');

// ATAQUE: HTML
const htmlPayload = Array.from('<html><script>alert(1)</script>').map(c => c.charCodeAt(0));
const badHtml = await validateImageFileDeep(makeFile(pad(htmlPayload, 200), 'evil.png', 'image/png'));
assert(typeof badHtml === 'string', 'HTML disfarcado de PNG → REJEITADO');

// ATAQUE: PNG com MIME JPEG (mismatch)
const mismatch = await validateImageFileDeep(makeFile(pad(PNG_HEADER, 200), 'wrong.jpg', 'image/jpeg'));
assert(typeof mismatch === 'string', 'magic bytes PNG com MIME JPEG → REJEITADO (tipo divergente)');

console.log('\n=== TESTE: sanitizeFileName ===');
assert(sanitizeFileName('normal.jpg') === 'normal.jpg', 'nome comum mantido');
assert(sanitizeFileName('foto 01.JPG') === 'foto_01.JPG', 'espacos viram _');
assert(sanitizeFileName('../../etc/passwd') === 'passwd', 'path traversal removido');
assert(sanitizeFileName('file;rm -rf /.jpg').includes(';') === false, 'caracteres especiais removidos');
assert(sanitizeFileName('C:\\Windows\\system.dll') === 'system.dll', 'path Windows removido');
assert(sanitizeFileName('').length > 0, 'string vazia retorna fallback');
assert(sanitizeFileName('a'.repeat(200)).length <= 100, 'limita a 100 chars');

console.log(`\n=== RESUMO ===\nPassou: ${passed}\nFalhou: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
