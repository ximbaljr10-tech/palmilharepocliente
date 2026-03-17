import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, User, MapPin, Package, Truck, CreditCard, Tag, ExternalLink,
  MessageCircle, Copy, Clock, BoxIcon, CheckCircle2, XCircle, Loader2,
  Archive, ArchiveRestore, AlertTriangle, Mail, Printer, RefreshCw, Wallet, Zap,
  StickyNote, Save, FileDown
} from 'lucide-react';
import { adminFetch, getStatusConfig, formatCurrency, isOrderArchived, archiveOrderBackend, unarchiveOrderBackend, saveOrderObservation } from './adminApi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromFilter = searchParams.get('from') || '';
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [superfreteMsg, setSuperfreteMsg] = useState<{ success: boolean; message: string } | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [observation, setObservation] = useState('');
  const [savingObs, setSavingObs] = useState(false);
  const [obsSaved, setObsSaved] = useState(false);
  const [generatingDecl, setGeneratingDecl] = useState(false);

  // Confirmation modal state for single-order actions
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    warning?: string;
    buttonLabel: string;
    buttonClass: string;
    onConfirm: () => void;
  } | null>(null);

  // Helper: generate back URL preserving filter
  const getBackUrl = () => {
    if (fromFilter && fromFilter !== 'awaiting_payment') {
      return `/store/admin/pedidos?filter=${fromFilter}`;
    }
    return '/store/admin/pedidos';
  };

  useEffect(() => {
    if (id) loadOrder();
  }, [id]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/admin/pedidos');
      const orders = Array.isArray(data) ? data : [];
      const found = orders.find((o: any) => String(o.id) === String(id));
      if (found) {
        setOrder(found);
        setTrackingInput(found.tracking_code || '');
        setObservation(found.admin_observation || '');
      }
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (status: string, tracking_code?: string, skipSuperfrete?: boolean) => {
    if (!order) return;
    setUpdating(true);
    setSuperfreteMsg(null);
    try {
      // Use medusa_order_id (internal Medusa ID) for direct lookup — no ambiguity
      const body: any = { orderId: order.id, status };
      if (order.medusa_order_id) body.medusa_order_id = order.medusa_order_id;
      if (tracking_code !== undefined) body.tracking_code = tracking_code;
      if (skipSuperfrete) body.skip_superfrete = true;
      console.log('Updating order:', order.id, 'medusa_order_id:', order.medusa_order_id, 'status:', status);

      const result = await adminFetch('/admin/pedidos', { method: 'PUT', body: JSON.stringify(body) });

      if (result.superfrete) {
        if (result.superfrete.success) {
          setSuperfreteMsg({ success: true, message: `Etiqueta criada no SuperFrete (ID: ${result.superfrete.data?.id || ''}).` });
        } else if (result.superfrete.error) {
          setSuperfreteMsg({ success: false, message: `Erro SuperFrete: ${result.superfrete.error}` });
        }
      }
      await loadOrder();
    } catch (err: any) {
      alert('Erro ao atualizar pedido');
    } finally {
      setUpdating(false);
    }
  };

  const generateLabel = async () => {
    if (!order) return;
    setUpdating(true);
    setSuperfreteMsg(null);
    try {
      console.log('Generating label for order:', order.id, 'medusa_order_id:', order.medusa_order_id);
      const body: any = { orderId: order.id, action: 'generate_label' };
      if (order.medusa_order_id) body.medusa_order_id = order.medusa_order_id;
      const result = await adminFetch('/admin/pedidos', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (result.superfrete?.success) {
        setSuperfreteMsg({ success: true, message: `Etiqueta criada (ID: ${result.order?.superfrete_id || ''}).` });
      } else {
        setSuperfreteMsg({ success: false, message: `Erro: ${result.superfrete?.error || result.error || 'desconhecido'}` });
      }
      await loadOrder();
    } catch {
      alert('Erro ao gerar etiqueta');
    } finally {
      setUpdating(false);
    }
  };

  const finalizeAndLabel = async () => {
    if (!order) return;
    setFinalizing(true);
    setSuperfreteMsg(null);
    setShowFinalizeConfirm(false);
    try {
      console.log('Finalizing order:', order.id, 'medusa_order_id:', order.medusa_order_id);
      const body: any = { orderId: order.id, action: 'finalize_and_label' };
      if (order.medusa_order_id) body.medusa_order_id = order.medusa_order_id;
      const result = await adminFetch('/admin/pedidos', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (result.success) {
        const trackInfo = result.order?.tracking_code ? ` · Rastreio: ${result.order.tracking_code}` : '';
        setSuperfreteMsg({ success: true, message: `Pedido finalizado com sucesso! Etiqueta gerada e paga.${trackInfo}` });
      } else {
        setSuperfreteMsg({ success: false, message: `Erro: ${result.error || 'desconhecido'} (etapa: ${result.step || 'N/A'})` });
      }
      await loadOrder();
    } catch (err: any) {
      setSuperfreteMsg({ success: false, message: `Erro: ${err.message || 'falha na operacao'}` });
    } finally {
      setFinalizing(false);
    }
  };

  const syncSuperfrete = async () => {
    if (!order) return;
    setSyncing(true);
    setSuperfreteMsg(null);
    try {
      const body: any = { orderId: order.id, action: 'sync_superfrete' };
      if (order.medusa_order_id) body.medusa_order_id = order.medusa_order_id;
      const result = await adminFetch('/admin/pedidos', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (result.success) {
        const changed = result.status_changed ? ' (status atualizado)' : ' (sem alteracao)';
        setSuperfreteMsg({ success: true, message: `Sincronizado com SuperFrete${changed}. Status SF: ${result.order?.superfrete_status || 'N/A'}` });
      } else {
        setSuperfreteMsg({ success: false, message: result.error || 'Erro ao sincronizar' });
      }
      await loadOrder();
    } catch (err: any) {
      setSuperfreteMsg({ success: false, message: err.message || 'Erro' });
    } finally {
      setSyncing(false);
    }
  };

  const printLabel = async () => {
    if (!order?.superfrete_id) return;
    try {
      // Send order_info for PDF header identification
      const orderInfo = [{
        superfrete_id: order.superfrete_id,
        order_id: order.id,
        customer_name: order.customer_name || '',
        cep: order.address_components?.cep || '',
      }];

      const result = await adminFetch('/admin/superfrete', {
        method: 'POST',
        body: JSON.stringify({ action: 'print', orders: [order.superfrete_id], order_info: orderInfo }),
      });

      if (result.success && result.data?.pdf_base64) {
        // Modified PDF returned as base64 — open as blob
        const byteCharacters = atob(result.data.pdf_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } else if (result.success && result.data?.url) {
        window.open(result.data.url, '_blank');
      } else {
        alert(result.error || 'Erro ao obter link de impressao');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao imprimir');
    }
  };

  const generateDeclaration = () => {
    if (!order) return;
    setGeneratingDecl(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 14;
      const cep = order.address_components?.cep || '';
      const customerName = order.customer_name || 'N/A';

      // ---- IDENTIFICATION HEADER ----
      doc.setFillColor(245, 245, 247);
      doc.rect(0, 0, pageWidth, 22, 'F');
      doc.setFillColor(249, 115, 22);
      doc.rect(0, 22, pageWidth, 1, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(24, 24, 27);
      doc.text(`Pedido #${order.id}`, marginX, 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 110);
      doc.text(customerName, marginX, 15);
      doc.text(`CEP: ${cep || 'N/A'}`, marginX, 20);

      const dateStr = new Date(order.created_at).toLocaleDateString('pt-BR');
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 155);
      doc.text(dateStr, pageWidth - marginX, 9, { align: 'right' });
      const shippingName = order.shipping_service === 1 ? 'PAC' : order.shipping_service === 2 ? 'SEDEX' : '';
      if (shippingName) {
        doc.text(shippingName, pageWidth - marginX, 15, { align: 'right' });
      }

      // ---- DECLARATION TITLE ----
      let y = 32;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(24, 24, 27);
      doc.text('DECLARACAO DE CONTEUDO', pageWidth / 2, y, { align: 'center' });
      y += 10;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(70, 70, 80);
      doc.text('REMETENTE:', marginX, y);
      doc.setFont('helvetica', 'normal');
      doc.text('Dente de Tubarao - Loja de Linhas', marginX + 28, y);
      y += 6;

      doc.setFont('helvetica', 'bold');
      doc.text('DESTINATARIO:', marginX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(customerName, marginX + 32, y);
      y += 5;
      if (order.customer_address) {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 110);
        const addrLines = doc.splitTextToSize(order.customer_address, pageWidth - marginX * 2 - 32);
        doc.text(addrLines, marginX + 32, y);
        y += addrLines.length * 4 + 2;
      }
      y += 4;

      const items = order.items || [];
      const tableData = items.map((item: any, i: number) => [
        String(i + 1),
        item.title || 'Produto',
        String(item.quantity || 1),
        `R$ ${formatCurrency(Number(item.price || 0))}`,
      ]);
      const totalValue = items.reduce((sum: number, item: any) => sum + (Number(item.price || 0) * (item.quantity || 1)), 0);

      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['N', 'Descricao do Conteudo', 'Qtd', 'Valor (R$)']],
        body: [
          ...tableData,
          ['', 'TOTAL', '', `R$ ${formatCurrency(totalValue)}`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, cellPadding: 3 },
        bodyStyles: { fontSize: 8, textColor: [55, 55, 60], cellPadding: 2.5 },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 15, halign: 'center' }, 3: { cellWidth: 30, halign: 'right' } },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 155);
      doc.text('Declaro que nao estou postando nenhum item proibido conforme o art. 13 do regulamento postal.', marginX, finalY + 10);

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(marginX, finalY + 30, pageWidth / 2 - 5, finalY + 30);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 110);
      doc.text('Assinatura do remetente', marginX, finalY + 35);

      // Download
      const link = document.createElement('a');
      link.href = doc.output('dataurlstring');
      link.download = `DECLARACAO-${order.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Erro ao gerar declaracao de conteudo.');
    } finally {
      setGeneratingDecl(false);
    }
  };

  const handleArchive = async () => {
    if (!order) return;
    setArchiving(true);
    console.log('Archiving order:', order.id, 'medusa_order_id:', order.medusa_order_id);
    const success = await archiveOrderBackend(order.id, order.medusa_order_id);
    if (success) {
      await loadOrder();
      setShowArchiveConfirm(false);
    } else {
      alert('Erro ao arquivar. Tente novamente.');
    }
    setArchiving(false);
  };

  const handleUnarchive = async () => {
    if (!order) return;
    setArchiving(true);
    console.log('Unarchiving order:', order.id, 'medusa_order_id:', order.medusa_order_id);
    const success = await unarchiveOrderBackend(order.id, order.medusa_order_id);
    if (success) {
      await loadOrder();
    } else {
      alert('Erro ao desarquivar. Tente novamente.');
    }
    setArchiving(false);
  };

  const copyAddress = () => {
    if (order?.customer_address) {
      navigator.clipboard.writeText(order.customer_address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleSaveObservation = async () => {
    if (!order) return;
    setSavingObs(true);
    setObsSaved(false);
    const success = await saveOrderObservation(order.id, observation, order.medusa_order_id);
    if (success) {
      setObsSaved(true);
      setTimeout(() => setObsSaved(false), 3000);
    } else {
      alert('Erro ao salvar observacao. Tente novamente.');
    }
    setSavingObs(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20 space-y-3">
        <Package size={32} className="text-zinc-300 mx-auto" />
        <p className="text-zinc-400">Pedido nao encontrado.</p>
        <button onClick={() => navigate(getBackUrl())} className="text-sm text-zinc-500 underline">
          Voltar para pedidos
        </button>
      </div>
    );
  }

  const sc = getStatusConfig(order.status);
  const isArchived = isOrderArchived(order);
  const shippingName = order.shipping_service === 1 ? 'PAC' : order.shipping_service === 2 ? 'SEDEX' : `Serv ${order.shipping_service}`;

  return (
    <div className="space-y-4 pb-8">
      {/* ============ TOP BAR ============ */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(getBackUrl())}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-700 text-sm transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Voltar</span>
        </button>

        {/* Archive button (top right, small and discrete) */}
        {isArchived ? (
          <button
            onClick={handleUnarchive}
            disabled={archiving}
            className="text-xs text-zinc-400 hover:text-emerald-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            <ArchiveRestore size={13} /> {archiving ? '...' : 'Desarquivar'}
          </button>
        ) : (
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <Archive size={13} /> Arquivar
          </button>
        )}
      </div>

      {/* ============ ARCHIVE CONFIRMATION MODAL ============ */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowArchiveConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <Archive size={28} className="text-zinc-400 mx-auto" />
              <h3 className="font-bold text-zinc-900">Arquivar pedido #{order.id}?</h3>
              <p className="text-sm text-zinc-500">
                O pedido sera removido da visao principal e nao entrara no faturamento.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="w-full bg-zinc-900 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {archiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                {archiving ? 'Arquivando...' : 'Sim, arquivar'}
              </button>
              <button
                onClick={() => setShowArchiveConfirm(false)}
                className="w-full text-zinc-500 py-2.5 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors border border-zinc-200"
              >
                Nao, cliquei sem querer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ FINALIZE CONFIRMATION MODAL ============ */}
      {showFinalizeConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowFinalizeConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <Zap size={28} className="text-orange-500 mx-auto" />
              <h3 className="font-bold text-zinc-900">Finalizar pedido #{order.id}?</h3>
              <p className="text-sm text-zinc-500">
                Isso vai gerar a etiqueta, pagar com saldo SuperFrete, marcar como "em preparacao" e enviar email ao cliente.
              </p>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-left">
                <p className="text-xs text-amber-700 font-medium">O que vai acontecer:</p>
                <ul className="text-xs text-amber-600 mt-1 space-y-0.5">
                  <li>1. Gerar etiqueta na SuperFrete</li>
                  <li>2. Pagar etiqueta usando saldo da conta</li>
                  <li>3. Marcar pedido como "em preparacao"</li>
                  <li>4. Enviar email ao cliente com rastreio</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={finalizeAndLabel}
                disabled={finalizing}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-2.5 rounded-xl text-sm font-bold hover:from-orange-600 hover:to-orange-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {finalizing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {finalizing ? 'Processando...' : 'Sim, finalizar agora'}
              </button>
              <button
                onClick={() => setShowFinalizeConfirm(false)}
                className="w-full text-zinc-500 py-2.5 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors border border-zinc-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ ORDER HEADER ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-black text-zinc-900">#{order.id}</h2>
              {isArchived && (
                <span className="text-[10px] bg-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded font-bold">ARQUIVADO</span>
              )}
            </div>
            <p className="text-xs text-zinc-400">{new Date(order.created_at).toLocaleString('pt-BR')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-black text-zinc-900">R$ {formatCurrency(Number(order.total_amount || 0))}</span>
            <span className={`${sc.bg} ${sc.text} px-3 py-1.5 rounded-xl text-xs font-bold`}>{sc.label}</span>
          </div>
        </div>
      </div>

      {/* ============ SUPERFRETE MESSAGE ============ */}
      {superfreteMsg && (
        <div className={`p-3 rounded-xl border flex items-start gap-2 text-sm ${
          superfreteMsg.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {superfreteMsg.success ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
          <p className="flex-1 text-xs">{superfreteMsg.message}</p>
          <button onClick={() => setSuperfreteMsg(null)} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* ============ CUSTOMER ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 space-y-3">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
          <User size={11} /> Cliente
        </p>
        <div className="space-y-2">
          <p className="font-semibold text-sm text-zinc-900">{order.customer_name}</p>
          {order.customer_email && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Mail size={12} /> {order.customer_email}
            </div>
          )}
          {order.customer_whatsapp && (
            <a
              href={`https://wa.me/55${order.customer_whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <MessageCircle size={13} /> {order.customer_whatsapp}
            </a>
          )}
        </div>
      </div>

      {/* ============ ADDRESS ============ */}
      {order.customer_address && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 space-y-2">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <MapPin size={11} /> Endereco de Entrega
          </p>
          <div className="flex items-start gap-2">
            <p className="text-sm text-zinc-700 leading-relaxed flex-1">{order.customer_address}</p>
            <button
              onClick={copyAddress}
              className="shrink-0 p-1.5 text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors"
              title="Copiar"
            >
              <Copy size={14} />
            </button>
          </div>
          {copiedAddress && <p className="text-xs text-emerald-600 font-medium">Endereco copiado!</p>}
        </div>
      )}

      {/* ============ ITEMS ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 space-y-3">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
          <Package size={11} /> Itens do Pedido
        </p>
        <div className="space-y-2">
          {order.items?.map((item: any, idx: number) => {
            // Find color preference for this item
            const colorPrefs = order.items_color_preferences || [];
            const itemColorPref = colorPrefs.find((cp: any) =>
              cp.product_id === item.product_id || cp.variant_id === item.variant_id
            );

            return (
              <div key={idx} className="bg-zinc-50 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center gap-3 text-sm">
                  {item.image_url && (
                    <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-zinc-200 shrink-0" />
                  )}
                  <span className="flex-1 line-clamp-2 text-zinc-700 text-xs sm:text-sm">{item.title}</span>
                  <span className="text-zinc-400 text-xs shrink-0">{item.quantity}x</span>
                  <span className="font-semibold text-zinc-900 text-xs sm:text-sm whitespace-nowrap shrink-0">
                    R$ {formatCurrency(Number(item.price) * item.quantity)}
                  </span>
                </div>
                {/* Color preference display */}
                {itemColorPref && (
                  <div className="ml-13 pl-2 border-l-2 border-zinc-200 space-y-1">
                    {itemColorPref.mode === 'sortida' ? (
                      <p className="text-[10px] text-zinc-500 font-medium">Cores sortidas</p>
                    ) : (
                      <div className="space-y-0.5">
                        <p className="text-[10px] text-zinc-500 font-medium">Prioridade de cores:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: '1ª', color: itemColorPref.color_1 },
                            { label: '2ª', color: itemColorPref.color_2 },
                            { label: '3ª', color: itemColorPref.color_3 },
                          ].filter(c => c.color).map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-white border border-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded font-medium">
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{
                                backgroundColor: c.color === 'Preta' ? '#1a1a1a' : c.color === 'Branca' ? '#f5f5f5' : c.color === 'Verde' ? '#22c55e' : c.color === 'Laranja' ? '#f97316' : c.color === 'Amarela' ? '#eab308' : c.color === 'Rosa' ? '#ec4899' : c.color === 'Roxa' || c.color === 'Lilás' ? '#a855f7' : c.color === 'Azul' ? '#3b82f6' : c.color === 'Vermelha' ? '#ef4444' : c.color === 'Cinza' ? '#9ca3af' : c.color === 'Marrom' ? '#92400e' : c.color === 'Multicor' ? '#eab308' : '#9ca3af',
                                border: c.color === 'Branca' ? '1px solid #d4d4d8' : 'none',
                                ...(c.color === 'Multicor' ? { background: 'linear-gradient(135deg, #ef4444, #eab308, #22c55e, #3b82f6)' } : {}),
                              }} />
                              {c.label} {c.color}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {itemColorPref.observation && (
                      <p className="text-[10px] text-zinc-400 italic">Obs: {itemColorPref.observation}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-zinc-100">
          <span className="text-xs text-zinc-500">Total dos itens</span>
          <span className="font-bold text-sm text-zinc-900">
            R$ {formatCurrency(order.items?.reduce((s: number, i: any) => s + Number(i.price) * i.quantity, 0) || 0)}
          </span>
        </div>
      </div>

      {/* ============ SHIPPING ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 space-y-2">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
          <Truck size={11} /> Frete
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
          <span className="font-medium">{shippingName}</span>
          <span>R$ {formatCurrency(Number(order.shipping_fee || 0))}</span>
          {order.package_dimensions?.dimensions && (
            <span className="text-xs text-zinc-400">
              {order.package_dimensions.dimensions.height}&times;{order.package_dimensions.dimensions.width}&times;{order.package_dimensions.dimensions.length} cm, {order.package_dimensions.weight} kg
            </span>
          )}
        </div>
        {order.tracking_code && (
          <div className="flex items-center gap-2 mt-2 text-sm">
            <Truck size={14} className="text-blue-500" />
            <span className="text-zinc-600">Rastreio:</span>
            <a
              href={`https://www.linkcorreios.com.br/?id=${order.tracking_code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-bold text-blue-600 underline"
            >
              {order.tracking_code}
            </a>
          </div>
        )}
      </div>

      {/* ============ SUPERFRETE INFO ============ */}
      {order.superfrete_id && (
        <div className="bg-orange-50 rounded-2xl border border-orange-100 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-orange-700 font-bold text-xs">
              <Tag size={14} /> SuperFrete: {order.superfrete_id}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={syncSuperfrete}
                disabled={syncing}
                className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-100 transition-colors disabled:opacity-50"
                title="Sincronizar status"
              >
                <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={printLabel}
                className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-100 transition-colors"
                title="Imprimir etiqueta"
              >
                <Printer size={13} />
              </button>
              <button
                onClick={generateDeclaration}
                disabled={generatingDecl}
                className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-100 transition-colors disabled:opacity-50"
                title="Gerar declaracao de conteudo"
              >
                <FileDown size={13} />
              </button>
            </div>
          </div>
          <p className="text-xs text-orange-600">
            Protocolo: {order.superfrete_protocol} · Status SF: {
              order.superfrete_status === 'pending' ? 'Aguardando pagamento' :
              order.superfrete_status === 'released' ? 'Pago/Pronto para postagem' :
              order.superfrete_status === 'posted' ? 'Postado' :
              order.superfrete_status === 'delivered' ? 'Entregue' :
              order.superfrete_status === 'canceled' ? 'Cancelado' :
              order.superfrete_status || 'N/A'
            }
            {order.superfrete_price ? ` · R$ ${formatCurrency(Number(order.superfrete_price))}` : ''}
          </p>
          {order.superfrete_tracking && (
            <p className="text-xs text-orange-700 font-medium">
              Rastreio SF: {order.superfrete_tracking}
            </p>
          )}
          <a
            href="https://web.superfrete.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-orange-800 font-bold underline hover:text-orange-900"
          >
            <ExternalLink size={12} /> Abrir SuperFrete
          </a>
        </div>
      )}

      {order.superfrete_error && !order.superfrete_id && (
        <div className="bg-red-50 border border-red-100 p-3 rounded-xl text-xs text-red-700">
          <span className="font-bold">Erro SuperFrete:</span> {order.superfrete_error}
        </div>
      )}

      {/* ============ ADMIN OBSERVATION (internal notes) ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 space-y-2">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
          <StickyNote size={11} /> Observacao Interna (admin)
        </p>
        <textarea
          value={observation}
          onChange={(e) => { setObservation(e.target.value); setObsSaved(false); }}
          placeholder="Notas internas sobre este pedido... (ex: cliente pediu envio rapido, aguardar estoque)"
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none resize-y bg-amber-50/30 placeholder:text-zinc-300"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveObservation}
            disabled={savingObs}
            className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            {savingObs ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {savingObs ? 'Salvando...' : 'Salvar Observacao'}
          </button>
          {obsSaved && (
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle2 size={12} /> Salvo!
            </span>
          )}
        </div>
        <p className="text-[10px] text-zinc-300 italic">Visivel apenas para administradores. Nao aparece para o cliente.</p>
      </div>

      {/* ============ ACTIONS ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 space-y-3">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Acoes</p>

        {/* AWAITING PAYMENT */}
        {order.status === 'awaiting_payment' && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl text-xs text-amber-700 flex items-start gap-2">
              <Clock size={14} className="shrink-0 mt-0.5" />
              <span>Aguardando comprovante PIX do cliente.</span>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setConfirmAction({
                  title: `Marcar pedido #${order.id} como pago?`,
                  description: 'O status do pedido sera alterado para "Pago". Esta acao confirma o recebimento do pagamento.',
                  warning: 'Verifique se o comprovante PIX foi recebido antes de confirmar.',
                  buttonLabel: 'Sim, confirmar pagamento',
                  buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
                  onConfirm: () => { setConfirmAction(null); updateStatus('paid', undefined, true); },
                })}
                disabled={updating}
                className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors w-full"
              >
                {updating ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {updating ? 'Processando...' : 'Marcar como Pago'}
              </button>
              <button
                onClick={() => setConfirmAction({
                  title: `Cancelar pedido #${order.id}?`,
                  description: 'O pedido sera marcado como cancelado. O cliente nao sera mais atendido por este pedido.',
                  warning: 'Se o cliente ja pagou, voce precisara resolver o estorno manualmente.',
                  buttonLabel: 'Sim, cancelar pedido',
                  buttonClass: 'bg-red-600 hover:bg-red-700',
                  onConfirm: () => { setConfirmAction(null); updateStatus('cancelled'); },
                })}
                disabled={updating}
                className="text-red-400 hover:text-red-600 text-xs py-2 transition-colors"
              >
                Cancelar pedido
              </button>
            </div>
          </div>
        )}

        {/* PAID */}
        {order.status === 'paid' && (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-xs text-emerald-700 space-y-1">
              <p className="font-bold flex items-center gap-2"><CheckCircle2 size={14} /> Pagamento confirmado</p>
              {order.superfrete_id ? (
                <p>Etiqueta criada. Use o botao abaixo para finalizar e imprimir.</p>
              ) : (
                <p>Pronto para gerar etiqueta e preparar para envio.</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {/* Main action: Finalize and generate label */}
              <button
                onClick={() => setShowFinalizeConfirm(true)}
                disabled={finalizing || updating}
                className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all w-full shadow-sm"
              >
                {finalizing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                {finalizing ? 'Finalizando...' : 'Finalizar Pedido e Gerar Etiqueta'}
              </button>
              <p className="text-[10px] text-zinc-400 text-center -mt-1">Gera etiqueta + paga com saldo + marca como preparando + envia email</p>

              {/* Secondary actions */}
              {!order.superfrete_id && (
                <button
                  onClick={generateLabel}
                  disabled={updating}
                  className="text-orange-500 hover:text-orange-600 border border-orange-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-orange-50 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors w-full"
                >
                  {updating ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
                  Apenas Gerar Etiqueta (sem pagar)
                </button>
              )}
              <button
                onClick={() => setConfirmAction({
                  title: `Marcar pedido #${order.id} em preparacao?`,
                  description: 'O status sera alterado para "Preparando". Use esta opcao se voce ja vai preparar o envio.',
                  buttonLabel: 'Sim, marcar em preparacao',
                  buttonClass: 'bg-purple-600 hover:bg-purple-700',
                  onConfirm: () => { setConfirmAction(null); updateStatus('preparing'); },
                })}
                disabled={updating}
                className="text-purple-600 hover:text-purple-700 border border-purple-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-purple-50 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors w-full"
              >
                {updating ? <Loader2 size={14} className="animate-spin" /> : <BoxIcon size={14} />}
                Apenas Marcar Em Preparacao
              </button>
            </div>
          </div>
        )}

        {/* PREPARING */}
        {order.status === 'preparing' && (
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-100 p-3 rounded-xl text-xs text-purple-700 flex items-center gap-2">
              <BoxIcon size={14} /> Preparando pedido para envio.
            </div>
            {!order.superfrete_id && (
              <button
                onClick={() => setShowFinalizeConfirm(true)}
                disabled={finalizing || updating}
                className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all w-full shadow-sm"
              >
                {finalizing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                {finalizing ? 'Finalizando...' : 'Gerar e Pagar Etiqueta'}
              </button>
            )}
            {order.superfrete_id && order.superfrete_status === 'pending' && (
              <button
                onClick={() => setShowFinalizeConfirm(true)}
                disabled={finalizing || updating}
                className="bg-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors w-full"
              >
                {finalizing ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                {finalizing ? 'Pagando...' : 'Pagar Etiqueta com Saldo'}
              </button>
            )}
            {order.superfrete_id && (
              <div className="flex gap-2">
                <button
                  onClick={printLabel}
                  className="text-orange-500 hover:text-orange-600 border border-orange-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-orange-50 flex items-center justify-center gap-2 transition-colors flex-1"
                >
                  <Printer size={14} />
                  Imprimir Etiqueta
                </button>
                <button
                  onClick={generateDeclaration}
                  disabled={generatingDecl}
                  className="text-zinc-600 hover:text-zinc-700 border border-zinc-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-50 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <FileDown size={14} />
                  {generatingDecl ? 'Gerando...' : 'Declaracao'}
                </button>
              </div>
            )}
            <div className="space-y-2">
              <input
                type="text"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Cole o codigo de rastreio aqui"
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
              />
              <button
                onClick={() => updateStatus('shipped', trackingInput)}
                disabled={updating || !trackingInput.trim()}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors w-full"
              >
                {updating ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
                Marcar Enviado
              </button>
            </div>
          </div>
        )}

        {/* SHIPPED */}
        {order.status === 'shipped' && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl text-sm text-blue-600 flex items-center gap-2">
              <Truck size={14} />
              <span>Rastreio: <a href={`https://www.linkcorreios.com.br/?id=${order.tracking_code}`} target="_blank" rel="noopener noreferrer" className="font-mono font-bold underline">{order.tracking_code}</a></span>
            </div>
            <button
              onClick={() => setConfirmAction({
                title: `Marcar pedido #${order.id} como entregue?`,
                description: 'O pedido sera marcado como "Entregue" indicando que o cliente recebeu a encomenda.',
                buttonLabel: 'Sim, marcar entregue',
                buttonClass: 'bg-green-600 hover:bg-green-700',
                onConfirm: () => { setConfirmAction(null); updateStatus('delivered'); },
              })}
              disabled={updating}
              className="bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors w-full"
            >
              {updating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Marcar Entregue
            </button>
          </div>
        )}

        {/* DELIVERED */}
        {order.status === 'delivered' && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle2 size={16} /> Entregue com sucesso
            {order.tracking_code && <span className="text-zinc-400">· Rastreio: {order.tracking_code}</span>}
          </div>
        )}

        {/* CANCELLED */}
        {order.status === 'cancelled' && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <XCircle size={16} /> Pedido cancelado
          </div>
        )}
      </div>
      {/* ============ GENERIC CONFIRMATION MODAL ============ */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmAction(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto bg-amber-50 rounded-full flex items-center justify-center">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <h3 className="font-bold text-zinc-900 text-lg">{confirmAction.title}</h3>
              <p className="text-sm text-zinc-500">{confirmAction.description}</p>
              {confirmAction.warning && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-left text-xs text-amber-700">
                  <p className="font-bold flex items-center gap-1"><AlertTriangle size={12} /> Atencao:</p>
                  <p className="mt-0.5">{confirmAction.warning}</p>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={confirmAction.onConfirm}
                className={`w-full text-white py-2.5 rounded-xl text-sm font-bold transition-colors ${confirmAction.buttonClass}`}
              >
                {confirmAction.buttonLabel}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="w-full text-zinc-500 py-2.5 rounded-xl text-sm font-medium hover:bg-zinc-50 border border-zinc-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
