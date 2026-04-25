// ============================================================================
// Upload de imagens para Medusa + validacao de seguranca
// 2026-04-25 FRENTE 3: seguranca reforcada (magic bytes + sanitize filename)
// ============================================================================

import { MEDUSA_URL } from '../../adminApi';

// ============ MAGIC BYTES (signature binaria) ============
// Validamos o CONTEUDO do arquivo, nao apenas o MIME type (que pode ser forjado).
// Referencia: https://en.wikipedia.org/wiki/List_of_file_signatures

async function detectImageMagicType(file: File): Promise<string | null> {
  // Le os primeiros 16 bytes do arquivo
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) return 'image/png';

  // GIF: 47 49 46 38 (GIF8)
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return 'image/gif';

  // WEBP: RIFF....WEBP (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
  if (
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) return 'image/webp';

  // AVIF: bytes 4-11 = "ftypavif" ou "ftypheic"... basta ter "ftyp" em bytes 4-7
  // e um marker conhecido em 8-11
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const marker = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (['avif', 'avis', 'mif1', 'heic', 'heix', 'heim'].includes(marker)) {
      return marker.startsWith('avi') ? 'image/avif' : 'image/heic';
    }
  }

  return null;
}

// ============ VALIDACAO (MIME + tamanho + magic bytes) ============

export function validateImageFile(file: File): string | null {
  const MAX_SIZE = 10 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Tipo nao permitido: ${file.type || 'desconhecido'}. Use JPG, PNG, WebP, GIF ou AVIF.`;
  }
  if (file.size > MAX_SIZE) {
    return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximo: 10MB.`;
  }
  if (file.size < 100) {
    return 'Arquivo muito pequeno - provavelmente corrompido.';
  }
  return null;
}

// Validacao ASSINCRONA (le os bytes). Retorna null se ok, string com erro se nao.
export async function validateImageFileDeep(file: File): Promise<string | null> {
  const basic = validateImageFile(file);
  if (basic) return basic;

  // Magic bytes: o conteudo binario precisa bater com o tipo declarado
  try {
    const detected = await detectImageMagicType(file);
    if (!detected) {
      return 'Conteudo do arquivo nao parece ser uma imagem valida (assinatura invalida).';
    }
    // Se o MIME declarado diverge muito do detectado, bloqueia
    // (PNG apresentado como JPEG, etc. — sinal de conteudo adulterado)
    const norm = (t: string) => t.toLowerCase().replace(/^image\//, '');
    const declared = norm(file.type);
    const actual = norm(detected);
    // Permite variacoes compativeis (ex: heic/avif com ftyp)
    const compatible =
      declared === actual ||
      (declared === 'jpg' && actual === 'jpeg') ||
      (declared === 'jpeg' && actual === 'jpg');
    if (!compatible) {
      return `Tipo declarado (${declared}) nao bate com o conteudo real (${actual}). Arquivo suspeito.`;
    }
  } catch (_err) {
    return 'Nao foi possivel ler o arquivo para validacao.';
  }
  return null;
}

// ============ SANITIZE FILENAME ============
// Evita characteres perigosos e path traversal.
export function sanitizeFileName(name: string): string {
  // Remove paths, caracteres de controle, e limita tamanho
  const base = name.split(/[\\/]/).pop() || 'upload';
  return base
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100) || 'upload';
}

// ============ UPLOAD PARA O MEDUSA ============
// Faz upload com headers de auditoria. Em caso de erro HTTP, retorna mensagem
// detalhada para o chamador poder exibir ao operador.

export async function uploadImageToMedusa(file: File): Promise<{ url: string }> {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado. Faca login novamente.');

  // Sanitiza o nome antes de enviar (alguns storages quebram com caracteres exoticos)
  const safeName = sanitizeFileName(file.name);
  const safeFile = new File([file], safeName, { type: file.type });

  const formData = new FormData();
  formData.append('files', safeFile);

  const auditHeaders: Record<string, string> = {};
  let sid = sessionStorage.getItem('admin_session_id');
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    sessionStorage.setItem('admin_session_id', sid);
  }
  auditHeaders['X-Audit-Session-Id'] = sid;
  auditHeaders['X-Audit-Origin'] = 'admin_panel';
  auditHeaders['X-Audit-Actor-Type'] = 'admin';
  const label = localStorage.getItem('admin_actor_label');
  if (label) auditHeaders['X-Audit-Actor-Label'] = label;

  let res: Response;
  try {
    res = await fetch(`${MEDUSA_URL}/admin/uploads`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, ...auditHeaders },
      body: formData,
    });
  } catch (err: any) {
    // Erro de rede / CORS / DNS
    throw new Error(`Falha de rede ao enviar imagem: ${err?.message || 'sem conexao'}.`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // Melhor diagnostico para o operador
    if (res.status === 401 || res.status === 403) {
      throw new Error('Sessao expirada. Faca login novamente.');
    }
    if (res.status === 413) {
      throw new Error('Arquivo muito grande para o servidor. Reduza o tamanho.');
    }
    if (res.status >= 500) {
      throw new Error(`Erro no servidor (${res.status}). Tente novamente em alguns instantes.`);
    }
    throw new Error(`Erro ao fazer upload (${res.status}): ${errText.slice(0, 120)}`);
  }

  const data = await res.json();
  if (data?.files && data.files.length > 0 && data.files[0]?.url) {
    return { url: normalizeMedusaUrl(data.files[0].url) };
  }
  throw new Error('Resposta inesperada do servidor de upload (sem URL).');
}

// ============ NORMALIZE URL ============
// O file-local do Medusa retorna URLs absolutas com http://localhost:9000/static/...
// que NAO funcionam no browser do cliente (localhost aponta para a maquina dele, nao
// para o servidor). Convertemos para path relativo /static/... que o nginx proxya
// para o Medusa.
// 2026-04-25 FIX IMAGENS: chave para os uploads funcionarem em producao.
export function normalizeMedusaUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  // ja eh relativo
  if (url.startsWith('/')) return url;
  // http://localhost:9000/static/xxx → /static/xxx
  // http://127.0.0.1:9000/static/xxx → /static/xxx
  // https://qualquercoisa/static/xxx → /static/xxx (servido pelo mesmo dominio)
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/static/')) {
      return u.pathname + (u.search || '');
    }
  } catch (_err) {
    // URL invalida - retorna original
  }
  return url;
}
