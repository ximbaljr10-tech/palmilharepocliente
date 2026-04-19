// ============================================================================
// Upload de imagens para Medusa + validação
// ============================================================================

import { MEDUSA_URL } from '../../adminApi';

export async function uploadImageToMedusa(file: File): Promise<{ url: string }> {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado');

  const formData = new FormData();
  formData.append('files', file);

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

  const res = await fetch(`${MEDUSA_URL}/admin/uploads`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, ...auditHeaders },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Erro ao fazer upload: ${res.status} ${errText.slice(0, 100)}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return { url: data.files[0].url };
  }
  throw new Error('Resposta inesperada do servidor de upload');
}

export function validateImageFile(file: File): string | null {
  const MAX_SIZE = 10 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Tipo nao permitido: ${file.type}. Use JPG, PNG, WebP, GIF ou AVIF.`;
  }
  if (file.size > MAX_SIZE) {
    return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximo: 10MB.`;
  }
  return null;
}
