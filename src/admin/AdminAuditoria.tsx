import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Clock, Filter, ChevronDown, ChevronUp, Loader2, Package, ArrowRight, Layers, User, RefreshCw, X, Monitor, Smartphone, Tablet, Globe, Wifi, Shield, AlertTriangle, ExternalLink } from 'lucide-react';
import { adminFetch, getStatusConfig } from './adminApi';

// ============ ACTION LABELS (user-friendly, no technical terms) ============
const ACTION_LABELS: Record<string, string> = {
  'status_change': 'Mudanca de Status',
  'batch_mark_paid': 'Marcar Pago (lote)',
  'batch_mark_paid_label': 'Pago + Etiqueta (lote)',
  'batch_pay_labels': 'Pagar Etiquetas (lote)',
  'batch_revert_to_paid': 'Reverter para Pago (lote)',
  'batch_finalize_and_label': 'Finalizar + Etiqueta (lote)',
  'batch_sync_superfrete': 'Sincronizar SuperFrete (lote)',
  'generate_label': 'Gerar Etiqueta',
  'finalize_and_label': 'Finalizar + Etiqueta',
  'sync_superfrete': 'Sincronizar SuperFrete',
  'save_observation': 'Salvar Observacao',
  'update_customer_data': 'Atualizar Dados Cliente',
  'archive': 'Arquivar',
  'unarchive': 'Desarquivar',
  'swap_item': 'Trocar Produto',
  'resolve_swap_adjustment': 'Resolver Ajuste de Troca',
  'tracking_update': 'Atualizar Rastreio',
  'webhook_superfrete': 'Atualizacao SuperFrete',
};

// Status labels in Portuguese
const STATUS_LABELS: Record<string, string> = {
  'awaiting_payment': 'Aguardando Pagamento',
  'paid': 'Pago',
  'preparing': 'Preparando',
  'shipped': 'Enviado',
  'delivered': 'Entregue',
  'cancelled': 'Cancelado',
};

const ORIGIN_LABELS: Record<string, string> = {
  'admin_panel': 'Painel Admin',
  'webhook': 'Webhook',
  'api': 'API',
  'automation': 'Automacao',
};

function getActionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] || actionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getStatusLabel(status: string | null): string {
  if (!status) return '-';
  return STATUS_LABELS[status] || status;
}

// Get display label for the actor (NEVER show technical actor_type)
function getActorDisplay(log: any): string {
  if (log.actor_label) return log.actor_label;
  if (log.actor_type === 'webhook') return 'SuperFrete';
  if (log.actor_type === 'system') return 'Sistema';
  return 'Operador';
}

// ============ USER-AGENT PARSING ============
interface DeviceInfo {
  os: string;
  browser: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'bot' | 'unknown';
  brand?: string;
  summary: string;
}

