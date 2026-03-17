import React, { useEffect, useState } from 'react';
import { Package, Truck, CheckCircle2, Clock, XCircle, ExternalLink, Lock, LogOut, RefreshCw, ChevronDown, ChevronUp, MessageCircle, Copy, AlertTriangle, Tag, Loader2, CreditCard, BoxIcon, Menu, ShoppingBag, Archive, ArchiveRestore, MapPin, User, Mail } from 'lucide-react';

const MEDUSA_URL = (() => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const port = window.location.port;
    if (port === '' || port === '80' || port === '443') {
      return `${window.location.protocol}//${host}`;
    }
    if (host === 'localhost' || host === '127.0.0.1') {
      return "http://localhost:9000";
    }
    return `http://${host}:9000`;
  }
  return "http://localhost:9000";
})();

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado');
  
  const res = await fetch(`${MEDUSA_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers as Record<string, string> || {}),
    },
  });
  
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    throw new Error('Sessao expirada. Faca login novamente.');
  }
  
  return res.json();
}

const STATUS_MAP: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode; dot: string }> = {
  awaiting_payment: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Aguardando Pagamento', icon: <Clock size={18} className="text-amber-600" />, dot: 'bg-amber-500' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Pago', icon: <CreditCard size={18} className="text-emerald-600" />, dot: 'bg-emerald-500' },
  preparing: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Preparando', icon: <BoxIcon size={18} className="text-purple-600" />, dot: 'bg-purple-500' },
  shipped: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Enviado', icon: <Truck size={18} className="text-blue-600" />, dot: 'bg-blue-500' },
  delivered: { bg: 'bg-green-100', text: 'text-green-800', label: 'Entregue', icon: <CheckCircle2 size={18} className="text-green-600" />, dot: 'bg-green-500' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelado', icon: <XCircle size={18} className="text-red-600" />, dot: 'bg-red-500' },
};

function getStatusConfig(status: string) {
  return STATUS_MAP[status] || { bg: 'bg-zinc-100', text: 'text-zinc-800', label: status, icon: <Package size={18} />, dot: 'bg-zinc-400' };
}

// Archive helpers — stored in localStorage
const ARCHIVED_KEY = 'ddt_archived_orders';
function getArchivedIds(): Set<number> {
  try {
    const stored = localStorage.getItem(ARCHIVED_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set();
}
function setArchivedIds(ids: Set<number>) {
  try { localStorage.setItem(ARCHIVED_KEY, JSON.stringify([...ids])); } catch {}
}

// ============ LOGIN SCREEN ============
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const authRes = await fetch(`${MEDUSA_URL}/auth/user/emailpass`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const authData = await authRes.json();
      if (!authData.token) { setError('Email ou senha incorretos.'); setLoading(false); return; }

      const verifyRes = await fetch(`${MEDUSA_URL}/admin/pedidos`, {
        headers: { 'Authorization': `Bearer ${authData.token}`, 'Content-Type': 'application/json' },
      });
      if (verifyRes.status === 401 || verifyRes.status === 403) { setError('Sem permissao de administrador.'); setLoading(false); return; }

      localStorage.setItem('admin_token', authData.token);
      onLogin();
    } catch { setError('Erro ao conectar. Tente novamente.'); }
    setLoading(false);
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 text-center space-y-6">
        <div className="w-16 h-16 bg-zinc-900 text-white rounded-full flex items-center justify-center mx-auto"><Lock size={32} /></div>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Painel Administrativo</h1>
          <p className="text-zinc-500 text-sm mt-1">Acesso restrito</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="Email do administrador" className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-400 outline-none" autoFocus required />
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="Senha" className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-400 outline-none" required />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading || !email || !password}
            className="w-full bg-zinc-900 text-white py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============ ORDER CARD — REDESIGNED OPEN STATE ============
function OrderCard({ order, updating, onUpdateStatus, onGenerateLabel, isArchived, onArchive, onUnarchive }: {
  order: any; updating: boolean;
  onUpdateStatus: (status: string, tracking?: string, skipSuperfrete?: boolean) => void;
  onGenerateLabel: () => void;
  isArchived: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  key?: any;
}) {
  const [trackingInput, setTrackingInput] = useState(order.tracking_code || '');
  const [expanded, setExpanded] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const sc = getStatusConfig(order.status);
  const shippingName = order.shipping_service === 1 ? 'PAC' : order.shipping_service === 2 ? 'SEDEX' : `Serv ${order.shipping_service}`;

  const copyAddress = () => {
    if (order.customer_address) {
      navigator.clipboard.writeText(order.customer_address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all ${
      isArchived ? 'border-zinc-300 opacity-80' :
      order.status === 'awaiting_payment' ? 'border-amber-200' :
      order.status === 'paid' ? 'border-emerald-300 ring-1 ring-emerald-100' :
      order.status === 'preparing' ? 'border-purple-200' : 'border-zinc-200'
    }`}>
      {/* ====== HEADER (always visible) ====== */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer hover:bg-zinc-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${sc.dot} shrink-0`} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-zinc-900">#{order.id}</h3>
              <span className="text-zinc-400">&middot;</span>
              <span className="text-sm text-zinc-600">{order.customer_name}</span>
              {isArchived && <span className="text-[10px] bg-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded font-bold">ARQUIVADO</span>}
            </div>
            <p className="text-xs text-zinc-400">{new Date(order.created_at).toLocaleString('pt-BR')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-zinc-900">R$ {Number(order.total_amount).toFixed(2).replace('.', ',')}</span>
          <span className={`${sc.bg} ${sc.text} px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap`}>{sc.label}</span>
          {expanded ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
        </div>
      </div>

      {/* ====== EXPANDED CONTENT — mobile-first redesign ====== */}
      {expanded && (
        <div className="border-t border-zinc-100">

          {/* --- Section: Archive button (top right) --- */}
          <div className="px-4 sm:px-5 pt-3 flex justify-end">
            {isArchived ? (
              <button onClick={(e) => { e.stopPropagation(); onUnarchive(); }}
                className="text-xs text-zinc-400 hover:text-emerald-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors">
                <ArchiveRestore size={13} /> Desarquivar
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onArchive(); }}
                className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-100 transition-colors">
                <Archive size={13} /> Arquivar
              </button>
            )}
          </div>

          {/* --- Section: Cliente --- */}
          <div className="px-4 sm:px-5 pb-4 pt-1">
            <div className="bg-zinc-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><User size={11} /> Cliente</p>
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                  <span className="font-medium text-zinc-900">{order.customer_name}</span>
                  <span className="text-zinc-500 text-xs sm:text-sm">{order.customer_email}</span>
                </div>
                {order.customer_whatsapp && (
                  <a href={`https://wa.me/55${order.customer_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium">
                    <MessageCircle size={14} /> {order.customer_whatsapp}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* --- Section: Endereco --- */}
          {order.customer_address && (
            <div className="px-4 sm:px-5 pb-4">
              <div className="bg-zinc-50 rounded-2xl p-4 space-y-2">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><MapPin size={11} /> Endereco de entrega</p>
                <div className="flex items-start gap-2">
                  <p className="text-sm text-zinc-700 flex-1 leading-relaxed">{order.customer_address}</p>
                  <button onClick={(e) => { e.stopPropagation(); copyAddress(); }}
                    className="shrink-0 p-1.5 text-zinc-300 hover:text-zinc-600 hover:bg-white rounded-lg transition-colors" title="Copiar">
                    <Copy size={14} />
                  </button>
                </div>
                {copiedAddress && <p className="text-xs text-emerald-600 font-medium">Endereco copiado!</p>}
              </div>
            </div>
          )}

          {/* --- Section: Itens --- */}
          <div className="px-4 sm:px-5 pb-4">
            <div className="bg-zinc-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><Package size={11} /> Itens do pedido</p>
              <div className="space-y-2">
                {order.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 text-sm bg-white rounded-xl p-2.5 border border-zinc-100">
                    {item.image_url && <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-zinc-100 shrink-0" />}
                    <span className="flex-1 line-clamp-1 text-zinc-700 text-xs sm:text-sm">{item.title}</span>
                    <span className="text-zinc-400 text-xs">{item.quantity}x</span>
                    <span className="font-semibold text-zinc-900 text-xs sm:text-sm whitespace-nowrap">R$ {(Number(item.price) * item.quantity).toFixed(2).replace('.', ',')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* --- Section: Frete --- */}
          <div className="px-4 sm:px-5 pb-4">
            <div className="bg-zinc-50 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><Truck size={11} /> Frete</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-zinc-600">
                <span className="font-medium">{shippingName}</span>
                <span>R$ {Number(order.shipping_fee || 0).toFixed(2).replace('.', ',')}</span>
                {order.package_dimensions?.dimensions && (
                  <span className="text-xs text-zinc-400">
                    {order.package_dimensions.dimensions.height}&times;{order.package_dimensions.dimensions.width}&times;{order.package_dimensions.dimensions.length} cm, {order.package_dimensions.weight} kg
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* --- Section: SuperFrete --- */}
          {order.superfrete_id && (
            <div className="px-4 sm:px-5 pb-4">
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-xs space-y-2">
                <div className="flex items-center gap-2 text-orange-700 font-bold"><Tag size={14} /> SuperFrete: {order.superfrete_id}</div>
                <div className="text-orange-600">Protocolo: {order.superfrete_protocol} &middot; Status: {order.superfrete_status === 'pending' ? 'Aguardando pagamento no SF' : order.superfrete_status} {order.superfrete_price ? ` &middot; R$ ${Number(order.superfrete_price).toFixed(2).replace('.', ',')}` : ''}</div>
                <a href="https://web.superfrete.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-orange-800 font-bold underline hover:text-orange-900"><ExternalLink size={12} /> Abrir SuperFrete</a>
              </div>
            </div>
          )}

          {order.superfrete_error && !order.superfrete_id && (
            <div className="px-4 sm:px-5 pb-4">
              <div className="bg-red-50 border border-red-100 p-3 rounded-2xl text-xs text-red-700">
                <span className="font-bold">Erro SuperFrete:</span> {order.superfrete_error}
              </div>
            </div>
          )}

          {/* --- Section: Acoes --- */}
          <div className="px-4 sm:px-5 pb-5 pt-1">
            <div className="bg-zinc-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Acoes</p>

              {order.status === 'awaiting_payment' && (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl text-sm text-amber-700 flex items-start gap-2">
                    <Clock size={16} className="shrink-0 mt-0.5" />
                    <span>Aguardando comprovante PIX do cliente.</span>
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
                    <button onClick={() => {
                      if (confirm('Confirmar pagamento E gerar etiqueta SuperFrete?')) {
                        onUpdateStatus('paid', undefined, false);
                      }
                    }} disabled={updating}
                      className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                      {updating ? <Loader2 size={16} className="animate-spin" /> : <><CreditCard size={16} /><Tag size={14} /></>}
                      {updating ? 'Processando...' : 'Pago + Etiqueta'}
                    </button>
                    <button onClick={() => {
                      if (confirm('Confirmar pagamento SEM gerar etiqueta?')) {
                        onUpdateStatus('paid', undefined, true);
                      }
                    }} disabled={updating}
                      className="bg-emerald-100 text-emerald-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors border border-emerald-200">
                      <CreditCard size={16} />
                      Pago (sem etiqueta)
                    </button>
                    <button onClick={() => { if (confirm('Cancelar este pedido?')) onUpdateStatus('cancelled'); }} disabled={updating}
                      className="text-red-400 hover:text-red-600 text-xs transition-colors py-2">Cancelar pedido</button>
                  </div>
                </div>
              )}

              {order.status === 'paid' && (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-sm text-emerald-700 space-y-1">
                    <p className="font-bold flex items-center gap-2"><CheckCircle2 size={14} /> Pagamento confirmado</p>
                    {order.superfrete_id ? (
                      <p className="text-xs">Etiqueta criada no SuperFrete. <a href="https://web.superfrete.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">Abrir SF</a> para pagar e imprimir.</p>
                    ) : (
                      <p className="text-xs">Etiqueta ainda nao gerada.</p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
                    {!order.superfrete_id && (
                      <button onClick={onGenerateLabel} disabled={updating}
                        className="bg-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                        {updating ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />}
                        Gerar Etiqueta SuperFrete
                      </button>
                    )}
                    <button onClick={() => onUpdateStatus('preparing')} disabled={updating}
                      className="bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                      {updating ? <Loader2 size={16} className="animate-spin" /> : <BoxIcon size={16} />}
                      Em Preparacao
                    </button>
                  </div>
                </div>
              )}

              {order.status === 'preparing' && (
                <div className="space-y-3">
                  <div className="bg-purple-50 border border-purple-100 p-3 rounded-xl text-sm text-purple-700 flex items-center gap-2">
                    <BoxIcon size={14} /> Preparando pedido para envio.
                  </div>
                  {!order.superfrete_id && (
                    <button onClick={onGenerateLabel} disabled={updating}
                      className="bg-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors w-full sm:w-auto">
                      {updating ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />}
                      Gerar Etiqueta SuperFrete
                    </button>
                  )}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <input type="text" value={trackingInput} onChange={(e) => setTrackingInput(e.target.value)}
                      placeholder="Cole o codigo de rastreio aqui"
                      className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
                      onClick={(e) => e.stopPropagation()} />
                    <button onClick={() => onUpdateStatus('shipped', trackingInput)} disabled={updating || !trackingInput.trim()}
                      className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 transition-colors">
                      <Truck size={16} /> {updating ? '...' : 'Marcar Enviado'}
                    </button>
                  </div>
                </div>
              )}

              {order.status === 'shipped' && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-blue-600 text-sm">
                      <Truck size={14} />
                      <span>Rastreio: <a href={`https://www.linkcorreios.com.br/?id=${order.tracking_code}`} target="_blank" rel="noopener noreferrer" className="font-mono font-bold underline">{order.tracking_code}</a></span>
                    </div>
                    <button onClick={() => onUpdateStatus('delivered')} disabled={updating}
                      className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors w-full sm:w-auto text-center">
                      Marcar Entregue
                    </button>
                  </div>
                </div>
              )}

              {order.status === 'delivered' && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 size={14} /> Entregue
                  {order.tracking_code && <span className="text-zinc-400">&middot; Rastreio: {order.tracking_code}</span>}
                </div>
              )}

              {order.status === 'cancelled' && (
                <div className="flex items-center gap-2 text-red-400 text-sm"><XCircle size={14} /> Cancelado</div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function AdminOrders() {
  const [authenticated, setAuthenticated] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('awaiting_payment');
  const [superfreteMsg, setSuperfreteMsg] = useState<{orderId: number; success: boolean; message: string} | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [archivedIds, setArchivedIdsState] = useState<Set<number>>(() => getArchivedIds());

  const updateArchived = (newSet: Set<number>) => {
    setArchivedIdsState(newSet);
    setArchivedIds(newSet);
  };

  const archiveOrder = (orderId: number) => {
    const next = new Set<number>(archivedIds);
    next.add(orderId);
    updateArchived(next);
  };

  const unarchiveOrder = (orderId: number) => {
    const next = new Set<number>(archivedIds);
    next.delete(orderId);
    updateArchived(next);
  };

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      fetch(`${MEDUSA_URL}/admin/pedidos`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      }).then(res => { if (res.ok) setAuthenticated(true); else localStorage.removeItem('admin_token'); })
        .catch(() => localStorage.removeItem('admin_token'));
    }
  }, []);

  useEffect(() => { if (authenticated) loadOrders(); }, [authenticated]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/admin/pedidos');
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) { localStorage.removeItem('admin_token'); setAuthenticated(false); }
    } finally { setLoading(false); }
  };

  const updateOrder = async (orderId: number, status: string, tracking_code?: string, skipSuperfrete?: boolean) => {
    setUpdating(orderId);
    setSuperfreteMsg(null);
    try {
      const body: any = { orderId, status };
      if (tracking_code !== undefined) body.tracking_code = tracking_code;
      if (skipSuperfrete) body.skip_superfrete = true;

      const result = await adminFetch('/admin/pedidos', { method: 'PUT', body: JSON.stringify(body) });

      if (result.superfrete) {
        if (result.superfrete.success) {
          setSuperfreteMsg({ orderId, success: true, message: `Etiqueta criada no SuperFrete (ID: ${result.superfrete.data?.id || ''}). Acesse o painel SF para pagar e imprimir.` });
        } else if (result.superfrete.error) {
          setSuperfreteMsg({ orderId, success: false, message: `Erro no SuperFrete: ${result.superfrete.error || 'desconhecido'}` });
        }
      }
      await loadOrders();
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) { localStorage.removeItem('admin_token'); setAuthenticated(false); alert('Sessao expirada.'); }
      else alert('Erro ao atualizar pedido');
    } finally { setUpdating(null); }
  };

  const generateLabel = async (orderId: number) => {
    setUpdating(orderId);
    setSuperfreteMsg(null);
    try {
      const result = await adminFetch('/admin/pedidos', {
        method: 'PUT',
        body: JSON.stringify({ orderId, action: 'generate_label' }),
      });

      if (result.superfrete?.success) {
        setSuperfreteMsg({ orderId, success: true, message: `Etiqueta criada no SuperFrete (ID: ${result.order?.superfrete_id || ''}). Acesse o painel SF para pagar e imprimir.` });
      } else {
        setSuperfreteMsg({ orderId, success: false, message: `Erro ao gerar etiqueta: ${result.superfrete?.error || result.error || 'desconhecido'}` });
      }
      await loadOrders();
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) { localStorage.removeItem('admin_token'); setAuthenticated(false); alert('Sessao expirada.'); }
      else alert('Erro ao gerar etiqueta');
    } finally { setUpdating(null); }
  };

  if (!authenticated) return <LoginScreen onLogin={() => setAuthenticated(true)} />;

  // Separate archived from active
  const activeOrders = orders.filter(o => !archivedIds.has(o.id));
  const archivedOrders = orders.filter(o => archivedIds.has(o.id));

  const counts: Record<string, number> = {};
  for (const o of activeOrders) counts[o.status] = (counts[o.status] || 0) + 1;

  // Revenue excludes archived
  const revenue = activeOrders.filter(o => ['paid', 'preparing', 'shipped', 'delivered'].includes(o.status)).reduce((s, o) => s + Number(o.total_amount || 0), 0);

  let filteredOrders: any[];
  if (filter === 'archived') {
    filteredOrders = archivedOrders;
  } else if (filter === 'all') {
    filteredOrders = activeOrders;
  } else {
    filteredOrders = activeOrders.filter(o => o.status === filter);
  }

  const tabs = [
    { key: 'all', label: 'Todos', count: activeOrders.length },
    { key: 'awaiting_payment', label: 'Aguardando', count: counts['awaiting_payment'] || 0 },
    { key: 'paid', label: 'Pagos', count: counts['paid'] || 0 },
    { key: 'preparing', label: 'Preparando', count: counts['preparing'] || 0 },
    { key: 'shipped', label: 'Enviados', count: counts['shipped'] || 0 },
    { key: 'delivered', label: 'Entregues', count: counts['delivered'] || 0 },
    { key: 'archived', label: 'Arquivados', count: archivedOrders.length },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-xl border border-zinc-200 hover:bg-zinc-100 transition-colors">
              <Menu size={20} className="text-zinc-600" />
            </button>
            {menuOpen && (
              <div className="absolute top-12 left-0 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 min-w-[200px] py-2">
                <a href="/admin/produtos" className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 text-sm text-zinc-700 transition-colors">
                  <ShoppingBag size={16} /> Gerenciar Produtos
                </a>
                <a href="https://web.superfrete.com" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 text-sm text-orange-600 transition-colors">
                  <Truck size={16} /> SuperFrete
                </a>
                <div className="border-t border-zinc-100 my-1" />
                <button onClick={() => { localStorage.removeItem('admin_token'); setAuthenticated(false); setMenuOpen(false); }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 text-sm text-red-500 transition-colors w-full text-left">
                  <LogOut size={16} /> Sair
                </button>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Pedidos</h1>
            <p className="text-zinc-400 text-xs sm:text-sm mt-0.5">
              {activeOrders.length} pedido{activeOrders.length !== 1 ? 's' : ''}
              {revenue > 0 && <> &middot; <span className="text-emerald-600 font-medium">R$ {revenue.toFixed(2).replace('.', ',')} faturado</span></>}
            </p>
          </div>
        </div>
        <button onClick={loadOrders} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 text-sm bg-white px-3 py-2 rounded-xl border border-zinc-200 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* SuperFrete notification */}
      {superfreteMsg && (
        <div className={`p-4 rounded-2xl border flex items-start gap-3 ${superfreteMsg.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {superfreteMsg.success ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="shrink-0 mt-0.5" />}
          <p className="text-sm flex-1">{superfreteMsg.message}</p>
          <button onClick={() => setSuperfreteMsg(null)} className="text-zinc-400 hover:text-zinc-600">&times;</button>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(t => {
          const isActive = filter === t.key;
          return (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? t.key === 'archived' ? 'bg-zinc-600 text-white border-zinc-600' : 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
              }`}>
              {t.key === 'archived' && <Archive size={12} className="inline mr-1 -mt-0.5" />}
              {t.label}
              {t.count > 0 && (
                <span className={`ml-2 px-1.5 py-0.5 rounded-md text-xs ${isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Orders */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-3 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto" />
          <p className="text-zinc-400 mt-4 text-sm">Carregando pedidos...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white p-16 rounded-2xl border border-zinc-200 text-center">
          {filter === 'archived' ? <Archive size={40} className="text-zinc-200 mx-auto mb-3" /> : <Package size={40} className="text-zinc-200 mx-auto mb-3" />}
          <p className="text-zinc-400">
            {filter === 'archived' ? 'Nenhum pedido arquivado.' :
             filter === 'all' ? 'Nenhum pedido ainda.' :
             `Nenhum pedido "${tabs.find(t => t.key === filter)?.label}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => (
            <OrderCard key={order.id} order={order} updating={updating === order.id}
              onUpdateStatus={(s, t, skip) => updateOrder(order.id, s, t, skip)}
              onGenerateLabel={() => generateLabel(order.id)}
              isArchived={archivedIds.has(order.id)}
              onArchive={() => archiveOrder(order.id)}
              onUnarchive={() => unarchiveOrder(order.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
