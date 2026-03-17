import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ShoppingBag, TrendingUp, Clock, CreditCard, AlertTriangle, ArrowRight, Loader2, DollarSign, Users, ShoppingCart, LogIn } from 'lucide-react';
import { adminFetch, MEDUSA_URL, PUBLISHABLE_KEY, REGION_ID, isOrderArchived, formatCurrency, getDateRange, isWithinRange, isWithinHours } from './adminApi';

type Period = 'today' | 'week' | 'month';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('today');

  // Product counts from admin API (correct source of truth)
  const [publishedCount, setPublishedCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  // Analytics state
  const [analytics, setAnalytics] = useState<{
    visits_today: number; visits_week: number; visits_month: number;
    unique_today: number; unique_week: number; unique_month: number;
    now_on_site: number; now_on_cart: number; now_on_checkout: number;
  } | null>(null);

  useEffect(() => {
    loadData();
    loadAnalytics();
    // Refresh analytics every 30 seconds
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

    // Use admin API for accurate product counts (includes both published AND draft)
    try {
      let pubCount = 0;
      let drftCount = 0;
      
      // Get published count
      const pubData = await adminFetch('/admin/produtos-custom?limit=1&offset=0&status=published');
      pubCount = pubData.count || 0;
      
      // Get draft count
      const drftData = await adminFetch('/admin/produtos-custom?limit=1&offset=0&status=draft');
      drftCount = drftData.count || 0;

      setPublishedCount(pubCount);
      setDraftCount(drftCount);
    } catch {
      // Products loading is non-critical
    }

    setLoading(false);
  };

  const loadAnalytics = async () => {
    try {
      const data = await adminFetch('/admin/analytics');
      if (data && typeof data === 'object') {
        // Ensure all fields have defaults to prevent zero display when data is partially available
        setAnalytics({
          visits_today: data.visits_today || 0,
          visits_week: data.visits_week || 0,
          visits_month: data.visits_month || 0,
          unique_today: data.unique_today || 0,
          unique_week: data.unique_week || 0,
          unique_month: data.unique_month || 0,
          now_on_site: data.now_on_site || 0,
          now_on_cart: data.now_on_cart || 0,
          now_on_checkout: data.now_on_checkout || 0,
        });
      }
    } catch (err) {
      console.warn('Analytics carregamento nao disponivel:', err);
      // Don't clear existing analytics on error — keep last known state
    }
  };

  // Filter out archived for metrics
  const activeOrders = orders.filter(o => !isOrderArchived(o));

  // Period-based metrics
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
    today: 'Hoje',
    week: 'Semana',
    month: 'Mes',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 size={24} className="animate-spin text-zinc-400 mx-auto" />
          <p className="text-zinc-400 text-sm">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ============ REAL-TIME ANALYTICS (compact strip) ============ */}
      {analytics && (
        <div className="bg-white rounded-xl border border-zinc-100 px-3 py-2.5">
          {/* Single-row compact presence + visits */}
          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Agora</span>
            </div>

            {/* Real-time numbers */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <Users size={12} className="text-emerald-500" />
                <span className="text-sm font-bold text-zinc-900">{analytics.now_on_site + analytics.now_on_cart + analytics.now_on_checkout}</span>
                <span className="text-[10px] text-zinc-400 hidden sm:inline">no site</span>
              </div>
              {analytics.now_on_cart > 0 && (
                <div className="flex items-center gap-1">
                  <ShoppingCart size={11} className="text-amber-500" />
                  <span className="text-xs font-bold text-amber-600">{analytics.now_on_cart}</span>
                  <span className="text-[10px] text-zinc-400 hidden sm:inline">carrinho</span>
                </div>
              )}
              {analytics.now_on_checkout > 0 && (
                <div className="flex items-center gap-1">
                  <LogIn size={11} className="text-blue-500" />
                  <span className="text-xs font-bold text-blue-600">{analytics.now_on_checkout}</span>
                  <span className="text-[10px] text-zinc-400 hidden sm:inline">checkout</span>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-zinc-100 shrink-0" />

            {/* Historic summary */}
            <div className="flex items-center gap-3 shrink-0 text-[10px]">
              <div className="text-center">
                <p className="font-bold text-zinc-700 text-xs">{analytics.unique_today}</p>
                <p className="text-zinc-400">hoje</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-zinc-700 text-xs">{analytics.unique_week}</p>
                <p className="text-zinc-400">sem</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-zinc-700 text-xs">{analytics.unique_month}</p>
                <p className="text-zinc-400">mes</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ REVENUE CARD ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 space-y-4">
        {/* Period Selector */}
        <div className="flex gap-1.5 bg-zinc-100 p-1 rounded-xl">
          {(['today', 'week', 'month'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                period === p
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>

        {/* 3 Financial Values */}
        <div className="space-y-3">
          <div className="text-center pb-3 border-b border-zinc-100">
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-1">
              <CreditCard size={10} /> Recebido (pagos)
            </p>
            <p className="text-3xl sm:text-4xl font-black text-zinc-900 tracking-tight mt-1">
              R$ {formatCurrency(recebido)}
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              {paidCount} pedido{paidCount !== 1 ? 's' : ''} pago{paidCount !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center justify-center gap-1">
                <Clock size={10} /> Aguardando
              </p>
              <p className="text-lg sm:text-xl font-black text-zinc-900 mt-0.5">
                R$ {formatCurrency(aguardando)}
              </p>
              <p className="text-[10px] text-zinc-400">
                {awaitingCount} pedido{awaitingCount !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="text-center border-l border-zinc-100">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest flex items-center justify-center gap-1">
                <DollarSign size={10} /> Potencial total
              </p>
              <p className="text-lg sm:text-xl font-black text-zinc-900 mt-0.5">
                R$ {formatCurrency(potencialTotal)}
              </p>
              <p className="text-[10px] text-zinc-400">
                {paidCount + awaitingCount} pedido{(paidCount + awaitingCount) !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ============ QUICK ACCESS BLOCKS ============ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Orders Block */}
        <button
          onClick={() => navigate('/store/admin/pedidos')}
          className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 text-left hover:border-zinc-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
              <Package size={18} className="text-amber-600" />
            </div>
            <ArrowRight size={16} className="text-zinc-300 group-hover:text-zinc-500 transition-colors mt-1" />
          </div>
          <h3 className="font-bold text-zinc-900 text-sm mb-2">Pedidos</h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Clock size={12} className="text-amber-500 shrink-0" />
              <span className="text-zinc-500">
                Pendentes (48h): <span className="font-bold text-zinc-700">{pending48h}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CreditCard size={12} className="text-emerald-500 shrink-0" />
              <span className="text-zinc-500">
                Pagos (48h): <span className="font-bold text-zinc-700">{paid48h}</span>
              </span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 font-medium mt-3 group-hover:text-zinc-600 transition-colors">
            Gerenciar →
          </p>
        </button>

        {/* Products Block */}
        <button
          onClick={() => navigate('/store/admin/produtos')}
          className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 text-left hover:border-zinc-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <ShoppingBag size={18} className="text-emerald-600" />
            </div>
            <ArrowRight size={16} className="text-zinc-300 group-hover:text-zinc-500 transition-colors mt-1" />
          </div>
          <h3 className="font-bold text-zinc-900 text-sm mb-2">Produtos</h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <TrendingUp size={12} className="text-emerald-500 shrink-0" />
              <span className="text-zinc-500">
                Publicados: <span className="font-bold text-zinc-700">{publishedCount}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Package size={12} className="text-zinc-400 shrink-0" />
              <span className="text-zinc-500">
                Rascunho: <span className="font-bold text-zinc-700">{draftCount}</span>
              </span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 font-medium mt-3 group-hover:text-zinc-600 transition-colors">
            Gerenciar →
          </p>
        </button>
      </div>
    </div>
  );
}