function parseUserAgent(ua: string | null | undefined): DeviceInfo | null {
  if (!ua) return null;
  const uaLower = ua.toLowerCase();

  // Detect bots/webhooks first
  if (uaLower.includes('superfrete') || uaLower.includes('webhook')) {
    return { os: 'Servidor', browser: 'SuperFrete', deviceType: 'bot', summary: 'SuperFrete (Webhook)' };
  }
  if (uaLower.includes('bot') || uaLower.includes('crawler') || uaLower.includes('spider')) {
    return { os: 'Servidor', browser: 'Bot', deviceType: 'bot', summary: 'Bot/Crawler' };
  }

  let os = 'Desconhecido';
  let browser = 'Desconhecido';
  let deviceType: DeviceInfo['deviceType'] = 'unknown';
  let brand: string | undefined;

  // OS detection
  if (uaLower.includes('iphone')) { os = 'iOS'; deviceType = 'mobile'; brand = 'iPhone'; }
  else if (uaLower.includes('ipad')) { os = 'iPadOS'; deviceType = 'tablet'; brand = 'iPad'; }
  else if (uaLower.includes('android')) {
    os = 'Android';
    deviceType = uaLower.includes('tablet') || (uaLower.includes('sm-t') || uaLower.includes('sm-x')) ? 'tablet' : 'mobile';
    // Try to extract model
    const modelMatch = ua.match(/;\s*([^;)]+)\s*Build/);
    if (modelMatch) brand = modelMatch[1].trim();
    else {
      const androidModel = ua.match(/Android[^;]*;\s*([^;)]+)/);
      if (androidModel) brand = androidModel[1].trim();
    }
  }
  else if (uaLower.includes('macintosh') || uaLower.includes('mac os')) { os = 'macOS'; deviceType = 'desktop'; brand = 'Mac'; }
  else if (uaLower.includes('windows')) { os = 'Windows'; deviceType = 'desktop'; }
  else if (uaLower.includes('linux')) { os = 'Linux'; deviceType = 'desktop'; }
  else if (uaLower.includes('cros')) { os = 'ChromeOS'; deviceType = 'desktop'; }

  // Browser detection
  if (uaLower.includes('edg/') || uaLower.includes('edge/')) browser = 'Edge';
  else if (uaLower.includes('opr/') || uaLower.includes('opera')) browser = 'Opera';
  else if (uaLower.includes('chrome') && !uaLower.includes('chromium')) browser = 'Chrome';
  else if (uaLower.includes('firefox')) browser = 'Firefox';
  else if (uaLower.includes('safari') && !uaLower.includes('chrome')) browser = 'Safari';
  else if (uaLower.includes('samsung')) browser = 'Samsung Internet';

  // Build summary
  const parts: string[] = [];
  if (brand) parts.push(brand);
  else if (os !== 'Desconhecido') parts.push(os);
  if (browser !== 'Desconhecido') parts.push(browser);
  const typeLabel = deviceType === 'mobile' ? 'Mobile' : deviceType === 'tablet' ? 'Tablet' : deviceType === 'desktop' ? 'Desktop' : '';
  if (typeLabel) parts.push(typeLabel);

  return {
    os,
    browser,
    deviceType,
    brand,
    summary: parts.length > 0 ? parts.join(' / ') : 'Desconhecido',
  };
}

