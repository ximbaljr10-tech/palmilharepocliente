// ============ ADMIN API UTILITIES ============
// Shared across all admin pages

export const MEDUSA_URL = (() => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const port = window.location.port;
    if (port === '' || port === '80' || port === '443') {
      return `${window.location.protocol}//${host}`;
    }
    if (host === 'localhost' || host === '127.0.0.1') {
      return "http://localhost:9000";
    }
    return `http://${host}:9000`;
  }
  return "http://localhost:9000";
})();

export const PUBLISHABLE_KEY = "pk_b54130691636a84f3172ebbc1d0ac4d9b14bc2430db612d289a055e341b7b706";
export const REGION_ID = "reg_01KK3F27J2GGKVBAPK30N9VBBH";

export async function adminFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado');

  const res = await fetch(`${MEDUSA_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers as Record<string, string> || {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  // Robust error handling for non-JSON responses
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Erro HTTP ${res.status}: ${text.slice(0, 200) || 'Resposta invalida do servidor'}`);
    }
    // Some endpoints might return empty 200/204
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return { success: true };
    }
  }

  const data = await res.json().catch(() => null);
  
  if (!res.ok && data) {
    throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
  }
  
  if (!res.ok) {
    throw new Error(`Erro HTTP ${res.status}`);
  }

  return data || { success: true };
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('admin_token');
}

export function getToken(): string | null {
  return localStorage.getItem('admin_token');
}

export function logout() {
  localStorage.removeItem('admin_token');
}

// ============ ORDER STATUS CONFIG ============
import React from 'react';
import { Clock, CreditCard, BoxIcon, Truck, CheckCircle2, XCircle, Package } from 'lucide-react';

export const STATUS_MAP: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode; dot: string; borderColor: string }> = {
  awaiting_payment: {
    bg: 'bg-amber-50', text: 'text-amber-700', label: 'Aguardando Pagamento',
    icon: React.createElement(Clock, { size: 16, className: 'text-amber-600' }),
    dot: 'bg-amber-500', borderColor: 'border-amber-200'
  },
  paid: {
    bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Pago',
    icon: React.createElement(CreditCard, { size: 16, className: 'text-emerald-600' }),
    dot: 'bg-emerald-500', borderColor: 'border-emerald-200'
  },
  preparing: {
    bg: 'bg-purple-50', text: 'text-purple-700', label: 'Preparando',
    icon: React.createElement(BoxIcon, { size: 16, className: 'text-purple-600' }),
    dot: 'bg-purple-500', borderColor: 'border-purple-200'
  },
  shipped: {
    bg: 'bg-blue-50', text: 'text-blue-700', label: 'Enviado',
    icon: React.createElement(Truck, { size: 16, className: 'text-blue-600' }),
    dot: 'bg-blue-500', borderColor: 'border-blue-200'
  },
  delivered: {
    bg: 'bg-green-50', text: 'text-green-700', label: 'Entregue',
    icon: React.createElement(CheckCircle2, { size: 16, className: 'text-green-600' }),
    dot: 'bg-green-500', borderColor: 'border-green-200'
  },
  cancelled: {
    bg: 'bg-red-50', text: 'text-red-700', label: 'Cancelado',
    icon: React.createElement(XCircle, { size: 16, className: 'text-red-600' }),
    dot: 'bg-red-500', borderColor: 'border-red-200'
  },
};

export function getStatusConfig(status: string) {
  return STATUS_MAP[status] || {
    bg: 'bg-zinc-50', text: 'text-zinc-700', label: status,
    icon: React.createElement(Package, { size: 16 }),
    dot: 'bg-zinc-400', borderColor: 'border-zinc-200'
  };
}

// ============ ARCHIVE HELPERS ============
// Archive is now persisted via backend (order metadata)
// We use PUT /admin/pedidos with action: 'archive' / 'unarchive'

