import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Loader2, Package, Calendar, FileDown, X, Search, Filter, Box, Shirt } from 'lucide-react';
import { adminFetch, isOrderArchived, formatCurrency } from './adminApi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// AdminSoldItems v5 — Foco em Operação e Pagamento de Funcionários
// ============================================================

type StatusFilter = 'all' | 'paid' | 'shipped';

interface ProductAggregate {
  title: string;
  totalQty: number;
  totalRevenue: number;
  saleDates: string[];
}

const STATUS_FILTER_MAP: Record<StatusFilter, string[]> = {
  all: ['paid', 'preparing', 'shipped', 'delivered'],
  paid: ['paid', 'preparing', 'shipped', 'delivered'],
  shipped: ['shipped', 'delivered'],
};

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Todos',
  paid: 'Pagos',
  shipped: 'Enviados',
};

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}`; 
}

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

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState(toInputDate(firstOfMonth));
  const [dateTo, setDateTo] = useState(toInputDate(now));

  const [debouncedFrom, setDebouncedFrom] = useState(toInputDate(firstOfMonth));
  const [debouncedTo, setDebouncedTo] = useState(toInputDate(now));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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
      setError('Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  // 1. Filtra os pedidos pelo Status e Data
  const filteredOrders = useMemo(() => {
    const allowedStatuses = STATUS_FILTER_MAP[statusFilter];
    let filtered = orders.filter(o => allowedStatuses.includes(o.status) && !isOrderArchived(o));

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
  }, [orders, debouncedFrom, debouncedTo, statusFilter]);

  // TOTAL DE CAIXAS PARA O EMBALADOR (Não muda com a pesquisa de texto)
  const totalOrdersBoxes = filteredOrders.length;

  // 2. Agrupa os produtos vendidos
  const productAggregates = useMemo(() => {
    const map = new Map<string, ProductAggregate>();
    filteredOrders.forEach(order => {
      const orderDate = dateToDayStr(new Date(order.created_at));
      (order.items || []).forEach((item: any) => {
        const title = (item.title || '').trim();
        if (!title) return;
        const qty = item.quantity || 1;
        const unitPrice = Number(item.price || item.unit_price) || 0;
        const revenue = unitPrice * qty;

        const existing = map.get(title);
        if (existing) {
          existing.totalQty += qty;
          existing.totalRevenue += revenue;
          if (!existing.saleDates.includes(orderDate)) existing.saleDates.push(orderDate);
        } else {
          map.set(title, { title, totalQty: qty, totalRevenue: revenue, saleDates: [orderDate] });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredOrders]);

  // 3. Aplica a busca (ex: "nylon")
  const displayProducts = useMemo(() => {
    if (!searchTerm.trim()) return productAggregates;
    const term = searchTerm.toLowerCase().trim();
    return productAggregates.filter(p => p.title.toLowerCase().includes(term));
  }, [productAggregates, searchTerm]);

  // TOTAL DE PEÇAS E FATURAMENTO (Muda dinamicamente se o usuário pesquisar algo!)
  const displayedTotalItems = displayProducts.reduce((s, p) => s + p.totalQty, 0);
  const displayedTotalRevenue = displayProducts.reduce((s, p) => s + p.totalRevenue, 0);

  const periodLabel = useMemo(() => {
    if (!debouncedFrom && !debouncedTo) return 'Todo o período';
    if (debouncedFrom && debouncedTo) return `${formatDisplayDate(debouncedFrom)} a ${formatDisplayDate(debouncedTo)}`;
    if (debouncedFrom) return `A partir de ${formatDisplayDate(debouncedFrom)}`;
    return `Até ${formatDisplayDate(debouncedTo)}`;
  }, [debouncedFrom, debouncedTo]);

  // ===================== PDF GENERATION =====================
  const generatePDF = useCallback(() => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório Operacional de Produtos', margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Período: ${periodLabel}`, margin, y);
    y += 5;

    if (searchTerm) {
      doc.setTextColor(59, 130, 246); // Azul
      doc.text(`Pesquisa aplicada: "${searchTerm}"`, margin, y);
      y += 5;
    }

    doc.setTextColor(100, 100, 100);
    doc.text(`Filtro de Status: ${statusFilter === 'all' ? 'Todos' : statusFilter === 'paid' ? 'Apenas Pagos' : 'Apenas Enviados'}`, margin, y);
    y += 8;

    // Resumo focado em operação
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total de Caixas (Pedidos no período): ${totalOrdersBoxes}`, margin, y);
    y += 5;
    doc.text(`Total de Peças (Na lista abaixo): ${displayedTotalItems} unidades`, margin, y);
    y += 10;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Tabela agora exporta a lista FILTRADA pela pesquisa
    const tableData = displayProducts.map(p => [
      p.title,
      String(p.totalQty),
      `R$ ${formatCurrency(p.totalRevenue)}`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Produto', 'Quantidade', 'Valor Total']],
      body: tableData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [39, 39, 42], textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 30, halign: 'center' }, 2: { cellWidth: 'auto', halign: 'right' } },
    });

    const fromStr = debouncedFrom ? debouncedFrom.replace(/-/g, '') : 'todos';
    const toStr = debouncedTo ? debouncedTo.replace(/-/g, '') : 'todos';
    const searchStr = searchTerm ? `_${searchTerm.replace(/\s+/g, '')}` : '';
    doc.save(`operacao_${fromStr}_${toStr}${searchStr}.pdf`);
  }, [displayProducts, periodLabel, displayedTotalItems, totalOrdersBoxes, debouncedFrom, debouncedTo, statusFilter, searchTerm]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6 max-w-2xl mx-auto">
      
      {/* 1. PAINEL OPERACIONAL (Foco em QTD e Caixas) */}
      <div className="bg-zinc-900 text-white rounded-2xl p-4 shadow-lg flex flex-col gap-4 relative overflow-hidden">
        
        {/* Topo: Informações do Período e Filtro */}
        <div className="flex justify-between items-start relative z-10">
          <div>
            <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-widest flex items-center gap-1">
              <Calendar size={12} /> {periodLabel}
              {filtering && <Loader2 size={10} className="animate-spin ml-1" />}
            </p>
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition ${showFilters ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-300 hover:text-white'}`}
          >
            <Filter size={16} />
          </button>
        </div>

        {/* Métricas Principais - Lado a Lado */}
        <div className="grid grid-cols-2 gap-4 relative z-10">
          
          {/* Métrica 1: Para o Embalador */}
          <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50">
            <div className="flex items-center gap-1.5 text-orange-400 mb-1">
              <Box size={14} />
              <p className="text-[10px] font-bold uppercase tracking-wider">Caixas (Pedidos)</p>
            </div>
            <p className="text-3xl font-black">{totalOrdersBoxes}</p>
            <p className="text-[9px] text-zinc-400 mt-1 leading-tight">Total no período.<br/>Não muda com a pesquisa.</p>
          </div>

          {/* Métrica 2: Para as Peças (Reage a busca) */}
          <div className="bg-emerald-900/20 p-3 rounded-xl border border-emerald-800/30">
            <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
              <Shirt size={14} />
              <p className="text-[10px] font-bold uppercase tracking-wider">Peças Listadas</p>
            </div>
            <p className="text-3xl font-black text-emerald-50">{displayedTotalItems}</p>
            <p className="text-[9px] text-zinc-400 mt-1 leading-tight text-emerald-200/50">
              {searchTerm ? `Resultados para "${searchTerm}"` : 'Todas as peças do período.'}
            </p>
          </div>

        </div>

        {/* Faturamento fica secundário, lá embaixo, miudinho */}
        <div className="flex justify-between items-center border-t border-zinc-800 pt-3 text-[11px] text-zinc-400">
          <p>Produtos Únicos: <span className="text-zinc-200 font-bold">{displayProducts.length}</span></p>
          <p>Faturamento ref.: <span className="text-zinc-200">R$ {formatCurrency(displayedTotalRevenue)}</span></p>
        </div>
      </div>

      {/* 2. ÁREA DE FILTROS (Retrátil) */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-zinc-200 p-3 flex flex-col gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex gap-2">
            <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center px-2">
              <span className="text-[10px] text-zinc-400 font-medium w-6">DE</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full bg-transparent py-2 text-xs font-medium text-zinc-800 focus:outline-none" />
            </div>
            <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center px-2">
              <span className="text-[10px] text-zinc-400 font-medium w-8">ATÉ</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full bg-transparent py-2 text-xs font-medium text-zinc-800 focus:outline-none" />
            </div>
          </div>
          
          <div className="flex bg-zinc-100 p-1 rounded-lg">
            {(['all', 'paid', 'shipped'] as StatusFilter[]).map(opt => (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all ${
                  statusFilter === opt ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
                }`}
              >
                {STATUS_FILTER_LABELS[opt]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. BARRA DE BUSCA (Muito importante agora) */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Pesquisar linha (ex: nylon, esportiva)..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-8 py-2.5 border-2 border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 bg-white focus:outline-none focus:border-zinc-900 transition-colors"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
              <X size={16} />
            </button>
          )}
        </div>
        <button
          onClick={generatePDF}
          disabled={displayProducts.length === 0}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-zinc-100 text-zinc-900 border border-zinc-200 rounded-xl disabled:opacity-50 text-xs font-bold hover:bg-zinc-200 transition-colors"
        >
          <FileDown size={16} />
          <span className="hidden sm:inline">PDF</span>
        </button>
      </div>

      {/* 4. LISTA DE PRODUTOS FOCADA EM QUANTIDADE */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
        {displayProducts.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-xs">
            Nenhum produto atende aos filtros atuais.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {displayProducts.map((product, idx) => (
              <div key={product.title} className="flex items-center p-3 gap-3 hover:bg-zinc-50 transition-colors">
                
                {/* Nome do Produto Ocupando Maior Espaço */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-zinc-800 leading-snug">
                    {product.title}
                  </p>
                  <p className="text-[9px] text-zinc-400 mt-0.5 truncate" title={product.saleDates.join(', ')}>
                    Dias: {product.saleDates.join(', ')}
                  </p>
                </div>

                {/* Bloco de Quantidade Gigante */}
                <div className="flex flex-col items-end shrink-0 pl-2 border-l border-zinc-100">
                  <p className="text-lg font-black text-emerald-600 leading-none">
                    {product.totalQty} <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">pcs</span>
                  </p>
                  <p className="text-[9px] font-semibold text-zinc-400 mt-1">
                    R$ {formatCurrency(product.totalRevenue)}
                  </p>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}