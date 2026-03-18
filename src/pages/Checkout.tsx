import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { api } from '../api';
import { LINE_COLORS } from '../types';
import { CheckCircle2, Copy, MessageCircle, Package, AlertTriangle, Loader2, Mail, MailOpen, ChevronDown, ChevronUp } from 'lucide-react';

export default function Checkout() {
  const { cart, total, clearCart, selectedShipping, setSelectedShipping, setShippingOptions, shippingOptions, cartCep } = useCart();
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'pix'>('form');
  const [loadingCep, setLoadingCep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', whatsapp: '', cep: '',
    street: '', number: '', complement: '', neighborhood: '', city: '', state: '',
  });
  const [semNumero, setSemNumero] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [finalTotal, setFinalTotal] = useState<number>(0);
  // Validation errors
  const [nameError, setNameError] = useState('');
  const [cepError, setCepError] = useState('');
  const [copied, setCopied] = useState(false);
  const [shippingAlert, setShippingAlert] = useState<{ oldPrice: number; newPrice: number; newName: string; oldName: string } | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [alertExpanded, setAlertExpanded] = useState(false);
  const [storeConfig, setStoreConfig] = useState({
    pix_key: '', pix_tipo: '', pix_nome: '', pix_banco: '', whatsapp: '',
  });

  // Scroll to top when component mounts or step changes
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  React.useEffect(() => {
    fetch(`${api.getMedusaUrl()}/store/config`, {
      headers: { "x-publishable-api-key": "pk_b54130691636a84f3172ebbc1d0ac4d9b14bc2430db612d289a055e341b7b706" },
    })
      .then(r => r.json())
      .then(d => setStoreConfig({
        pix_key: d.pix_key || '', pix_tipo: d.pix_tipo || 'CNPJ',
        pix_nome: d.pix_nome || '', pix_banco: d.pix_banco || '',
        whatsapp: d.whatsapp || '',
      }))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if ((cart.length === 0 || !selectedShipping) && step === 'form') {
      navigate('/store/cart');
    }
  }, [cart.length, selectedShipping, step, navigate]);

  if ((cart.length === 0 || !selectedShipping) && step === 'form') return null;

  // ============ NAME VALIDATION ============
  const validateName = (name: string): boolean => {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    const words = trimmed.split(' ').filter(w => w.length > 0);
    if (words.length < 2) {
      setNameError('Coloque seu sobrenome');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleNameBlur = () => {
    if (formData.name.trim().length > 0) {
      validateName(formData.name);
    }
  };

  // ============ CEP VALIDATION ============
  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let cep = e.target.value.replace(/\D/g, '');
    if (cep.length > 8) cep = cep.slice(0, 8);
    const formattedCep = cep.replace(/^(\d{5})(\d)/, '$1-$2');
    setFormData(prev => ({ ...prev, cep: formattedCep }));
    setCepError('');

    if (cep.length === 8) {
      setLoadingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (data.erro) {
          setCepError('Revise o CEP, ele parece inválido');
        } else {
          setCepError('');
          setFormData(prev => ({
            ...prev, street: data.logradouro, neighborhood: data.bairro,
            city: data.localidade, state: data.uf,
          }));
          document.getElementById('number')?.focus();
          
          // CEP divergence check: if checkout CEP is different from cart CEP, recalculate shipping
          const cartCepClean = (cartCep || '').replace(/\D/g, '');
          if (cartCepClean && cep !== cartCepClean && selectedShipping) {
            setRecalculating(true);
            try {
              const shippingRes = await api.calculateShipping(cep, cart);
              if (shippingRes.success && shippingRes.options) {
                const newOpts = shippingRes.options.map((opt: any) => ({
                  id: opt.id, name: opt.name,
                  price: parseFloat(opt.price),
                  delivery_time: opt.delivery_time,
                  package: opt.packages?.[0] || null,
                })).filter((opt: any) => opt.price > 0);

                setShippingOptions(newOpts);
                // Find same service or pick first
                const sameService = newOpts.find((o: any) => o.id === selectedShipping.id);
                const newOpt = sameService || newOpts[0];
                if (newOpt) {
                  const oldPrice = selectedShipping.price;
                  const oldName = selectedShipping.name;
                  setShippingAlert({ oldPrice, newPrice: newOpt.price, newName: newOpt.name, oldName });
                  setAlertExpanded(false);
                  setSelectedShipping(newOpt);
                }
              }
            } catch {} finally {
              setRecalculating(false);
            }
          }
        }
      } catch {
        setCepError('Revise o CEP, ele parece inválido');
      } finally { setLoadingCep(false); }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ============ FRONTEND VALIDATIONS ============
    // Name validation: require at least 2 words
    if (!validateName(formData.name)) {
      document.getElementById('name')?.focus();
      return;
    }

    // CEP format validation
    const cleanCep = formData.cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setCepError('Revise o CEP, ele parece inválido');
      document.getElementById('cep')?.focus();
      return;
    }

    // If CEP error still set from ViaCEP check, block
    if (cepError) {
      document.getElementById('cep')?.focus();
      return;
    }

    setSubmitting(true);
    
    const addressNumber = semNumero ? 'S/N' : formData.number;
    const componentNumber = semNumero ? '' : formData.number;
    const fullAddress = `${formData.street}, ${addressNumber}${formData.complement ? ` - ${formData.complement}` : ''}, ${formData.neighborhood}, ${formData.city} - ${formData.state}, CEP: ${formData.cep}`;
    
    try {
      const data = await api.createOrder({
        name: formData.name, email: formData.email, whatsapp: formData.whatsapp,
        address: fullAddress,
        address_components: {
          street: formData.street, number: componentNumber, complement: formData.complement,
          neighborhood: formData.neighborhood, city: formData.city, state: formData.state,
          cep: formData.cep.replace(/\D/g, ''),
        },
        items: cart.map(item => ({
          ...item,
          color_preference: item.color_preference || undefined,
        })), totalAmount: total, shipping_service: selectedShipping?.id,
        shipping_fee: selectedShipping?.price, package_dimensions: selectedShipping?.package,
      });
      
      if (data.success) {
        setOrderId(data.orderId);
        setFinalTotal(total);
        setStep('pix');
        clearCart();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        alert(data.error || 'Erro ao processar pedido. Tente novamente.');
      }
    } catch {
      alert('Ocorreu um erro ao processar seu pedido. Tente novamente.');
    } finally { setSubmitting(false); }
  };

  const handleCopyPix = () => {
    navigator.clipboard.writeText(storeConfig.pix_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ========== PIX PAYMENT SCREEN ==========
  if (step === 'pix') {
    const whatsappMsg = encodeURIComponent(
      `Olá! Fiz o pedido #${orderId} no valor de R$ ${finalTotal.toFixed(2).replace('.', ',')}. Segue o comprovante do PIX:`
    );
    const whatsappLink = `https://wa.me/${storeConfig.whatsapp}?text=${whatsappMsg}`;
    const whatsappFormatted = storeConfig.whatsapp.replace(/^55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');

    return (
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 text-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package size={32} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Aguardando pagamento</h1>
          <p className="text-zinc-500 mt-2">Pedido <strong className="text-zinc-900">#{orderId}</strong></p>
        </div>

        {/* Payment info */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 space-y-6">
          <p className="text-zinc-700 leading-relaxed">
            Agradecemos sua compra!
          </p>
          <p className="text-zinc-700 leading-relaxed">
            Segue os dados para pagamento via Pix.
          </p>

          {/* PIX Key Box */}
          <div className="bg-zinc-50 p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-500">Chave Pix {storeConfig.pix_tipo}:</span>
            </div>
            <div className="flex items-center gap-2 bg-white border border-zinc-200 p-3 rounded-xl">
              <code className="flex-grow text-left font-mono text-lg font-bold text-zinc-900">{storeConfig.pix_key}</code>
              <button onClick={handleCopyPix} className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Copiar">
                <Copy size={20} />
              </button>
            </div>
            {copied && <p className="text-xs text-emerald-600 font-medium">Chave copiada!</p>}
          </div>

          {/* Store info */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-zinc-100">
              <span className="text-zinc-500">Nome:</span>
              <span className="font-medium text-zinc-900">{storeConfig.pix_nome}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100">
              <span className="text-zinc-500">Banco:</span>
              <span className="font-medium text-zinc-900">{storeConfig.pix_banco}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100">
              <span className="text-zinc-500">Valor:</span>
              <span className="font-bold text-lg text-zinc-900">R$ {finalTotal.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
        </div>

        {/* WhatsApp CTA */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
          {/* Preparation time notice - visible and clear */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <Package size={16} className="text-amber-600" />
              </div>
              <p className="text-sm font-bold text-amber-800">Prazo de preparação e postagem</p>
            </div>
            <p className="text-sm text-amber-700 leading-relaxed">
              Após a confirmação do pagamento, seu pedido será preparado e postado em até <strong>3 dias úteis</strong>. O prazo de entrega dos Correios começa a contar a partir da postagem.
            </p>
          </div>

          <p className="text-zinc-700 text-sm leading-relaxed font-medium text-center">
            Envie o comprovante de pagamento pelo WhatsApp
          </p>
          <p className="text-center text-2xl font-bold text-zinc-900">{whatsappFormatted}</p>
          
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white py-3.5 rounded-xl text-sm font-bold hover:bg-[#128C7E] transition-colors whitespace-nowrap"
          >
            <MessageCircle size={20} />
            Enviar Comprovante
          </a>
        </div>

        {/* Email tracking notice */}
        <div className="bg-blue-50 border border-blue-200 p-5 rounded-3xl text-center space-y-2">
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
            <Mail size={20} />
          </div>
          <p className="text-sm text-blue-800 font-medium">
            Acompanhe a caixa de entrada do e-mail <strong>{formData.email}</strong>
          </p>
          <p className="text-xs text-blue-600">
            Voce recebera atualizacoes sobre o status do seu pedido por e-mail.
          </p>
        </div>

        {/* Track order */}
        <div className="text-center">
          <button
            onClick={() => navigate('/store/acompanhar')}
            className="text-emerald-600 font-medium hover:text-emerald-700 transition-colors text-sm"
          >
            Acompanhar meu pedido →
          </button>
        </div>
      </div>
    );
  }

  // ========== CHECKOUT FORM ==========
  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-7 space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Finalizar Compra</h1>
        
        <form id="checkout-form" onSubmit={handleSubmit} className="space-y-8">
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100 space-y-6">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-sm">1</span>
              Dados de Contato
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1">Nome Completo</label>
                  <input type="text" id="name" required value={formData.name} onChange={(e) => { setFormData({ ...formData, name: e.target.value }); if (nameError) setNameError(''); }} onBlur={handleNameBlur} className={`w-full px-4 py-3 rounded-xl border ${nameError ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : 'border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500'} focus:ring-2 outline-none transition-all`} placeholder="João da Silva" />
                  {nameError && <p className="text-xs text-red-500 mt-1 font-medium">{nameError}</p>}
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1">E-mail</label>
                  <input type="email" id="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all" placeholder="seu@email.com" />
                  <p className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1"><Mail size={12} /> Este e-mail sera usado para acompanhar seu pedido</p>
                </div>
              </div>
              <div>
                <label htmlFor="whatsapp" className="block text-sm font-medium text-zinc-700 mb-1">WhatsApp</label>
                <input type="tel" id="whatsapp" required value={formData.whatsapp} onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })} className="w-full sm:w-1/2 px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all" placeholder="(11) 99999-9999" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100 space-y-6">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-sm">2</span>
              Endereço de Entrega
            </h2>
            <div className="space-y-4">
              <div className="relative">
                <label htmlFor="cep" className="block text-sm font-medium text-zinc-700 mb-1">CEP</label>
                <input type="text" id="cep" required maxLength={9} value={formData.cep} onChange={handleCepChange} className={`w-full sm:w-1/2 px-4 py-3 rounded-xl border ${cepError ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : 'border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500'} focus:ring-2 outline-none transition-all`} placeholder="00000-000" />
                {loadingCep && <span className="absolute right-4 top-10 text-xs text-zinc-500">Buscando...</span>}
                {cepError && <p className="text-xs text-red-500 mt-1 font-medium">{cepError}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-8">
                  <label htmlFor="street" className="block text-sm font-medium text-zinc-700 mb-1">Rua / Avenida</label>
                  <input type="text" id="street" required value={formData.street} onChange={(e) => setFormData({ ...formData, street: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-zinc-50" />
                </div>
                <div className="sm:col-span-4">
                  <label htmlFor="number" className="block text-sm font-medium text-zinc-700 mb-1">Numero da residencia</label>
                  <input
                    type="text"
                    id="number"
                    inputMode="numeric"
                    required={!semNumero}
                    disabled={semNumero}
                    maxLength={5}
                    value={semNumero ? '' : formData.number}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 5);
                      setFormData({ ...formData, number: val });
                    }}
                    onKeyDown={(e) => {
                      // Allow backspace, delete, tab, arrows
                      if (['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) return;
                      // Block non-numeric
                      if (!/^\d$/.test(e.key)) e.preventDefault();
                      // Block if already 5 digits
                      if (formData.number.length >= 5 && /^\d$/.test(e.key)) e.preventDefault();
                    }}
                    className={`w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all ${
                      semNumero ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed placeholder-zinc-400' : ''
                    }`}
                    placeholder={semNumero ? 'S/N' : 'Ex: 123'}
                  />
                  <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={semNumero}
                      onChange={(e) => {
                        setSemNumero(e.target.checked);
                        if (e.target.checked) {
                          setFormData(prev => ({ ...prev, number: '' }));
                        } else {
                          setFormData(prev => ({ ...prev, number: '' }));
                          setTimeout(() => document.getElementById('number')?.focus(), 50);
                        }
                      }}
                      className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-zinc-500">Sem numero</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label htmlFor="complement" className="block text-sm font-medium text-zinc-700 mb-1">Complemento <span className="text-zinc-400 font-normal">(Opcional)</span></label>
                  <input type="text" id="complement" value={formData.complement} onChange={(e) => setFormData({ ...formData, complement: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all" placeholder="Apto, Bloco, Casa 2" />
                </div>
                <div className="sm:col-span-6">
                  <label htmlFor="neighborhood" className="block text-sm font-medium text-zinc-700 mb-1">Bairro</label>
                  <input type="text" id="neighborhood" required value={formData.neighborhood} onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-zinc-50" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-8">
                  <label htmlFor="city" className="block text-sm font-medium text-zinc-700 mb-1">Cidade</label>
                  <input type="text" id="city" required value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-zinc-50" />
                </div>
                <div className="sm:col-span-4">
                  <label htmlFor="state" className="block text-sm font-medium text-zinc-700 mb-1">Estado</label>
                  <input type="text" id="state" required maxLength={2} value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })} className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-zinc-50 uppercase" placeholder="SP" />
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Order Summary Sidebar */}
      <div className="lg:col-span-5">
        <div className="bg-zinc-50 p-6 sm:p-8 rounded-3xl border border-zinc-200 sticky top-24">
          <h2 className="text-xl font-bold text-zinc-900 mb-6">Resumo do Pedido</h2>
          <div className="space-y-4 mb-6 max-h-[40vh] overflow-y-auto pr-2">
            {cart.map((item) => (
              <div key={item.id} className="flex gap-4">
                <div className="w-16 h-16 bg-white rounded-xl border border-zinc-200 overflow-hidden flex-shrink-0 relative">
                  {item.image_url ? <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full bg-zinc-100" />}
                  <span className="absolute -top-2 -right-2 bg-zinc-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">{item.quantity}</span>
                </div>
                <div className="flex-grow">
                  <h3 className="text-sm font-medium text-zinc-900 line-clamp-2">{item.title}</h3>
                  {item.color_preference && (
                    <div className="flex items-center gap-1 flex-wrap mt-1">
                      {item.color_preference.mode === 'sortida' ? (
                        <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium">Sortidas</span>
                      ) : (
                        [item.color_preference.color_1, item.color_preference.color_2, item.color_preference.color_3].filter(Boolean).map((colorName, idx) => {
                          const c = LINE_COLORS.find(lc => lc.name === colorName);
                          return c ? (
                            <span key={idx} className="inline-flex items-center gap-0.5 text-[9px] bg-zinc-100 text-zinc-500 px-1 py-0.5 rounded">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ ...(c.hex.startsWith('linear-gradient') ? { background: c.hex } : { backgroundColor: c.hex }), border: c.hex === '#f5f5f5' ? '1px solid #d4d4d8' : 'none' }} />
                              {c.name}
                            </span>
                          ) : null;
                        })
                      )}
                    </div>
                  )}
                  <p className="text-sm font-bold text-zinc-900 mt-1">R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-200 pt-4 space-y-3 mb-6">
            {shippingAlert && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl overflow-hidden mb-2 shadow-sm transition-all">
                {/* Envelope header - always visible (summary) */}
                <div
                  className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-amber-100/50 transition-colors"
                  onClick={() => setAlertExpanded(!alertExpanded)}
                >
                  <div className="w-9 h-9 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
                    {alertExpanded ? <MailOpen size={18} className="text-amber-700" /> : <Mail size={18} className="text-amber-700" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-amber-800 text-sm">Frete atualizado automaticamente</p>
                    <p className="text-xs text-amber-600 truncate">
                      R$ {shippingAlert.oldPrice.toFixed(2).replace('.', ',')} &rarr; R$ {shippingAlert.newPrice.toFixed(2).replace('.', ',')} &middot; Toque para ver detalhes
                    </p>
                  </div>
                  {alertExpanded ? <ChevronUp size={16} className="text-amber-500 shrink-0" /> : <ChevronDown size={16} className="text-amber-500 shrink-0" />}
                </div>

                {/* Expandable details */}
                {alertExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-amber-200">
                    <p className="text-sm text-amber-800 pt-3 leading-relaxed">
                      Percebemos que o <strong>CEP informado aqui no checkout</strong> e diferente do CEP que voce usou no carrinho. Como o destino mudou, recalculamos o frete automaticamente para garantir o valor correto.
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex-1 bg-white rounded-xl p-3 text-center border border-amber-200/80 shadow-sm">
                        <p className="text-amber-500 font-semibold uppercase tracking-wide text-[10px] mb-1">Valor anterior</p>
                        <p className="text-amber-800 font-bold text-base line-through decoration-amber-400/60">R$ {shippingAlert.oldPrice.toFixed(2).replace('.', ',')}</p>
                        <p className="text-amber-500 mt-0.5">{shippingAlert.oldName}</p>
                      </div>
                      <div className="text-amber-400 text-lg font-bold">&rarr;</div>
                      <div className="flex-1 bg-white rounded-xl p-3 text-center border border-amber-200/80 shadow-sm">
                        <p className="text-amber-500 font-semibold uppercase tracking-wide text-[10px] mb-1">Valor atualizado</p>
                        <p className="text-amber-800 font-bold text-base">R$ {shippingAlert.newPrice.toFixed(2).replace('.', ',')}</p>
                        <p className="text-amber-500 mt-0.5">{shippingAlert.newName}</p>
                      </div>
                    </div>
                    {shippingAlert.newPrice > shippingAlert.oldPrice && (
                      <div className="bg-amber-100/60 rounded-lg p-2 flex items-center gap-2">
                        <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-700">O frete ficou <strong>R$ {(shippingAlert.newPrice - shippingAlert.oldPrice).toFixed(2).replace('.', ',')}</strong> mais caro para o novo endereco.</p>
                      </div>
                    )}
                    {shippingAlert.newPrice < shippingAlert.oldPrice && (
                      <div className="bg-emerald-50 rounded-lg p-2 flex items-center gap-2">
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        <p className="text-xs text-emerald-700">Boa noticia! O frete ficou <strong>R$ {(shippingAlert.oldPrice - shippingAlert.newPrice).toFixed(2).replace('.', ',')}</strong> mais barato para o novo endereco.</p>
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setShippingAlert(null); }}
                      className="w-full bg-amber-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-amber-700 transition-colors"
                    >
                      Entendi, continuar
                    </button>
                  </div>
                )}
              </div>
            )}
            {recalculating && (
              <div className="flex items-center gap-2 text-amber-600 text-sm p-2">
                <Loader2 size={14} className="animate-spin" />
                <span>Recalculando frete...</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-zinc-600">
              <span>Subtotal</span>
              <span>R$ {(total - (selectedShipping?.price || 0)).toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between text-sm text-zinc-600">
              <span>Frete ({selectedShipping?.name})</span>
              <span className="text-zinc-900 font-medium">R$ {selectedShipping?.price.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-zinc-900 pt-3 border-t border-zinc-200">
              <span>Total</span>
              <span>R$ {total.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
          <button type="submit" form="checkout-form" disabled={submitting} className="w-full bg-emerald-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? 'Processando...' : 'Finalizar Compra'}
          </button>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
              <CheckCircle2 size={14} className="text-emerald-500" />
              Pagamento 100% seguro via PIX
            </div>
            <p className="text-xs text-zinc-400 text-center leading-relaxed">
              Ao finalizar, voce vera as informacoes para pagamento via PIX.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