export async function archiveOrderBackend(orderId: number, medusa_order_id?: string): Promise<boolean> {
  try {
    const body: any = { orderId, action: 'archive' };
    if (medusa_order_id) body.medusa_order_id = medusa_order_id;
    const result = await adminFetch('/admin/pedidos', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return !!result.success || !!result.order;
  } catch (err) {
    console.error('Erro ao arquivar pedido:', err);
    // Fallback: try metadata approach
    try {
      const fallbackBody: any = { orderId, metadata: { archived: true } };
      if (medusa_order_id) fallbackBody.medusa_order_id = medusa_order_id;
      const result = await adminFetch('/admin/pedidos', {
        method: 'PUT',
        body: JSON.stringify(fallbackBody),
      });
      return !!result.success || !!result.order;
    } catch {
      return false;
    }
  }
}

export async function unarchiveOrderBackend(orderId: number, medusa_order_id?: string): Promise<boolean> {
  try {
    const body: any = { orderId, action: 'unarchive' };
    if (medusa_order_id) body.medusa_order_id = medusa_order_id;
    const result = await adminFetch('/admin/pedidos', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return !!result.success || !!result.order;
  } catch (err) {
    console.error('Erro ao desarquivar pedido:', err);
    try {
      const fallbackBody2: any = { orderId, metadata: { archived: false } };
      if (medusa_order_id) fallbackBody2.medusa_order_id = medusa_order_id;
      const result = await adminFetch('/admin/pedidos', {
        method: 'PUT',
        body: JSON.stringify(fallbackBody2),
      });
      return !!result.success || !!result.order;
    } catch {
      return false;
    }
  }
}

// ============ OBSERVATION HELPERS ============
export async function saveOrderObservation(orderId: number, observation: string, medusa_order_id?: string): Promise<boolean> {
  try {
    const body: any = { orderId, action: 'save_observation', observation };
    if (medusa_order_id) body.medusa_order_id = medusa_order_id;
    const result = await adminFetch('/admin/pedidos', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return !!result.success;
  } catch (err) {
    console.error('Erro ao salvar observacao:', err);
    return false;
  }
}

// ============ BATCH SUPERFRETE SYNC ============
export async function batchSyncSuperfrete(): Promise<{
  success: boolean;
  total: number;
  updated: number;
  errors: number;
  results: any[];
  error?: string;
}> {
  try {
    const result = await adminFetch('/admin/pedidos', {
      method: 'PUT',
      body: JSON.stringify({ orderId: 0, action: 'batch_sync_superfrete' }),
    });
    return result;
  } catch (err: any) {
    console.error('Erro no sync global:', err);
    return { success: false, total: 0, updated: 0, errors: 0, results: [], error: err.message };
  }
}

// ============ BATCH REVERT TO PAID ============
export async function batchRevertToPaid(orderIds: string[]): Promise<{
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: any[];
  error?: string;
}> {
  try {
    const result = await adminFetch('/admin/pedidos', {
      method: 'PUT',
      body: JSON.stringify({ orderId: 0, action: 'batch_revert_to_paid', order_ids: orderIds }),
    });
    return result;
  } catch (err: any) {
    console.error('Erro ao reverter pedidos:', err);
    return { success: false, total: 0, succeeded: 0, failed: 0, results: [], error: err.message };
  }
}

// ============ BATCH FINALIZE AND LABEL (sequential) ============
export async function batchFinalizeAndLabel(orderIds: string[]): Promise<{
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: any[];
  error?: string;
}> {
  try {
    const result = await adminFetch('/admin/pedidos', {
      method: 'PUT',
      body: JSON.stringify({ orderId: 0, action: 'batch_finalize_and_label', order_ids: orderIds }),
    });
    return result;
  } catch (err: any) {
    console.error('Erro ao finalizar pedidos:', err);
    return { success: false, total: 0, succeeded: 0, failed: 0, results: [], error: err.message };
  }
}

// Check if order is archived (from order metadata or a dedicated field)
export function isOrderArchived(order: any): boolean {
  // Check metadata.archived flag
  if (order.metadata?.archived === true || order.metadata?.archived === 'true') return true;
  // Check dedicated archived field
  if (order.archived === true) return true;
  // Check status
  if (order.status === 'archived') return true;
  return false;
}

// ============ DATE HELPERS ============
export function formatCurrency(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR');
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

// Get date ranges for dashboard periods
export function getDateRange(period: 'today' | 'week' | 'month'): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (period) {
    case 'today':
      break;
    case 'week': {
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      start.setDate(start.getDate() - diff);
      break;
    }
    case 'month':
      start.setDate(1);
      break;
  }

  return { start, end };
}

export function isWithinRange(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

export function isWithinHours(dateStr: string, hours: number): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return diff <= hours * 60 * 60 * 1000;
}
