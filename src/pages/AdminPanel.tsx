import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../UserContext';
import { Users, ShoppingBag, Truck, Edit3 } from 'lucide-react';

export default function AdminPanel() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'users'>('orders');

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }

    fetch('/api/admin/orders')
      .then(res => res.json())
      .then(data => setOrders(data));

    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => setUsers(data));
  }, [user, navigate]);

  const updateOrderStatus = async (id: number, status: string, tracking_code: string) => {
    try {
      await fetch(`/api/admin/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, tracking_code }),
      });
      setOrders(orders.map(o => o.id === id ? { ...o, status, tracking_code } : o));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Painel Admin</h1>
      
      <div className="flex gap-4 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-4 px-2 font-bold text-lg transition-colors ${activeTab === 'orders' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-zinc-500 hover:text-zinc-900'}`}
        >
          <ShoppingBag className="inline mr-2" size={20} />
          Pedidos
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-4 px-2 font-bold text-lg transition-colors ${activeTab === 'users' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-zinc-500 hover:text-zinc-900'}`}
        >
          <Users className="inline mr-2" size={20} />
          Usuários
        </button>
      </div>

      {activeTab === 'orders' && (
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="p-4 font-bold text-zinc-900">ID</th>
                <th className="p-4 font-bold text-zinc-900">Cliente</th>
                <th className="p-4 font-bold text-zinc-900">Valor</th>
                <th className="p-4 font-bold text-zinc-900">Status</th>
                <th className="p-4 font-bold text-zinc-900">Rastreio</th>
                <th className="p-4 font-bold text-zinc-900">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-zinc-50">
                  <td className="p-4 font-mono text-zinc-500">#{order.id}</td>
                  <td className="p-4">
                    <div className="font-bold text-zinc-900">{order.customer_name}</div>
                    <div className="text-sm text-zinc-500">{order.customer_email}</div>
                  </td>
                  <td className="p-4 font-bold text-zinc-900">R$ {order.total_amount.toFixed(2)}</td>
                  <td className="p-4">
                    <select
                      value={order.status}
                      onChange={(e) => updateOrderStatus(order.id, e.target.value, order.tracking_code)}
                      className="bg-zinc-100 border border-zinc-200 rounded-lg px-3 py-1 text-sm font-bold text-zinc-700 outline-none"
                    >
                      <option value="pending">Pendente</option>
                      <option value="paid">Pago</option>
                      <option value="shipped">Enviado</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <input
                      type="text"
                      placeholder="Código..."
                      defaultValue={order.tracking_code || ''}
                      onBlur={(e) => updateOrderStatus(order.id, order.status, e.target.value)}
                      className="bg-white border border-zinc-200 rounded-lg px-3 py-1 text-sm font-mono outline-none w-32"
                    />
                  </td>
                  <td className="p-4">
                    <button className="text-emerald-600 hover:text-emerald-700 p-2">
                      <Edit3 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="p-4 font-bold text-zinc-900">ID</th>
                <th className="p-4 font-bold text-zinc-900">Nome</th>
                <th className="p-4 font-bold text-zinc-900">E-mail</th>
                <th className="p-4 font-bold text-zinc-900">Papel</th>
                <th className="p-4 font-bold text-zinc-900">Cadastro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-zinc-50">
                  <td className="p-4 font-mono text-zinc-500">#{u.id}</td>
                  <td className="p-4 font-bold text-zinc-900">{u.name}</td>
                  <td className="p-4 text-zinc-500">{u.email}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-zinc-100 text-zinc-800'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4 text-zinc-500 text-sm">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
