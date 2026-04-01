import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Clock, Filter, ChevronDown, ChevronUp, Loader2, Package, ArrowRight, Layers, User, RefreshCw, X } from 'lucide-react';
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
  // Fallback: map actor_type to neutral display names
  if (log.actor_type === 'webhook') return 'SuperFrete';
  if (log.actor_type === 'system') return 'Sistema';
  return 'Operador';
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

// ============ AUDIT LOG ITEM ============
function AuditLogItem({ log, onOrderClick }: { log: any; onOrderClick: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isError = log.result === 'error';
  const isBatch = !!log.batch_id;
  const actorDisplay = getActorDisplay(log);

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      isError ? 'border-red-200 bg-red-50/30' : 'border-zinc-200 bg-white'
    }`}>
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
                className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
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
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
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
          </div>
        </div>

        {/* Expand icon */}
        <div className="shrink-0 text-zinc-300">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-zinc-100 pt-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
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
            {log.batch_id && (
              <div className="col-span-2">
                <span className="text-zinc-400">Operacao em lote:</span>{' '}
                <span className="text-purple-700 font-mono text-[10px]">{log.batch_id.slice(0, 30)}...</span>
              </div>
            )}
            {log.result === 'error' && log.error_message && (
              <div className="col-span-2">
                <span className="text-red-500">Erro:</span>{' '}
                <span className="text-red-600 text-[10px]">{log.error_message}</span>
              </div>
            )}
            {log.ip_address && (
              <div>
                <span className="text-zinc-400">IP:</span>{' '}
                <span className="text-zinc-600 font-mono text-[10px]">{log.ip_address}</span>
              </div>
            )}
          </div>
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
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const fetchLogs = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeSearch) params.set('order_id', activeSearch);
      if (filterAction) params.set('action_type', filterAction);
      if (filterActor) params.set('actor_label', filterActor);
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
  }, [activeSearch, filterAction, filterActor, page]);

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
    setSearchParams(params, { replace: true });
  };

  const handleClearFilters = () => {
    setSearchOrder('');
    setActiveSearch('');
    setFilterAction('');
    setFilterActor('');
    setPage(0);
    setSearchParams({}, { replace: true });
  };

  const handleOrderClick = (orderId: number) => {
    navigate(`/store/admin/pedido/${orderId}`);
  };

  const hasFilters = !!activeSearch || !!filterAction || !!filterActor;
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
                {[activeSearch, filterAction, filterActor].filter(Boolean).length}
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
          <div className="grid grid-cols-2 gap-2 pt-1">
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
