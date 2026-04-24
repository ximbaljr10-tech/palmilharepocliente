import React, { useEffect, useState } from 'react';
import { Link, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../config';
import {
  LogOut, FilePlus, UserPlus, FileText, CheckCircle2, AlertCircle,
  DollarSign, Send, Menu, X as XIcon, LayoutDashboard, Users,
  ClipboardList, Search, ChevronRight, Loader2, Phone, Mail, Calendar,
  Download, Eye, Trash2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { labelFromList, TIPO_MODELO, TIPO_CALCADO } from '../lib/insoleConstants';

// ==========================================================================
// Sidebar com suporte mobile
// ==========================================================================
function Sidebar({ user, logout, open, onClose }) {
  const location = useLocation();
  const linkCls = (path) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
     ${location.pathname === path
        ? 'bg-teal-50 text-teal-700'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`;

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          onClick={onClose}
          className="md:hidden fixed inset-0 bg-black/40 z-30"
        />
      )}
      <aside
        className={`
          fixed md:sticky top-0 left-0 z-40 h-screen w-72 bg-white border-r border-gray-200
          flex flex-col transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-200">
          <div className="font-bold text-lg tracking-tight">
            <span className="text-teal-700">AXIOM</span>
            <span className="ml-2 text-[10px] font-medium text-gray-400 uppercase tracking-widest">PRO</span>
          </div>
          <button onClick={onClose} className="md:hidden text-gray-500">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-4">
          <Link to="/dashboard/new-order" onClick={onClose} data-testid="link-new-order">
            <Button className="w-full h-11 rounded-full bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-sm">
              <FilePlus className="mr-2 h-4 w-4" /> Novo Pedido
            </Button>
          </Link>
        </div>

        <nav className="px-3 pb-4 space-y-1 flex-1">
          <Link to="/dashboard"            onClick={onClose} className={linkCls('/dashboard')}>
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </Link>
          <Link to="/dashboard/patients"   onClick={onClose} className={linkCls('/dashboard/patients')}>
            <Users className="w-4 h-4" /> Pacientes
          </Link>
          <Link to="/dashboard/orders"     onClick={onClose} className={linkCls('/dashboard/orders')}>
            <ClipboardList className="w-4 h-4" /> Pedidos
          </Link>
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
    </>
  );
}

// ==========================================================================
// Modal para completar dados de cobrança (CPF/email/phone)
// ==========================================================================
function BillingModal({ open, patient, onClose, onSave }) {
  const [form, setForm] = useState({ cpf: '', email: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && patient) {
      setForm({
        cpf: patient.cpf || '',
        email: patient.email || '',
        phone: patient.phone || '',
        address: patient.address || '',
      });
    }
  }, [open, patient]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cpf || !form.email || !form.phone) {
      toast.error('Preencha CPF, email e telefone.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Completar cadastro</h3>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Para gerar a cobrança e enviar via WhatsApp, informe os dados obrigatórios do paciente.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500">CPF *</Label>
            <Input
              className="mt-1 h-11 rounded-lg border-gray-200"
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">E-mail *</Label>
              <Input
                type="email"
                className="mt-1 h-11 rounded-lg border-gray-200"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">WhatsApp *</Label>
              <Input
                className="mt-1 h-11 rounded-lg border-gray-200"
                placeholder="(48) 99180-3859"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Endereço</Label>
            <Input
              className="mt-1 h-11 rounded-lg border-gray-200"
              placeholder="Rua, número, bairro, cidade"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-full border-gray-200">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full bg-teal-600 hover:bg-teal-700 text-white"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando</>
                : 'Salvar e gerar cobrança'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================================================
// Dashboard Home
// ==========================================================================
function DashboardHome() {
  const [stats, setStats] = useState({
    patients_count: 0,
    orders_count: 0,
    recent_orders: [],
    recent_patients: [],
  });
  const [loading, setLoading] = useState(true);
  const [billingPatient, setBillingPatient] = useState(null);
  const [billingOrderId, setBillingOrderId] = useState(null);
  const { user } = useAuth();

  const load = async () => {
    try {
      const res = await axios.get(api('/api/pro/dashboard'), { withCredentials: true });
      setStats(res.data);
    } catch (err) {
      toast.error('Erro ao carregar dashboard.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleGenerateBilling = async (orderId) => {
    try {
      const res = await axios.post(api(`/api/orders/${orderId}/billing`), {}, { withCredentials: true });
      if (res.data.needs_completion) {
        setBillingPatient(res.data.patient);
        setBillingOrderId(orderId);
      } else {
        toast.success('Cobrança gerada!');
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao gerar cobrança.');
    }
  };

  const handleSendInvoice = async (orderId) => {
    try {
      await axios.post(api(`/api/orders/${orderId}/send-invoice`), {}, { withCredentials: true });
      toast.success('Fatura enviada via WhatsApp!');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar fatura.');
    }
  };

  const handleSaveBilling = async (form) => {
    try {
      await axios.put(api(`/api/pro/patients/${billingPatient._id}`), form, { withCredentials: true });
      toast.success('Dados atualizados.');
      const oid = billingOrderId;
      setBillingPatient(null);
      setBillingOrderId(null);
      await handleGenerateBilling(oid);
    } catch (err) {
      toast.error('Erro ao salvar dados.');
    }
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">Olá, {user?.name?.split(' ')[0] || 'profissional'} 👋</h1>
      <p className="text-gray-500 mt-1 text-sm">Bem-vindo(a) ao seu consultório. Gerencie pacientes e pedidos de palmilhas.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mt-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500"><Users className="w-4 h-4" /> Pacientes</div>
          <div className="mt-2 text-2xl md:text-3xl font-bold text-gray-900">{stats.patients_count}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500"><ClipboardList className="w-4 h-4" /> Pedidos</div>
          <div className="mt-2 text-2xl md:text-3xl font-bold text-gray-900">{stats.orders_count}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500"><CheckCircle2 className="w-4 h-4" /> Últ. pedido</div>
          <div className="mt-2 text-sm md:text-base font-medium text-gray-800 truncate">
            {stats.recent_orders[0] ? new Date(stats.recent_orders[0].created_at).toLocaleDateString('pt-BR') : '—'}
          </div>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base md:text-lg font-semibold text-gray-900">Pedidos recentes</h2>
          <Link to="/dashboard/orders" className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
            ver todos <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Carregando…</div>
          ) : stats.recent_orders.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Nenhum pedido ainda. Clique em "Novo Pedido" para começar.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {stats.recent_orders.map((o) => (
                <OrderItem
                  key={o._id}
                  order={o}
                  onGenerate={() => handleGenerateBilling(o._id)}
                  onSend={() => handleSendInvoice(o._id)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <BillingModal
        open={!!billingPatient}
        patient={billingPatient}
        onClose={() => { setBillingPatient(null); setBillingOrderId(null); }}
        onSave={handleSaveBilling}
      />
    </div>
  );
}

// ==========================================================================
// Item de pedido (linha)
// ==========================================================================
function OrderItem({ order, onGenerate, onSend }) {
  const navigate = useNavigate();
  const presc = order.prescription || {};
  const modelo = presc.tipo_modelo ? labelFromList(TIPO_MODELO, presc.tipo_modelo) : (order.foot_type || '—');
  const tipo   = presc.tipo_calcado ? labelFromList(TIPO_CALCADO, presc.tipo_calcado) : '';

  const statusColor = {
    'Pendente':        'bg-amber-50 text-amber-700 border-amber-200',
    'Cobrança gerada': 'bg-blue-50 text-blue-700 border-blue-200',
    'Fatura enviada':  'bg-teal-50 text-teal-700 border-teal-200',
    'Em produção':     'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Pronto':          'bg-green-50 text-green-700 border-green-200',
    'Entregue':        'bg-gray-100 text-gray-700 border-gray-200',
    'Cancelado':       'bg-red-50 text-red-700 border-red-200',
  }[order.status] || 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <li className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
          <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full border ${statusColor}`}>
            {order.status}
          </span>
        </div>
        <div className="text-sm md:text-base font-medium text-gray-900 truncate mt-0.5">
          {order.patient_name || '—'}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {modelo}{tipo ? ` · ${tipo}` : ''}{presc.numeracao ? ` · nº ${presc.numeracao}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-gray-200 text-gray-600 hover:text-teal-700 hover:border-teal-300 text-xs"
          onClick={() => window.open(api(`/api/orders/${order._id}/pdf`), '_blank')}
        >
          <Download className="w-3 h-3 mr-1" /> PDF
        </Button>
        {!order.payment_link && (
          <Button size="sm" className="h-9 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs" onClick={onGenerate}>
            <DollarSign className="w-3 h-3 mr-1" /> Gerar cobrança
          </Button>
        )}
        {order.payment_link && !order.invoice_sent_at && (
          <Button size="sm" className="h-9 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs" onClick={onSend}>
            <Send className="w-3 h-3 mr-1" /> Enviar WhatsApp
          </Button>
        )}
        {order.invoice_sent_at && (
          <span className="text-[11px] text-teal-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> enviada</span>
        )}
      </div>
    </li>
  );
}

// ==========================================================================
// Página de Pacientes
// ==========================================================================
function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = async () => {
    try {
      const res = await axios.get(api('/api/pro/patients'), { withCredentials: true });
      setPatients(res.data || []);
    } catch (err) {
      toast.error('Erro ao carregar pacientes.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Excluir paciente "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await axios.delete(api(`/api/pro/patients/${id}`), { withCredentials: true });
      setPatients((arr) => arr.filter((p) => p._id !== id));
      toast.success('Paciente removido.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao remover.');
    }
  };

  const filtered = patients.filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.cpf || '').includes(q)
    );
  });

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">Pacientes</h1>
          <p className="text-gray-500 text-sm">{patients.length} cadastrado{patients.length === 1 ? '' : 's'}</p>
        </div>
        <Link to="/dashboard/new-order">
          <Button className="h-11 rounded-full bg-teal-600 hover:bg-teal-700 text-white">
            <FilePlus className="w-4 h-4 mr-2" /> Novo pedido
          </Button>
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 h-11">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por nome, telefone, e-mail, CPF..."
            className="flex-1 bg-transparent text-sm outline-none text-gray-700"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhum paciente encontrado.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((p) => (
              <li key={p._id} className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-semibold shrink-0">
                  {(p.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{p.name}</div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {p.age ? <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {p.age} anos</span> : null}
                    {p.phone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {p.phone}</span> : null}
                    {p.email ? <span className="flex items-center gap-1 truncate max-w-[200px]"><Mail className="w-3 h-3" /> {p.email}</span> : null}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(p._id, p.name)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// Página de Pedidos (do profissional)
// ==========================================================================
function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = async () => {
    try {
      const res = await axios.get(api('/api/orders/'), { withCredentials: true });
      setOrders(res.data || []);
    } catch (err) {
      toast.error('Erro ao carregar pedidos.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleGenerateBilling = async (orderId) => {
    try {
      const res = await axios.post(api(`/api/orders/${orderId}/billing`), {}, { withCredentials: true });
      if (res.data.needs_completion) {
        toast.warning('Paciente incompleto — abra o dashboard para completar os dados.');
      } else {
        toast.success('Cobrança gerada!');
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao gerar cobrança.');
    }
  };

  const handleSendInvoice = async (orderId) => {
    try {
      await axios.post(api(`/api/orders/${orderId}/send-invoice`), {}, { withCredentials: true });
      toast.success('Fatura enviada!');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar.');
    }
  };

  const filtered = orders.filter((o) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (o.patient_name || '').toLowerCase().includes(q) ||
      (o.status || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">Pedidos</h1>
          <p className="text-gray-500 text-sm">{orders.length} pedido{orders.length === 1 ? '' : 's'}</p>
        </div>
        <Link to="/dashboard/new-order">
          <Button className="h-11 rounded-full bg-teal-600 hover:bg-teal-700 text-white">
            <FilePlus className="w-4 h-4 mr-2" /> Novo pedido
          </Button>
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 h-11">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por paciente ou status..."
            className="flex-1 bg-transparent text-sm outline-none text-gray-700"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhum pedido encontrado.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((o) => (
              <OrderItem
                key={o._id}
                order={o}
                onGenerate={() => handleGenerateBilling(o._id)}
                onSend={() => handleSendInvoice(o._id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// Layout principal com roteamento interno
// ==========================================================================
export default function ProDashboard() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        user={user}
        logout={logout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 min-w-0">
        {/* Topbar mobile */}
        <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600">
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-bold text-sm tracking-tight text-teal-700">AXIOM PRO</div>
          <Link to="/dashboard/new-order" className="text-teal-600">
            <FilePlus className="w-5 h-5" />
          </Link>
        </header>

        <main className="p-4 md:p-8 max-w-6xl mx-auto">
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
