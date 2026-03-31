import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, User, MapPin, Package, Truck, CreditCard, Tag, ExternalLink,
  MessageCircle, Copy, Clock, BoxIcon, CheckCircle2, XCircle, Loader2,
  Archive, ArchiveRestore, AlertTriangle, Mail, Printer, RefreshCw, Wallet, Zap,
  StickyNote, Save, FileDown, Edit3, Search, ArrowRightLeft, ArrowRight, Info, ShieldAlert, History
} from 'lucide-react';
import { adminFetch, getStatusConfig, formatCurrency, isOrderArchived, archiveOrderBackend, unarchiveOrderBackend, saveOrderObservation, validateCPF, formatCPF, updateOrderCustomerData, canSwapItems, hasLabelGenerated, hasActiveLabelOrTracking, getSwapBlockedReason, searchProducts, mapAdminProduct, swapOrderItem, resolveSwapAdjustment, getShippingByYards, extractYards } from './adminApi';
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

  // Product swap state
  const [swapItemIndex, setSwapItemIndex] = useState<number | null>(null);
  const [swapSearch, setSwapSearch] = useState('');
  const [swapSearchResults, setSwapSearchResults] = useState<any[]>([]);
  const [swapSearching, setSwapSearching] = useState(false);
  const [swapSelectedProduct, setSwapSelectedProduct] = useState<any>(null);
  const [swapConfirming, setSwapConfirming] = useState(false);
  const [swapExecuting, setSwapExecuting] = useState(false);
  const [swapResult, setSwapResult] = useState<{ success: boolean; message: string } | null>(null);
  const swapSearchTimeout = React.useRef<any>(null);

  // Customer data editing state
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSaved, setCustomerSaved] = useState(false);
  const [customerSaveError, setCustomerSaveError] = useState('');
  const [editForm, setEditForm] = useState({
    name: '', cpf: '',
    street: '', number: '', complement: '', neighborhood: '', city: '', state: '', cep: '',
  });
  const [cpfError, setCpfError] = useState('');

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
        // Preserve local customer_cpf if server returned null but we have a local value
        // This handles the race condition where Medusa hasn't flushed the metadata write yet
        setOrder((prevOrder: any) => {
          const serverCpf = found.customer_cpf;
          const localCpf = prevOrder?.customer_cpf;
          
          // If server has no CPF but local state has one (just saved), keep local
          // This prevents the "CPF disappears after save" bug
          if (!serverCpf && localCpf && prevOrder?.id === found.id) {
            console.log(`[loadOrder] Preserving local CPF "${localCpf}" (server returned null — likely stale)`);
            return { ...found, customer_cpf: localCpf };
          }
          return found;
        });
        setTrackingInput(found.tracking_code || '');
        setObservation(found.admin_observation || '');
        // Populate edit form with current customer data
        const addr = found.address_components || {};
        setEditForm((prevForm) => {
          // Use server CPF if available, otherwise preserve what's in the form
          const serverCpf = found.customer_cpf;
          const formCpf = prevForm.cpf;
          return {
            name: found.customer_name || '',
            cpf: serverCpf || formCpf || '',
            street: addr.street || '',
            number: addr.number || '',
            complement: addr.complement || '',
            neighborhood: addr.neighborhood || '',
            city: addr.city || '',
            state: addr.state || '',
            cep: addr.cep || '',
          };
        });
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

      // Optimistic local update for instant UI feedback
      setOrder((prev: any) => prev ? { ...prev, status, ...(tracking_code ? { tracking_code } : {}) } : prev);

      if (result.superfrete) {
        if (result.superfrete.success) {
          setSuperfreteMsg({ success: true, message: `Etiqueta criada no SuperFrete (ID: ${result.superfrete.data?.id || ''}).` });
        } else if (result.superfrete.error) {
          setSuperfreteMsg({ success: false, message: `Erro SuperFrete: ${result.superfrete.error}` });
        }
      }
      // Delayed reload to get full server state without overwriting optimistic update
      setTimeout(() => { loadOrder().catch(() => {}); }, 1500);
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
        // Optimistic update for label data
        setOrder((prev: any) => prev ? {
          ...prev,
          superfrete_id: result.order?.superfrete_id || prev.superfrete_id,
          superfrete_status: 'pending',
        } : prev);
        setSuperfreteMsg({ success: true, message: `Etiqueta criada (ID: ${result.order?.superfrete_id || ''}).` });
      } else {
        setSuperfreteMsg({ success: false, message: `Erro: ${result.superfrete?.error || result.error || 'desconhecido'}` });
      }
      setTimeout(() => { loadOrder().catch(() => {}); }, 1500);
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
        // Optimistic update
        setOrder((prev: any) => prev ? {
          ...prev,
          status: 'preparing',
          superfrete_id: result.order?.superfrete_id || prev.superfrete_id,
          superfrete_status: result.order?.superfrete_status || 'released',
          tracking_code: result.order?.tracking_code || prev.tracking_code,
          superfrete_tracking: result.order?.superfrete_tracking || prev.superfrete_tracking,
        } : prev);
        const trackInfo = result.order?.tracking_code ? ` · Rastreio: ${result.order.tracking_code}` : '';
        setSuperfreteMsg({ success: true, message: `Pedido finalizado com sucesso! Etiqueta gerada e paga.${trackInfo}` });
      } else {
        setSuperfreteMsg({ success: false, message: `Erro: ${result.error || 'desconhecido'} (etapa: ${result.step || 'N/A'})` });
      }
      setTimeout(() => { loadOrder().catch(() => {}); }, 1500);
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
        // Optimistic update
        if (result.order) {
          setOrder((prev: any) => prev ? {
            ...prev,
            status: result.order.status || prev.status,
            superfrete_status: result.order.superfrete_status || prev.superfrete_status,
            tracking_code: result.order.tracking_code || prev.tracking_code,
          } : prev);
        }
      } else {
        setSuperfreteMsg({ success: false, message: result.error || 'Erro ao sincronizar' });
      }
      setTimeout(() => { loadOrder().catch(() => {}); }, 1500);
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
      // Expand items: repeat each product line instead of using "3x" notation
      const expandedItems: { title: string; price: number }[] = [];
      items.forEach((item: any) => {
        const qty = item.quantity || 1;
        for (let q = 0; q < qty; q++) {
          expandedItems.push({ title: item.title || 'Produto', price: Number(item.price || 0) });
        }
      });
      const tableData = expandedItems.map((item, i) => [
        String(i + 1),
        item.title,
        '1',
        `R$ ${formatCurrency(item.price)}`,
      ]);
      const totalValue = expandedItems.reduce((sum, item) => sum + item.price, 0);

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
      setOrder((prev: any) => prev ? { ...prev, archived: true } : prev);
      setShowArchiveConfirm(false);
      setTimeout(() => { loadOrder().catch(() => {}); }, 1500);
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
      setOrder((prev: any) => prev ? { ...prev, archived: false } : prev);
      setTimeout(() => { loadOrder().catch(() => {}); }, 1500);
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
      // Update local state immediately so admin_observation reflects new value
      setOrder((prev: any) => prev ? { ...prev, admin_observation: observation } : prev);
      setObsSaved(true);
      setTimeout(() => setObsSaved(false), 3000);
    } else {
      alert('Erro ao salvar observacao. Tente novamente.');
    }
    setSavingObs(false);
  };

  const handleSaveCustomerData = async () => {
    if (!order) return;
    
    // Validate CPF if provided
    const cleanCpf = editForm.cpf.replace(/\D/g, '');
    if (cleanCpf && !validateCPF(cleanCpf)) {
      setCpfError('CPF invalido. Verifique os digitos.');
      return;
    }
    setCpfError('');
    
    setSavingCustomer(true);
    setCustomerSaved(false);
    setCustomerSaveError('');
    
    const result = await updateOrderCustomerData(order.id, order.medusa_order_id, {
      customer_name: editForm.name,
      customer_cpf: cleanCpf,
      address_components: {
        street: editForm.street,
        number: editForm.number,
        complement: editForm.complement,
        neighborhood: editForm.neighborhood,
        city: editForm.city,
        state: editForm.state,
        cep: editForm.cep.replace(/\D/g, ''),
      },
    });
    
    if (result.success) {
      // Use server response data as source of truth for CPF
      // This prevents the stale-data bug where loadOrder() returns old metadata
      const serverCpf = result.order?.customer_cpf || null;
      const serverName = result.order?.customer_name || editForm.name || order.customer_name;
      const serverAddress = result.order?.customer_address || '';
      const serverAddrComponents = result.order?.address_components || null;

      const newCep = editForm.cep.replace(/\D/g, '');
      
      // Build address components from editForm (local truth until server confirms)
      const updatedAddrComponents = serverAddrComponents || {
        ...(order.address_components || {}),
        street: editForm.street,
        number: editForm.number,
        complement: editForm.complement,
        neighborhood: editForm.neighborhood,
        city: editForm.city,
        state: editForm.state,
        cep: newCep,
      };
      
      // Rebuild full address string
      const addr = updatedAddrComponents;
      const addrNum = addr.number || 'S/N';
      const compStr = addr.complement ? ` - ${addr.complement}` : '';
      const rebuiltAddress = serverAddress || `${addr.street || ''}, ${addrNum}${compStr}, ${addr.neighborhood || ''}, ${addr.city || ''} - ${addr.state || ''}, CEP: ${addr.cep || ''}`;
      
      // CRITICAL: Update local order state using SERVER response data
      // This is the definitive update — no more "CPF disappearing" after save
      setOrder((prev: any) => prev ? {
        ...prev,
        customer_name: serverName,
        customer_cpf: serverCpf,
        customer_address: rebuiltAddress,
        address_components: updatedAddrComponents,
      } : prev);
      
      // Also update the editForm to match what server confirmed
      setEditForm(prev => ({
        ...prev,
        name: serverName,
        cpf: serverCpf || '',
        cep: newCep,
      }));
      
      setCustomerSaved(true);
      setEditingCustomer(false);
      setTimeout(() => setCustomerSaved(false), 4000);
      
      // Delayed reload: use a longer delay to ensure Medusa has flushed the write
      // This is a safety net — the optimistic update above already shows correct data
      setTimeout(() => { loadOrder().catch(() => {}); }, 3000);
    } else {
      setCustomerSaveError(result.error || 'Erro ao salvar');
    }
    setSavingCustomer(false);
  };

  // === PRODUCT SWAP FUNCTIONS ===
  const openSwapModal = (itemIndex: number) => {
    setSwapItemIndex(itemIndex);
    setSwapSearch('');
    setSwapSearchResults([]);
    setSwapSelectedProduct(null);
    setSwapConfirming(false);
    setSwapResult(null);
  };

  const closeSwapModal = () => {
    setSwapItemIndex(null);
    setSwapSearch('');
    setSwapSearchResults([]);
    setSwapSelectedProduct(null);
    setSwapConfirming(false);
    setSwapResult(null);
  };

  const handleSwapSearch = (query: string) => {
    setSwapSearch(query);
    setSwapSelectedProduct(null);
    setSwapConfirming(false);
    
    if (swapSearchTimeout.current) clearTimeout(swapSearchTimeout.current);
    
    if (query.trim().length < 2) {
      setSwapSearchResults([]);
      setSwapSearching(false);
      return;
    }

    setSwapSearching(true);
    swapSearchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchProducts(query.trim());
        const mapped = results.map(mapAdminProduct).filter(p => p.variant_id && p.status === 'published');
        setSwapSearchResults(mapped);
      } catch (err) {
        console.error('Swap search error:', err);
        setSwapSearchResults([]);
      } finally {
        setSwapSearching(false);
      }
    }, 500);
  };

  const selectSwapProduct = (product: any) => {
    setSwapSelectedProduct(product);
    setSwapConfirming(true);
  };

  // Format price (in REAIS) helper
  const fmtPrice = (reais: number) => formatCurrency(reais);

  const executeSwap = async () => {
    if (!order || swapItemIndex === null || !swapSelectedProduct) return;
    
    const oldItem = order.items[swapItemIndex];
    if (!oldItem) return;

    setSwapExecuting(true);
    setSwapResult(null);

    const result = await swapOrderItem({
      orderId: order.id,
      medusa_order_id: order.medusa_order_id,
      old_item_index: swapItemIndex,
      new_product_id: swapSelectedProduct.id,
      new_variant_id: swapSelectedProduct.variant_id,
      new_product_title: swapSelectedProduct.title,
      new_product_price: swapSelectedProduct.price, // already in reais
      new_product_image: swapSelectedProduct.image_url,
      new_product_shipping: swapSelectedProduct.shipping,
      quantity: oldItem.quantity || 1,
    });

    if (result.success) {
      // Build detailed success message with difference info
      const swap = result.swap;
      let diffMsg = 'Produto trocado com sucesso!';
      if (swap) {
        const totalDiff = (swap.after?.total || 0) - (swap.before?.total || 0);
        if (totalDiff > 0) {
          diffMsg += ` Diferenca a cobrar: +R$ ${formatCurrency(totalDiff)}`;
        } else if (totalDiff < 0) {
          diffMsg += ` Diferenca a devolver: -R$ ${formatCurrency(Math.abs(totalDiff))}`;
        } else {
          diffMsg += ' Sem diferenca no valor total.';
        }
      }
      setSwapResult({ success: true, message: diffMsg });
      // Reload order after delay
      setTimeout(() => {
        loadOrder().catch(() => {});
        closeSwapModal();
      }, 2500);
    } else {
      setSwapResult({ success: false, message: result.error || 'Erro ao trocar produto' });
    }
    setSwapExecuting(false);
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

      {/* ============ CUSTOMER + ADDRESS (Editable) ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <User size={11} /> Cliente
          </p>
          <button
            onClick={() => setEditingCustomer(!editingCustomer)}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
              editingCustomer
                ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            <Edit3 size={11} />
            {editingCustomer ? 'Editando' : 'Editar'}
          </button>
        </div>

        {customerSaved && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
            <CheckCircle2 size={12} /> Dados do cliente atualizados com sucesso!
          </div>
        )}
        {customerSaveError && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            <AlertTriangle size={12} /> {customerSaveError}
          </div>
        )}
        
        {!editingCustomer ? (
          /* ---- VIEW MODE ---- */
          <div className="space-y-2">
            <p className="font-semibold text-sm text-zinc-900">{order.customer_name}</p>
            {order.customer_cpf && (
              <p className="text-xs text-zinc-500">CPF: {formatCPF(order.customer_cpf)}</p>
            )}
            {!order.customer_cpf && (
              <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <AlertTriangle size={10} /> CPF nao informado - edite para adicionar
              </p>
            )}
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
            {order.customer_address && (
              <div className="pt-2 mt-2 border-t border-zinc-100">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                  <MapPin size={10} /> Endereco
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
          </div>
        ) : (
          /* ---- EDIT MODE ---- */
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Nome Completo</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                placeholder="Nome do cliente"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">CPF</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={14}
                value={editForm.cpf ? formatCPF(editForm.cpf) : ''}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '').slice(0, 11);
                  setEditForm({ ...editForm, cpf: cleaned });
                  if (cpfError) setCpfError('');
                }}
                onBlur={() => {
                  const clean = editForm.cpf.replace(/\D/g, '');
                  if (clean.length === 11 && !validateCPF(clean)) {
                    setCpfError('CPF invalido. Verifique os digitos.');
                  } else {
                    setCpfError('');
                  }
                }}
                className={`w-full px-3 py-2 rounded-lg border ${cpfError ? 'border-red-400' : 'border-zinc-200'} text-sm focus:ring-2 focus:ring-amber-400 outline-none`}
                placeholder="000.000.000-00"
              />
              {cpfError && <p className="text-xs text-red-500 mt-0.5">{cpfError}</p>}
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-9">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Rua</label>
                <input type="text" value={editForm.street} onChange={(e) => setEditForm({ ...editForm, street: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none" />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Numero</label>
                <input type="text" value={editForm.number} onChange={(e) => setEditForm({ ...editForm, number: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Complemento</label>
                <input type="text" value={editForm.complement} onChange={(e) => setEditForm({ ...editForm, complement: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none" placeholder="Opcional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Bairro</label>
                <input type="text" value={editForm.neighborhood} onChange={(e) => setEditForm({ ...editForm, neighborhood: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Cidade</label>
                <input type="text" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-zinc-600 mb-1">UF</label>
                <input type="text" maxLength={2} value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value.toUpperCase() })} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none uppercase" />
              </div>
              <div className="col-span-4">
                <label className="block text-xs font-medium text-zinc-600 mb-1">CEP</label>
                <input type="text" maxLength={9} value={editForm.cep} onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, '').slice(0, 8);
                  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
                  setEditForm({ ...editForm, cep: v });
                }} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-400 outline-none" placeholder="00000-000" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSaveCustomerData}
                disabled={savingCustomer}
                className="bg-amber-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
              >
                {savingCustomer ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {savingCustomer ? 'Salvando...' : 'Salvar Dados'}
              </button>
              <button
                onClick={() => { setEditingCustomer(false); setCpfError(''); setCustomerSaveError(''); }}
                className="text-zinc-400 hover:text-zinc-600 px-3 py-2 rounded-lg text-xs transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============ ITEMS ============ */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <Package size={11} /> Itens do Pedido
          </p>
          {canSwapItems(order) && (
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full">
              <ArrowRightLeft size={10} /> Troca disponivel
            </span>
          )}
          {!canSwapItems(order) && hasLabelGenerated(order) && ['awaiting_payment', 'paid'].includes(order.status) && (
            <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full">
              <ShieldAlert size={9} /> Etiqueta gerada
            </span>
          )}
        </div>

        {/* Swap result message */}
        {swapResult && swapItemIndex === null && (
          <div className={`p-3 rounded-xl border flex items-start gap-2 text-sm ${
            swapResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {swapResult.success ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
            <p className="flex-1 text-xs">{swapResult.message}</p>
            <button onClick={() => setSwapResult(null)} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
          </div>
        )}

        <div className="space-y-2">
          {order.items?.map((item: any, idx: number) => {
            // Find color preference for this item
            const colorPrefs = order.items_color_preferences || [];
            const itemColorPref = colorPrefs.find((cp: any) =>
              cp.product_id === item.product_id || cp.variant_id === item.variant_id
            );
            const swapAllowed = canSwapItems(order);
            // Prices in order items are in centavos
            const itemPrice = Number(item.price || item.unit_price || 0);

            return (
              <div key={idx} className="bg-zinc-50 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center gap-3 text-sm">
                  {item.image_url && (
                    <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-zinc-200 shrink-0" />
                  )}
                  <span className="flex-1 line-clamp-2 text-zinc-700 text-xs sm:text-sm">{item.title}</span>
                  <span className="text-zinc-400 text-xs shrink-0">{item.quantity}x</span>
                  <span className="font-semibold text-zinc-900 text-xs sm:text-sm whitespace-nowrap shrink-0">
                    R$ {formatCurrency(itemPrice * item.quantity)}
                  </span>
                </div>
                {/* Swap button */}
                {swapAllowed && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => openSwapModal(idx)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors font-semibold border border-blue-200 hover:border-blue-300"
                    >
                      <ArrowRightLeft size={10} /> Trocar produto
                    </button>
                  </div>
                )}
                {/* Blocked swap indicator */}
                {!swapAllowed && ['awaiting_payment', 'paid'].includes(order.status) && hasLabelGenerated(order) && (
                  <div className="flex justify-end">
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded">
                      <ShieldAlert size={9} /> {getSwapBlockedReason(order)}
                    </span>
                  </div>
                )}
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
                            { label: '1a', color: itemColorPref.color_1 },
                            { label: '2a', color: itemColorPref.color_2 },
                            { label: '3a', color: itemColorPref.color_3 },
                          ].filter(c => c.color).map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-white border border-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded font-medium">
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{
                                backgroundColor: c.color === 'Preta' ? '#1a1a1a' : c.color === 'Branca' ? '#f5f5f5' : c.color === 'Verde' ? '#22c55e' : c.color === 'Laranja' ? '#f97316' : c.color === 'Amarela' ? '#eab308' : c.color === 'Rosa' ? '#ec4899' : c.color === 'Roxa' || c.color === 'Lilas' ? '#a855f7' : c.color === 'Azul' ? '#3b82f6' : c.color === 'Vermelha' ? '#ef4444' : c.color === 'Cinza' ? '#9ca3af' : c.color === 'Marrom' ? '#92400e' : c.color === 'Multicor' ? '#eab308' : '#9ca3af',
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
            R$ {formatCurrency(order.items?.reduce((s: number, i: any) => s + Number(i.price || i.unit_price || 0) * i.quantity, 0) || 0)}
          </span>
        </div>

        {/* ===== SWAP ADJUSTMENT (Pending or Resolved) ===== */}
        {order.swap_adjustment && order.swap_adjustment.status === 'pending' && order.swap_adjustment.original_state && order.swap_adjustment.current_state && (
          <div className="pt-2 border-t border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                <AlertTriangle size={10} /> Ajuste de Troca Pendente
              </p>
              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                {order.swap_adjustment.swap_count} troca{order.swap_adjustment.swap_count > 1 ? 's' : ''}
              </span>
            </div>
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 space-y-2.5">
              {/* Original vs Current items */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Original</p>
                  {order.swap_adjustment.original_state.items?.map((it: any, i: number) => (
                    <p key={i} className="text-[10px] text-zinc-500 truncate">{it.title} ({it.quantity}x R$ {formatCurrency(it.unit_price || 0)})</p>
                  ))}
                </div>
                <div>
                  <p className="text-[9px] font-bold text-emerald-500 uppercase mb-1">Atual</p>
                  {order.swap_adjustment.current_state.items?.map((it: any, i: number) => (
                    <p key={i} className="text-[10px] text-zinc-700 font-medium truncate">{it.title} ({it.quantity}x R$ {formatCurrency(it.unit_price || 0)})</p>
                  ))}
                </div>
              </div>
              {/* Financial summary: original vs current */}
              <div className="border-t border-amber-200 pt-2 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Subtotal</span>
                  <span>
                    <span className="text-zinc-400 line-through mr-2">R$ {formatCurrency(order.swap_adjustment.original_state.subtotal || 0)}</span>
                    <span className="text-zinc-700 font-semibold">R$ {formatCurrency(order.swap_adjustment.current_state.subtotal || 0)}</span>
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Frete</span>
                  <span>
                    <span className="text-zinc-400 line-through mr-2">R$ {formatCurrency(order.swap_adjustment.original_state.shipping_fee || 0)}</span>
                    <span className="text-zinc-700 font-semibold">R$ {formatCurrency(order.swap_adjustment.current_state.shipping_fee || 0)}</span>
                  </span>
                </div>
                <div className="flex justify-between text-[10px] pt-1 border-t border-amber-100">
                  <span className="text-zinc-700 font-bold">Total</span>
                  <span>
                    <span className="text-zinc-400 line-through mr-2">R$ {formatCurrency(order.swap_adjustment.original_state.total || 0)}</span>
                    <span className="text-zinc-900 font-bold">R$ {formatCurrency(order.swap_adjustment.current_state.total || 0)}</span>
                  </span>
                </div>
                {/* Difference */}
                {(() => {
                  const diff = (order.swap_adjustment.current_state.total || 0) - (order.swap_adjustment.original_state.total || 0);
                  if (Math.abs(diff) < 0.01) return <p className="text-[10px] text-blue-600 font-semibold text-center pt-1">Sem diferenca de valor</p>;
                  return (
                    <p className={`text-[10px] font-bold text-center pt-1 ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {diff > 0 ? `Cobrar do cliente: +R$ ${formatCurrency(diff)}` : `Devolver ao cliente: R$ ${formatCurrency(Math.abs(diff))}`}
                    </p>
                  );
                })()}
              </div>
              {/* Resolve button */}
              <button
                onClick={async () => {
                  if (!confirm('Marcar este ajuste como resolvido? Isso consolida o historico.')) return;
                  const result = await resolveSwapAdjustment(order.id, order.medusa_order_id);
                  if (result.success) loadOrder();
                }}
                className="w-full text-[10px] bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={10} /> Marcar Ajuste como Resolvido
              </button>
              <p className="text-[9px] text-zinc-400 text-center">Enquanto pendente, voce pode continuar trocando produtos.</p>
            </div>
          </div>
        )}

        {/* ===== CONSOLIDATED SWAP HISTORY (resolved cycles only) ===== */}
        {order.swap_history && order.swap_history.length > 0 && (
          <div className="pt-2 border-t border-zinc-100 space-y-2">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <History size={10} /> Historico de Trocas ({order.swap_history.length})
            </p>
            {order.swap_history.map((entry: any, sIdx: number) => (
              <div key={sIdx} className="bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span>Ciclo #{sIdx + 1} &middot; {entry.swap_count} troca{entry.swap_count > 1 ? 's' : ''}</span>
                  <span>{new Date(entry.resolved_at).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Total original &rarr; final</span>
                  <span>R$ {formatCurrency(entry.original_state?.total || 0)} &rarr; R$ {formatCurrency(entry.final_state?.total || 0)}</span>
                </div>
                {(() => {
                  const diff = (entry.final_state?.total || 0) - (entry.original_state?.total || 0);
                  if (Math.abs(diff) < 0.01) return null;
                  return (
                    <p className={`text-[10px] font-bold ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {diff > 0 ? `Cobrado: +R$ ${formatCurrency(diff)}` : `Devolvido: R$ ${formatCurrency(Math.abs(diff))}`}
                    </p>
                  );
                })()}
              </div>
            ))}
          </div>
        )}

        {/* ===== LEGACY SWAP HISTORY (old swapped_items, only show if no new adjustment exists) ===== */}
        {!order.swap_adjustment && order.swapped_items && order.swapped_items.length > 0 && (
          <div className="pt-2 border-t border-zinc-100 space-y-2">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <History size={10} /> Historico de Trocas (legado)
            </p>
            {order.swapped_items.map((swap: any, sIdx: number) => (
              <div key={sIdx} className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-red-500 line-through flex-1 truncate">{swap.old_item?.title}</span>
                  <ArrowRight size={12} className="text-blue-400 shrink-0" />
                  <span className="text-emerald-600 font-medium flex-1 truncate">{swap.new_item?.title}</span>
                </div>
                <p className="text-[10px] text-zinc-400">{new Date(swap.swapped_at).toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ SWAP PRODUCT MODAL (Professional UX) ============ */}
      {swapItemIndex !== null && order.items?.[swapItemIndex] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={closeSwapModal}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-hidden shadow-2xl flex flex-col border border-zinc-200" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-5 border-b border-blue-100 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-zinc-900 flex items-center gap-2 text-base">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <ArrowRightLeft size={16} className="text-blue-600" />
                  </div>
                  Trocar Produto
                </h3>
                <button onClick={closeSwapModal} className="w-8 h-8 rounded-lg bg-white/80 hover:bg-white flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-colors border border-zinc-200 text-lg leading-none">&times;</button>
              </div>
              
              {/* Current item being replaced */}
              <div className="bg-white rounded-xl p-3 border border-red-100 shadow-sm">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <XCircle size={10} /> Produto atual (sera removido)
                </p>
                <div className="flex items-center gap-3">
                  {order.items[swapItemIndex].image_url && (
                    <img src={order.items[swapItemIndex].image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-red-200 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 line-clamp-2">{order.items[swapItemIndex].title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {order.items[swapItemIndex].quantity}x &middot; R$ {fmtPrice(Number(order.items[swapItemIndex].price || order.items[swapItemIndex].unit_price || 0) * order.items[swapItemIndex].quantity)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search or Confirmation */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {!swapConfirming ? (
                <>
                  {/* Search input */}
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={swapSearch}
                      onChange={(e) => handleSwapSearch(e.target.value)}
                      placeholder="Buscar novo produto por nome..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-300 outline-none bg-zinc-50 focus:bg-white transition-colors"
                      autoFocus
                    />
                    {swapSearching && (
                      <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
                    )}
                  </div>

                  {/* Search results */}
                  {swapSearch.length >= 2 && !swapSearching && swapSearchResults.length === 0 && (
                    <div className="text-center py-6 space-y-2">
                      <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
                        <Search size={20} className="text-zinc-300" />
                      </div>
                      <p className="text-sm text-zinc-500 font-medium">Nenhum produto encontrado</p>
                      <p className="text-xs text-zinc-400">Tente buscar com outros termos para &ldquo;{swapSearch}&rdquo;</p>
                    </div>
                  )}

                  {swapSearchResults.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
                        {swapSearchResults.length} produto(s) encontrado(s)
                      </p>
                      <div className="space-y-1">
                        {swapSearchResults.map((product) => {
                          const isCurrentProduct = product.variant_id === order.items[swapItemIndex!].variant_id;
                          const priceDiff = product.price - Number(order.items[swapItemIndex!].price || order.items[swapItemIndex!].unit_price || 0);
                          return (
                            <button
                              key={product.id}
                              onClick={() => !isCurrentProduct && selectSwapProduct(product)}
                              disabled={isCurrentProduct}
                              className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                isCurrentProduct
                                  ? 'bg-zinc-50 border-zinc-200 opacity-50 cursor-not-allowed'
                                  : 'bg-white border-zinc-100 hover:border-blue-300 hover:bg-blue-50/30 hover:shadow-sm active:scale-[0.99]'
                              }`}
                            >
                              {product.image_url ? (
                                <img src={product.image_url} alt="" className="w-11 h-11 rounded-lg object-cover border border-zinc-200 shrink-0" />
                              ) : (
                                <div className="w-11 h-11 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                                  <Package size={16} className="text-zinc-300" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-900 line-clamp-1">{product.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs font-semibold text-zinc-700">R$ {fmtPrice(product.price)}</span>
                                  {!isCurrentProduct && priceDiff !== 0 && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      priceDiff > 0 ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'
                                    }`}>
                                      {priceDiff > 0 ? '+' : '-'}R$ {fmtPrice(Math.abs(priceDiff))}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isCurrentProduct ? (
                                <span className="text-[10px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded shrink-0 font-medium">Atual</span>
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                  <ArrowRight size={14} className="text-blue-500" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {swapSearch.length < 2 && (
                    <div className="text-center py-8 space-y-2">
                      <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
                        <Search size={24} className="text-blue-300" />
                      </div>
                      <p className="text-sm text-zinc-500 font-medium">Busque o novo produto</p>
                      <p className="text-xs text-zinc-400">Digite ao menos 2 caracteres para buscar</p>
                    </div>
                  )}
                </>
              ) : swapSelectedProduct && (
                /* ============ CONFIRMATION VIEW ============ */
                <div className="space-y-4">
                  {/* Swap result message inside modal */}
                  {swapResult && (
                    <div className={`p-3 rounded-xl border flex items-start gap-2 ${
                      swapResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                      {swapResult.success ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                      <p className="flex-1 text-xs font-medium">{swapResult.message}</p>
                    </div>
                  )}

                  {/* New product card */}
                  <div className="bg-white rounded-xl p-3 border border-emerald-200 shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <CheckCircle2 size={10} /> Novo produto (sera adicionado)
                    </p>
                    <div className="flex items-center gap-3">
                      {swapSelectedProduct.image_url ? (
                        <img src={swapSelectedProduct.image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-emerald-200 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                          <Package size={16} className="text-emerald-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 line-clamp-2">{swapSelectedProduct.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {order.items[swapItemIndex].quantity}x &middot; R$ {fmtPrice(swapSelectedProduct.price * order.items[swapItemIndex].quantity)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ===== DETAILED PRICE COMPARISON ===== */}
                  {(() => {
                    const oldItem = order.items[swapItemIndex];
                    const qty = oldItem.quantity || 1;
                    const oldUnitPrice = Number(oldItem.price || oldItem.unit_price || 0);
                    const newUnitPrice = swapSelectedProduct.price;
                    const oldItemTotal = oldUnitPrice * qty;
                    const newItemTotal = newUnitPrice * qty;
                    const priceDiff = newItemTotal - oldItemTotal;
                    
                    // Current order totals
                    const currentSubtotal = order.items?.reduce((s: number, i: any) => s + Number(i.price || i.unit_price || 0) * i.quantity, 0) || 0;
                    const currentShipping = Number(order.shipping_fee || 0);
                    const currentTotal = Number(order.total_amount || 0);
                    const isPaid = order.status === 'paid';
                    
                    // New subtotal (replace old item price with new)
                    const newSubtotal = currentSubtotal - oldItemTotal + newItemTotal;
                    // Note: shipping will be recalculated on backend, so we show estimate
                    
                    return (
                      <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">
                        <div className="p-3 border-b border-zinc-200 bg-zinc-100/50">
                          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-1.5">
                            <Info size={10} /> Resumo Financeiro da Troca
                          </p>
                        </div>
                        <div className="p-3 space-y-2.5">
                          {/* Item price comparison */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500">Produto anterior ({qty}x)</span>
                              <span className="text-zinc-600 font-medium">R$ {fmtPrice(oldItemTotal)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500">Produto novo ({qty}x)</span>
                              <span className="text-zinc-600 font-medium">R$ {fmtPrice(newItemTotal)}</span>
                            </div>
                            <div className="flex justify-between text-xs pt-1.5 border-t border-zinc-200">
                              <span className="text-zinc-700 font-semibold">Diferenca no produto</span>
                              <span className={`font-bold ${priceDiff > 0 ? 'text-red-600' : priceDiff < 0 ? 'text-emerald-600' : 'text-zinc-600'}`}>
                                {priceDiff > 0 ? '+' : ''}{priceDiff !== 0 ? `R$ ${fmtPrice(Math.abs(priceDiff))}` : 'Sem diferenca'}
                              </span>
                            </div>
                          </div>

                          {/* Subtotal comparison */}
                          <div className="space-y-1 pt-2 border-t border-zinc-200">
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500">Subtotal atual (itens)</span>
                              <span className="text-zinc-600">R$ {fmtPrice(currentSubtotal)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500">Subtotal novo (itens)</span>
                              <span className="text-zinc-700 font-semibold">R$ {fmtPrice(newSubtotal)}</span>
                            </div>
                          </div>

                          {/* Shipping note */}
                          <div className="bg-amber-50/80 border border-amber-100 rounded-lg p-2.5 mt-1">
                            <div className="flex items-start gap-2">
                              <Truck size={12} className="text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] text-amber-700 font-semibold">Frete sera recalculado</p>
                                <p className="text-[10px] text-amber-600 mt-0.5">
                                  Frete atual: R$ {formatCurrency(currentShipping)} &middot; O novo frete sera calculado via SuperFrete com base no peso/dimensao do novo produto.
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Paid order: show financial impact */}
                          {isPaid && (
                            <div className={`rounded-lg p-2.5 border ${
                              priceDiff > 0 ? 'bg-red-50 border-red-200' : priceDiff < 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'
                            }`}>
                              <div className="flex items-start gap-2">
                                <CreditCard size={12} className={`shrink-0 mt-0.5 ${
                                  priceDiff > 0 ? 'text-red-500' : priceDiff < 0 ? 'text-emerald-500' : 'text-blue-500'
                                }`} />
                                <div>
                                  <p className={`text-[10px] font-bold ${
                                    priceDiff > 0 ? 'text-red-700' : priceDiff < 0 ? 'text-emerald-700' : 'text-blue-700'
                                  }`}>
                                    {priceDiff > 0 ? 'Cobrar diferenca do cliente' : priceDiff < 0 ? 'Devolver diferenca ao cliente' : 'Sem diferenca de valor'}
                                  </p>
                                  <p className={`text-[10px] mt-0.5 ${
                                    priceDiff > 0 ? 'text-red-600' : priceDiff < 0 ? 'text-emerald-600' : 'text-blue-600'
                                  }`}>
                                    {priceDiff !== 0 
                                      ? `Diferenca estimada nos produtos: R$ ${fmtPrice(Math.abs(priceDiff))}. O frete pode alterar o valor final.`
                                      : 'O valor dos produtos e o mesmo. Apenas o frete pode mudar.'
                                    }
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Warning */}
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-600">
                    <p className="font-bold flex items-center gap-1 mb-1.5 text-zinc-700"><AlertTriangle size={12} className="text-amber-500" /> O que vai acontecer:</p>
                    <ul className="space-y-0.5 ml-0.5 text-zinc-500">
                      <li className="flex items-start gap-1.5"><span className="text-zinc-300 mt-px">&#8226;</span> O produto anterior sera removido do pedido</li>
                      <li className="flex items-start gap-1.5"><span className="text-zinc-300 mt-px">&#8226;</span> O novo produto sera adicionado no lugar</li>
                      <li className="flex items-start gap-1.5"><span className="text-zinc-300 mt-px">&#8226;</span> O frete sera recalculado via SuperFrete</li>
                      <li className="flex items-start gap-1.5"><span className="text-zinc-300 mt-px">&#8226;</span> O total do pedido sera atualizado</li>
                      <li className="flex items-start gap-1.5"><span className="text-zinc-300 mt-px">&#8226;</span> A troca sera registrada no historico</li>
                    </ul>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      onClick={executeSwap}
                      disabled={swapExecuting || !!swapResult?.success}
                      className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm active:scale-[0.98]"
                    >
                      {swapExecuting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}
                      {swapExecuting ? 'Processando troca...' : 'Confirmar Troca de Produto'}
                    </button>
                    <button
                      onClick={() => { setSwapConfirming(false); setSwapSelectedProduct(null); setSwapResult(null); }}
                      disabled={swapExecuting}
                      className="w-full text-zinc-500 py-2.5 rounded-xl text-sm font-medium hover:bg-zinc-50 border border-zinc-200 disabled:opacity-50 transition-colors"
                    >
                      Voltar para busca
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
