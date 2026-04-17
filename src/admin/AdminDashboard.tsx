import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ShoppingBag, TrendingUp, Clock, CreditCard, Users, ShoppingCart, LogIn, ChevronRight, DollarSign, Loader2 } from 'lucide-react';
import { adminFetch, isOrderArchived, formatCurrency, getDateRange, isWithinRange, isWithinHours } from './adminApi';

type Period = 'today' | 'week' | 'month';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('today');

  const [publishedCount, setPublishedCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  const [analytics, setAnalytics] = useState<{
    visits_today: number; visits_week: number; visits_month: number;
    unique_today: number; unique_week: number; unique_month: number;
    now_on_site: number; now_on_cart: number; now_on_checkout: number;
  } | null>(null);

  useEffect(() => {
    loadData();
    loadAnalytics();
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const ordersData = await adminFetch('/admin/pedidos');
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
    }

    try {
      const pubData = await adminFetch('/admin/produtos-custom?limit=1&offset=0&status=published');
      const drftData = await adminFetch('/admin/produtos-custom?limit=1&offset=0&status=draft');
      setPublishedCount(pubData.count || 0);
      setDraftCount(drftData.count || 0);
    } catch {
      // Falha silenciosa
    }
    setLoading(false);
  };

  const loadAnalytics = async () => {
    try {
      const data = await adminFetch('/admin/analytics');
      if (data && typeof data === 'object') {
        setAnalytics({
          visits_today: data.visits_today || 0, visits_week: data.visits_week || 0, visits_month: data.visits_month || 0,
          unique_today: data.unique_today || 0, unique_week: data.unique_week || 0, unique_month: data.unique_month || 0,
          now_on_site: data.now_on_site || 0, now_on_cart: data.now_on_cart || 0, now_on_checkout: data.now_on_checkout || 0,
        });
      }
    } catch (err) {
      console.warn('Analytics indisponível:', err);
    }
  };

  const activeOrders = orders.filter(o => !isOrderArchived(o));
  const { start, end } = getDateRange(period);
  const periodOrders = activeOrders.filter(o => isWithinRange(o.created_at, start, end));

  const paidStatuses = ['paid', 'preparing', 'shipped', 'delivered'];
  const paidPeriodOrders = periodOrders.filter(o => paidStatuses.includes(o.status));
  const recebido = paidPeriodOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const paidCount = paidPeriodOrders.length;

  const awaitingPeriodOrders = periodOrders.filter(o => o.status === 'awaiting_payment');
  const aguardando = awaitingPeriodOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const awaitingCount = awaitingPeriodOrders.length;

  const potencialTotal = recebido + aguardando;
  const pending48h = activeOrders.filter(o => o.status === 'awaiting_payment' && isWithinHours(o.created_at, 48)).length;
  const paid48h = activeOrders.filter(o => paidStatuses.includes(o.status) && isWithinHours(o.created_at, 48)).length;

  const periodLabels: Record<Period, string> = {
    today: 'Hoje', week: 'Semana', month: 'Mês',
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  const liveUsers = analytics ? (analytics.now_on_site + analytics.now_on_cart + analytics.now_on_checkout) : 0;

  return (
    <div className="space-y-4 pb-6 max-w-2xl mx-auto">
      
      {/* ============ 1. TOPO: INDICADOR AO VIVO ============ */}
      {analytics && (
        <div className="flex items-center justify-between bg-white border border-zinc-100 rounded-full px-4 py-2 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
              Agora <span className="text-zinc-900 ml-1">{liveUsers}</span>
            </span>
          </div>
          
          <div className="flex gap-4">
            {analytics.now_on_cart > 0 && (
              <span className="flex items-center text-[11px] font-bold text-amber-500">
                <ShoppingCart size={12} className="mr-1" /> {analytics.now_on_cart} no carrinho
              </span>
            )}
            {analytics.now_on_checkout > 0 && (
              <span className="flex items-center text-[11px] font-bold text-blue-500">
                <LogIn size={12} className="mr-1" /> {analytics.now_on_checkout} no checkout
              </span>
            )}
          </div>
        </div>
      )}

      {/* ============ 2. CARTÃO FINANCEIRO (O CLÁSSICO BRANCO) ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm space-y-5">
        
        {/* Seletor de Período Grande e Claro */}
        <div className="flex bg-zinc-100 p-1 rounded-xl">
          {(['today', 'week', 'month'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                period === p ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>

        {/* Métrica Central: Recebido */}
        <div className="text-center pb-4 border-b border-zinc-100">
          <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1">
            <CreditCard size={14} /> Recebido (Pagos)
          </p>
          <p className="text-4xl font-black text-zinc-900 tracking-tight">
            R$ {formatCurrency(recebido)}
          </p>
          <p className="text-[11px] text-zinc-400 font-medium mt-1">
            {paidCount} {paidCount === 1 ? 'pedido pago' : 'pedidos pagos'}
          </p>
        </div>

        {/* Métricas Secundárias */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center justify-center gap-1 mb-1">
              <Clock size={12} /> Aguardando
            </p>
            <p className="text-xl font-black text-zinc-900">
              R$ {formatCurrency(aguardando)}
            </p>
            <p className="text-[10px] text-zinc-400 font-medium">
              {awaitingCount} unid.
            </p>
          </div>
          <div className="text-center border-l border-zinc-100">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest flex items-center justify-center gap-1 mb-1">
              <DollarSign size={12} /> Potencial
            </p>
            <p className="text-xl font-black text-zinc-900">
              R$ {formatCurrency(potencialTotal)}
            </p>
            <p className="text-[10px] text-zinc-400 font-medium">
              Total
            </p>
          </div>
        </div>
      </div>

      {/* ============ 3. TRÁFEGO HISTÓRICO ============ */}
      {analytics && (
        <div className="flex justify-between items-center bg-white border border-zinc-100 rounded-xl px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-zinc-400" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Visitas Únicas</span>
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <p className="text-sm font-black text-zinc-900">{analytics.unique_today}</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Hoje</p>
            </div>
            <div>
              <p className="text-sm font-black text-zinc-900">{analytics.unique_week}</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Sem</p>
            </div>
            <div>
              <p className="text-sm font-black text-zinc-900">{analytics.unique_month}</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Mês</p>
            </div>
          </div>
        </div>
      )}

      {/* ============ 4. ATALHOS RÁPIDOS (Estilo Lista iOS) ============ */}
      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm flex flex-col">
        
        {/* Item: Pedidos */}
        <button 
          onClick={() => navigate('/store/admin/pedidos')}
          className="flex items-center p-4 gap-4 hover:bg-zinc-50 active:bg-zinc-100 transition-colors border-b border-zinc-50 text-left"
        >
          <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
            <Package size={22} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-zinc-900">Gerenciar Pedidos</p>
            <div className="flex gap-2 mt-1">
              <span className="text-[11px] font-semibold text-zinc-500">Pendentes (48h): <span className="text-amber-600">{pending48h}</span></span>
              <span className="text-zinc-300 text-[11px]">•</span>
              <span className="text-[11px] font-semibold text-zinc-500">Pagos (48h): <span className="text-emerald-600">{paid48h}</span></span>
            </div>
          </div>
          <ChevronRight size={20} className="text-zinc-300" />
        </button>

        {/* Item: Produtos */}
        <button 
          onClick={() => navigate('/store/admin/produtos')}
          className="flex items-center p-4 gap-4 hover:bg-zinc-50 active:bg-zinc-100 transition-colors text-left"
        >
          <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
            <ShoppingBag size={22} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-zinc-900">Gerenciar Produtos</p>
            <div className="flex gap-2 mt-1">
              <span className="text-[11px] font-semibold text-zinc-500">Publicados: <span className="text-emerald-600">{publishedCount}</span></span>
              <span className="text-zinc-300 text-[11px]">•</span>
              <span className="text-[11px] font-semibold text-zinc-500">Rascunhos: <span className="text-zinc-600">{draftCount}</span></span>
            </div>
          </div>
          <ChevronRight size={20} className="text-zinc-300" />
        </button>

      </div>

    </div>
  );
}