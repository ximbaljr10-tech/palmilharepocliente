import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Loader2, Package, Calendar, FileDown, X, Search, Truck } from 'lucide-react';
import { adminFetch, isOrderArchived, formatCurrency } from './adminApi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// AdminSoldItems — Mobile-first, auto-filter, shipped toggle
// ============================================================
// Data source: /admin/pedidos (existing endpoint, no backend changes)
// Filtering: client-side on order.created_at + order.status
// PDF: jsPDF + autoTable (project dependencies)
// ============================================================
// CHANGES v2:
//  - Removed "Aplicar" button — filters apply automatically on change
//  - Added "Apenas enviados" toggle (shipped + delivered)
//  - Debounce 300ms on date changes to avoid excessive re-renders
//  - PDF respects all active filters
//  - Mobile-first clean UX
// ============================================================

interface ProductAggregate {
  title: string;
  totalQty: number;
  totalRevenue: number;
  saleDates: string[]; // unique dates as dd/mm/yyyy
}

// Format a Date to YYYY-MM-DD for <input type="date">
function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Format YYYY-MM-DD to dd/mm/yyyy for display
function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// Get date string dd/mm/yyyy from a Date object
function dateToDayStr(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export default function AdminSoldItems() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date filter state — default: current month
  // No dual state (applied vs pending) — filters apply immediately
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState(toInputDate(firstOfMonth));
  const [dateTo, setDateTo] = useState(toInputDate(now));

  // Debounced date values — actual filtering uses these
  const [debouncedFrom, setDebouncedFrom] = useState(toInputDate(firstOfMonth));
  const [debouncedTo, setDebouncedTo] = useState(toInputDate(now));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shipped-only filter
  const [onlyShipped, setOnlyShipped] = useState(false);

  // Search
  const [searchTerm, setSearchTerm] = useState('');

  // Loading indicator for filter changes (subtle, doesn't block UI)
  const [filtering, setFiltering] = useState(false);

  // Debounce date changes — 300ms delay
  useEffect(() => {
    setFiltering(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedFrom(dateFrom);
      setDebouncedTo(dateTo);
      setFiltering(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [dateFrom, dateTo]);

  useEffect(() => { loadOrders(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch('/admin/pedidos');
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        window.location.reload();
        return;
      }
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Filter orders: paid statuses, date range, shipped toggle
  const filteredOrders = useMemo(() => {
    // Base: only paid statuses (exclude awaiting_payment and cancelled)
    const paidStatuses = ['paid', 'preparing', 'shipped', 'delivered'];
    let filtered = orders.filter(o => paidStatuses.includes(o.status) && !isOrderArchived(o));

    // Shipped-only filter: show only shipped OR delivered
    // (delivered is a subset of shipped — every delivered order was shipped first)
    if (onlyShipped) {
      filtered = filtered.filter(o => o.status === 'shipped' || o.status === 'delivered');
    }

    // Date range filter (uses debounced values for smooth UX)
    if (debouncedFrom && debouncedTo) {
      const startDate = new Date(debouncedFrom + 'T00:00:00');
      const endDate = new Date(debouncedTo + 'T23:59:59.999');
      filtered = filtered.filter(o => {
        const d = new Date(o.created_at);
        return d >= startDate && d <= endDate;
      });
    } else if (debouncedFrom) {
      const startDate = new Date(debouncedFrom + 'T00:00:00');
      filtered = filtered.filter(o => new Date(o.created_at) >= startDate);
    } else if (debouncedTo) {
      const endDate = new Date(debouncedTo + 'T23:59:59.999');
      filtered = filtered.filter(o => new Date(o.created_at) <= endDate);
    }

    return filtered;
  }, [orders, debouncedFrom, debouncedTo, onlyShipped]);

  // Aggregate sold items by product title, including sale dates
  const productAggregates = useMemo(() => {
    const map = new Map<string, ProductAggregate>();

    filteredOrders.forEach(order => {
      const orderDate = dateToDayStr(new Date(order.created_at));
      (order.items || []).forEach((item: any) => {
        const title = (item.title || '').trim();
        if (!title) return;
        const qty = item.quantity || 1;
        const revenue = (Number(item.price) || 0) * qty;

        const existing = map.get(title);
        if (existing) {
          existing.totalQty += qty;
          existing.totalRevenue += revenue;
          if (!existing.saleDates.includes(orderDate)) {
            existing.saleDates.push(orderDate);
          }
        } else {
          map.set(title, {
            title,
            totalQty: qty,
            totalRevenue: revenue,
            saleDates: [orderDate],
          });
        }
      });
    });

    // Sort sale dates chronologically for each product
    map.forEach(product => {
      product.saleDates.sort((a, b) => {
        const [da, ma, ya] = a.split('/').map(Number);
        const [db, mb, yb] = b.split('/').map(Number);
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
      });
    });

    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredOrders]);

  // Search filter on product list
  const displayProducts = useMemo(() => {
    if (!searchTerm.trim()) return productAggregates;
    const term = searchTerm.toLowerCase().trim();
    return productAggregates.filter(p => p.title.toLowerCase().includes(term));
  }, [productAggregates, searchTerm]);

  // Summary metrics
  const totalItems = productAggregates.reduce((s, p) => s + p.totalQty, 0);
  const totalRevenue = productAggregates.reduce((s, p) => s + p.totalRevenue, 0);
  const uniqueProducts = productAggregates.length;

  // Quick period presets — set dates directly (auto-applies via debounce)
  const setPreset = useCallback((preset: 'today' | 'week' | 'month') => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);

    if (preset === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    } else if (preset === 'month') {
      start.setDate(1);
    }

    const from = toInputDate(start);
    const to = toInputDate(today);
    setDateFrom(from);
    setDateTo(to);
    // Apply immediately for presets (skip debounce)
    setDebouncedFrom(from);
    setDebouncedTo(to);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setFiltering(false);
  }, []);

  // Clear date filter (show all time)
  const handleClearDates = useCallback(() => {
    setDateFrom('');
    setDateTo('');
    setDebouncedFrom('');
    setDebouncedTo('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setFiltering(false);
  }, []);

  // Period label for display
  const periodLabel = useMemo(() => {
    if (!debouncedFrom && !debouncedTo) return 'Todo o periodo';
    if (debouncedFrom && debouncedTo) return `${formatDisplayDate(debouncedFrom)} a ${formatDisplayDate(debouncedTo)}`;
    if (debouncedFrom) return `A partir de ${formatDisplayDate(debouncedFrom)}`;
    return `Ate ${formatDisplayDate(debouncedTo)}`;
  }, [debouncedFrom, debouncedTo]);

  // ===================== PDF GENERATION =====================
  const generatePDF = useCallback(() => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatorio de Itens Vendidos', margin, y);
    y += 8;

    // Period + filter info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Periodo: ${periodLabel}`, margin, y);
    y += 5;

    // Shipped filter indicator
    if (onlyShipped) {
      doc.text('Filtro: Apenas enviados (enviados + entregues)', margin, y);
      y += 5;
    }

    // Generation date
    const genDate = new Date();
    doc.text(`Gerado em: ${dateToDayStr(genDate)} as ${String(genDate.getHours()).padStart(2, '0')}:${String(genDate.getMinutes()).padStart(2, '0')}`, margin, y);
    y += 8;

    // Summary
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total de itens vendidos: ${totalItems}`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Produtos unicos: ${uniqueProducts}`, margin, y);
    y += 5;
    doc.text(`Faturamento: R$ ${formatCurrency(totalRevenue)}`, margin, y);
    y += 10;

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Product table
    const tableData = productAggregates.map(p => [
      p.title,
      String(p.totalQty),
      p.saleDates.join(', '),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Produto', 'Qtd', 'Dias de venda']],
      body: tableData,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        overflow: 'linebreak',
        lineColor: [220, 220, 220],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [39, 39, 42], // zinc-800
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 'auto' },
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251], // zinc-50
      },
    });

    // Footer on last page
    // Note: cast to any due to outdated @types/jspdf (v1.3) conflicting with jspdf v4
    const pageCount = (doc as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      (doc as any).setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Pagina ${i} de ${pageCount} — Dente de Tubarao`,
        pageWidth / 2,
        (doc as any).internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    }

    // Generate filename
    const fromStr = debouncedFrom ? debouncedFrom.replace(/-/g, '') : 'todos';
    const toStr = debouncedTo ? debouncedTo.replace(/-/g, '') : 'todos';
    const shippedSuffix = onlyShipped ? '_enviados' : '';
    const filename = `itens-vendidos_${fromStr}_${toStr}${shippedSuffix}.pdf`;

    doc.save(filename);
  }, [productAggregates, periodLabel, totalItems, uniqueProducts, totalRevenue, debouncedFrom, debouncedTo, onlyShipped]);

  // ===================== RENDER =====================

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={28} className="animate-spin text-zinc-300" />
        <p className="text-zinc-400 text-sm">Carregando itens vendidos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-red-500 text-sm">{error}</p>
        <button
          onClick={loadOrders}
          className="px-4 py-2.5 bg-zinc-900 text-white text-sm font-semibold rounded-xl"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">

      {/* ===== HEADER + PERIOD SUBTITLE ===== */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          <Calendar size={12} className="inline -mt-0.5 mr-1" />
          {periodLabel}
          {onlyShipped && <span className="ml-1.5 text-blue-500 font-medium">· Enviados</span>}
        </p>
        {filtering && (
          <Loader2 size={14} className="animate-spin text-zinc-300" />
        )}
      </div>

      {/* ===== FILTER BLOCK ===== */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Filtros</p>

        {/* Quick presets */}
        <div className="flex gap-2">
          {[
            { key: 'today' as const, label: 'Hoje' },
            { key: 'week' as const, label: 'Semana' },
            { key: 'month' as const, label: 'Mes' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className="flex-1 py-2 px-2 rounded-lg text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-100 active:bg-zinc-100 transition-colors"
            >
              {p.label}
            </button>
          ))}
          {/* Clear dates button — only show when dates are set */}
          {(dateFrom || dateTo) && (
            <button
              onClick={handleClearDates}
              className="py-2 px-3 rounded-lg text-xs font-medium text-zinc-400 border border-zinc-100 active:bg-zinc-50 transition-colors"
              title="Limpar datas"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Date inputs — auto-apply on change */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] text-zinc-400 mb-1">De</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm text-zinc-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] text-zinc-400 mb-1">Ate</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm text-zinc-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors"
            />
          </div>
        </div>

        {/* Shipped-only toggle — auto-apply on change */}
        <button
          onClick={() => setOnlyShipped(prev => !prev)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
            onlyShipped
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-zinc-50 border-zinc-100 text-zinc-500'
          }`}
        >
          <Truck size={16} className={onlyShipped ? 'text-blue-500' : 'text-zinc-400'} />
          <span className="text-sm font-medium flex-1 text-left">Apenas enviados</span>
          {/* Toggle indicator */}
          <div className={`w-9 h-5 rounded-full relative transition-colors ${
            onlyShipped ? 'bg-blue-500' : 'bg-zinc-300'
          }`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              onlyShipped ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </div>
        </button>
      </div>

      {/* ===== SUMMARY CARDS ===== */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border border-zinc-100 p-3 text-center">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider leading-tight">Itens vendidos</p>
          <p className="text-xl font-black text-zinc-900 mt-1">{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-100 p-3 text-center">
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider leading-tight">Produtos</p>
          <p className="text-xl font-black text-zinc-900 mt-1">{uniqueProducts}</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-100 p-3 text-center">
          <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider leading-tight">Faturamento</p>
          <p className="text-lg font-black text-zinc-900 mt-1">
            <span className="text-xs font-semibold text-zinc-400">R$ </span>
            {formatCurrency(totalRevenue)}
          </p>
        </div>
      </div>

      {/* ===== SEARCH + PDF BUTTON ===== */}
      <div className="flex gap-2 items-center">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2.5 border border-zinc-200 rounded-xl text-sm text-zinc-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-300"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-300 hover:text-zinc-500"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={generatePDF}
          disabled={productAggregates.length === 0}
          className="flex items-center gap-1.5 py-2.5 px-4 bg-white border border-zinc-200 text-zinc-600 text-sm font-medium rounded-xl disabled:opacity-40 disabled:cursor-not-allowed active:bg-zinc-50 transition-colors shrink-0"
          title="Baixar PDF do periodo"
        >
          <FileDown size={15} />
          <span className="hidden sm:inline">PDF</span>
        </button>
      </div>

      {/* ===== PRODUCT LIST ===== */}
      {displayProducts.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-zinc-100 text-center">
          <Package size={28} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">
            {searchTerm
              ? 'Nenhum produto encontrado para esta busca.'
              : onlyShipped
                ? 'Nenhum item enviado no periodo selecionado.'
                : 'Nenhum item vendido no periodo selecionado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayProducts.map((product, idx) => (
            <div
              key={product.title}
              className="bg-white rounded-xl border border-zinc-100 p-4"
            >
              {/* Product name + quantity badge */}
              <div className="flex items-start gap-3">
                {/* Rank number */}
                <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-zinc-400">{idx + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <p className="text-sm font-semibold text-zinc-900 leading-snug break-words">
                    {product.title}
                  </p>

                  {/* Metrics row */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {product.totalQty}
                      <span className="font-normal text-emerald-500">un</span>
                    </span>
                    <span className="text-xs text-zinc-400">
                      R$ {formatCurrency(product.totalRevenue)}
                    </span>
                  </div>

                  {/* Sale dates */}
                  <div className="mt-2">
                    <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1">
                      Vendido em
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {product.saleDates.map(d => (
                        <span
                          key={d}
                          className="text-[11px] text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== FOOTER STATS ===== */}
      {displayProducts.length > 0 && (
        <p className="text-center text-[10px] text-zinc-400 pt-2 pb-4">
          {displayProducts.length === productAggregates.length
            ? `${uniqueProducts} produtos · ${totalItems} unidades vendidas`
            : `Exibindo ${displayProducts.length} de ${uniqueProducts} produtos`
          }
        </p>
      )}
    </div>
  );
}
