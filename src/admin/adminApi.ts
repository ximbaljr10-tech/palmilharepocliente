// ============ ADMIN API UTILITIES ============
// Shared across all admin pages

// ============ AUDIT: SESSION + OPERATOR IDENTIFICATION ============
// Every admin session gets a unique session_id.
// The operator (actor_label) is chosen by the user on first access.
// Both are sent as headers on every admin API call for audit trail.

function getOrCreateSessionId(): string {
  let sid = sessionStorage.getItem('admin_session_id');
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    sessionStorage.setItem('admin_session_id', sid);
  }
  return sid;
}

export function getSessionId(): string {
  return getOrCreateSessionId();
}

export function getActorLabel(): string | null {
  return localStorage.getItem('admin_actor_label');
}

export function setActorLabel(label: string): void {
  localStorage.setItem('admin_actor_label', label);
}

export function clearActorLabel(): void {
  localStorage.removeItem('admin_actor_label');
}

export function needsActorLabel(): boolean {
  return !localStorage.getItem('admin_actor_label');
}

// Build audit headers for every admin API call
function getAuditHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  headers['X-Audit-Session-Id'] = getOrCreateSessionId();
  headers['X-Audit-Origin'] = 'admin_panel';
  headers['X-Audit-Actor-Type'] = 'admin';
  const label = getActorLabel();
  if (label) {
    headers['X-Audit-Actor-Label'] = label;
  }
  return headers;
}

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
      ...getAuditHeaders(),
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

// ============ BATCH FINALIZE AND LABEL (sequential, real-time per-item) ============
// Processes orders ONE BY ONE from the frontend, calling the single-order
// finalize_and_label endpoint. This gives the frontend true real-time
// progress per order instead of waiting for one big batch request.
export async function batchFinalizeAndLabelSequential(
  orderIds: string[],
  onProgress: (update: {
    orderId: string;
    step: 'generating' | 'paying' | 'completed' | 'error';
    error?: string;
    index: number;
  }) => void,
): Promise<{
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: any[];
}> {
  const results: any[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < orderIds.length; i++) {
    const oid = orderIds[i];
    
    // Notify: generating
    onProgress({ orderId: oid, step: 'generating', index: i });
    
    try {
      // Call the SINGLE ORDER finalize_and_label endpoint
      const result = await adminFetch('/admin/pedidos', {
        method: 'PUT',
        body: JSON.stringify({
          orderId: 0,
          medusa_order_id: oid,
          action: 'finalize_and_label',
        }),
      });

      if (result.success) {
        // Notify: completed
        onProgress({ orderId: oid, step: 'completed', index: i });
        succeeded++;
        results.push({ id: result.order?.id, medusa_id: oid, success: true });
      } else {
        onProgress({ orderId: oid, step: 'error', error: result.error || 'Erro desconhecido', index: i });
        failed++;
        results.push({ id: oid, medusa_id: oid, success: false, error: result.error || 'Erro desconhecido' });
      }
    } catch (err: any) {
      onProgress({ orderId: oid, step: 'error', error: err.message || 'Erro de conexao', index: i });
      failed++;
      results.push({ id: oid, medusa_id: oid, success: false, error: err.message });
    }

    // 2-second delay between orders to avoid SuperFrete rate limits
    if (i < orderIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return { success: failed === 0, total: orderIds.length, succeeded, failed, results };
}

// Legacy wrapper for backward compat (single batch request — no real-time)
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

// ============ CPF VALIDATION ============
// Real Brazilian CPF validation with digit verification
export function validateCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  
  // Reject known invalid patterns (all same digit)
  if (/^(\d)\1{10}$/.test(cleaned)) return false;
  
  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cleaned.charAt(9))) return false;
  
  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cleaned.charAt(10))) return false;
  
  return true;
}

// Format CPF for display: 000.000.000-00
export function formatCPF(value: string): string {
  const cleaned = value.replace(/\D/g, '').slice(0, 11);
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
  if (cleaned.length <= 9) return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
  return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
}

// ============ CUSTOMER DATA EDIT (Admin) ============
export interface CustomerEditData {
  customer_name?: string;
  customer_cpf?: string;
  address_components?: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    cep?: string;
  };
}

