import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, BarChart3, Package, Filter, TrendingUp, Hash, ChevronDown, ChevronUp } from 'lucide-react';
import { adminFetch, isOrderArchived, formatCurrency } from './adminApi';

type ViewMode = 'yards' | 'brand' | 'combo';
type Period = 'all' | 'month' | 'week' | 'today';

interface SoldItem {
  title: string;
  quantity: number;
  yards: number | null;
  brand: string;
  revenue: number;
  orderCount: number;
}

// Extract yards from product title
function extractYards(title: string): number | null {
  const match = title.match(/(\d+)\s*(?:j|jds|jardas)\b/i);
  return match ? parseInt(match[1], 10) : null;
}

// Extract brand from product title
function extractBrand(title: string): string {
  const t = title.toLowerCase();
  if (/indon[eé]sia/i.test(t)) return 'Nylon Esportiva';
  if (/\bking\b/i.test(t)) return 'King';
  if (/shark\s*attack/i.test(t)) return 'Shark Attack';
  if (/carretilha/i.test(t)) return 'Carretilha';
  if (/camiseta|camisa|bone/i.test(t)) return 'Vestuario';
  if (/dente\s*de\s*tubar/i.test(t)) return 'Dente de Tubarao';
  return 'Outros';
}

export default function AdminSoldItems() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('yards');
  const [period, setPeriod] = useState<Period>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => { loadOrders(); }, []);

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

  // Filter to only paid/completed orders (exclude cancelled & awaiting)
  const soldOrders = useMemo(() => {
    const paidStatuses = ['paid', 'preparing', 'shipped', 'delivered'];
    let filtered = orders.filter(o => paidStatuses.includes(o.status) && !isOrderArchived(o));

    // Period filter
    if (period !== 'all') {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      if (period === 'week') {
        const day = start.getDay();
        start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      } else if (period === 'month') {
        start.setDate(1);
      }
      filtered = filtered.filter(o => new Date(o.created_at) >= start);
    }

    return filtered;
  }, [orders, period]);

  // Extract all sold items from orders
  const allSoldItems = useMemo(() => {
    const items: SoldItem[] = [];
    soldOrders.forEach(order => {
      (order.items || []).forEach((item: any) => {
        const title = item.title || '';
        items.push({
          title,
          quantity: item.quantity || 1,
          yards: extractYards(title),
          brand: extractBrand(title),
          revenue: (Number(item.price) || 0) * (item.quantity || 1),
          orderCount: 1,
        });
      });
    });
    return items;
  }, [soldOrders]);

  // Aggregated views
  const byYards = useMemo(() => {
    const map = new Map<string, { yards: number | null; label: string; totalQty: number; totalRevenue: number; orderCount: number; items: SoldItem[] }>();
    allSoldItems.forEach(item => {
      const key = item.yards !== null ? `${item.yards}j` : 'Sem jardas';
      const existing = map.get(key) || { yards: item.yards, label: key, totalQty: 0, totalRevenue: 0, orderCount: 0, items: [] };
      existing.totalQty += item.quantity;
      existing.totalRevenue += item.revenue;
      existing.orderCount += 1;
      existing.items.push(item);
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [allSoldItems]);

  const byBrand = useMemo(() => {
    const map = new Map<string, { brand: string; totalQty: number; totalRevenue: number; orderCount: number; items: SoldItem[] }>();
    allSoldItems.forEach(item => {
      const existing = map.get(item.brand) || { brand: item.brand, totalQty: 0, totalRevenue: 0, orderCount: 0, items: [] };
      existing.totalQty += item.quantity;
      existing.totalRevenue += item.revenue;
      existing.orderCount += 1;
      existing.items.push(item);
      map.set(item.brand, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [allSoldItems]);

  const byCombo = useMemo(() => {
    const map = new Map<string, { brand: string; yards: number | null; label: string; totalQty: number; totalRevenue: number; orderCount: number; items: SoldItem[] }>();
    allSoldItems.forEach(item => {
      const yardsLabel = item.yards !== null ? `${item.yards}j` : 'Sem jardas';
      const key = `${item.brand} - ${yardsLabel}`;
      const existing = map.get(key) || { brand: item.brand, yards: item.yards, label: key, totalQty: 0, totalRevenue: 0, orderCount: 0, items: [] };
      existing.totalQty += item.quantity;
      existing.totalRevenue += item.revenue;
      existing.orderCount += 1;
      existing.items.push(item);
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [allSoldItems]);

  const totalQty = allSoldItems.reduce((s, i) => s + i.quantity, 0);
  const totalRevenue = allSoldItems.reduce((s, i) => s + i.revenue, 0);

  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const periodLabels: Record<Period, string> = {
    all: 'Todos',
    month: 'Mes',
    week: 'Semana',
    today: 'Hoje',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
        <p className="text-zinc-400 ml-3 text-sm">Carregando dados...</p>
      </div>
    );
  }

  const currentData = viewMode === 'yards' ? byYards : viewMode === 'brand' ? byBrand : byCombo;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
            <BarChart3 size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-bold text-zinc-900 text-sm">Itens Vendidos</h2>
            <p className="text-[10px] text-zinc-400">{soldOrders.length} pedidos pagos/finalizados</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Unidades vendidas</p>
            <p className="text-2xl font-black text-zinc-900 mt-0.5">{totalQty}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Faturamento itens</p>
            <p className="text-2xl font-black text-zinc-900 mt-0.5">R$ {formatCurrency(totalRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-1.5 bg-zinc-100 p-1 rounded-xl">
        {(['all', 'month', 'week', 'today'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              period === p ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* View mode selector */}
      <div className="flex gap-1.5">
        {[
          { key: 'yards' as ViewMode, label: 'Por Jardas', icon: Hash },
          { key: 'brand' as ViewMode, label: 'Por Marca', icon: Package },
          { key: 'combo' as ViewMode, label: 'Marca + Jardas', icon: TrendingUp },
        ].map(v => (
          <button
            key={v.key}
            onClick={() => { setViewMode(v.key); setExpandedRows(new Set()); }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 ${
              viewMode === v.key
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <v.icon size={12} />
            {v.label}
          </button>
        ))}
      </div>

      {/* Data table */}
      {currentData.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-zinc-100 text-center">
          <Package size={32} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">Nenhum item vendido no periodo selecionado.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            <div className="col-span-5">
              {viewMode === 'yards' ? 'Jardas' : viewMode === 'brand' ? 'Marca' : 'Marca + Jardas'}
            </div>
            <div className="col-span-2 text-center">Qtd</div>
            <div className="col-span-2 text-center">Vendas</div>
            <div className="col-span-3 text-right">Receita</div>
          </div>

          {currentData.map((row: any, idx: number) => {
            const key = row.label || row.brand || String(idx);
            const isExpanded = expandedRows.has(key);
            const maxQty = currentData[0]?.totalQty || 1;
            const barWidth = Math.max(5, (row.totalQty / maxQty) * 100);

            return (
              <div key={key}>
                <button
                  onClick={() => toggleRow(key)}
                  className={`w-full bg-white rounded-xl border p-3 hover:border-zinc-300 transition-all text-left ${
                    isExpanded ? 'border-zinc-300 shadow-sm' : 'border-zinc-100'
                  }`}
                >
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-zinc-900 truncate">{key}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="font-black text-zinc-900 text-base">{row.totalQty}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="text-xs text-zinc-500">{row.orderCount}x</span>
                    </div>
                    <div className="col-span-3 text-right flex items-center justify-end gap-1">
                      <span className="font-bold text-sm text-zinc-700">R$ {formatCurrency(row.totalRevenue)}</span>
                      {isExpanded ? <ChevronUp size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                    </div>
                  </div>
                </button>

                {/* Expanded: show individual items */}
                {isExpanded && row.items && (
                  <div className="ml-4 mt-1 mb-2 space-y-1">
                    {/* Deduplicate items by title and sum quantities */}
                    {(() => {
                      const grouped = new Map<string, { title: string; qty: number; rev: number }>();
                      row.items.forEach((item: SoldItem) => {
                        const existing = grouped.get(item.title) || { title: item.title, qty: 0, rev: 0 };
                        existing.qty += item.quantity;
                        existing.rev += item.revenue;
                        grouped.set(item.title, existing);
                      });
                      return Array.from(grouped.values())
                        .sort((a, b) => b.qty - a.qty)
                        .map((g, i) => (
                          <div key={i} className="bg-zinc-50 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                            <span className="flex-1 text-zinc-600 truncate">{g.title}</span>
                            <span className="font-bold text-zinc-800 shrink-0">{g.qty}x</span>
                            <span className="text-zinc-400 shrink-0">R$ {formatCurrency(g.rev)}</span>
                          </div>
                        ));
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[10px] text-zinc-400 pb-4">
        {currentData.length} {viewMode === 'yards' ? 'tipos de jardas' : viewMode === 'brand' ? 'marcas' : 'combinacoes'} · {totalQty} unidades vendidas
      </p>
    </div>
  );
}
