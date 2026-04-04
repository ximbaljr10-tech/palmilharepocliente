import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Package, Clock, CreditCard, BoxIcon, Truck, CheckCircle2, XCircle, Loader2, ChevronRight, ChevronDown, ChevronUp, MessageCircle, MoreVertical, FileText, Trash2, Download, X, Share2, Tag, Wallet, Printer, Search, Filter, Zap, Square, CheckSquare, AlertTriangle, FileDown, RotateCcw, Plus, Eye, Minus } from 'lucide-react';
import { adminFetch, isOrderArchived, getStatusConfig, formatCurrency, batchSyncSuperfrete, batchRevertToPaid, batchFinalizeAndLabel, batchFinalizeAndLabelSequential, fetchRemessas, createRemessa, addOrdersToRemessa, removeOrderFromRemessa, undoRemessa, closeRemessa, reopenRemessa, logRemessaPdfExport, logRemessaLabelExport, type Remessa, type OrderRemessaMap } from './adminApi';
import RemessaManagementOverlay from './RemessaOverlay';
import { LINE_COLORS } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STATUS_FILTERS = [
  { key: 'awaiting_payment', label: 'Aguardando', shortLabel: 'Aguard.', icon: Clock, color: 'amber' },
  { key: 'paid', label: 'Pagos', shortLabel: 'Pagos', icon: CreditCard, color: 'emerald' },
  { key: 'preparing', label: 'Preparando', shortLabel: 'Prepar.', icon: BoxIcon, color: 'purple' },
  { key: 'shipped', label: 'Enviados', shortLabel: 'Enviad.', icon: Truck, color: 'blue' },
  { key: 'delivered', label: 'Entregues', shortLabel: 'Entreg.', icon: CheckCircle2, color: 'green' },
  { key: 'cancelled', label: 'Cancelados', shortLabel: 'Cancel.', icon: XCircle, color: 'red' },
];

const VALID_FILTER_KEYS = STATUS_FILTERS.map(s => s.key);

const colorMap: Record<string, { bg: string; bgActive: string; text: string; textActive: string; border: string; borderActive: string; dot: string }> = {
  amber:   { bg: 'bg-white', bgActive: 'bg-amber-50', text: 'text-zinc-600', textActive: 'text-amber-700', border: 'border-zinc-200', borderActive: 'border-amber-300', dot: 'bg-amber-500' },
  emerald: { bg: 'bg-white', bgActive: 'bg-emerald-50', text: 'text-zinc-600', textActive: 'text-emerald-700', border: 'border-zinc-200', borderActive: 'border-emerald-300', dot: 'bg-emerald-500' },
  purple:  { bg: 'bg-white', bgActive: 'bg-purple-50', text: 'text-zinc-600', textActive: 'text-purple-700', border: 'border-zinc-200', borderActive: 'border-purple-300', dot: 'bg-purple-500' },
  blue:    { bg: 'bg-white', bgActive: 'bg-blue-50', text: 'text-zinc-600', textActive: 'text-blue-700', border: 'border-zinc-200', borderActive: 'border-blue-300', dot: 'bg-blue-500' },
  green:   { bg: 'bg-white', bgActive: 'bg-green-50', text: 'text-zinc-600', textActive: 'text-green-700', border: 'border-zinc-200', borderActive: 'border-green-300', dot: 'bg-green-500' },
  red:     { bg: 'bg-white', bgActive: 'bg-red-50', text: 'text-zinc-600', textActive: 'text-red-700', border: 'border-zinc-200', borderActive: 'border-red-300', dot: 'bg-red-500' },
};

// ============ PDF STORAGE (localStorage for generated files) ============
interface GeneratedPDF {
  id: string;
  name: string;
  filter: string;
  filterLabel: string;
  date: string;
  orderCount: number;
  dataUrl: string;
}