// ============ PRODUCT SEARCH (for swap) ============
export async function searchProducts(query: string, limit = 30): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: query.trim(),
      limit: String(limit),
      status: 'published',
    });
    console.log(`[searchProducts] Searching for: "${query.trim()}"`);
    const result = await adminFetch(`/admin/produtos-custom?${params.toString()}`);
    const products = result.products || [];
    console.log(`[searchProducts] Backend returned ${products.length} products for "${query.trim()}"`);
    return products;
  } catch (err) {
    console.error('Erro ao buscar produtos:', err);
    return [];
  }
}

// ============ SWAP ITEM (Product Exchange) ============
export interface SwapItemPayload {
  orderId: number;
  medusa_order_id: string;
  old_item_index: number;
  new_product_id: string;
  new_variant_id: string;
  new_product_title: string;
  new_product_price: number; // in REAIS
  new_product_image: string;
  new_product_shipping: {
    height: number;
    width: number;
    length: number;
    weight: number;
  };
  quantity: number;
}

export async function swapOrderItem(payload: SwapItemPayload): Promise<{
  success: boolean;
  error?: string;
  swap?: any;
  order?: any;
}> {
  try {
    const result = await adminFetch('/admin/pedidos', {
      method: 'PUT',
      body: JSON.stringify({
        ...payload,
        action: 'swap_item',
      }),
    });
    return result;
  } catch (err: any) {
    console.error('Erro ao trocar produto:', err);
    return { success: false, error: err.message };
  }
}

// Resolve (consolidate) a pending swap adjustment
export async function resolveSwapAdjustment(orderId: number, medusa_order_id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const result = await adminFetch('/admin/pedidos', {
      method: 'PUT',
      body: JSON.stringify({
        orderId,
        medusa_order_id,
        action: 'resolve_swap_adjustment',
      }),
    });
    return result;
  } catch (err: any) {
    console.error('Erro ao resolver ajuste:', err);
    return { success: false, error: err.message };
  }
}

// Check if order allows product swap
// BUSINESS RULE:
//   - Allowed: status is 'awaiting_payment' or 'paid'
//   - BLOCKED: if an ACTIVE label exists (superfrete_id set) OR active tracking exists
//   - NOT blocked by historical label data (e.g., label_generated_at from a cancelled label)
//   - Orders restored from cancelled->paid have old label data cleared but may retain
//     label_generated_at as historical; this must NOT block swaps.
export function canSwapItems(order: any): boolean {
  if (!order) return false;
  const status = order.status || order.custom_status || '';
  
  // Block by status: only allow swap in these early states
  const allowedStatuses = ['awaiting_payment', 'paid'];
  if (!allowedStatuses.includes(status)) return false;
  
  // Block if ACTIVE label/tracking exists (THE MAIN CRITERION)
  if (hasActiveLabelOrTracking(order)) return false;
  
  return true;
}

// Check if order has an ACTIVE shipping label or tracking code.
// This checks CURRENT logistic state, not historical data.
// An order that was cancelled and restored to paid will have superfrete_id=null
// but may still have label_generated_at from the old (now-cancelled) label.
// That historical data must NOT block swaps.
export function hasActiveLabelOrTracking(order: any): boolean {
  if (!order) return false;
  // Active SuperFrete label ID means a label currently exists
  if (order.superfrete_id) return true;
  // Active tracking code means shipment is in transit
  if (order.tracking_code) return true;
  // Active SuperFrete tracking
  if (order.superfrete_tracking) return true;
  // NOTE: label_generated_at is NOT checked here.
  // It is a historical timestamp that persists even after label cancellation and order restoration.
  // The active state is determined by superfrete_id (label exists) and tracking_code (shipment in transit).
  return false;
}

// Legacy alias for backward compatibility
export function hasLabelGenerated(order: any): boolean {
  return hasActiveLabelOrTracking(order);
}

