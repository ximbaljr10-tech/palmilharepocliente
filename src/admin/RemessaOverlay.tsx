import React, { useState } from 'react';
import { Package, X, Download, Printer, RotateCcw, FileText, Share2, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { Remessa, OrderRemessaMap } from './adminApi';

interface GeneratedPDF {
  id: string;
  name: string;
  filter: string;
  filterLabel: string;
  date: string;
  orderCount: number;
  dataUrl: string;
}

// Tipo do status de geração de etiquetas (compatível com o state em AdminOrders)
interface LabelsJobStatusUI {
  remessa_id: number;
  remessa_code: string;
  status: 'pending' | 'building' | 'ready' | 'error';
  current: number;
  total: number;
  message: string;
}

export default function RemessaManagementOverlay({
  remessas, allOrders, onClose, onPDF, onLabels, onUndo, onCloseRemessa, onReopen,
  savedPDFs, onDownload, onShare, onDelete, labelsJobStatus,
}: {
  remessas: Remessa[];
  allOrders: any[];
  onClose: () => void;
  onPDF: (remessaId: number) => void;
  onLabels: (remessaId: number) => void;
  onUndo: (remessaId: number) => void;
  onCloseRemessa: (remessaId: number) => void;
  onReopen: (remessaId: number) => void;
  savedPDFs: GeneratedPDF[];
  onDownload: (pdf: GeneratedPDF) => void;
  onShare: (pdf: GeneratedPDF) => void;
  onDelete: (pdf: GeneratedPDF) => void;
  labelsJobStatus?: LabelsJobStatusUI | null;
}) {
  const [tab, setTab] = useState<'active' | 'history' | 'pdfs'>('active');
  const activeRemessas = remessas.filter(r => r.status === 'open' || r.status === 'closed');
  const cancelledRemessas = remessas.filter(r => r.status === 'cancelled');

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full h-[90vh] max-w-2xl rounded-2xl flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
          <div>
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <Package size={18} className="text-purple-500" />
              Gerenciar Remessas
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">Agrupamentos de pedidos para PDF e etiquetas</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ============ BARRA DE STATUS DE ETIQUETAS (visível DENTRO do overlay) ============ */}
        {/* Feedback redundante ao toast flutuante — garante que usuário veja progresso sem precisar fechar o overlay. */}
        {labelsJobStatus && (
          <div
            className={`px-5 py-3 border-b-2 shrink-0 ${
              labelsJobStatus.status === 'ready'
                ? 'bg-emerald-50 border-emerald-300'
                : labelsJobStatus.status === 'error'
                ? 'bg-red-50 border-red-300'
                : 'bg-blue-50 border-blue-300'
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              {labelsJobStatus.status === 'ready' ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : labelsJobStatus.status === 'error' ? (
                <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
              ) : (
                <Loader2 size={18} className="text-blue-600 animate-spin shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${
                  labelsJobStatus.status === 'ready' ? 'text-emerald-800'
                  : labelsJobStatus.status === 'error' ? 'text-red-800'
                  : 'text-blue-800'
                }`}>
                  {labelsJobStatus.status === 'ready'
                    ? `Pronto! ${labelsJobStatus.remessa_code} — PDF baixado.`
                    : labelsJobStatus.status === 'error'
                    ? `Erro em ${labelsJobStatus.remessa_code}`
                    : `Gerando etiquetas de ${labelsJobStatus.remessa_code}`}
                  {labelsJobStatus.total > 0 && labelsJobStatus.status === 'building' && (
                    <span className="ml-2 text-[10px] font-mono opacity-70">
                      {labelsJobStatus.current}/{labelsJobStatus.total}
                    </span>
                  )}
                </p>
                <p className={`text-[11px] mt-0.5 leading-snug ${
                  labelsJobStatus.status === 'ready' ? 'text-emerald-700'
                  : labelsJobStatus.status === 'error' ? 'text-red-700'
                  : 'text-blue-700'
                }`}>{labelsJobStatus.message}</p>
                {(labelsJobStatus.status === 'building' || labelsJobStatus.status === 'pending') && (
                  <div className="mt-2 w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        labelsJobStatus.total > 0 ? 'bg-blue-500' : 'bg-blue-400 animate-pulse w-full'
                      }`}
                      style={
                        labelsJobStatus.total > 0
                          ? { width: `${Math.max(4, Math.min(100, (labelsJobStatus.current / labelsJobStatus.total) * 100))}%` }
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="flex border-b border-zinc-100 shrink-0">
          <button onClick={() => setTab('active')} className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'active' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}>
            Ativas ({activeRemessas.length})
          </button>
          <button onClick={() => setTab('pdfs')} className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'pdfs' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}>
            PDFs ({savedPDFs.length})
          </button>
          <button onClick={() => setTab('history')} className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'history' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}>
            Historico ({cancelledRemessas.length})
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tab === 'active' ? (
            activeRemessas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Package size={36} className="text-zinc-200 mb-3" />
                <p className="text-zinc-400 text-sm">Nenhuma remessa ativa.</p>
                <p className="text-zinc-300 text-xs mt-1">Selecione pedidos em "Preparando" e crie uma remessa.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {activeRemessas.map(rem => {
                  const remOrderIds = new Set(rem.order_ids);
                  const remOrders = allOrders.filter((o: any) => remOrderIds.has(o.medusa_order_id));
                  const withLabel = remOrders.filter((o: any) => !!o.superfrete_id).length;
                  return (
                    <div key={rem.id} className="px-5 py-3.5 hover:bg-zinc-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-zinc-900">{rem.code}</p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rem.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                              {rem.status === 'open' ? 'Aberta' : 'Fechada'}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            {rem.order_count} pedido{rem.order_count !== 1 ? 's' : ''} · {withLabel} com etiqueta · {new Date(rem.created_at).toLocaleDateString('pt-BR')}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(rem.order_display_ids || []).slice(0, 10).map((did: number, i: number) => (
                              <span key={`${did}-${i}`} className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-mono">#{did}</span>
                            ))}
                            {(rem.order_display_ids || []).length > 10 && <span className="text-[10px] text-zinc-400">+{rem.order_display_ids.length - 10}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button onClick={() => onPDF(rem.id)} className="bg-zinc-900 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold hover:bg-zinc-800 flex items-center gap-1.5 transition-colors">
                            <Download size={11} /> PDF
                          </button>
                          {withLabel > 0 && (() => {
                            const isThisProcessing = !!labelsJobStatus
                              && labelsJobStatus.remessa_id === rem.id
                              && (labelsJobStatus.status === 'pending' || labelsJobStatus.status === 'building');
                            return (
                              <button
                                onClick={() => onLabels(rem.id)}
                                disabled={isThisProcessing}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
                                  isThisProcessing
                                    ? 'bg-blue-500 text-white cursor-wait'
                                    : 'bg-orange-500 text-white hover:bg-orange-600'
                                }`}
                              >
                                {isThisProcessing ? (
                                  <>
                                    <Loader2 size={11} className="animate-spin" />
                                    {labelsJobStatus && labelsJobStatus.total > 0
                                      ? `${labelsJobStatus.current}/${labelsJobStatus.total}`
                                      : 'Gerando...'}
                                  </>
                                ) : (
                                  <>
                                    <Printer size={11} /> Etiquetas
                                  </>
                                )}
                              </button>
                            );
                          })()}
                          {rem.status === 'open' && (
                            <>
                              <button onClick={() => onCloseRemessa(rem.id)} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-blue-200 hover:bg-blue-100 transition-colors">Fechar</button>
                              <button onClick={() => onUndo(rem.id)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-red-200 hover:bg-red-100 flex items-center gap-1 transition-colors">
                                <RotateCcw size={10} /> Desfazer
                              </button>
                            </>
                          )}
                          {rem.status === 'closed' && (
                            <button onClick={() => onReopen(rem.id)} className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-emerald-200 hover:bg-emerald-100 transition-colors">Reabrir</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : tab === 'pdfs' ? (
            savedPDFs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <FileText size={36} className="text-zinc-200 mb-3" />
                <p className="text-zinc-400 text-sm">Nenhum PDF gerado ainda.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {savedPDFs.map(pdf => (
                  <div key={pdf.id} className="px-5 py-3.5 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText size={16} className="text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate">{pdf.name}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{new Date(pdf.date).toLocaleDateString('pt-BR')} · {pdf.orderCount} pedido{pdf.orderCount !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => onShare(pdf)} className="p-2 rounded-lg text-zinc-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Share2 size={15} /></button>
                        <button onClick={() => onDownload(pdf)} className="p-2 rounded-lg text-zinc-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"><Download size={15} /></button>
                        <button onClick={() => { if (confirm('Excluir este PDF?')) onDelete(pdf); }} className="p-2 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            cancelledRemessas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <RotateCcw size={36} className="text-zinc-200 mb-3" />
                <p className="text-zinc-400 text-sm">Nenhuma remessa desfeita.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {cancelledRemessas.map(rem => (
                  <div key={rem.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-zinc-400 line-through">{rem.code}</p>
                        <p className="text-[11px] text-zinc-300">{new Date(rem.cancelled_at || rem.updated_at).toLocaleDateString('pt-BR')} · Desfeita</p>
                      </div>
                      <span className="text-[10px] bg-red-50 text-red-400 px-2 py-0.5 rounded">Cancelada</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