function getSavedPDFs(): GeneratedPDF[] {
  try {
    const raw = localStorage.getItem('admin_generated_pdfs');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePDF(pdf: GeneratedPDF) {
  const list = getSavedPDFs();
  list.unshift(pdf);
  if (list.length > 20) list.splice(20);
  localStorage.setItem('admin_generated_pdfs', JSON.stringify(list));
}

function deletePDF(id: string) {
  const list = getSavedPDFs().filter(p => p.id !== id);
  localStorage.setItem('admin_generated_pdfs', JSON.stringify(list));
}

// ============ SESSION STORAGE KEYS for filter/search/scroll persistence ============
const PERSIST_KEYS = {
  filter: 'admin_orders_filter',
  searchQuery: 'admin_orders_searchQuery',
  searchFilter: 'admin_orders_searchFilter',
  scrollY: 'admin_orders_scrollY',
};

// ============ MAIN COMPONENT ============
export default function AdminOrders() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Read filter from URL query param, or sessionStorage, default to 'awaiting_payment'
  const urlFilter = searchParams.get('filter') || '';
  const savedFilter = sessionStorage.getItem(PERSIST_KEYS.filter) || '';
  const resolvedFilter = urlFilter || savedFilter;
  const filter = VALID_FILTER_KEYS.includes(resolvedFilter) ? resolvedFilter : (resolvedFilter === 'all' ? 'all' : 'awaiting_payment');

  // 3-dot menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // SuperFrete balance state
  const [sfBalance, setSfBalance] = useState<number | null>(null);
  const [sfShipments, setSfShipments] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Label printing state
  const [showLabelOverlay, setShowLabelOverlay] = useState(false);
  const [printingLabels, setPrintingLabels] = useState(false);

  // ============ REMESSA STATE (only active when filter === 'preparing') ============
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [orderRemessaMap, setOrderRemessaMap] = useState<OrderRemessaMap>({});
  const [remessaFilter, setRemessaFilter] = useState<'all' | 'no_remessa' | 'in_remessa' | number>('all');
  const [showRemessaOverlay, setShowRemessaOverlay] = useState(false);
  const [activeRemessaId, setActiveRemessaId] = useState<number | null>(null);
  const [remessaLoading, setRemessaLoading] = useState(false);
  const [remessaMessage, setRemessaMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [showAddToDropdown, setShowAddToDropdown] = useState(false);
  const addToRemessaRef = useRef<HTMLDivElement>(null);

  // Global SuperFrete sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; total: number; updated: number; errors: number } | null>(null);

  // Search state — restore from sessionStorage if returning from detail
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem(PERSIST_KEYS.searchQuery) || '');
  const [searchFilter, setSearchFilter] = useState<'order_id' | 'value' | 'cep' | 'name' | 'phone'>(() => {
    const saved = sessionStorage.getItem(PERSIST_KEYS.searchFilter);
    if (saved && ['order_id', 'value', 'cep', 'name', 'phone'].includes(saved)) return saved as any;
    return 'order_id';
  });
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Bulk operations state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'mark_paid' | 'mark_paid_label' | 'pay_labels' | 'revert_to_paid' | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number; results: any[] } | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  // Progress bar state for bulk operations
  const [progressData, setProgressData] = useState<{
    active: boolean;
    expanded: boolean;
    operation: string;
    current: number;
    total: number;
    succeeded: number;
    failed: number;
    items: { id: string; label: string; status: 'pending' | 'generating' | 'paying' | 'completed' | 'error'; error?: string }[];
  }>({
    active: false, expanded: false, operation: '', current: 0, total: 0, succeeded: 0, failed: 0, items: [],
  });

  // Ideal balance calculation
  const [idealBalance, setIdealBalance] = useState<number | null>(null);

  // Persist search state to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem(PERSIST_KEYS.searchQuery, searchQuery);
  }, [searchQuery]);
  useEffect(() => {
    sessionStorage.setItem(PERSIST_KEYS.searchFilter, searchFilter);
  }, [searchFilter]);
  useEffect(() => {
    sessionStorage.setItem(PERSIST_KEYS.filter, filter);
  }, [filter]);

  // Scroll persistence: restore scroll position when coming back from order detail
  useEffect(() => {
    if (!loading) {
      const savedScroll = sessionStorage.getItem(PERSIST_KEYS.scrollY);
      if (savedScroll) {
        // Use requestAnimationFrame to ensure DOM is fully painted
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo(0, parseInt(savedScroll, 10));
            sessionStorage.removeItem(PERSIST_KEYS.scrollY);
          });
        });
      }
    }
  }, [loading]); // re-check when loading changes (orders loaded)

  // PDF overlay state
  const [showPDFOverlay, setShowPDFOverlay] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [savedPDFs, setSavedPDFs] = useState<GeneratedPDF[]>([]);

  useEffect(() => { loadOrders(); loadBalance(); loadRemessas(); }, []);

  // Load remessas from backend
  const loadRemessas = async () => {
    try {
      const data = await fetchRemessas();
      setRemessas(data.remessas);
      setOrderRemessaMap(data.orderRemessaMap);
    } catch (err) {
      console.error('Erro ao carregar remessas:', err);
    }
  };

  const loadBalance = async () => {
    setLoadingBalance(true);
    try {
      const data = await adminFetch('/admin/superfrete');
      if (data.balance !== undefined) setSfBalance(data.balance);
      if (data.shipments !== undefined) setSfShipments(data.shipments);
    } catch (err) {
      console.error('Erro ao carregar saldo:', err);
    } finally {
      setLoadingBalance(false);
    }
  };

  // Close 3-dot menu on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) setShowFilterDropdown(false);
      if (addToRemessaRef.current && !addToRemessaRef.current.contains(e.target as Node)) setShowAddToDropdown(false);
    };
    if (menuOpen || showFilterDropdown || showAddToDropdown) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen, showFilterDropdown, showAddToDropdown]);

  // Load saved PDFs when overlay opens
  useEffect(() => {
    if (showPDFOverlay) setSavedPDFs(getSavedPDFs());
  }, [showPDFOverlay]);

  const setFilter = (newFilter: string) => {
    setSearchParams(newFilter === 'awaiting_payment' ? {} : { filter: newFilter }, { replace: true });
    sessionStorage.setItem(PERSIST_KEYS.filter, newFilter);
    setSelectedOrders(new Set()); // Clear selection on filter change
    setBulkResult(null);
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/admin/pedidos');
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  };

  // Exclude archived from active view (memoized)
  const activeOrders = useMemo(() => orders.filter(o => !isOrderArchived(o)), [orders]);

  // Count per status (memoized)
  const counts: Record<string, number> = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of activeOrders) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [activeOrders]);

  const statusFiltered = useMemo(() => filter === 'all'
    ? activeOrders
    : activeOrders.filter(o => o.status === filter), [activeOrders, filter]);

  // Apply search query filtering
  const filteredOrders = searchQuery.trim()
    ? statusFiltered.filter(o => {
        const q = searchQuery.trim().toLowerCase();
        switch (searchFilter) {
          case 'order_id':
            return String(o.id).includes(q) || `#${o.id}`.toLowerCase().includes(q);
          case 'value': {
            const val = Number(o.total_amount || 0);
            const qNormalized = q.replace(',', '.');
            const formatted = formatCurrency(val).toLowerCase();
            return formatted.includes(q) || String(val).includes(qNormalized) || formatted.replace(',', '.').includes(qNormalized);
          }
          case 'cep': {
            const cep = (o.address_components?.cep || '').replace(/\D/g, '');
            const qClean = q.replace(/\D/g, '');
            return cep.includes(qClean);
          }
          case 'name':
            return (o.customer_name || '').toLowerCase().includes(q);
          case 'phone': {
            const phone = (o.customer_whatsapp || '').replace(/\D/g, '');
            const qPhone = q.replace(/\D/g, '');
            return phone.includes(qPhone);
          }
          default:
            return true;
        }
      })
    : statusFiltered;

  // ============ REMESSA SUB-FILTERING (only for 'preparing' tab, memoized) ============
  const remessaFilteredOrders = useMemo(() => (filter === 'preparing' && remessaFilter !== 'all')
    ? filteredOrders.filter(o => {
        const medusaId = o.medusa_order_id || '';
        const mapping = orderRemessaMap[medusaId];
        if (remessaFilter === 'no_remessa') return !mapping;
        if (remessaFilter === 'in_remessa') return !!mapping;
        if (typeof remessaFilter === 'number') return mapping?.remessa_id === remessaFilter;
        return true;
      })
    : filteredOrders, [filter, remessaFilter, filteredOrders, orderRemessaMap]);

  // Use remessaFilteredOrders for display in preparing, filteredOrders for other tabs
  const displayOrders = filter === 'preparing' ? remessaFilteredOrders : filteredOrders;

  // Orders that have labels generated (superfrete_id) within the current filter
  // FIXED: This is used for the counter display and the "quick PDF" button.
  // It correctly shows ALL orders with labels in the current status filter.
  const ordersWithLabel = filteredOrders.filter(o => !!o.superfrete_id);

  // Helper: Get current operational day boundaries for PDF filtering
  const getOperationalDayBounds = () => {
    const now = new Date();
    const opStart = new Date(now);
    // If current time < 6AM, operational day started yesterday at 00:00
    if (now.getHours() < 6) {
      opStart.setDate(opStart.getDate() - 1);
    }
    opStart.setHours(0, 0, 0, 0);

    const opEnd = new Date(opStart);
    opEnd.setDate(opEnd.getDate() + 1);
    opEnd.setHours(6, 0, 0, 0); // Ends at 06:00 of the next calendar day
    return { opStart, opEnd };
  };

  // Orders with labels from TODAY's operational day only (for quick PDF)
  const ordersWithLabelToday = ordersWithLabel.filter(o => {
    const labelDate = o.label_generated_at;
    if (!labelDate) return false; // No label date = not from today
    const d = new Date(labelDate);
    const { opStart, opEnd } = getOperationalDayBounds();
    return d >= opStart && d <= opEnd;
  });

  // Calculate ideal balance for paid orders
  useEffect(() => {
    if (filter === 'paid') {
      const paidOrders = activeOrders.filter(o => o.status === 'paid');
      const total = paidOrders.reduce((sum, o) => sum + Number(o.shipping_fee || 0), 0);
      setIdealBalance(total);
    }
  }, [filter, orders]);

  // Bulk action toggle
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleAllOrders = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map(o => String(o.medusa_order_id || o.id))));
    }
  };

  // Execute bulk action — sequential processing with progress tracking
  const executeBulkAction = async () => {
    if (!bulkAction || selectedOrders.size === 0) return;

    // Pre-flight balance check for pay_labels to prevent wasting API calls
    if (bulkAction === 'pay_labels' && sfBalance !== null) {
      const selectedShippingTotal = filteredOrders
        .filter(o => selectedOrders.has(String(o.medusa_order_id || o.id)))
        .reduce((sum, o) => sum + Number(o.shipping_fee || 0), 0);
      if (sfBalance < selectedShippingTotal) {
        alert(`Saldo SuperFrete insuficiente!\nNecessario: R$ ${formatCurrency(selectedShippingTotal)}\nDisponivel: R$ ${formatCurrency(sfBalance)}\n\nAdicione saldo antes de continuar.`);
        setShowBulkConfirm(false);
        return;
      }
    }

    // Duplicate guard: prevent double execution
    if (bulkProcessing) return;

    setBulkProcessing(true);
    setBulkResult(null);
    setShowBulkConfirm(false);

    const orderIds: string[] = Array.from(selectedOrders);

    try {
      if (bulkAction === 'pay_labels') {
        // REAL-TIME sequential processing: one order at a time, frontend drives progress
        const progressItems = orderIds.map(oid => {
          const o = filteredOrders.find(o => String(o.medusa_order_id || o.id) === oid);
          return {
            id: oid,
            label: o ? `#${o.id} - ${o.customer_name || 'Cliente'}` : `#${oid}`,
            status: 'pending' as const,
          };
        });

        setProgressData({
          active: true, expanded: false, operation: 'Gerando e pagando etiquetas',
          current: 0, total: orderIds.length, succeeded: 0, failed: 0, items: progressItems,
        });

        // Use the sequential function that calls onProgress for each order
        const result = await batchFinalizeAndLabelSequential(orderIds, (update) => {
          setProgressData(prev => {
            const newItems = [...prev.items];
            const idx = newItems.findIndex(item => item.id === update.orderId);
            if (idx !== -1) {
              if (update.step === 'generating') {
                newItems[idx] = { ...newItems[idx], status: 'generating' };
              } else if (update.step === 'paying') {
                newItems[idx] = { ...newItems[idx], status: 'paying' };
              } else if (update.step === 'completed') {
                newItems[idx] = { ...newItems[idx], status: 'completed' };
              } else if (update.step === 'error') {
                newItems[idx] = { ...newItems[idx], status: 'error', error: update.error };
              }
            }
            const completedCount = newItems.filter(i => i.status === 'completed' || i.status === 'error').length;
            const succeededCount = newItems.filter(i => i.status === 'completed').length;
            const failedCount = newItems.filter(i => i.status === 'error').length;
            return {
              ...prev,
              current: completedCount,
              succeeded: succeededCount,
              failed: failedCount,
              items: newItems,
            };
          });
        });

        setBulkResult({
          succeeded: result.succeeded || 0,
          failed: result.failed || 0,
          results: result.results || [],
        });
      } else if (bulkAction === 'revert_to_paid') {
        // Revert cancelled orders to paid
        const progressItems = orderIds.map(oid => {
          const o = filteredOrders.find(o => String(o.medusa_order_id || o.id) === oid);
          return {
            id: oid,
            label: o ? `#${o.id} - ${o.customer_name || 'Cliente'}` : `#${oid}`,
            status: 'pending' as const,
          };
        });

        setProgressData({
          active: true, expanded: false, operation: 'Revertendo para pago',
          current: 0, total: orderIds.length, succeeded: 0, failed: 0, items: progressItems,
        });

        const result = await batchRevertToPaid(orderIds);

        const finalItems = progressItems.map(item => {
          const r = (result.results || []).find((r: any) =>
            String(r.medusa_id) === item.id || String(r.id) === item.id
          );
          if (r?.success) return { ...item, status: 'completed' as const };
          if (r) return { ...item, status: 'error' as const, error: r.error || 'Erro' };
          return { ...item, status: 'error' as const, error: 'Sem resposta' };
        });

        setProgressData(prev => ({
          ...prev,
          current: orderIds.length,
          succeeded: result.succeeded || 0,
          failed: result.failed || 0,
          items: finalItems,
        }));

        setBulkResult({
          succeeded: result.succeeded || 0,
          failed: result.failed || 0,
          results: result.results || [],
        });
      } else {
        // Standard batch actions (mark_paid, mark_paid_label)
        let actionName = '';
        if (bulkAction === 'mark_paid') actionName = 'batch_mark_paid';
        else if (bulkAction === 'mark_paid_label') actionName = 'batch_mark_paid_label';

        const result = await adminFetch('/admin/pedidos', {
          method: 'PUT',
          body: JSON.stringify({ action: actionName, order_ids: orderIds }),
        });

        setBulkResult({
          succeeded: result.succeeded || 0,
          failed: result.failed || 0,
          results: result.results || [],
        });
      }

      // Reload orders and balance after bulk operation
      await loadOrders();
      await loadBalance();
      setSelectedOrders(new Set());
    } catch (err: any) {
      setBulkResult({ succeeded: 0, failed: selectedOrders.size, results: [{ error: err.message }] });
    } finally {
      setBulkProcessing(false);
      setBulkAction(null);
    }
  };

  // ============ HELPER: Resolve color name → hex ============
  const colorNameToHex = (name: string): string | null => {
    if (!name) return null;
    const found = LINE_COLORS.find(c => c.name.toLowerCase() === name.toLowerCase());
    return found ? (found.hex.startsWith('linear') ? null : found.hex) : null;
  };

  const isMulticolor = (name: string): boolean => {
    return name?.toLowerCase() === 'multicor';
  };

  // ============ HELPER: Generate PDF for a list of orders ============
  const buildPDFForOrders = (ordersForPdf: any[], dateLabel: string): string => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // ---- HEADER ----
    doc.setFillColor(24, 24, 27);
    doc.rect(0, 0, pageWidth, 38, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 38, pageWidth, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Extrato de Pedidos', margin, 17);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 190);
    doc.text(`Dia operacional: ${dateLabel} (ate 06h do dia seguinte)`, margin, 26);
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 155);
    const totalItems = ordersForPdf.reduce((sum, o) => sum + (o.items?.length || 0), 0);
    doc.text(`${ordersForPdf.length} ${ordersForPdf.length === 1 ? 'pedido' : 'pedidos'} com etiqueta  |  ${totalItems} itens  |  ${timeStr}`, margin, 33);

    // ---- BUILD TABLE DATA ----
    // Each row: [N° pedido, Nome, Produto]
    // Color squares are drawn programmatically next to the name (per item)
    // For multi-item orders: first item shows all columns, subsequent items leave pedido/nome empty
    // We track which order index each row belongs to for alternating backgrounds
    const tableData: string[][] = [];
    const rowOrderIndex: number[] = []; // maps each row → order index (for alternating bg)

    // ---- PER-ROW COLOR DATA (for didDrawCell) ----
    // Each row has its own color squares based on the specific item's color preference
    interface RowColorInfo {
      colors: { hex: string | null; isMulticolor: boolean; name: string }[];
      isSortida: boolean;
      hasColorPref: boolean; // true if item had a color preference at all
    }
    const rowColorInfoMap: Map<number, RowColorInfo> = new Map();

    ordersForPdf.forEach((order, orderIdx) => {
      const fullName = (order.customer_name || '').trim();
      const nameParts = fullName.split(/\s+/);
      const shortName = nameParts.length <= 2 ? fullName : `${nameParts[0]} ${nameParts[nameParts.length - 1]}`;

      const items: any[] = order.items || [];
      const colorPrefs: any[] = order.items_color_preferences || [];

      if (items.length === 0) {
        // Edge case: order with no items
        const rowIdx = tableData.length;
        tableData.push([`#${order.id}`, shortName, '-']);
        rowOrderIndex.push(orderIdx);
        rowColorInfoMap.set(rowIdx, { colors: [], isSortida: false, hasColorPref: false });
        return;
      }

      items.forEach((item: any, itemIdx: number) => {
        // Find color preference for this specific item
        const itemColorPref = colorPrefs.find((cp: any) =>
          cp.product_id === item.product_id || cp.variant_id === item.variant_id
        );

        // Build per-item color info for squares
        const itemColors: { hex: string | null; isMulticolor: boolean; name: string }[] = [];
        let isSortida = false;
        let hasColorPref = false;

        if (itemColorPref) {
          hasColorPref = true;
          if (itemColorPref.mode === 'sortida') {
            isSortida = true;
          } else {
            for (const c of [itemColorPref.color_1, itemColorPref.color_2, itemColorPref.color_3]) {
              if (c) {
                itemColors.push({ hex: colorNameToHex(c), isMulticolor: isMulticolor(c), name: c });
              }
            }
            // If mode is prioridade but no colors were actually set
            if (itemColors.length === 0) hasColorPref = false;
          }
        }

        // Expand items: repeat each product line instead of using "3x"
        const qty = item.quantity || 1;
        for (let q = 0; q < qty; q++) {
          const isFirstItem = itemIdx === 0 && q === 0;
          const rowIdx = tableData.length;

          tableData.push([
            isFirstItem ? `#${order.id}` : '',
            isFirstItem ? shortName : '',
            item.title,
          ]);
          rowOrderIndex.push(orderIdx);
          rowColorInfoMap.set(rowIdx, { colors: itemColors.slice(0, 3), isSortida, hasColorPref });
        }
      });
    });

    // ---- RENDER TABLE ----
    // 3 columns: N°, Nome (with color squares drawn inside), Produto
    autoTable(doc, {
      startY: 47,
      margin: { left: margin, right: margin },
      head: [['N\u00b0', 'Nome', 'Produto']],
      body: tableData,
      theme: 'plain',
      headStyles: {
        fillColor: [24, 24, 27],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 },
        lineWidth: 0,
        halign: 'left',
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [55, 55, 60],
        cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
        lineWidth: 0,
        overflow: 'ellipsize',
      },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center', fontStyle: 'bold', fontSize: 9, textColor: [24, 24, 27] },
        1: { cellWidth: 56 },
        2: { cellWidth: 'auto', fontSize: 8, textColor: [70, 70, 80] },
      },
      // Alternating background per ORDER (not per row)
      didParseCell: (data: any) => {
        if (data.section !== 'body') return;
        const rowIdx = data.row.index;
        const oIdx = rowOrderIndex[rowIdx];
        if (oIdx === undefined) return;

        // Alternating: even orders → white, odd orders → light gray
        if (oIdx % 2 === 1) {
          data.cell.styles.fillColor = [247, 247, 248];
        } else {
          data.cell.styles.fillColor = [255, 255, 255];
        }

        // For sub-item rows (pedido/nome columns empty), make text lighter
        const cellText = (data.cell.text || []).join('').trim();
        if (data.column.index <= 1 && cellText === '') {
          data.cell.styles.textColor = [200, 200, 200];
        }
      },
      // Draw color squares next to the name — PER ITEM (every row gets its own squares)
      didDrawCell: (data: any) => {
        if (data.section !== 'body') return;

        // Draw color squares in the "Nome" column (column 1) for EVERY row
        if (data.column.index === 1) {
          const rowIdx = data.row.index;
          const info = rowColorInfoMap.get(rowIdx);
          if (!info) return;

          const squareSize = 3.5;
          const gap = 1.4;
          const centerY = data.cell.y + (data.cell.height / 2) - (squareSize / 2);

          if (info.isSortida) {
            // "Sortida" mode: draw a small striped/rainbow indicator
            const x = data.cell.x + data.cell.width - squareSize - 3;
            const half = squareSize / 2;
            doc.setFillColor(239, 68, 68); doc.rect(x, centerY, half, half, 'F');
            doc.setFillColor(234, 179, 8); doc.rect(x + half, centerY, half, half, 'F');
            doc.setFillColor(34, 197, 94); doc.rect(x, centerY + half, half, half, 'F');
            doc.setFillColor(59, 130, 246); doc.rect(x + half, centerY + half, half, half, 'F');
            // Small "S" label next to it
            doc.setFontSize(5.5);
            doc.setTextColor(140, 140, 155);
            doc.text('S', x - 3.5, centerY + squareSize - 0.3);
            return;
          }

          if (!info.hasColorPref || info.colors.length === 0) {
            // No color preference: draw "N/A" indicator
            const naX = data.cell.x + data.cell.width - 14;
            const naY = centerY + squareSize - 0.3;
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(180, 180, 190);
            doc.text('N/A', naX, naY);
            doc.setFont('helvetica', 'normal');
            return;
          }

          // Draw color squares aligned to the right of the cell
          const totalWidth = info.colors.length * (squareSize + gap) - gap;
          const startX = data.cell.x + data.cell.width - totalWidth - 3;

          info.colors.forEach((color, i) => {
            const x = startX + i * (squareSize + gap);
            if (color.isMulticolor) {
              // Draw 4 tiny quadrants for multicolor
              const half = squareSize / 2;
              doc.setFillColor(239, 68, 68); doc.rect(x, centerY, half, half, 'F');
              doc.setFillColor(234, 179, 8); doc.rect(x + half, centerY, half, half, 'F');
              doc.setFillColor(34, 197, 94); doc.rect(x, centerY + half, half, half, 'F');
              doc.setFillColor(59, 130, 246); doc.rect(x + half, centerY + half, half, half, 'F');
            } else if (color.hex) {
              const r = parseInt(color.hex.slice(1, 3), 16);
              const g = parseInt(color.hex.slice(3, 5), 16);
              const b = parseInt(color.hex.slice(5, 7), 16);
              doc.setFillColor(r, g, b);
              doc.roundedRect(x, centerY, squareSize, squareSize, 0.6, 0.6, 'F');

              // White/light colors: add border
              if (color.name === 'Branca' || (r > 230 && g > 230 && b > 230)) {
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.2);
                doc.roundedRect(x, centerY, squareSize, squareSize, 0.6, 0.6, 'S');
              }
            }
          });
        }

        // Draw thin separator line between orders (before first item of a new order)
        if (data.column.index === 0) {
          const rowIdx = data.row.index;
          const oIdx = rowOrderIndex[rowIdx];
          const prevOIdx = rowIdx > 0 ? rowOrderIndex[rowIdx - 1] : -1;

          if (oIdx !== prevOIdx && rowIdx > 0) {
            doc.setDrawColor(210, 210, 215);
            doc.setLineWidth(0.3);
            doc.line(
              margin,
              data.cell.y,
              pageWidth - margin,
              data.cell.y
            );
          }
        }
      },
      didDrawPage: () => {
        const pageNum = (doc as any).getCurrentPageInfo().pageNumber;
        const totalPages = (doc as any).internal.getNumberOfPages();
        doc.setDrawColor(228, 228, 231);
        doc.setLineWidth(0.3);
        doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 170);
        doc.setFont('helvetica', 'normal');
        doc.text(`Pagina ${pageNum} de ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      },
    });

    return doc.output('dataurlstring');
  };

  // ============ PDF GENERATION (quick — for current operational day only) ============
  const generatePDF = async () => {
    if (ordersWithLabelToday.length === 0) {
      alert('Nenhum pedido com etiqueta gerada no dia operacional atual.');
      return;
    }
    setGeneratingPDF(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const fileDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const dataUrl = buildPDFForOrders(ordersWithLabelToday, dateStr);
      const fileName = `PEDIDOS-${fileDate}.pdf`;
      const filterLabel = STATUS_FILTERS.find(s => s.key === filter)?.label || 'Todos';
      const pdfEntry: GeneratedPDF = {
        id: `pdf_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name: fileName, filter, filterLabel, date: now.toISOString(),
        orderCount: ordersWithLabelToday.length, dataUrl,
      };
      savePDF(pdfEntry);
      setSavedPDFs(getSavedPDFs());
      setShowPDFOverlay(true);
      setMenuOpen(false);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleDownloadPDF = (pdf: GeneratedPDF) => {
    const link = document.createElement('a');
    link.href = pdf.dataUrl;
    link.download = pdf.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSharePDF = async (pdf: GeneratedPDF) => {
    try {
      // Convert dataUrl to blob for Web Share API
      const byteString = atob(pdf.dataUrl.split(',')[1]);
      const mimeString = pdf.dataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mimeString });
      const file = new File([blob], pdf.name, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: pdf.name, files: [file] });
      } else {
        // Fallback: just download
        handleDownloadPDF(pdf);
      }
    } catch {
      handleDownloadPDF(pdf);
    }
  };

  const handleDeletePDF = (id: string) => {
    deletePDF(id);
    setSavedPDFs(getSavedPDFs());
  };

  // ============ REMESSA HELPERS (only for 'preparing', memoized) ============
  const openRemessas = useMemo(() => remessas.filter(r => r.status === 'open'), [remessas]);
  const activeRemessa = useMemo(() => activeRemessaId ? remessas.find(r => r.id === activeRemessaId) : null, [activeRemessaId, remessas]);

  // Count how many preparing orders are without remessa (memoized)
  const { preparingWithoutRemessa, preparingWithRemessa } = useMemo(() => {
    const preparingOrders = filter === 'preparing' ? filteredOrders : [];
    return {
      preparingWithoutRemessa: preparingOrders.filter(o => !orderRemessaMap[o.medusa_order_id || '']),
      preparingWithRemessa: preparingOrders.filter(o => !!orderRemessaMap[o.medusa_order_id || '']),
    };
  }, [filter, filteredOrders, orderRemessaMap]);

  // Smart selection: select only eligible orders (preparing + no remessa)
  const selectEligibleOrders = () => {
    const eligible = preparingWithoutRemessa;
    const newSet = new Set(eligible.map(o => String(o.medusa_order_id || o.id)));
    setSelectedOrders(newSet);
    const skipped = preparingWithRemessa.length;
    if (skipped > 0) {
      setRemessaMessage({
        type: 'info',
        text: `${newSet.size} pedido${newSet.size !== 1 ? 's' : ''} sem remessa selecionado${newSet.size !== 1 ? 's' : ''}. ${skipped} pedido${skipped !== 1 ? 's' : ''} ja pertence${skipped !== 1 ? 'm' : ''} a outras remessas e ficaram de fora.`,
      });
    } else {
      setRemessaMessage({
        type: 'info',
        text: `${newSet.size} pedido${newSet.size !== 1 ? 's' : ''} em preparando sem remessa selecionado${newSet.size !== 1 ? 's' : ''}.`,
      });
    }
    setTimeout(() => setRemessaMessage(null), 6000);
  };

  // Create remessa from selected orders
  const handleCreateRemessa = async () => {
    if (selectedOrders.size === 0) return;
    setRemessaLoading(true);
    try {
      const orderIds = Array.from(selectedOrders);
      const displayIds = orderIds.map(oid => {
        const o = filteredOrders.find(o => String(o.medusa_order_id || o.id) === oid);
        return o?.id || 0;
      });
      const result = await createRemessa(orderIds, displayIds as number[]);
      if (result.success) {
        setRemessaMessage({
          type: 'success',
          text: `Remessa ${result.remessa.code} criada com ${result.added} pedido${result.added !== 1 ? 's' : ''}.${result.skipped > 0 ? ` ${result.skipped} ja em outra remessa.` : ''}`,
        });
        setSelectedOrders(new Set());
        await loadRemessas();
      } else {
        setRemessaMessage({ type: 'error', text: result.error || 'Erro ao criar remessa.' });
      }
    } catch (err: any) {
      setRemessaMessage({ type: 'error', text: err.message || 'Erro ao criar remessa.' });
    } finally {
      setRemessaLoading(false);
      setTimeout(() => setRemessaMessage(null), 6000);
    }
  };

  // Add selected orders to an existing open remessa
  const handleAddToRemessa = async (remessaId: number) => {
    if (selectedOrders.size === 0) return;
    setRemessaLoading(true);
    try {
      const orderIds = Array.from(selectedOrders);
      const displayIds = orderIds.map(oid => {
        const o = filteredOrders.find(o => String(o.medusa_order_id || o.id) === oid);
        return o?.id || 0;
      });
      const result = await addOrdersToRemessa(remessaId, orderIds, displayIds as number[]);
      if (result.success !== false) {
        const rem = remessas.find(r => r.id === remessaId);
        setRemessaMessage({
          type: 'success',
          text: `${result.added} pedido${result.added !== 1 ? 's' : ''} adicionado${result.added !== 1 ? 's' : ''} a ${rem?.code || 'remessa'}.${result.skipped > 0 ? ` ${result.skipped} ja em outra remessa.` : ''}`,
        });
        setSelectedOrders(new Set());
        await loadRemessas();
      } else {
        setRemessaMessage({ type: 'error', text: result.error || 'Erro ao adicionar pedidos.' });
      }
    } catch (err: any) {
      setRemessaMessage({ type: 'error', text: err.message || 'Erro ao adicionar pedidos.' });
    } finally {
      setRemessaLoading(false);
      setTimeout(() => setRemessaMessage(null), 6000);
    }
  };

  // Remove a single order from remessa
  const handleRemoveFromRemessa = async (orderId: string, displayId?: number) => {
    const mapping = orderRemessaMap[orderId];
    if (!mapping) return;
    setRemessaLoading(true);
    try {
      const result = await removeOrderFromRemessa(mapping.remessa_id, orderId, displayId);
      if (result.success) {
        setRemessaMessage({ type: 'success', text: `Pedido #${displayId || '?'} removido da remessa ${mapping.remessa_code}.` });
        await loadRemessas();
      } else {
        setRemessaMessage({ type: 'error', text: result.error || 'Erro ao remover pedido.' });
      }
    } catch (err: any) {
      setRemessaMessage({ type: 'error', text: err.message || 'Erro.' });
    } finally {
      setRemessaLoading(false);
      setTimeout(() => setRemessaMessage(null), 5000);
    }
  };

  // Undo an entire remessa
  const handleUndoRemessa = async (remessaId: number) => {
    const rem = remessas.find(r => r.id === remessaId);
    if (!confirm(`Desfazer remessa ${rem?.code || ''}? Todos os pedidos voltam para "sem remessa".`)) return;
    setRemessaLoading(true);
    try {
      const result = await undoRemessa(remessaId);
      if (result.success) {
        setRemessaMessage({ type: 'success', text: `Remessa ${rem?.code} desfeita. ${result.freed_orders} pedido${result.freed_orders !== 1 ? 's' : ''} liberado${result.freed_orders !== 1 ? 's' : ''}.` });
        setActiveRemessaId(null);
        setRemessaFilter('all');
        await loadRemessas();
      }
    } catch (err: any) {
      setRemessaMessage({ type: 'error', text: err.message });
    } finally {
      setRemessaLoading(false);
      setTimeout(() => setRemessaMessage(null), 5000);
    }
  };

  // Generate PDF for a specific remessa (uses existing buildPDFForOrders — NO content change)
  const handleRemessaPDF = async (remessaId: number) => {
    const rem = remessas.find(r => r.id === remessaId);
    if (!rem) return;
    // Get orders in this remessa
    const remessaOrderIds = new Set(rem.order_ids);
    const ordersForPdf = orders.filter(o => remessaOrderIds.has(o.medusa_order_id));
    if (ordersForPdf.length === 0) {
      alert('Nenhum pedido encontrado nesta remessa.');
      return;
    }
    setGeneratingPDF(true);
    try {
      const dateStr = `Remessa ${rem.code} - ${new Date().toLocaleDateString('pt-BR')}`;
      const dataUrl = buildPDFForOrders(ordersForPdf, dateStr);
      const fileName = `REMESSA-${rem.code}.pdf`;
      const pdfEntry: GeneratedPDF = {
        id: `pdf_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name: fileName, filter: 'remessa', filterLabel: `Remessa ${rem.code}`,
        date: new Date().toISOString(), orderCount: ordersForPdf.length, dataUrl,
      };
      savePDF(pdfEntry);
      setSavedPDFs(getSavedPDFs());
      // Auto-download
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Log export (does NOT change state)
      logRemessaPdfExport(remessaId).catch(() => {});
      setRemessaMessage({ type: 'success', text: `PDF da ${rem.code} baixado (${ordersForPdf.length} pedidos). Nenhum estado alterado.` });
    } catch (err: any) {
      setRemessaMessage({ type: 'error', text: 'Erro ao gerar PDF.' });
    } finally {
      setGeneratingPDF(false);
      setTimeout(() => setRemessaMessage(null), 5000);
    }
  };

  // Print labels for a specific remessa
  const handleRemessaLabels = async (remessaId: number) => {
    const rem = remessas.find(r => r.id === remessaId);
    if (!rem) return;
    const remessaOrderIds = new Set(rem.order_ids);
    const ordersForLabels = orders.filter(o => remessaOrderIds.has(o.medusa_order_id) && !!o.superfrete_id);
    if (ordersForLabels.length === 0) {
      alert('Nenhum pedido com etiqueta nesta remessa.');
      return;
    }
    setPrintingLabels(true);
    try {
      const sfIds = ordersForLabels.map(o => o.superfrete_id).filter(Boolean);
      const orderInfo = ordersForLabels.filter(o => o.superfrete_id).map(o => ({
        superfrete_id: o.superfrete_id,
        order_id: o.id,
        customer_name: o.customer_name || '',
        cep: o.address_components?.cep || '',
      }));
      const result = await adminFetch('/admin/superfrete', {
        method: 'POST',
        body: JSON.stringify({ action: 'print', orders: sfIds, order_info: orderInfo }),
      });
      if (result.success && result.data?.pdf_base64) {
        const byteCharacters = atob(result.data.pdf_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        window.open(URL.createObjectURL(blob), '_blank');
      } else if (result.success && result.data?.url) {
        window.open(result.data.url, '_blank');
      } else {
        alert(result.error || 'Erro ao obter etiquetas.');
      }
      logRemessaLabelExport(remessaId).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Erro ao imprimir etiquetas.');
    } finally {
      setPrintingLabels(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ============ SYNCING OVERLAY (non-blocking banner) ============ */}
      {syncing && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700 animate-pulse">
          <Loader2 size={16} className="animate-spin shrink-0" />
          <div>
            <p className="font-bold text-xs">Sincronizando status da SuperFrete...</p>
            <p className="text-[10px] text-orange-500">Consultando todos os pedidos com etiqueta. Pode levar alguns segundos.</p>
          </div>
        </div>
      )}

      {/* ============ TOP BAR: Refresh + 3-dot menu ============ */}
      <div className="flex justify-end items-center gap-2">
        <button
          onClick={loadOrders}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-700 text-xs bg-white px-3 py-1.5 rounded-lg border border-zinc-200 transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>

        {/* 3-dot menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center text-zinc-400 hover:text-zinc-700 bg-white p-1.5 rounded-lg border border-zinc-200 transition-colors w-8 h-8"
          >
            <MoreVertical size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-30 w-56 py-1 overflow-hidden">
              <button
                onClick={generatePDF}
                disabled={generatingPDF || ordersWithLabelToday.length === 0}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generatingPDF ? (
                  <Loader2 size={15} className="animate-spin text-zinc-400" />
                ) : (
                  <FileText size={15} className="text-zinc-400" />
                )}
                <div className="text-left">
                  <span className="block">{generatingPDF ? 'Gerando...' : 'Gerar PDF (Hoje)'}</span>
                  {ordersWithLabelToday.length > 0 && !generatingPDF && (
                    <span className="block text-[10px] text-zinc-400 -mt-0.5">
                      {ordersWithLabelToday.length} com etiqueta hoje
                    </span>
                  )}
                  {ordersWithLabelToday.length === 0 && !generatingPDF && (
                    <span className="block text-[10px] text-zinc-400 -mt-0.5">
                      Nenhum com etiqueta hoje
                    </span>
                  )}
                </div>
              </button>
              <div className="border-t border-zinc-100 my-0.5" />
              <button
                onClick={() => { setShowPDFOverlay(true); setMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <FileText size={15} className="text-zinc-400" />
                Ver PDFs gerados
              </button>
              <div className="border-t border-zinc-100 my-0.5" />
              <button
                onClick={() => { setShowLabelOverlay(true); setMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <Printer size={15} className="text-orange-400" />
                <div className="text-left">
                  <span className="block">Imprimir Etiquetas</span>
                  <span className="block text-[10px] text-zinc-400 -mt-0.5">
                    SuperFrete por dia
                  </span>
                </div>
              </button>
              <div className="border-t border-zinc-100 my-0.5" />
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  setSyncing(true);
                  setSyncResult(null);
                  try {
                    const result = await batchSyncSuperfrete();
                    setSyncResult({ success: result.success, total: result.total, updated: result.updated, errors: result.errors });
                    if (result.success) await loadOrders();
                  } catch {
                    setSyncResult({ success: false, total: 0, updated: 0, errors: 1 });
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-orange-50 transition-colors disabled:opacity-50"
              >
                {syncing ? (
                  <Loader2 size={15} className="animate-spin text-orange-500" />
                ) : (
                  <Zap size={15} className="text-orange-500" />
                )}
                <div className="text-left">
                  <span className="block font-semibold text-orange-700">{syncing ? 'Sincronizando...' : 'Atualizar Status SuperFrete'}</span>
                  <span className="block text-[10px] text-orange-400 -mt-0.5">
                    Sync global de todos os pedidos
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ============ SYNC RESULT BANNER ============ */}
      {syncResult && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          syncResult.success
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {syncResult.success ? <CheckCircle2 size={16} className="shrink-0" /> : <XCircle size={16} className="shrink-0" />}
          <div className="flex-1">
            {syncResult.success ? (
              <p className="text-xs">
                <span className="font-bold">Sync concluido!</span> {syncResult.total} pedidos verificados, {syncResult.updated} status atualizados{syncResult.errors > 0 ? `, ${syncResult.errors} erros` : ''}.
              </p>
            ) : (
              <p className="text-xs font-bold">Erro ao sincronizar. Tente novamente.</p>
            )}
          </div>
          <button onClick={() => setSyncResult(null)} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* ============ SUPERFRETE BALANCE ============ */}
      {sfBalance !== null && (
        <div className="bg-white rounded-xl border border-zinc-100 px-4 py-2.5 space-y-1.5">
          <div className="flex items-center gap-3">
            <Wallet size={16} className="text-orange-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">Saldo SuperFrete:</span>
                <span className={`font-bold ${sfBalance > 20 ? 'text-emerald-600' : sfBalance > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                  R$ {formatCurrency(sfBalance)}
                </span>
              </div>
              {sfShipments > 0 && (
                <p className="text-[10px] text-zinc-400">{sfShipments} etiqueta{sfShipments > 1 ? 's' : ''} aguardando postagem</p>
              )}
            </div>
            <button
              onClick={loadBalance}
              disabled={loadingBalance}
              className="text-zinc-300 hover:text-zinc-500 transition-colors p-1"
              title="Atualizar saldo"
            >
              <RefreshCw size={12} className={loadingBalance ? 'animate-spin' : ''} />
            </button>
          </div>
          {/* Ideal balance for paid orders */}
          {filter === 'paid' && idealBalance !== null && (
            <div className="border-t border-zinc-100 pt-1.5 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Saldo ideal (fretes pendentes):</span>
                <span className="font-bold text-blue-600">R$ {formatCurrency(idealBalance)}</span>
              </div>
              {sfBalance !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Diferenca:</span>
                  <span className={`font-bold ${sfBalance >= idealBalance ? 'text-emerald-600' : 'text-red-600'}`}>
                    {sfBalance >= idealBalance ? '+' : '-'} R$ {formatCurrency(Math.abs(sfBalance - idealBalance))}
                    {sfBalance >= idealBalance ? ' (suficiente)' : ' (insuficiente)'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============ SEARCH BAR ============ */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              searchFilter === 'order_id' ? 'Buscar por numero do pedido...' :
              searchFilter === 'value' ? 'Buscar por valor (ex: 89.90)...' :
              searchFilter === 'cep' ? 'Buscar por CEP...' :
              searchFilter === 'name' ? 'Buscar por nome do cliente...' :
              'Buscar por telefone...'
            }
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none bg-white placeholder:text-zinc-300"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="relative" ref={filterDropdownRef}>
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="flex items-center gap-1.5 text-xs bg-white border border-zinc-200 px-3 py-2 rounded-xl hover:border-zinc-300 transition-colors text-zinc-600 whitespace-nowrap"
          >
            <Filter size={12} className="text-zinc-400" />
            {searchFilter === 'order_id' ? 'N. Pedido' :
             searchFilter === 'value' ? 'Valor' :
             searchFilter === 'cep' ? 'CEP' :
             searchFilter === 'name' ? 'Nome' : 'Telefone'}
          </button>
          {showFilterDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-30 w-44 py-1 overflow-hidden">
              {[
                { key: 'order_id' as const, label: 'Numero do Pedido' },
                { key: 'name' as const, label: 'Nome do Cliente' },
                { key: 'value' as const, label: 'Valor do Pedido' },
                { key: 'cep' as const, label: 'CEP' },
                { key: 'phone' as const, label: 'Telefone' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setSearchFilter(opt.key); setShowFilterDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    searchFilter === opt.key ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ============ STATUS GRID ============ */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-2.5">
        {STATUS_FILTERS.map(sf => {
          const isActive = filter === sf.key;
          const count = counts[sf.key] || 0;
          const c = colorMap[sf.color];
          const Icon = sf.icon;
          return (
            <button
              key={sf.key}
              onClick={() => setFilter(sf.key === filter ? 'all' : sf.key)}
              className={`relative rounded-xl border p-2.5 sm:p-3 text-center transition-all ${
                isActive
                  ? `${c.bgActive} ${c.borderActive} ${c.textActive} shadow-sm`
                  : `${c.bg} ${c.border} ${c.text} hover:border-zinc-300`
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Icon size={14} className={isActive ? '' : 'opacity-50'} />
              </div>
              <p className={`text-[10px] sm:text-xs font-semibold leading-tight ${isActive ? '' : 'text-zinc-500'}`}>
                <span className="sm:hidden">{sf.shortLabel}</span>
                <span className="hidden sm:inline">{sf.label}</span>
              </p>
              <p className={`text-lg sm:text-xl font-black mt-0.5 ${isActive ? '' : 'text-zinc-700'}`}>
                {count}
              </p>
            </button>
          );
        })}
      </div>

      {/* ============ BULK RESULT BANNER ============ */}
      {bulkResult && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          bulkResult.failed === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          <CheckCircle2 size={16} className="shrink-0" />
          <div className="flex-1">
            <p className="text-xs">
              <span className="font-bold">Operacao concluida!</span> {bulkResult.succeeded} com sucesso
              {bulkResult.failed > 0 && <>, <span className="text-red-600 font-bold">{bulkResult.failed} falharam</span></>}.
            </p>
            {bulkResult.failed > 0 && (
              <div className="mt-1 space-y-0.5">
                {bulkResult.results.filter((r: any) => !r.success).map((r: any, i: number) => (
                  <p key={i} className="text-[10px] text-red-600">#{r.id || '?'}: {r.error}</p>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setBulkResult(null)} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* ============ BULK PROCESSING BANNER ============ */}
      {bulkProcessing && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 animate-pulse">
          <Loader2 size={16} className="animate-spin shrink-0" />
          <p className="text-xs font-bold">Processando operacao em massa... Nao feche esta pagina.</p>
        </div>
      )}

      {/* ============ FLOATING BULK ACTION BAR (fixed bottom) ============ */}
      {selectedOrders.size > 0 && !bulkProcessing && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 sm:p-4" style={{ pointerEvents: 'none' }}>
          <div className="max-w-5xl mx-auto" style={{ pointerEvents: 'auto' }}>
            <div className="bg-zinc-900 rounded-2xl px-4 py-3 shadow-2xl border border-zinc-700 space-y-2">
              {/* Top row: count + actions */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white text-xs font-bold">{selectedOrders.size} selecionado{selectedOrders.size > 1 ? 's' : ''}</span>
                <div className="flex-1" />
                {filter === 'awaiting_payment' && (
                  <>
                    <button
                      onClick={() => { setBulkAction('mark_paid'); setShowBulkConfirm(true); }}
                      className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-emerald-700 flex items-center gap-1.5"
                    >
                      <CreditCard size={11} /> Marcar Pago
                    </button>
                    <button
                      onClick={() => { setBulkAction('mark_paid_label'); setShowBulkConfirm(true); }}
                      className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-orange-600 flex items-center gap-1.5"
                    >
                      <Tag size={11} /> Pago + Etiqueta
                    </button>
                  </>
                )}
                {filter === 'paid' && (
                  <button
                    onClick={() => { setBulkAction('pay_labels'); setShowBulkConfirm(true); }}
                    className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-orange-600 flex items-center gap-1.5"
                  >
                    <Wallet size={11} /> Gerar e Pagar Etiquetas
                  </button>
                )}
                {filter === 'cancelled' && (
                  <button
                    onClick={() => { setBulkAction('revert_to_paid'); setShowBulkConfirm(true); }}
                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-emerald-700 flex items-center gap-1.5"
                  >
                    <CreditCard size={11} /> Reverter para Pago
                  </button>
                )}
                {filter === 'preparing' && (
                  <>
                    <button
                      onClick={handleCreateRemessa}
                      disabled={remessaLoading}
                      className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-purple-700 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {remessaLoading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      Nova remessa
                    </button>
                    {openRemessas.length > 0 && (
                      <div className="relative" ref={addToRemessaRef}>
                        <button
                          onClick={() => setShowAddToDropdown(!showAddToDropdown)}
                          className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-blue-600 flex items-center gap-1.5"
                        >
                          <Plus size={11} /> Adicionar a...
                        </button>
                        {showAddToDropdown && (
                          <div className="absolute bottom-full right-0 mb-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 w-48 py-1">
                            {openRemessas.map(rem => (
                              <button
                                key={rem.id}
                                onClick={() => { handleAddToRemessa(rem.id); setShowAddToDropdown(false); }}
                                className="w-full text-left px-3 py-2.5 text-xs text-zinc-700 hover:bg-blue-50 transition-colors"
                              >
                                <span className="font-bold">{rem.code}</span>
                                <span className="text-zinc-400 ml-1">({rem.order_count} pedidos)</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                <button
                  onClick={() => { setSelectedOrders(new Set()); setBulkResult(null); }}
                  className="text-zinc-400 hover:text-white text-xs px-2 py-1.5"
                >
                  <X size={14} />
                </button>
              </div>
              {/* Bottom row: shipping cost summary for selected orders */}
              {filter === 'paid' && sfBalance !== null && (() => {
                const selectedShippingTotal = filteredOrders
                  .filter(o => selectedOrders.has(String(o.medusa_order_id || o.id)))
                  .reduce((sum, o) => sum + Number(o.shipping_fee || 0), 0);
                const sufficient = sfBalance >= selectedShippingTotal;
                return (
                  <div className={`flex items-center justify-between text-[11px] px-1 pt-1 border-t border-zinc-700 ${
                    sufficient ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    <span>Custo etiquetas selecionadas: <strong>R$ {formatCurrency(selectedShippingTotal)}</strong></span>
                    <span>
                      {sufficient
                        ? <span className="text-emerald-400">Saldo OK (R$ {formatCurrency(sfBalance)})</span>
                        : <span className="text-red-400">Saldo insuficiente — desmarque uma ou mais</span>
                      }
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ============ BULK CONFIRM MODAL (enhanced) ============ */}
      {showBulkConfirm && bulkAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBulkConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto bg-amber-50 rounded-full flex items-center justify-center">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <h3 className="font-bold text-zinc-900 text-lg">Confirmar operacao em massa</h3>
              <p className="text-sm text-zinc-500">
                {bulkAction === 'mark_paid' && (
                  <>Voce vai marcar <strong>{selectedOrders.size} pedido{selectedOrders.size > 1 ? 's' : ''}</strong> como <span className="text-emerald-600 font-semibold">pago</span>.</>
                )}
                {bulkAction === 'mark_paid_label' && (
                  <>Voce vai marcar <strong>{selectedOrders.size} pedido{selectedOrders.size > 1 ? 's' : ''}</strong> como <span className="text-emerald-600 font-semibold">pago</span> e <span className="text-orange-600 font-semibold">gerar etiqueta</span> para cada um.</>
                )}
                {bulkAction === 'pay_labels' && (
                  <>Voce vai <span className="text-orange-600 font-semibold">gerar e pagar as etiquetas</span> de <strong>{selectedOrders.size} pedido{selectedOrders.size > 1 ? 's' : ''}</strong> usando o saldo SuperFrete. Os pedidos serao processados <strong>um por vez</strong>, com intervalo de 2 segundos entre cada. Pedidos que ja possuem etiqueta serao apenas pagos. Pedidos SEM etiqueta terao a etiqueta gerada automaticamente.</>
                )}
                {bulkAction === 'revert_to_paid' && (
                  <>Voce vai reverter <strong>{selectedOrders.size} pedido{selectedOrders.size > 1 ? 's' : ''}</strong> cancelado{selectedOrders.size > 1 ? 's' : ''} para <span className="text-emerald-600 font-semibold">pago</span>. Os dados da etiqueta SuperFrete serao limpos, permitindo gerar nova etiqueta. <strong>Nenhuma chamada a API da SuperFrete sera feita.</strong></>
                )}
              </p>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-left text-xs text-red-700">
                <p className="font-bold flex items-center gap-1"><AlertTriangle size={12} /> Atencao:</p>
                <p className="mt-1">Esta acao altera o status real dos pedidos e <strong>nao pode ser facilmente desfeita</strong>. Confira se os pedidos corretos estao selecionados.</p>
              </div>
              {bulkAction === 'mark_paid_label' && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-left text-xs text-amber-700">
                  <p className="font-bold">Importante:</p>
                  <p>Se a geracao de etiqueta falhar para um pedido, ele NAO sera marcado como pago (garantia de consistencia).</p>
                </div>
              )}
              {bulkAction === 'pay_labels' && sfBalance !== null && (() => {
                const selectedShippingTotal = filteredOrders
                  .filter(o => selectedOrders.has(String(o.medusa_order_id || o.id)))
                  .reduce((sum, o) => sum + Number(o.shipping_fee || 0), 0);
                const ordersWithoutLabel = filteredOrders
                  .filter(o => selectedOrders.has(String(o.medusa_order_id || o.id)) && !o.superfrete_id).length;
                const ordersWithLabel = filteredOrders
                  .filter(o => selectedOrders.has(String(o.medusa_order_id || o.id)) && !!o.superfrete_id).length;
                const sufficient = sfBalance >= selectedShippingTotal;
                return (
                  <div className={`rounded-xl p-3 text-left text-xs border space-y-1.5 ${sufficient ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                    <p>Custo total estimado: <strong>R$ {formatCurrency(selectedShippingTotal)}</strong></p>
                    <p>Saldo disponivel: <strong>R$ {formatCurrency(sfBalance)}</strong></p>
                    {ordersWithoutLabel > 0 && <p className="text-blue-600">📋 {ordersWithoutLabel} pedido{ordersWithoutLabel > 1 ? 's' : ''} sem etiqueta (serao geradas automaticamente)</p>}
                    {ordersWithLabel > 0 && <p className="text-emerald-600">✓ {ordersWithLabel} pedido{ordersWithLabel > 1 ? 's' : ''} ja com etiqueta</p>}
                    {!sufficient && <p className="font-bold mt-1">Saldo insuficiente! Desmarque algumas para prosseguir.</p>}
                  </div>
                );
              })()}
              {bulkAction === 'revert_to_paid' && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-left text-xs text-emerald-700">
                  <p className="font-bold flex items-center gap-1"><RotateCcw size={12} /> O que sera feito:</p>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    <li>Status sera alterado de <strong>cancelado</strong> para <strong>pago</strong></li>
                    <li>Dados da etiqueta SuperFrete serao limpos</li>
                    <li>Nova etiqueta podera ser gerada</li>
                    <li>Nenhuma chamada a API da SuperFrete</li>
                  </ul>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={executeBulkAction}
                disabled={bulkProcessing || (bulkAction === 'pay_labels' && sfBalance !== null && sfBalance < filteredOrders.filter(o => selectedOrders.has(String(o.medusa_order_id || o.id))).reduce((sum, o) => sum + Number(o.shipping_fee || 0), 0))}
                className="w-full bg-zinc-900 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkProcessing ? 'Processando...' : `Sim, executar para ${selectedOrders.size} pedido${selectedOrders.size > 1 ? 's' : ''}`}
              </button>
              <button
                onClick={() => { setShowBulkConfirm(false); setBulkAction(null); }}
                className="w-full text-zinc-500 py-2.5 rounded-xl text-sm font-medium hover:bg-zinc-50 border border-zinc-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ REMESSA MESSAGE BANNER ============ */}
      {remessaMessage && (
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
          remessaMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
          remessaMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
          'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          {remessaMessage.type === 'success' ? <CheckCircle2 size={14} className="shrink-0" /> :
           remessaMessage.type === 'error' ? <XCircle size={14} className="shrink-0" /> :
           <Package size={14} className="shrink-0" />}
          <p className="flex-1">{remessaMessage.text}</p>
          <button onClick={() => setRemessaMessage(null)} className="text-zinc-400 hover:text-zinc-600">&times;</button>
        </div>
      )}

      {/* ============ REMESSA AREA — CLEAN MOBILE-FIRST UX (only in 'preparing' tab) ============ */}
      {filter === 'preparing' && (
        <div className="space-y-2">
          {/* --- Compact filter chips --- */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
            {[
              { key: 'all' as const, label: 'Todos', count: filteredOrders.length, color: 'purple' },
              { key: 'no_remessa' as const, label: 'Sem remessa', count: preparingWithoutRemessa.length, color: 'amber' },
              { key: 'in_remessa' as const, label: 'Com remessa', count: preparingWithRemessa.length, color: 'emerald' },
            ].map(chip => (
              <button
                key={chip.key}
                onClick={() => setRemessaFilter(chip.key)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                  remessaFilter === chip.key
                    ? chip.color === 'purple' ? 'bg-purple-600 text-white border-purple-600'
                      : chip.color === 'amber' ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-zinc-500 border-zinc-200'
                }`}
              >
                {chip.label} ({chip.count})
              </button>
            ))}
            {openRemessas.map(rem => (
              <button
                key={rem.id}
                onClick={() => { setRemessaFilter(rem.id); setActiveRemessaId(rem.id); }}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                  remessaFilter === rem.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-blue-600 border-blue-200'
                }`}
              >
                {rem.code} ({rem.order_count})
              </button>
            ))}
          </div>

          {/* --- Active remessa card (shown when filtering by specific remessa) --- */}
          {typeof remessaFilter === 'number' && activeRemessa && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                    <Package size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-900">{activeRemessa.code}</p>
                    <p className="text-[10px] text-blue-500">{activeRemessa.order_count} pedidos · {activeRemessa.status === 'open' ? 'Aberta' : 'Fechada'}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRemessaPDF(activeRemessa.id)}
                  disabled={generatingPDF}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                >
                  {generatingPDF ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  PDF
                </button>
                <button
                  onClick={() => handleRemessaLabels(activeRemessa.id)}
                  disabled={printingLabels}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {printingLabels ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                  Etiquetas
                </button>
                {activeRemessa.status === 'open' && (
                  <button
                    onClick={() => handleUndoRemessa(activeRemessa.id)}
                    className="flex items-center justify-center gap-1 text-[10px] font-semibold px-3 py-2 rounded-lg text-red-600 bg-white border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    <RotateCcw size={10} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* --- No remessas yet? Show clear CTA --- */}
          {openRemessas.length === 0 && filteredOrders.length > 0 && selectedOrders.size === 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                <Package size={16} className="text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-purple-800">Nenhuma remessa criada</p>
                <p className="text-[10px] text-purple-500">Selecione pedidos para criar uma remessa e gerar PDF/etiquetas</p>
              </div>
              <button
                onClick={selectEligibleOrders}
                disabled={preparingWithoutRemessa.length === 0}
                className="shrink-0 bg-purple-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                Selecionar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active filter label */}
      {filter !== 'all' && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            {STATUS_FILTERS.find(s => s.key === filter)?.label || filter} ({displayOrders.length})
            {filter !== 'preparing' && ordersWithLabel.length > 0 && (
              <span className="ml-2 text-emerald-500">
                <Tag size={10} className="inline -mt-0.5" /> {ordersWithLabelToday.length} hoje / {ordersWithLabel.length} total
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {(filter === 'awaiting_payment' || filter === 'paid' || filter === 'cancelled') && filteredOrders.length > 0 && (
              <button
                onClick={toggleAllOrders}
                className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
              >
                {selectedOrders.size === filteredOrders.length ? <CheckSquare size={12} /> : <Square size={12} />}
                {selectedOrders.size === filteredOrders.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            )}
            {filter === 'preparing' && filteredOrders.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={selectEligibleOrders}
                  disabled={preparingWithoutRemessa.length === 0}
                  className="text-xs text-purple-500 hover:text-purple-700 flex items-center gap-1 disabled:opacity-40"
                >
                  <CheckSquare size={12} /> Selecionar elegiveis
                </button>
                <button
                  onClick={() => setShowRemessaOverlay(true)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
                >
                  <Eye size={12} /> Remessas
                </button>
              </div>
            )}
            <button onClick={() => setFilter('all')} className="text-xs text-zinc-400 hover:text-zinc-600 underline">
              Ver todos
            </button>
          </div>
        </div>
      )}

      {/* ============ ORDER LIST ============ */}
      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={24} className="animate-spin text-zinc-300 mx-auto" />
          <p className="text-zinc-400 mt-3 text-sm">Carregando pedidos...</p>
        </div>
      ) : displayOrders.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-zinc-100 text-center">
          <Package size={32} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">
            {filter === 'all'
              ? 'Nenhum pedido ainda.'
              : filter === 'preparing' && remessaFilter !== 'all'
                ? 'Nenhum pedido neste filtro de remessa.'
                : `Nenhum pedido "${STATUS_FILTERS.find(s => s.key === filter)?.label}".`}
          </p>
        </div>
      ) : (
        <div className={`space-y-2 ${selectedOrders.size > 0 ? 'pb-24' : ''}`}>
          {displayOrders.map(order => {
            const medusaId = order.medusa_order_id || '';
            const remessaMapping = filter === 'preparing' ? orderRemessaMap[medusaId] : null;
            return (
              <OrderListItem
                key={order.id}
                order={order}
                showCheckbox={filter === 'awaiting_payment' || filter === 'paid' || filter === 'cancelled' || filter === 'preparing'}
                isSelected={selectedOrders.has(String(order.medusa_order_id || order.id))}
                onToggleSelect={() => toggleOrderSelection(String(order.medusa_order_id || order.id))}
                remessaCode={remessaMapping?.remessa_code || null}
                onRemoveFromRemessa={remessaMapping ? () => handleRemoveFromRemessa(medusaId, order.id) : undefined}
                onClick={() => {
                  // Save scroll position before navigating to detail
                  sessionStorage.setItem(PERSIST_KEYS.scrollY, String(window.scrollY));
                  navigate(`/store/admin/pedido/${order.id}?from=${filter}`);
                }}
              />
            );
          })}
        </div>
      )}

      {/* ============ FLOATING PROGRESS BAR ============ */}
      {progressData.active && (
        <div
          className="fixed z-50 transition-all duration-300 ease-in-out"
          style={{
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: progressData.expanded ? '85%' : '70%',
            maxWidth: progressData.expanded ? '600px' : '420px',
            maxHeight: progressData.expanded ? '50vh' : 'auto',
          }}
        >
          <div className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-700 overflow-hidden">
            {/* Compact bar (always visible) */}
            <div
              className="px-4 py-3 cursor-pointer"
              onClick={() => setProgressData(prev => ({ ...prev, expanded: !prev.expanded }))}
            >
              <div className="flex items-center gap-3">
                {/* Icon: spinning during process, check/alert after */}
                {progressData.current < progressData.total ? (
                  <Loader2 size={16} className="text-orange-400 animate-spin shrink-0" />
                ) : progressData.failed > 0 ? (
                  <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                ) : (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-bold truncate">{progressData.operation}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-zinc-400 text-[10px]">
                      {progressData.current < progressData.total
                        ? `${progressData.current} de ${progressData.total}`
                        : 'Concluido'}
                    </span>
                    {progressData.succeeded > 0 && (
                      <span className="text-emerald-400 text-[10px]">{progressData.succeeded} OK</span>
                    )}
                    {progressData.failed > 0 && (
                      <span className="text-red-400 text-[10px]">{progressData.failed} erro{progressData.failed > 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>

                {/* Expand/collapse toggle */}
                <button className="text-zinc-400 hover:text-white p-1 shrink-0">
                  {progressData.expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>

                {/* Close button (only after complete) */}
                {progressData.current >= progressData.total && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setProgressData(prev => ({ ...prev, active: false })); }}
                    className="text-zinc-500 hover:text-white p-1 shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    progressData.failed > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: progressData.total > 0 ? `${(progressData.current / progressData.total) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Expanded detail list */}
            {progressData.expanded && (
              <div className="border-t border-zinc-800 max-h-[40vh] overflow-y-auto">
                {progressData.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2.5 px-4 py-2 text-xs border-b border-zinc-800/50 last:border-0 ${
                      item.status === 'error' ? 'bg-red-900/20' : item.status === 'completed' ? 'bg-emerald-900/10' : ''
                    }`}
                  >
                    {/* Status icon */}
                    {item.status === 'pending' && <Clock size={12} className="text-zinc-500 shrink-0" />}
                    {item.status === 'generating' && <Loader2 size={12} className="text-orange-400 animate-spin shrink-0" />}
                    {item.status === 'paying' && <Wallet size={12} className="text-blue-400 animate-pulse shrink-0" />}
                    {item.status === 'completed' && <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />}
                    {item.status === 'error' && <XCircle size={12} className="text-red-400 shrink-0" />}

                    <span className="text-zinc-300 flex-1 min-w-0 truncate">{item.label}</span>

                    {item.status === 'completed' && <span className="text-emerald-400 text-[10px] shrink-0">OK</span>}
                    {item.status === 'error' && (
                      <span className="text-red-400 text-[10px] shrink-0 max-w-[40%] truncate" title={item.error}>
                        {item.error}
                      </span>
                    )}
                    {(item.status === 'generating' || item.status === 'paying') && (
                      <span className="text-orange-400 text-[10px] shrink-0">Processando...</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ REMESSA MANAGEMENT OVERLAY ============ */}
      {showRemessaOverlay && (
        <RemessaManagementOverlay
          remessas={remessas}
          allOrders={orders}
          onClose={() => setShowRemessaOverlay(false)}
          onPDF={handleRemessaPDF}
          onLabels={handleRemessaLabels}
          onUndo={handleUndoRemessa}
          onCloseRemessa={async (remId) => { await closeRemessa(remId); await loadRemessas(); }}
          onReopen={async (remId) => { await reopenRemessa(remId); await loadRemessas(); }}
          savedPDFs={savedPDFs}
          onDownload={handleDownloadPDF}
          onShare={handleSharePDF}
          onDelete={(pdf) => handleDeletePDF(pdf.id)}
        />
      )}

      {/* ============ PDF MANAGEMENT OVERLAY ============ */}
      {showPDFOverlay && (
        <LabelDatePDFOverlay
          allOrders={orders}
          onClose={() => setShowPDFOverlay(false)}
          buildPDFForOrders={buildPDFForOrders}
          savedPDFs={savedPDFs}
          onSavePDF={(pdf) => { savePDF(pdf); setSavedPDFs(getSavedPDFs()); }}
          onDownload={handleDownloadPDF}
          onShare={handleSharePDF}
          onDelete={(pdf) => handleDeletePDF(pdf.id)}
        />
      )}

      {/* ============ LABEL PRINT OVERLAY ============ */}
      {showLabelOverlay && (
        <LabelPrintOverlay
          allOrders={orders}
          onClose={() => setShowLabelOverlay(false)}
        />
      )}
    </div>
  );
}

// ============ LABEL DATE PDF OVERLAY (90% screen popup) ============
function LabelDatePDFOverlay({
  allOrders,
  onClose,
  buildPDFForOrders,
  savedPDFs,
  onSavePDF,
  onDownload,
  onShare,
  onDelete,
}: {
  allOrders: any[];
  onClose: () => void;
  buildPDFForOrders: (orders: any[], dateLabel: string) => string;
  savedPDFs: GeneratedPDF[];
  onSavePDF: (pdf: GeneratedPDF) => void;
  onDownload: (pdf: GeneratedPDF) => void;
  onShare: (pdf: GeneratedPDF) => void;
  onDelete: (pdf: GeneratedPDF) => void;
}) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dates' | 'history'>('dates');

  // Group ALL orders that have labels by their OPERATIONAL DAY
  // Operational day: starts at 00:00 and goes until 05:59:59 of the NEXT calendar day.
  // So if a label was generated at 2am on day 11, it belongs to operational day 10.
  // If generated at 7am on day 11, it belongs to operational day 11.
  const paidStatuses = ['paid', 'preparing', 'shipped', 'delivered'];
  const ordersWithLabels = allOrders.filter(o => !!o.superfrete_id && paidStatuses.includes(o.status) && !isOrderArchived(o));

  /**
   * Get the operational day key for a given date.
   * If the hour is < 6 (00:00-05:59), the order belongs to the previous calendar day.
   */
  const getOperationalDayKey = (dateStr: string): { dateKey: string; dateLabel: string } => {
    const d = new Date(dateStr);
    // If hour < 6, this belongs to the previous operational day
    if (d.getHours() < 6) {
      d.setDate(d.getDate() - 1);
    }
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return { dateKey, dateLabel };
  };

  // Group by operational day of label generation
  const dateGroups: Record<string, { dateKey: string; dateLabel: string; orders: any[] }> = {};

  ordersWithLabels.forEach(order => {
    // CRITICAL FIX: Only use label_generated_at for grouping.
    // Fallback to created_at only if label_generated_at is missing (should not happen after backfill).
    // NEVER use updated_at — it changes every time sync runs, causing orders to appear on wrong days.
    const labelDate = order.label_generated_at || order.created_at;
    if (!labelDate) return; // Skip orders with no date at all
    const { dateKey, dateLabel } = getOperationalDayKey(labelDate);

    if (!dateGroups[dateKey]) {
      dateGroups[dateKey] = { dateKey, dateLabel, orders: [] };
    }
    dateGroups[dateKey].orders.push(order);
  });

  // Sort by date descending (most recent first)
  const sortedDates = Object.values(dateGroups).sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  // Today/Yesterday labels (using operational day logic)
  const today = new Date();
  // If current time is before 6am, operational "today" is yesterday
  const operationalToday = new Date(today);
  if (operationalToday.getHours() < 6) {
    operationalToday.setDate(operationalToday.getDate() - 1);
  }
  const todayKey = `${operationalToday.getFullYear()}-${String(operationalToday.getMonth() + 1).padStart(2, '0')}-${String(operationalToday.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(operationalToday);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  const getDateDisplayName = (dateKey: string, dateLabel: string) => {
    if (dateKey === todayKey) return `Hoje (${dateLabel})`;
    if (dateKey === yesterdayKey) return `Ontem (${dateLabel})`;
    return dateLabel;
  };

  const generatePDFForDate = async (group: { dateKey: string; dateLabel: string; orders: any[] }) => {
    setGenerating(group.dateKey);
    try {
      const dateStr = getDateDisplayName(group.dateKey, group.dateLabel);
      const dataUrl = buildPDFForOrders(group.orders, dateStr);
      const fileName = `ETIQUETAS-${group.dateKey}.pdf`;
      const pdfEntry: GeneratedPDF = {
        id: `pdf_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name: fileName,
        filter: 'label_date',
        filterLabel: dateStr,
        date: new Date().toISOString(),
        orderCount: group.orders.length,
        dataUrl,
      };
      onSavePDF(pdfEntry);

      // Auto-download
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar PDF.');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full h-[90vh] max-w-2xl rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
          <div>
            <h3 className="font-bold text-zinc-900 text-base">Gerar PDF de Etiquetas</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Dia operacional: 00:00 ate 06:00 do dia seguinte</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-100 shrink-0">
          <button
            onClick={() => setActiveTab('dates')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === 'dates' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            Por Dia
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === 'history' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            Historico ({savedPDFs.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'dates' ? (
            // ---- DATES TAB ----
            sortedDates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Tag size={36} className="text-zinc-200 mb-3" />
                <p className="text-zinc-400 text-sm">Nenhum pedido com etiqueta gerada.</p>
                <p className="text-zinc-300 text-xs mt-1">Gere etiquetas nos pedidos pagos primeiro.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {sortedDates.map(group => (
                  <div key={group.dateKey} className="px-5 py-3.5 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-900">
                          {getDateDisplayName(group.dateKey, group.dateLabel)}
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {group.orders.length} {group.orders.length === 1 ? 'pedido' : 'pedidos'} com etiqueta
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {group.orders.slice(0, 8).map(o => (
                            <span key={o.id} className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">
                              #{o.id}
                            </span>
                          ))}
                          {group.orders.length > 8 && (
                            <span className="text-[10px] text-zinc-400">+{group.orders.length - 8} mais</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => generatePDFForDate(group)}
                        disabled={generating === group.dateKey}
                        className="shrink-0 ml-3 bg-zinc-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                      >
                        {generating === group.dateKey ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Download size={12} />
                        )}
                        {generating === group.dateKey ? 'Gerando...' : 'Gerar PDF'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // ---- HISTORY TAB ----
            savedPDFs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <FileText size={36} className="text-zinc-200 mb-3" />
                <p className="text-zinc-400 text-sm">Nenhum PDF gerado ainda.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {savedPDFs.map(pdf => (
                  <div key={pdf.id} className="px-5 py-3.5 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText size={16} className="text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate">{pdf.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
                          <span>{new Date(pdf.date).toLocaleDateString('pt-BR')}</span>
                          <span className="text-zinc-200">|</span>
                          <span>{new Date(pdf.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="text-zinc-200">|</span>
                          <span>{pdf.orderCount} {pdf.orderCount === 1 ? 'pedido' : 'pedidos'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => onShare(pdf)} className="p-2 rounded-lg text-zinc-300 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Compartilhar">
                          <Share2 size={15} />
                        </button>
                        <button onClick={() => onDownload(pdf)} className="p-2 rounded-lg text-zinc-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Baixar">
                          <Download size={15} />
                        </button>
                        <button onClick={() => { if (confirm('Excluir este PDF?')) onDelete(pdf); }} className="p-2 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Excluir">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}


// ============ HELPER: Generate declaration of content PDF for orders ============
function generateDeclarationPDF(ordersForDeclaration: any[]): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  ordersForDeclaration.forEach((order, idx) => {
    if (idx > 0) doc.addPage();

    const cep = order.address_components?.cep || '';
    const customerName = order.customer_name || 'N/A';

    // ---- IDENTIFICATION HEADER (top of each page) ----
    doc.setFillColor(245, 245, 247);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setFillColor(249, 115, 22); // orange accent
    doc.rect(0, 22, pageWidth, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(24, 24, 27);
    doc.text(`Pedido #${order.id}`, margin, 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 110);
    doc.text(`${customerName}`, margin, 15);
    doc.text(`CEP: ${cep || 'N/A'}`, margin, 20);

    // Date on the right
    const dateStr = new Date(order.created_at).toLocaleDateString('pt-BR');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 155);
    doc.text(dateStr, pageWidth - margin, 9, { align: 'right' });
    const shippingName = order.shipping_service === 1 ? 'PAC' : order.shipping_service === 2 ? 'SEDEX' : '';
    if (shippingName) {
      doc.text(shippingName, pageWidth - margin, 15, { align: 'right' });
    }

    // ---- DECLARATION TITLE ----
    let y = 32;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(24, 24, 27);
    doc.text('DECLARACAO DE CONTEUDO', pageWidth / 2, y, { align: 'center' });
    y += 10;

    // ---- SENDER INFO ----
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 80);
    doc.text('REMETENTE:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text('Dente de Tubarao - Loja de Linhas', margin + 28, y);
    y += 6;

    // ---- RECIPIENT INFO ----
    doc.setFont('helvetica', 'bold');
    doc.text('DESTINATARIO:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(customerName, margin + 32, y);
    y += 5;
    if (order.customer_address) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 110);
      const addrLines = doc.splitTextToSize(order.customer_address, pageWidth - margin * 2 - 32);
      doc.text(addrLines, margin + 32, y);
      y += addrLines.length * 4 + 2;
    }
    y += 4;

    // ---- ITEMS TABLE ----
    const items = order.items || [];
    // Expand items: repeat each product line instead of using quantity notation
    const expandedItems: { title: string; price: number }[] = [];
    items.forEach((item: any) => {
      const qty = item.quantity || 1;
      for (let q = 0; q < qty; q++) {
        expandedItems.push({ title: item.title || 'Produto', price: Number(item.price || 0) });
      }
    });
    const tableData = expandedItems.map((item, i) => [
      String(i + 1),
      item.title,
      '1',
      `R$ ${formatCurrency(item.price)}`,
    ]);

    const totalValue = expandedItems.reduce((sum, item) => sum + item.price, 0);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['N', 'Descricao do Conteudo', 'Qtd', 'Valor (R$)']],
      body: [
        ...tableData,
        ['', 'TOTAL', '', `R$ ${formatCurrency(totalValue)}`],
      ],
      theme: 'grid',
      headStyles: {
        fillColor: [24, 24, 27],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [55, 55, 60],
        cellPadding: 2.5,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
      },
    });

    // ---- DISCLAIMER ----
    const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 155);
    doc.text(
      'Declaro que nao estou postando nenhum item proibido conforme o art. 13 do regulamento postal.',
      margin, finalY + 10
    );

    // ---- SIGNATURE LINE ----
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, finalY + 30, pageWidth / 2 - 5, finalY + 30);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 110);
    doc.text('Assinatura do remetente', margin, finalY + 35);
  });

  return doc.output('dataurlstring');
}

// ============ LABEL PRINT OVERLAY (same date filter logic as PDF) ============
function LabelPrintOverlay({ allOrders, onClose }: { allOrders: any[]; onClose: () => void }) {
  const [printing, setPrinting] = useState<string | null>(null);
  const [generatingDecl, setGeneratingDecl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'dates' | 'all'>('dates');

  // Include ALL statuses for old orders — not just paid statuses
  // This fixes the bug where old orders (already shipped/delivered) couldn't be printed
  const relevantStatuses = ['paid', 'preparing', 'shipped', 'delivered'];
  const ordersWithLabels = allOrders.filter(o => !!o.superfrete_id && relevantStatuses.includes(o.status) && !isOrderArchived(o));

  const getOperationalDayKey = (dateStr: string): { dateKey: string; dateLabel: string } => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      // Fallback for invalid dates (old orders)
      return { dateKey: '0000-00-00', dateLabel: 'Data desconhecida' };
    }
    if (d.getHours() < 6) d.setDate(d.getDate() - 1);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return { dateKey, dateLabel };
  };

  const dateGroups: Record<string, { dateKey: string; dateLabel: string; orders: any[] }> = {};
  ordersWithLabels.forEach(order => {
    // CRITICAL FIX: Only use label_generated_at for grouping.
    // Fallback to created_at only if missing. NEVER use updated_at (changes on sync).
    const labelDate = order.label_generated_at || order.created_at;
    const { dateKey, dateLabel } = getOperationalDayKey(labelDate);
    if (!dateGroups[dateKey]) dateGroups[dateKey] = { dateKey, dateLabel, orders: [] };
    dateGroups[dateKey].orders.push(order);
  });

  const sortedDates = Object.values(dateGroups).sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  const today = new Date();
  const operationalToday = new Date(today);
  if (operationalToday.getHours() < 6) operationalToday.setDate(operationalToday.getDate() - 1);
  const todayKey = `${operationalToday.getFullYear()}-${String(operationalToday.getMonth() + 1).padStart(2, '0')}-${String(operationalToday.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(operationalToday);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  const getDateDisplayName = (dateKey: string, dateLabel: string) => {
    if (dateKey === todayKey) return `Hoje (${dateLabel})`;
    if (dateKey === yesterdayKey) return `Ontem (${dateLabel})`;
    if (dateKey === '0000-00-00') return 'Data desconhecida';
    return dateLabel;
  };

  const printLabelsForDate = async (group: { dateKey: string; dateLabel: string; orders: any[] }) => {
    setPrinting(group.dateKey);
    setError(null);
    try {
      const sfIds = group.orders.map(o => o.superfrete_id).filter(Boolean);
      if (sfIds.length === 0) {
        setError('Nenhuma etiqueta SuperFrete para imprimir neste dia.');
        return;
      }

      // Build order_info to send to backend for PDF header identification
      const orderInfo = group.orders
        .filter(o => o.superfrete_id)
        .map(o => ({
          superfrete_id: o.superfrete_id,
          order_id: o.id,
          customer_name: o.customer_name || '',
          cep: o.address_components?.cep || '',
        }));

      const result = await adminFetch('/admin/superfrete', {
        method: 'POST',
        body: JSON.stringify({ action: 'print', orders: sfIds, order_info: orderInfo }),
      });

      if (result.success && result.data?.pdf_base64) {
        // Modified PDF returned as base64 — open as blob
        const byteCharacters = atob(result.data.pdf_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } else if (result.success && result.data?.url) {
        // Fallback: open original SuperFrete URL
        window.open(result.data.url, '_blank');
      } else {
        setError(result.error || 'Erro ao obter link de impressao. Verifique se as etiquetas foram pagas.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao imprimir');
    } finally {
      setPrinting(null);
    }
  };

  const printDeclarationForDate = (group: { dateKey: string; dateLabel: string; orders: any[] }) => {
    setGeneratingDecl(group.dateKey);
    try {
      const dataUrl = generateDeclarationPDF(group.orders);
      // Auto download
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `DECLARACAO-${group.dateKey}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError('Erro ao gerar declaracao de conteudo.');
    } finally {
      setGeneratingDecl(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full h-[90vh] max-w-2xl rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
          <div>
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <Printer size={18} className="text-orange-500" />
              Imprimir Etiquetas e Declaracoes
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">Selecione o dia para imprimir etiquetas e declaracoes de conteudo</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs: By date / All with label */}
        <div className="flex border-b border-zinc-100 shrink-0">
          <button
            onClick={() => setViewMode('dates')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              viewMode === 'dates' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            Por Dia ({sortedDates.length})
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              viewMode === 'all' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            Todos com Etiqueta ({ordersWithLabels.length})
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'all' ? (
            // ALL view: print all at once
            ordersWithLabels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Printer size={36} className="text-zinc-200 mb-3" />
                <p className="text-zinc-400 text-sm">Nenhuma etiqueta para imprimir.</p>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                <p className="text-xs text-zinc-500">{ordersWithLabels.length} pedido{ordersWithLabels.length > 1 ? 's' : ''} com etiqueta gerada</p>
                <div className="flex flex-wrap gap-1">
                  {ordersWithLabels.slice(0, 20).map(o => (
                    <span key={o.id} className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded font-mono">
                      #{o.id} {o.customer_name?.split(' ')[0]} · {o.address_components?.cep || 'CEP?'}
                    </span>
                  ))}
                  {ordersWithLabels.length > 20 && (
                    <span className="text-[10px] text-zinc-400">+{ordersWithLabels.length - 20} mais</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => printLabelsForDate({ dateKey: 'all', dateLabel: 'Todos', orders: ordersWithLabels })}
                    disabled={printing === 'all'}
                    className="bg-orange-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {printing === 'all' ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                    {printing === 'all' ? 'Abrindo...' : 'Imprimir Todas Etiquetas'}
                  </button>
                  <button
                    onClick={() => printDeclarationForDate({ dateKey: 'all', dateLabel: 'Todos', orders: ordersWithLabels })}
                    disabled={generatingDecl === 'all'}
                    className="bg-zinc-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {generatingDecl === 'all' ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
                    {generatingDecl === 'all' ? 'Gerando...' : 'Declaracoes de Conteudo'}
                  </button>
                </div>
              </div>
            )
          ) : (
            // DATES view
            sortedDates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Printer size={36} className="text-zinc-200 mb-3" />
                <p className="text-zinc-400 text-sm">Nenhuma etiqueta para imprimir.</p>
                <p className="text-zinc-300 text-xs mt-1">Gere e finalize etiquetas nos pedidos primeiro.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {sortedDates.map(group => (
                  <div key={group.dateKey} className="px-5 py-3.5 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-900">
                          {getDateDisplayName(group.dateKey, group.dateLabel)}
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {group.orders.length} {group.orders.length === 1 ? 'etiqueta' : 'etiquetas'}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {group.orders.slice(0, 8).map(o => (
                            <span key={o.id} className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded font-mono">
                              #{o.id} {o.customer_name?.split(' ')[0]}
                            </span>
                          ))}
                          {group.orders.length > 8 && (
                            <span className="text-[10px] text-zinc-400">+{group.orders.length - 8} mais</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button
                          onClick={() => printLabelsForDate(group)}
                          disabled={printing === group.dateKey}
                          className="bg-orange-500 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                        >
                          {printing === group.dateKey ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Printer size={11} />
                          )}
                          {printing === group.dateKey ? 'Abrindo...' : 'Etiquetas'}
                        </button>
                       
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}


// ============ COMPACT ORDER LIST ITEM ============
function OrderListItem({ order, onClick, showCheckbox, isSelected, onToggleSelect, remessaCode, onRemoveFromRemessa }: { order: any; onClick: () => void; key?: any; showCheckbox?: boolean; isSelected?: boolean; onToggleSelect?: () => void; remessaCode?: string | null; onRemoveFromRemessa?: () => void }) {
  const sc = getStatusConfig(order.status);
  const shippingName = order.shipping_service === 1 ? 'PAC' : order.shipping_service === 2 ? 'SEDEX' : '';
  const itemCount = order.items?.length || 0;
  const hasLabel = !!order.superfrete_id;
  const missingCPF = !order.customer_cpf;

  return (
    <div className="flex items-center gap-1.5 w-full max-w-full overflow-hidden">
      {showCheckbox && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            isSelected ? 'bg-zinc-900 border-zinc-900 text-white' : 'border-zinc-300 text-transparent hover:border-zinc-400'
          }`}
        >
          {isSelected ? <CheckSquare size={11} /> : <Square size={11} />}
        </button>
      )}
      <button
        onClick={onClick}
        className={`flex-1 min-w-0 bg-white rounded-xl border p-3 sm:p-4 flex items-center gap-2.5 hover:border-zinc-300 hover:shadow-sm transition-all text-left group active:scale-[0.99] overflow-hidden relative ${
          isSelected ? 'border-zinc-400 bg-zinc-50' : 'border-zinc-100'
        }`}
      >
      {/* CPF Missing Ribbon — top-right corner, only when CPF is absent */}
      {missingCPF && (
        <div
          className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] sm:text-[9px] font-bold uppercase tracking-wide leading-none flex items-center gap-0.5 sm:gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-bl-lg shadow-sm pointer-events-none select-none"
          style={{ zIndex: 2 }}
        >
          <AlertTriangle size={8} className="shrink-0 sm:w-[10px] sm:h-[10px]" />
          <span>Sem CPF</span>
        </div>
      )}

      {/* Status Dot */}
      <div className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />

      {/* Main Info */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-bold text-sm text-zinc-900 shrink-0">#{order.id}</span>
          <span className="text-zinc-300 shrink-0">·</span>
          <span className="text-xs text-zinc-500 truncate">{order.customer_name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 flex-wrap">
          <span className="shrink-0">{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
          {shippingName && <><span className="shrink-0">·</span><span className="shrink-0">{shippingName}</span></>}
          <span className="shrink-0">·</span>
          <span className="shrink-0">{itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
          {hasLabel && (
            <>
              <span className="shrink-0">·</span>
              <span className="text-orange-500 flex items-center gap-0.5 shrink-0"><Tag size={9} /> Etiqueta</span>
            </>
          )}
          {remessaCode && (
            <>
              <span className="shrink-0">·</span>
              <span className="text-blue-500 flex items-center gap-0.5 shrink-0"><Package size={9} /> {remessaCode}</span>
            </>
          )}
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="font-bold text-sm text-zinc-900 whitespace-nowrap">R$ {formatCurrency(Number(order.total_amount || 0))}</p>
          <span className={`inline-block ${sc.bg} ${sc.text} px-1.5 py-0.5 rounded-md text-[10px] font-bold mt-0.5 whitespace-nowrap`}>
            {sc.label}
          </span>
        </div>
        <ChevronRight size={14} className="text-zinc-300 group-hover:text-zinc-500 transition-colors" />
      </div>
    </button>
    </div>
  );
}
