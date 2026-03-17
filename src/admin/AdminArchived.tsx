import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Package, Loader2, ChevronRight } from 'lucide-react';
import { adminFetch, isOrderArchived, getStatusConfig, formatCurrency, unarchiveOrderBackend } from './adminApi';

export default function AdminArchived() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unarchiving, setUnarchiving] = useState<number | null>(null);

  useEffect(() => { loadOrders(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/admin/pedidos');
      const all = Array.isArray(data) ? data : [];
      setOrders(all.filter(o => isOrderArchived(o)));
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnarchive = async (orderId: number, medusa_order_id?: string) => {
    setUnarchiving(orderId);
    const success = await unarchiveOrderBackend(orderId, medusa_order_id);
    if (success) {
      await loadOrders();
    } else {
      alert('Erro ao desarquivar. Tente novamente.');
    }
    setUnarchiving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400">
        {orders.length} pedido{orders.length !== 1 ? 's' : ''} arquivado{orders.length !== 1 ? 's' : ''}
      </p>

      {orders.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-zinc-100 text-center">
          <Archive size={32} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">Nenhum pedido arquivado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => {
            const sc = getStatusConfig(order.status);
            return (
              <div
                key={order.id}
                className="bg-white rounded-xl border border-zinc-100 p-3 sm:p-4 flex items-center gap-3 opacity-80"
              >
                <div className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />
                <button
                  onClick={() => navigate(`/store/admin/pedido/${order.id}`)}
                  className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-sm text-zinc-700">#{order.id}</span>
                    <span className="text-zinc-300">·</span>
                    <span className="text-xs text-zinc-400 truncate">{order.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <span>{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                    <span>·</span>
                    <span>R$ {formatCurrency(Number(order.total_amount || 0))}</span>
                  </div>
                </button>

                <button
                  onClick={() => handleUnarchive(order.id, order.medusa_order_id)}
                  disabled={unarchiving === order.id}
                  className="text-xs text-zinc-400 hover:text-emerald-600 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50 shrink-0"
                >
                  {unarchiving === order.id ? <Loader2 size={12} className="animate-spin" /> : <ArchiveRestore size={13} />}
                  <span className="hidden sm:inline">Desarquivar</span>
                </button>

                <button
                  onClick={() => navigate(`/store/admin/pedido/${order.id}`)}
                  className="text-zinc-300 hover:text-zinc-500 transition-colors shrink-0"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
