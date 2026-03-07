import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../UserContext';
import { Package, Truck, CheckCircle2 } from 'lucide-react';

export default function CustomerPanel() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!user || user.role !== 'customer') {
      navigate('/login');
      return;
    }

    fetch(`/api/orders/user/${user.id}`)
      .then(res => res.json())
      .then(data => setOrders(data))
      .catch(err => console.error(err));
  }, [user, navigate]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold">Aguardando Pagamento</span>;
      case 'paid': return <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold">Pago</span>;
      case 'shipped': return <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">Enviado</span>;
      default: return <span className="bg-zinc-100 text-zinc-800 px-3 py-1 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Meus Pedidos</h1>
      
      {orders.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 text-center text-zinc-500">
          Você ainda não tem nenhum pedido.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Pedido #{order.id}</h3>
                  <p className="text-sm text-zinc-500">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-zinc-900">R$ {order.total_amount.toFixed(2).replace('.', ',')}</span>
                  {getStatusBadge(order.status)}
                </div>
              </div>

              {order.tracking_code && (
                <div className="bg-zinc-50 p-4 rounded-xl flex items-center gap-3 border border-zinc-200">
                  <Truck className="text-emerald-600" size={20} />
                  <div>
                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Código de Rastreio</p>
                    <p className="font-mono font-bold text-zinc-900">{order.tracking_code}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
