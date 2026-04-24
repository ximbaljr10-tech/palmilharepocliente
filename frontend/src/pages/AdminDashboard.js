import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../config';
import {
  LogOut, LayoutDashboard, Users, Settings, Activity,
  AlertCircle, CheckCircle2, ClipboardList, Search, Download,
  Eye, X as XIcon, Menu, Send, Loader2, Phone, Mail, Calendar,
  FileText, Image as ImageIcon, Video as VideoIcon,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { labelFromList, TIPO_MODELO, TIPO_CALCADO, ESPECIFICACOES } from '../lib/insoleConstants';

const STATUSES = [
  'Pendente',
  'Cobrança gerada',
  'Fatura enviada',
  'Em produção',
  'Pronto',
  'Enviado',
  'Entregue',
  'Cancelado',
];

const statusColor = (s) => ({
  'Pendente':        'bg-amber-50 text-amber-700 border-amber-200',
  'Cobrança gerada': 'bg-blue-50 text-blue-700 border-blue-200',
  'Fatura enviada':  'bg-teal-50 text-teal-700 border-teal-200',
  'Em produção':     'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Pronto':          'bg-green-50 text-green-700 border-green-200',
  'Enviado':         'bg-sky-50 text-sky-700 border-sky-200',
  'Entregue':        'bg-gray-100 text-gray-700 border-gray-200',
  'Cancelado':       'bg-red-50 text-red-700 border-red-200',
}[s] || 'bg-gray-100 text-gray-700 border-gray-200');

// ============================================================================
// Order Detail Modal — inspeção completa de um pedido
// ============================================================================
function OrderDetailModal({ orderId, onClose, onChanged }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(api(`/api/admin/orders/${orderId}`), { withCredentials: true });
      setOrder(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao carregar pedido.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (orderId) load(); }, [orderId]);

  const changeStatus = async (newStatus) => {
    setUpdating(true);
    try {
      await axios.patch(
        api(`/api/admin/orders/${orderId}/status`),
        { status: newStatus },
        { withCredentials: true }
      );
      toast.success(`Status atualizado: ${newStatus}`);
      await load();
      onChanged && onChanged();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao atualizar status.');
    } finally {
      setUpdating(false);
    }
  };

  if (!orderId) return null;

  const presc = order?.prescription || {};
  const details = presc.details || {};
  const pat = order?.patient || {};
  const pro = order?.professional || {};
  const uploads = order?.uploads || [];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-black/50 backdrop-blur-sm md:p-4">
      <div className="bg-white w-full md:max-w-3xl md:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-screen">
        <header className="flex items-center justify-between px-5 h-14 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-teal-600" />
            <h3 className="font-semibold text-gray-900 text-sm md:text-base">
              Pedido #{String(orderId).slice(-8).toUpperCase()}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <XIcon className="w-5 h-5 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          {loading ? (
            <div className="p-10 text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando…</div>
          ) : !order ? (
            <div className="text-center text-gray-500">Pedido não encontrado.</div>
          ) : (
            <>
              {/* Header com status + ações */}
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-xs px-3 py-1 rounded-full border ${statusColor(order.status)}`}>
                  {order.status}
                </span>
                <span className="text-xs text-gray-500">
                  {order.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : '—'}
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  R$ {Number(order.price || 0).toFixed(2).replace('.', ',')}
                </span>
                <div className="flex-1" />
                <Button
                  size="sm"
                  className="h-9 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs"
                  onClick={() => window.open(api(`/api/orders/${order._id}/pdf`), '_blank')}
                >
                  <Download className="w-3 h-3 mr-1" /> Baixar PDF
                </Button>
              </div>

              {/* Mudança de status */}
              <div>
                <Label className="text-xs text-gray-500">Alterar status</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      disabled={updating || s === order.status}
                      onClick={() => changeStatus(s)}
                      className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                        s === order.status
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-teal-400 hover:text-teal-700'
                      } disabled:opacity-50`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Paciente */}
              <section>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-600" /> Paciente
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div><span className="text-gray-500">Nome:</span> <b>{pat.name || '—'}</b></div>
                  <div><span className="text-gray-500">Idade:</span> <b>{pat.age || '—'}</b></div>
                  <div><span className="text-gray-500">Telefone:</span> <b>{pat.phone || '—'}</b></div>
                  <div><span className="text-gray-500">E-mail:</span> <b>{pat.email || '—'}</b></div>
                  <div><span className="text-gray-500">CPF:</span> <b>{pat.cpf || '—'}</b></div>
                  <div><span className="text-gray-500">Endereço:</span> <b>{pat.address || '—'}</b></div>
                </div>
              </section>

              {/* Profissional */}
              <section>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" /> Profissional solicitante
                </h4>
                <div className="text-sm bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div><b>{pro.name || '—'}</b> · <span className="text-gray-500">{pro.email || '—'}</span></div>
                </div>
              </section>

              {/* Prescrição — Modelo */}
              <section>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Prescrição — Modelo</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-gray-500">Tipo</div>
                    <div className="font-medium text-gray-900">{labelFromList(TIPO_CALCADO, presc.tipo_calcado) || '—'}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-gray-500">Numeração</div>
                    <div className="font-medium text-gray-900">{presc.numeracao || '—'}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 col-span-2 md:col-span-1">
                    <div className="text-gray-500">Modelo</div>
                    <div className="font-medium text-gray-900">{labelFromList(TIPO_MODELO, presc.tipo_modelo) || '—'}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-gray-500">Revestimento</div>
                    <div className="font-medium text-gray-900">{presc.tipo_revestimento || '—'}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 col-span-1 md:col-span-2">
                    <div className="text-gray-500">EVA</div>
                    <div className="font-medium text-gray-900">{presc.revestimento_eva || '—'}</div>
                  </div>
                </div>
              </section>

              {/* Detalhes por pé */}
              <section>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Detalhes técnicos por pé</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {['left', 'right'].map((side) => (
                    <div key={side} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-teal-600 text-white text-xs font-semibold px-3 py-2">
                        Pé {side === 'left' ? 'esquerdo' : 'direito'}
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {ESPECIFICACOES.map((e) => {
                            const item = (details[side] || {})[e.key] || {};
                            const enabled = !!item.enabled;
                            return (
                              <tr key={e.key} className={`border-t border-gray-100 ${enabled ? 'bg-teal-50/40' : ''}`}>
                                <td className="px-3 py-1.5 text-gray-700">{e.label}</td>
                                <td className="px-3 py-1.5 text-center w-16">
                                  {enabled ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 inline" /> : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono text-gray-700 w-20">
                                  {item.value || ''}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </section>

              {/* Observação */}
              {presc.observacao && (
                <section>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Observações</h4>
                  <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-4 whitespace-pre-wrap">
                    {presc.observacao}
                  </div>
                </section>
              )}

              {/* Anexos */}
              {uploads.length > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Anexos ({uploads.length})</h4>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {uploads.map((u) => (
                      <li
                        key={u._id}
                        className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      >
                        {u.content_type?.startsWith('video/') ? (
                          <VideoIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                        ) : u.content_type?.startsWith('image/') ? (
                          <ImageIcon className="w-4 h-4 text-teal-500 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                        )}
                        <span className="flex-1 truncate text-gray-700">{u.filename}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{Math.round((u.size || 0)/1024)} KB</span>
                        <a
                          href={api(`/api/uploads/${u._id}/raw`)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded text-teal-600 hover:bg-teal-50"
                          title="Ver"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Orders Tab — lista de todos os pedidos com filtros
// ============================================================================
function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const url = statusFilter
        ? api(`/api/admin/orders?status=${encodeURIComponent(statusFilter)}`)
        : api('/api/admin/orders');
      const res = await axios.get(url, { withCredentials: true });
      setOrders(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao carregar pedidos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  const filtered = useMemo(() => {
    if (!query) return orders;
    const q = query.toLowerCase();
    return orders.filter((o) =>
      (o.patient_name || '').toLowerCase().includes(q) ||
      (o.pro_name || '').toLowerCase().includes(q) ||
      (o.status || '').toLowerCase().includes(q) ||
      String(o._id).toLowerCase().includes(q)
    );
  }, [orders, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Todos os pedidos</h2>
          <p className="text-gray-500 text-sm">{orders.length} pedido{orders.length === 1 ? '' : 's'} carregado{orders.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-3 md:p-4 flex flex-col md:flex-row gap-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 h-10 flex-1">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por paciente, profissional, status, ID..."
            className="flex-1 bg-transparent text-sm outline-none text-gray-700"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700"
        >
          <option value="">Todos os status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">Nenhum pedido encontrado.</div>
        ) : (
          <>
            {/* Desktop */}
            <table className="hidden md:table w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Paciente</th>
                  <th className="px-4 py-3">Profissional</th>
                  <th className="px-4 py-3">Modelo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const presc = o.prescription || {};
                  const modelo = labelFromList(TIPO_MODELO, presc.tipo_modelo) || '—';
                  return (
                    <tr key={o._id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{o.patient_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{o.pro_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{modelo}{presc.numeracao ? ` · ${presc.numeracao}` : ''}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusColor(o.status)}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">R$ {Number(o.price || 0).toFixed(2).replace('.', ',')}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setSelected(o._id)}
                            className="p-1.5 rounded text-gray-500 hover:text-teal-700 hover:bg-teal-50"
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => window.open(api(`/api/orders/${o._id}/pdf`), '_blank')}
                            className="p-1.5 rounded text-gray-500 hover:text-teal-700 hover:bg-teal-50"
                            title="Baixar PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile */}
            <ul className="md:hidden divide-y divide-gray-100">
              {filtered.map((o) => {
                const presc = o.prescription || {};
                const modelo = labelFromList(TIPO_MODELO, presc.tipo_modelo) || '—';
                return (
                  <li key={o._id} className="p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(o.status)}`}>
                        {o.status}
                      </span>
                      <span className="ml-auto font-mono text-xs text-gray-700">R$ {Number(o.price || 0).toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900">{o.patient_name || '—'}</div>
                    <div className="text-xs text-gray-500">Pro: {o.pro_name || '—'} · {modelo}{presc.numeracao ? ` · ${presc.numeracao}` : ''}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs rounded-full flex-1" onClick={() => setSelected(o._id)}>
                        <Eye className="w-3 h-3 mr-1" /> Detalhes
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs rounded-full flex-1" onClick={() => window.open(api(`/api/orders/${o._id}/pdf`), '_blank')}>
                        <Download className="w-3 h-3 mr-1" /> PDF
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {selected && (
        <OrderDetailModal
          orderId={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ============================================================================
// Main AdminDashboard
// ============================================================================
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({ pro_count: 0, order_count: 0, pending_count: 0, recent_orders: [] });
  const [settings, setSettings] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [pros, setPros] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // WhatsApp
  const [waStatus, setWaStatus] = useState({ connected: false, hasQR: false });
  const [waQR, setWaQR] = useState(null);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get(api(`/api/admin/dashboard`), { withCredentials: true });
      setStats(res.data);
    } catch (err) {
      toast.error('Erro ao buscar dados do painel.');
    }
  };

  const fetchPros = async () => {
    try {
      const res = await axios.get(api(`/api/admin/professionals`), { withCredentials: true });
      setPros(res.data || []);
    } catch (err) {
      toast.error('Erro ao buscar profissionais.');
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get(api(`/api/admin/settings`), { withCredentials: true });
      setSettings(res.data || {});
    } catch (err) {}
  };

  const checkWaStatus = async () => {
    try {
      const res = await axios.get(api(`/api/admin/whatsapp/status`), { withCredentials: true });
      setWaStatus(res.data);
      if (res.data.hasQR && !res.data.connected) {
        const qrRes = await axios.get(api(`/api/admin/whatsapp/qr`), { withCredentials: true });
        setWaQR(qrRes.data.qr);
      } else {
        setWaQR(null);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchDashboard();
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') {
      checkWaStatus();
      const interval = setInterval(checkWaStatus, 3000);
      return () => clearInterval(interval);
    }
    if (activeTab === 'pros') fetchPros();
  }, [activeTab]);

  const handleSettingsSave = async (e) => {
    e.preventDefault();
    try {
      await axios.post(api(`/api/admin/settings`), settings, { withCredentials: true });
      toast.success('Configurações salvas.');
    } catch (err) {
      toast.error('Erro ao salvar.');
    }
  };

  const handleWaConnect = async () => {
    try {
      await axios.post(api(`/api/admin/whatsapp/connect`), {}, { withCredentials: true });
      toast.info('Gerando QR Code...');
    } catch (err) {}
  };

  const handleWaDisconnect = async () => {
    try {
      await axios.post(api(`/api/admin/whatsapp/disconnect`), {}, { withCredentials: true });
      toast.info('Desconectado.');
    } catch (err) {}
  };

  const NavBtn = ({ id, icon: Icon, children }) => (
    <button
      onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium w-full transition-colors ${
        activeTab === id
          ? 'bg-teal-50 text-teal-700'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
      data-testid={`tab-${id}`}
    >
      <Icon className="w-4 h-4" /> {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/40 z-30" />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:sticky top-0 left-0 z-40 h-screen w-72 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-200">
          <div className="font-bold text-lg tracking-tight">
            <span className="text-teal-700">AXIOM</span>
            <span className="ml-2 text-[10px] font-medium text-gray-400 uppercase tracking-widest">ADMIN</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-500">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavBtn id="overview" icon={LayoutDashboard}>Visão Geral</NavBtn>
          <NavBtn id="orders"   icon={ClipboardList}>Todos os pedidos</NavBtn>
          <NavBtn id="pros"     icon={Users}>Profissionais</NavBtn>
          <NavBtn id="settings" icon={Settings}>Integrações</NavBtn>
        </nav>

        <div className="border-t border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-semibold">
              {(user?.name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{user?.name}</div>
              <div className="text-xs text-gray-500 truncate">{user?.email}</div>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full h-10 rounded-lg border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300"
            onClick={logout}
            data-testid="btn-logout"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Mobile topbar */}
        <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600">
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-bold text-sm tracking-tight text-teal-700">AXIOM ADMIN</div>
          <div className="w-5" />
        </header>

        <main className="p-4 md:p-8 max-w-6xl mx-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">Painel de Controle</h1>
                <p className="text-gray-500 mt-1 text-sm">Olá {user?.name?.split(' ')[0] || 'admin'}, dados da plataforma em tempo real.</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                <Card className="rounded-2xl border-gray-200 bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs md:text-sm font-medium text-gray-500 flex items-center"><Users className="w-4 h-4 mr-2" /> Profissionais</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl md:text-3xl font-bold text-gray-900">{stats.pro_count}</div>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-gray-200 bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs md:text-sm font-medium text-gray-500 flex items-center"><Activity className="w-4 h-4 mr-2" /> Pedidos totais</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl md:text-3xl font-bold text-gray-900">{stats.order_count}</div>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-gray-200 bg-white col-span-2 md:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs md:text-sm font-medium text-gray-500 flex items-center"><AlertCircle className="w-4 h-4 mr-2" /> Pendentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl md:text-3xl font-bold text-amber-600">{stats.pending_count || 0}</div>
                  </CardContent>
                </Card>
              </div>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base md:text-lg font-semibold text-gray-900">Pedidos recentes</h2>
                  <button
                    onClick={() => setActiveTab('orders')}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                  >
                    ver todos →
                  </button>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  {stats.recent_orders.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">Nenhum pedido ainda.</div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {stats.recent_orders.map((o) => (
                        <li key={o._id} className="p-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(o.status)}`}>{o.status}</span>
                            </div>
                            <div className="text-sm font-medium text-gray-900 truncate">{o.patient_name || '—'}</div>
                          </div>
                          <span className="font-mono text-xs text-gray-700">R$ {Number(o.price || 0).toFixed(2).replace('.', ',')}</span>
                          <button
                            onClick={() => window.open(api(`/api/orders/${o._id}/pdf`), '_blank')}
                            className="p-1.5 rounded text-gray-500 hover:text-teal-700 hover:bg-teal-50"
                            title="PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'orders' && <OrdersTab />}

          {activeTab === 'pros' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Profissionais Cadastrados</h2>
                <p className="text-gray-500 text-sm">{pros.length} profissional{pros.length === 1 ? '' : 'es'}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                {pros.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Nenhum profissional cadastrado.</div>
                ) : (
                  <>
                    <table className="hidden md:table w-full text-sm text-left">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3">Nome</th>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Cadastrado em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pros.map((p) => (
                          <tr key={p._id} className="border-b border-gray-100">
                            <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                            <td className="px-4 py-3 text-gray-600">{p.email}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ul className="md:hidden divide-y divide-gray-100">
                      {pros.map((p) => (
                        <li key={p._id} className="p-4">
                          <div className="font-medium text-gray-900">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.email}</div>
                          <div className="text-[10px] text-gray-400 mt-1">{p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—'}</div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Integrações</h2>
                <p className="text-gray-500 text-sm">WhatsApp Web e Mercado Pago.</p>
              </div>

              <div className="p-6 border border-gray-200 bg-white rounded-2xl flex flex-col items-center justify-center text-center">
                <h3 className="text-base font-semibold mb-1 text-gray-900">WhatsApp Web API</h3>
                <p className="text-xs text-gray-500 mb-4">Escaneie o QR Code com seu WhatsApp para ativar o envio automático de faturas.</p>

                <div className="w-64 h-64 bg-white p-2 border border-gray-200 rounded-lg mb-4 flex items-center justify-center">
                  {waStatus.connected ? (
                    <div className="text-green-600 flex flex-col items-center">
                      <CheckCircle2 className="w-16 h-16 mb-2" />
                      <span className="font-bold">Conectado!</span>
                    </div>
                  ) : waQR ? (
                    <img src={waQR} alt="WhatsApp QR" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-gray-400 text-sm flex flex-col items-center">
                      <AlertCircle className="w-8 h-8 mb-2" /> Aguardando inicialização...
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  {!waStatus.connected && (
                    <Button variant="outline" className="rounded-full border-gray-200" onClick={handleWaConnect}>
                      Gerar QR Code
                    </Button>
                  )}
                  {waStatus.connected && (
                    <Button variant="destructive" className="rounded-full" onClick={handleWaDisconnect}>
                      Desconectar
                    </Button>
                  )}
                </div>
              </div>

              <form onSubmit={handleSettingsSave} className="space-y-4">
                <Card className="rounded-2xl border-gray-200 bg-white">
                  <CardHeader>
                    <CardTitle className="text-base">Mercado Pago</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs text-gray-500">Access Token (PIX automático)</Label>
                      <Input
                        className="mt-1 h-11 rounded-lg border-gray-200"
                        type="text"
                        value={settings.mp_access_token || ''}
                        onChange={(e) => setSettings({ ...settings, mp_access_token: e.target.value })}
                        placeholder="APP_USR-..."
                        data-testid="input-mp-token"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Button
                  type="submit"
                  className="rounded-full bg-teal-600 hover:bg-teal-700 text-white w-full h-11"
                  data-testid="btn-save-settings"
                >
                  Salvar Configurações
                </Button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