// Get human-readable reason why swap is blocked
export function getSwapBlockedReason(order: any): string {
  if (!order) return 'Pedido nao encontrado';
  const status = order.status || order.custom_status || '';
  
  // First check ACTIVE label/tracking (primary blocking criterion)
  if (order.superfrete_id) return 'Etiqueta SuperFrete ativa para este pedido';
  if (order.tracking_code) return 'Ja existe codigo de rastreio ativo';
  if (order.superfrete_tracking) return 'Ja existe rastreio SuperFrete ativo';
  
  // Then check status
  if (['preparing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
    const labels: Record<string, string> = {
      preparing: 'em preparacao',
      shipped: 'enviado',
      delivered: 'entregue',
      cancelled: 'cancelado',
    };
    return `Pedido esta ${labels[status] || status}`;
  }
  
  return 'Troca nao permitida neste estado';
}

// Shipping dimensions by yards (mirrors backend logic)
export function getShippingByYards(yards: number | null, title: string): { height: number; width: number; length: number; weight: number } {
  if (title && /carretilha/i.test(title)) {
    return { height: 25, width: 33, length: 31, weight: 1.0 };
  }
  switch (yards) {
    case 50:   return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 100:  return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 200:  return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 500:  return { height: 12, width: 12, length: 19, weight: 0.4 };
    case 600:  return { height: 12, width: 18, length: 18, weight: 0.3 };
    case 1000: return { height: 15, width: 15, length: 18, weight: 0.5 };
    case 2000: return { height: 18, width: 18, length: 19, weight: 1.0 };
    case 3000: return { height: 18, width: 18, length: 27, weight: 1.0 };
    case 6000: return { height: 19, width: 19, length: 25, weight: 2.0 };
    case 12000: return { height: 21, width: 21, length: 30, weight: 3.0 };
    default:   return { height: 12, width: 12, length: 12, weight: 0.2 };
  }
}

// Extract yards from product title
export function extractYards(title: string): number | null {
  const match = title?.match(/(\d+)\s*(j|jds|jardas)\b/i);
  return match ? parseInt(match[1], 10) : null;
}

// Map Medusa admin product to a simpler format for swap UI
// IMPORTANT: In this system, prices are stored in REAIS (not centavos).
// Admin API returns variant.prices[].amount in reais (e.g., 45.4 = R$ 45,40)
export function mapAdminProduct(p: any): {
  id: string;
  title: string;
  price: number; // in REAIS (e.g., 45.4 = R$ 45,40)
  image_url: string;
  variant_id: string;
  yards: number | null;
  shipping: { height: number; width: number; length: number; weight: number };
  status: string;
} {
  const variant = p.variants?.[0];
  // Admin API returns prices in REAIS (e.g., 45.4, 140.3)
  const price = variant?.prices?.[0]?.amount || variant?.calculated_price?.calculated_amount || 0;
  
  const image = p.images?.[0]?.url || p.thumbnail || '';
  const meta = p.metadata || {};
  const yards = extractYards(p.title || '');
  const shipping = getShippingByYards(yards, p.title || '');

  return {
    id: p.id,
    title: p.title || '',
    price, // REAIS
    image_url: image,
    variant_id: variant?.id || '',
    yards,
    shipping: {
      height: meta.shipping_height || shipping.height,
      width: meta.shipping_width || shipping.width,
      length: meta.shipping_length || shipping.length,
      weight: meta.shipping_weight || shipping.weight,
    },
    status: p.status || 'draft',
  };
}

// ============ REMESSA (Shipment Batch) API ============

export interface Remessa {
  id: number;
  code: string;
  status: 'open' | 'closed' | 'cancelled';
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  order_count: number;
  order_ids: string[];
  order_display_ids: number[];
}

export interface OrderRemessaMap {
  [orderId: string]: {
    remessa_id: number;
    remessa_code: string;
    remessa_status: string;
    order_display_id: number;
  };
}

export async function fetchRemessas(): Promise<{ remessas: Remessa[]; orderRemessaMap: OrderRemessaMap }> {
  try {
    const result = await adminFetch('/admin/remessas');
    return {
      remessas: result.remessas || [],
      orderRemessaMap: result.orderRemessaMap || {},
    };
  } catch (err: any) {
    console.error('Erro ao carregar remessas:', err);
    return { remessas: [], orderRemessaMap: {} };
  }
}

export async function createRemessa(orderIds: string[], orderDisplayIds: number[], notes?: string): Promise<any> {
  return adminFetch('/admin/remessas', {
    method: 'POST',
    body: JSON.stringify({ action: 'create', order_ids: orderIds, order_display_ids: orderDisplayIds, notes: notes || '' }),
  });
}

export async function addOrdersToRemessa(remessaId: number, orderIds: string[], orderDisplayIds: number[]): Promise<any> {
  return adminFetch('/admin/remessas', {
    method: 'POST',
    body: JSON.stringify({ action: 'add_orders', remessa_id: remessaId, order_ids: orderIds, order_display_ids: orderDisplayIds }),
  });
}

export async function removeOrderFromRemessa(remessaId: number, orderId: string, orderDisplayId?: number): Promise<any> {
  return adminFetch('/admin/remessas', {
    method: 'POST',
    body: JSON.stringify({ action: 'remove_order', remessa_id: remessaId, order_id: orderId, order_display_id: orderDisplayId }),
  });
}

export async function undoRemessa(remessaId: number): Promise<any> {
  return adminFetch('/admin/remessas', {
    method: 'POST',
    body: JSON.stringify({ action: 'undo', remessa_id: remessaId }),
  });
}

export async function closeRemessa(remessaId: number): Promise<any> {
  return adminFetch('/admin/remessas', {
    method: 'POST',
    body: JSON.stringify({ action: 'close', remessa_id: remessaId }),
  });
}

export async function reopenRemessa(remessaId: number): Promise<any> {
  return adminFetch('/admin/remessas', {
    method: 'POST',
    body: JSON.stringify({ action: 'reopen', remessa_id: remessaId }),
  });
}

export async function logRemessaPdfExport(remessaId: number): Promise<any> {
  return adminFetch('/admin/remessas', {
    method: 'POST',
    body: JSON.stringify({ action: 'log_pdf_export', remessa_id: remessaId }),
  });
}

export async function logRemessaLabelExport(remessaId: number): Promise<any> {
  return adminFetch('/admin/remessas', {
    method: 'POST',
    body: JSON.stringify({ action: 'log_label_export', remessa_id: remessaId }),
  });
}

export async function getRemessaDetails(remessaId: number): Promise<any> {
  return adminFetch('/admin/remessas', {
    method: 'POST',
    body: JSON.stringify({ action: 'get_details', remessa_id: remessaId }),
  });
}

export async function updateOrderCustomerData(
  orderId: number,
  medusa_order_id: string,
  data: CustomerEditData,
): Promise<{ success: boolean; error?: string; order?: any }> {
  try {
    const body: any = {
      orderId,
      medusa_order_id,
      action: 'update_customer_data',
      ...data,
    };
    const result = await adminFetch('/admin/pedidos', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    // Return the full order data from the response so frontend can use it directly
    return { success: !!result.success, order: result.order || null };
  } catch (err: any) {
    console.error('Erro ao atualizar dados do cliente:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================
// LABELS v2 — Sistema desacoplado de etiquetas
// ============================================================
// Todos os helpers abaixo conversam SOMENTE com as rotas novas
// /admin/remessas/labels/*. Nunca alteram pedidos.
//
// Feature flag: localStorage['labels_v2_enabled'] (default '1')
//   - '1' → usa o fluxo novo (download local, sem redirect)
//   - '0' → usa o fluxo antigo (window.open em /admin/superfrete)
// ============================================================

export function isLabelsV2Enabled(): boolean {
  try {
    const v = localStorage.getItem('labels_v2_enabled');
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export type LabelJobStatus = {
  success: boolean;
  status: 'pending' | 'building' | 'ready' | 'error';
  progress_current: number;
  progress_total: number;
  ready: boolean;
  error: string | null;
  page_count?: number | null;
  size_bytes?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
  message: string;
};

// Dispara a geração em background. Responde rápido (202).
export async function buildRemessaLabels(remessaId: number): Promise<{
  success: boolean;
  accepted?: boolean;
  already_running?: boolean;
  message?: string;
  error?: string;
}> {
  return adminFetch('/admin/remessas/labels', {
    method: 'POST',
    body: JSON.stringify({ action: 'build', remessa_id: remessaId }),
  });
}

// Consulta o status/progresso do job.
export async function getRemessaLabelsStatus(remessaId: number): Promise<LabelJobStatus> {
  return adminFetch('/admin/remessas/labels', {
    method: 'POST',
    body: JSON.stringify({ action: 'status', remessa_id: remessaId }),
  });
}

// Marca o job como pendente (invalida cache). Usado ao add/remove pedido.
export async function invalidateRemessaLabels(remessaId: number): Promise<{
  success: boolean;
  invalidated?: boolean;
  message?: string;
}> {
  return adminFetch('/admin/remessas/labels', {
    method: 'POST',
    body: JSON.stringify({ action: 'invalidate', remessa_id: remessaId }),
  });
}

// Faz o download autenticado do PDF consolidado e dispara o download no browser.
// Nunca abre nova aba, nunca redireciona para SuperFrete.
export async function downloadRemessaLabelsPdf(
  remessaId: number,
  remessaCode: string,
): Promise<{ success: boolean; error?: string }> {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado');

  const url = `${MEDUSA_URL}/admin/remessas/labels/download?remessa_id=${encodeURIComponent(remessaId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...getAuditHeaders(),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    throw new Error('Sessao expirada. Faca login novamente.');
  }
  if (!res.ok) {
    let msg = `Erro HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data.error || data.message || msg;
    } catch {
      // ignore
    }
    return { success: false, error: msg };
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `etiquetas_${remessaCode || 'remessa'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    // Libera memória depois que o download começou
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }
  return { success: true };
}

// Download da etiqueta individual de um pedido (preparação p/ WhatsApp).
export async function downloadOrderLabelPdf(
  displayId: number | string,
  orderMedusaId?: string,
): Promise<{ success: boolean; error?: string }> {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado');

  const qs = orderMedusaId
    ? `order_id=${encodeURIComponent(orderMedusaId)}`
    : `display_id=${encodeURIComponent(String(displayId))}`;
  const url = `${MEDUSA_URL}/admin/remessas/labels/individual?${qs}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...getAuditHeaders(),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    throw new Error('Sessao expirada. Faca login novamente.');
  }
  if (!res.ok) {
    let msg = `Erro HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data.error || data.message || msg;
    } catch {}
    return { success: false, error: msg };
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `pedido_${displayId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }
  return { success: true };
}

// Helper de alto nível: dispara build se precisar, faz polling até pronto, baixa.
// Callbacks opcionais para UI mostrar progresso.
export async function ensureAndDownloadRemessaLabels(
  remessaId: number,
  remessaCode: string,
  onProgress?: (s: LabelJobStatus) => void,
  opts: { maxWaitMs?: number; pollMs?: number } = {},
): Promise<{ success: boolean; error?: string }> {
  const maxWaitMs = opts.maxWaitMs ?? 120_000; // 2min default — mesmo com 20 pedidos dá tempo
  const pollMs = opts.pollMs ?? 1500;

  // 1) Status atual
  let st = await getRemessaLabelsStatus(remessaId);
  if (onProgress) onProgress(st);

  // 2) Se não está pronto nem building, dispara build
  if (st.status !== 'ready' && st.status !== 'building') {
    const b = await buildRemessaLabels(remessaId);
    if (!b.success && !b.accepted) {
      return { success: false, error: b.error || b.message || 'Falha ao iniciar geração.' };
    }
    // Pequena espera antes do primeiro poll
    await new Promise(r => setTimeout(r, 400));
    st = await getRemessaLabelsStatus(remessaId);
    if (onProgress) onProgress(st);
  }

  // 3) Polling
  const startedAt = Date.now();
  while (st.status === 'building' || st.status === 'pending') {
    if (Date.now() - startedAt > maxWaitMs) {
      return { success: false, error: `Tempo esgotado (${Math.round(maxWaitMs/1000)}s). Tente novamente em instantes — o servidor pode estar ocupado.` };
    }
    await new Promise(r => setTimeout(r, pollMs));
    st = await getRemessaLabelsStatus(remessaId);
    if (onProgress) onProgress(st);
  }

  if (st.status === 'error') {
    return { success: false, error: st.error || 'Erro ao gerar etiquetas.' };
  }
  if (st.status !== 'ready') {
    return { success: false, error: `Estado inesperado: ${st.status}` };
  }

  // 4) Download
  return downloadRemessaLabelsPdf(remessaId, remessaCode);
}