function DeviceIcon({ deviceType }: { deviceType: DeviceInfo['deviceType'] }) {
  switch (deviceType) {
    case 'mobile': return <Smartphone size={11} className="text-blue-500" />;
    case 'tablet': return <Tablet size={11} className="text-purple-500" />;
    case 'desktop': return <Monitor size={11} className="text-zinc-500" />;
    case 'bot': return <Globe size={11} className="text-orange-500" />;
    default: return <Monitor size={11} className="text-zinc-400" />;
  }
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function formatTimeShort(ts: string): string {
  try {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

// ============ AUDIT LOG ITEM (EXPANDABLE ACCORDION) ============
function AuditLogItem({ log, onOrderClick }: { log: any; onOrderClick: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isError = log.result === 'error';
  const isBatch = !!log.batch_id;
  const actorDisplay = getActorDisplay(log);
  const device = parseUserAgent(log.user_agent);

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      isError ? 'border-red-200 bg-red-50/30' : 'border-zinc-200 bg-white'
    }`}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2.5 flex items-center gap-2"
      >
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${isError ? 'bg-red-400' : 'bg-emerald-400'}`} />
        
        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {log.order_display_id && (
              <span
                onClick={(e) => { e.stopPropagation(); onOrderClick(log.order_display_id); }}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
              >
                #{log.order_display_id}
              </span>
            )}
            <span className="text-xs font-semibold text-zinc-800">{getActionLabel(log.action_type)}</span>
            {isBatch && (
              <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                <Layers size={9} /> Lote
              </span>
            )}
            {isError && (
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Erro</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400 flex-wrap">
            <span>{formatTimeShort(log.timestamp)}</span>
            <span>&middot;</span>
            <span className="flex items-center gap-0.5">
              <User size={9} /> {actorDisplay}
            </span>
            {log.previous_status && log.new_status && log.previous_status !== log.new_status && (
              <>
                <span>&middot;</span>
                <span className="flex items-center gap-0.5">
                  {getStatusLabel(log.previous_status)} <ArrowRight size={8} /> {getStatusLabel(log.new_status)}
                </span>
              </>
            )}
            {device && (
              <>
                <span>&middot;</span>
                <span className="flex items-center gap-0.5">
                  <DeviceIcon deviceType={device.deviceType} />
                  <span className="max-w-[100px] truncate">{device.summary}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Expand icon */}
        <div className="shrink-0 text-zinc-300">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-zinc-100 pt-2 space-y-2">
          {/* Key details grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <div>
              <span className="text-zinc-400">Horario:</span>{' '}
              <span className="text-zinc-700 font-medium">{formatTimestamp(log.timestamp)}</span>
            </div>
            <div>
              <span className="text-zinc-400">Operador:</span>{' '}
              <span className="text-zinc-700 font-medium">{actorDisplay}</span>
            </div>
            {log.previous_status && (
              <div>
                <span className="text-zinc-400">Status anterior:</span>{' '}
                <span className="text-zinc-700">{getStatusLabel(log.previous_status)}</span>
              </div>
            )}
            {log.new_status && (
              <div>
                <span className="text-zinc-400">Novo status:</span>{' '}
                <span className="text-zinc-700">{getStatusLabel(log.new_status)}</span>
              </div>
            )}
            {log.origin && (
              <div>
                <span className="text-zinc-400">Origem:</span>{' '}
                <span className="text-zinc-700">{ORIGIN_LABELS[log.origin] || log.origin}</span>
              </div>
            )}
            {log.order_display_id && (
              <div>
                <span className="text-zinc-400">Pedido:</span>{' '}
                <button
                  onClick={() => onOrderClick(log.order_display_id)}
                  className="text-blue-600 hover:text-blue-800 font-medium hover:underline inline-flex items-center gap-0.5"
                >
                  #{log.order_display_id} <ExternalLink size={9} />
                </button>
              </div>
            )}
          </div>

          {/* Device/IP section */}
          {(log.ip_address || device) && (
            <div className="bg-zinc-50 rounded-lg p-2 space-y-1">
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Identificacao do Acesso</p>
              <div className="grid grid-cols-1 gap-1 text-[11px]">
                {log.ip_address && (
                  <div className="flex items-center gap-1.5">
                    <Wifi size={10} className="text-zinc-400 shrink-0" />
                    <span className="text-zinc-400">IP:</span>
                    <span className="text-zinc-700 font-mono text-[10px]">{log.ip_address}</span>
                  </div>
                )}
                {device && (
                  <div className="flex items-center gap-1.5">
                    <DeviceIcon deviceType={device.deviceType} />
                    <span className="text-zinc-400">Dispositivo:</span>
                    <span className="text-zinc-700">{device.summary}</span>
                  </div>
                )}
                {device && device.os !== 'Desconhecido' && (
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Monitor size={10} className="text-zinc-300 shrink-0" />
                    <span className="text-zinc-400">SO: {device.os}</span>
                    <span className="text-zinc-300">&middot;</span>
                    <span className="text-zinc-400">Navegador: {device.browser}</span>
                  </div>
                )}
                {device?.brand && (
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Smartphone size={10} className="text-zinc-300 shrink-0" />
                    <span className="text-zinc-400">Marca/Modelo: {device.brand}</span>
                  </div>
                )}
                {log.session_id && (
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Shield size={10} className="text-zinc-300 shrink-0" />
                    <span className="text-zinc-400">Sessao:</span>
                    <span className="text-zinc-500 font-mono text-[9px] truncate max-w-[200px]">{log.session_id}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Batch info */}
          {log.batch_id && (
            <div className="bg-purple-50 rounded-lg p-2 space-y-0.5">
              <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1">
                <Layers size={9} /> Operacao em Lote
              </p>
              <p className="text-[10px] text-purple-700 font-mono truncate">{log.batch_id}</p>
            </div>
          )}

          {/* Error */}
          {log.result === 'error' && log.error_message && (
            <div className="bg-red-50 rounded-lg p-2 flex items-start gap-1.5">
              <AlertTriangle size={11} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[9px] font-bold text-red-400 uppercase">Erro</p>
                <p className="text-[10px] text-red-600">{log.error_message}</p>
              </div>
            </div>
          )}

          {/* Payload summary */}
          {log.payload_summary && typeof log.payload_summary === 'object' && Object.keys(log.payload_summary).length > 0 && (
            <div className="bg-zinc-50 rounded-lg p-2 space-y-0.5">
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Detalhes</p>
              <div className="text-[10px] text-zinc-600 space-y-0.5">
                {Object.entries(log.payload_summary).map(([key, val]) => (
                  <div key={key} className="flex items-baseline gap-1">
                    <span className="text-zinc-400">{key.replace(/_/g, ' ')}:</span>
                    <span className="text-zinc-700 font-medium truncate">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User-agent raw (collapsed) */}
          {log.user_agent && (
            <details className="text-[10px]">
              <summary className="text-zinc-400 cursor-pointer hover:text-zinc-600">User-Agent completo</summary>
              <p className="text-zinc-500 font-mono text-[9px] mt-1 break-all bg-zinc-50 p-1.5 rounded">{log.user_agent}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function AdminAuditoria() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchOrder, setSearchOrder] = useState(searchParams.get('order') || '');
  const [activeSearch, setActiveSearch] = useState(searchParams.get('order') || '');
  const [filterAction, setFilterAction] = useState(searchParams.get('action') || '');
  const [filterActor, setFilterActor] = useState(searchParams.get('actor') || '');
  const [filterIP, setFilterIP] = useState(searchParams.get('ip') || '');
  const [filterOrigin, setFilterOrigin] = useState(searchParams.get('origin') || '');
  const [filterDateFrom, setFilterDateFrom] = useState(searchParams.get('from') || '');
  const [filterDateTo, setFilterDateTo] = useState(searchParams.get('to') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [knownIPs, setKnownIPs] = useState<string[]>([]);
  const PAGE_SIZE = 30;

  // Load known IPs for filter dropdown
  useEffect(() => {
    adminFetch('/admin/auditoria?view=ips').then(data => {
      setKnownIPs(data.ips || []);
    }).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeSearch) params.set('order_id', activeSearch);
      if (filterAction) params.set('action_type', filterAction);
      if (filterActor) params.set('actor_label', filterActor);
      if (filterIP) params.set('ip_address', filterIP);
      if (filterOrigin) params.set('origin', filterOrigin);
      if (filterDateFrom) params.set('date_from', filterDateFrom);
      if (filterDateTo) params.set('date_to', filterDateTo);
      const offset = reset ? 0 : page * PAGE_SIZE;
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));

      const data = await adminFetch(`/admin/auditoria?${params.toString()}`);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      if (reset) setPage(0);
    } catch (err) {
      console.error('Erro ao buscar auditoria:', err);
    } finally {
      setLoading(false);
    }
  }, [activeSearch, filterAction, filterActor, filterIP, filterOrigin, filterDateFrom, filterDateTo, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = () => {
    setActiveSearch(searchOrder);
    setPage(0);
    // Update URL params
    const params = new URLSearchParams();
    if (searchOrder) params.set('order', searchOrder);
    if (filterAction) params.set('action', filterAction);
    if (filterActor) params.set('actor', filterActor);
    if (filterIP) params.set('ip', filterIP);
    if (filterOrigin) params.set('origin', filterOrigin);
    if (filterDateFrom) params.set('from', filterDateFrom);
    if (filterDateTo) params.set('to', filterDateTo);
    setSearchParams(params, { replace: true });
  };

  const handleClearFilters = () => {
    setSearchOrder('');
    setActiveSearch('');
    setFilterAction('');
    setFilterActor('');
    setFilterIP('');
    setFilterOrigin('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(0);
    setSearchParams({}, { replace: true });
  };

  const handleOrderClick = (orderId: number) => {
    navigate(`/store/admin/pedido/${orderId}`);
  };

  const activeFilterCount = [activeSearch, filterAction, filterActor, filterIP, filterOrigin, filterDateFrom, filterDateTo].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Historico de Acoes</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Registro de todas as acoes realizadas nos pedidos</p>
        </div>
        <button
          onClick={() => fetchLogs(true)}
          disabled={loading}
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-3 space-y-3">
        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              inputMode="numeric"
              value={searchOrder}
              onChange={(e) => setSearchOrder(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Buscar por numero do pedido..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-zinc-400 focus:border-zinc-300 outline-none bg-zinc-50 focus:bg-white transition-colors"
            />
          </div>
          <button
            onClick={handleSearch}
            className="bg-zinc-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors shrink-0"
          >
            Buscar
          </button>
        </div>

        {/* Filter toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            <Filter size={12} />
            Filtros
            {hasFilters && (
              <span className="w-4 h-4 bg-zinc-900 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-zinc-400 hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Tipo de Acao</label>
                <select
                  value={filterAction}
                  onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-xs bg-white focus:ring-2 focus:ring-zinc-400 outline-none"
                >
                  <option value="">Todas</option>
                  {Object.entries(ACTION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Operador</label>
                <select
                  value={filterActor}
                  onChange={(e) => { setFilterActor(e.target.value); setPage(0); }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-xs bg-white focus:ring-2 focus:ring-zinc-400 outline-none"
                >
                  <option value="">Todos</option>
                  <option value="Luana">Luana</option>
                  <option value="Programador">Programador</option>
                  <option value="Auditoria">Auditoria</option>
                  <option value="SuperFrete">SuperFrete</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">IP</label>
                <select
                  value={filterIP}
                  onChange={(e) => { setFilterIP(e.target.value); setPage(0); }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-xs bg-white focus:ring-2 focus:ring-zinc-400 outline-none"
                >
                  <option value="">Todos</option>
                  {knownIPs.map(ip => (
                    <option key={ip} value={ip}>{ip}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Origem</label>
                <select
                  value={filterOrigin}
                  onChange={(e) => { setFilterOrigin(e.target.value); setPage(0); }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-xs bg-white focus:ring-2 focus:ring-zinc-400 outline-none"
                >
                  <option value="">Todas</option>
                  <option value="admin_panel">Painel Admin</option>
                  <option value="webhook">Webhook</option>
                  <option value="api">API</option>
                  <option value="automation">Automacao</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Data de</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-xs bg-white focus:ring-2 focus:ring-zinc-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Data ate</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-xs bg-white focus:ring-2 focus:ring-zinc-400 outline-none"
                />
              </div>
            </div>
            <button
              onClick={handleSearch}
              className="w-full bg-zinc-800 text-white py-2 rounded-lg text-xs font-bold hover:bg-zinc-700 transition-colors"
            >
              Aplicar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Results count */}
      {!loading && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-zinc-400">
            {total === 0 ? 'Nenhum registro encontrado' : `${total} registro${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
          </p>
          {totalPages > 1 && (
            <p className="text-xs text-zinc-400">
              Pagina {page + 1} de {totalPages}
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-zinc-400" />
        </div>
      )}

      {/* Log list */}
      {!loading && logs.length > 0 && (
        <div className="space-y-2">
          {logs.map((log) => (
            <AuditLogItem key={log.id} log={log} onOrderClick={handleOrderClick} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && logs.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <div className="w-16 h-16 mx-auto bg-zinc-100 rounded-full flex items-center justify-center">
            <Clock size={28} className="text-zinc-300" />
          </div>
          <p className="text-sm text-zinc-500 font-medium">
            {hasFilters ? 'Nenhum registro encontrado com esses filtros' : 'Nenhuma acao registrada ainda'}
          </p>
          <p className="text-xs text-zinc-400">
            {hasFilters ? 'Tente ajustar os filtros ou buscar outro pedido' : 'As acoes serao registradas automaticamente a partir de agora'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0 || loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Anterior
          </button>
          <span className="text-xs text-zinc-500 px-2">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1 || loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Proximo
          </button>
        </div>
      )}
    </div>
  );
}
