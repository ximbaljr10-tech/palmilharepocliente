import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { Trash2, Plus, Minus, Truck, Loader2, MapPin, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { LINE_COLORS } from '../types';

export default function Cart() {
  const {
    cart, updateQuantity, removeFromCart, total,
    shippingOptions, setShippingOptions,
    selectedShipping, setSelectedShipping,
    cartCep, setCartCep,
    shippingCartFingerprint, setShippingCartFingerprint,
    isShippingStale
  } = useCart();
  const navigate = useNavigate();

  // Local UI state
  const [cep, setCep] = useState(() => {
    const raw = cartCep.replace(/\D/g, '');
    return raw ? raw.replace(/^(\d{5})(\d)/, '$1-$2') : '';
  });
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [shippingError, setShippingError] = useState('');
  const [validationMsg, setValidationMsg] = useState('');

  // ── Shipping calculation (reusable) ────────────────────────────
  const calculateShipping = useCallback(async (targetCep: string, cartItems: typeof cart) => {
    const cleanCep = targetCep.replace(/\D/g, '');
    if (cleanCep.length < 8 || cartItems.length === 0) return;

    setLoadingShipping(true);
    setShippingError('');
    setValidationMsg('');

    try {
      const res = await api.calculateShipping(cleanCep, cartItems);
      if (res.success && res.options && Array.isArray(res.options)) {
        const options = res.options
          .map((opt: any) => ({
            id: opt.id,
            name: opt.name,
            price: parseFloat(opt.price),
            delivery_time: opt.delivery_time,
            package: opt.packages?.[0] || null,
          }))
          .filter((opt: any) => opt.price > 0);

        setShippingOptions(options);
        setCartCep(cleanCep);

        // Record the fingerprint so we know this quote matches the current cart
        const fp = cartItems
          .map((i) => `${i.id}:${i.quantity}`)
          .sort()
          .join('|');
        setShippingCartFingerprint(fp);

        // Auto-select: try to keep the same service, else pick first
        if (options.length > 0) {
          const prev = selectedShipping;
          const sameService = prev ? options.find((o: any) => o.id === prev.id) : null;
          setSelectedShipping(sameService || options[0]);
        } else {
          setSelectedShipping(null);
        }
      } else {
        setShippingError(res.error || 'Nao foi possivel calcular o frete para este CEP.');
        setShippingOptions([]);
        setSelectedShipping(null);
      }
    } catch {
      setShippingError('Erro ao calcular frete.');
    } finally {
      setLoadingShipping(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setShippingOptions, setCartCep, setShippingCartFingerprint, setSelectedShipping]);

  // ── Auto-recalculate when cart changes and CEP is already filled ──
  // Use a debounce so rapid +/- clicks don't spam the API.
  const recalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartFingerprintNow = cart.map((i) => `${i.id}:${i.quantity}`).sort().join('|');

  useEffect(() => {
    const cleanCep = (cep || cartCep || '').replace(/\D/g, '');
    // Only auto-recalculate if: CEP filled, shipping was already calculated once,
    // and the current cart doesn't match the last calculation.
    if (cleanCep.length >= 8 && shippingCartFingerprint && cartFingerprintNow !== shippingCartFingerprint && cart.length > 0) {
      if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
      recalcTimerRef.current = setTimeout(() => {
        calculateShipping(cleanCep, cart);
      }, 600); // 600ms debounce
    }
    return () => {
      if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartFingerprintNow]);

  // ── Manual "OK" button handler ─────────────────────────────────
  const handleCalculateShipping = () => calculateShipping(cep, cart);

  // ── Proceed to checkout ────────────────────────────────────────
  const handleProceed = () => {
    setValidationMsg('');

    // Still recalculating
    if (loadingShipping) {
      setValidationMsg('loading');
      return;
    }
    // No CEP
    if (!cep.replace(/\D/g, '')) {
      setValidationMsg('cep');
      return;
    }
    // Shipping stale (cart changed after last quote)
    if (isShippingStale) {
      setValidationMsg('stale');
      return;
    }
    // No shipping options at all
    if (shippingOptions.length === 0) {
      setValidationMsg('cep');
      return;
    }
    // Options exist but none selected
    if (!selectedShipping) {
      setValidationMsg('shipping');
      return;
    }
    navigate('/store/checkout');
  };

  // ── Empty cart ─────────────────────────────────────────────────
  if (cart.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-3xl shadow-sm border border-zinc-100">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">Seu carrinho esta vazio</h2>
        <p className="text-zinc-500 mb-8">Adicione alguns produtos para continuar.</p>
        <Link
          to="/store"
          className="inline-block bg-zinc-900 text-white px-8 py-3 rounded-xl font-medium hover:bg-zinc-800 transition-colors"
        >
          Continuar Comprando
        </Link>
      </div>
    );
  }

  const itemsTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // If shipping is stale, don't show the old price in the total
  const displayShippingPrice = isShippingStale ? 0 : (selectedShipping?.price || 0);
  const displayTotal = itemsTotal + displayShippingPrice;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Carrinho</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-3">
          {cart.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
              <div className="flex items-start gap-3 p-3 sm:p-4">
                {/* Image */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-zinc-100 rounded-xl overflow-hidden flex-shrink-0">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Link to={`/store/product/${item.id}`} className="block font-medium text-sm sm:text-base text-zinc-900 hover:text-emerald-600 transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </Link>
                  <p className="text-emerald-600 font-bold text-sm sm:text-base">
                    R$ {item.price.toFixed(2).replace('.', ',')}
                  </p>
                  {/* Color preference display */}
                  {item.color_preference && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.color_preference.mode === 'sortida' ? (
                        <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-md font-medium">Cores sortidas</span>
                      ) : (
                        <>
                          {[item.color_preference.color_1, item.color_preference.color_2, item.color_preference.color_3].filter(Boolean).map((colorName, idx) => {
                            const c = LINE_COLORS.find(lc => lc.name === colorName);
                            return c ? (
                              <span key={idx} className="inline-flex items-center gap-1 text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded-md font-medium">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ ...(c.hex.startsWith('linear-gradient') ? { background: c.hex } : { backgroundColor: c.hex }), border: c.hex === '#f5f5f5' ? '1px solid #d4d4d8' : 'none' }} />
                                {idx + 1}ª {c.name}
                              </span>
                            ) : null;
                          })}
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center bg-zinc-100 rounded-lg">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="p-1.5 sm:p-2 hover:bg-white rounded-l-lg transition-colors"
                      >
                        <Minus size={14} className="text-zinc-600" />
                      </button>
                      <span className="w-8 sm:w-10 text-center text-sm font-bold text-zinc-900">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="p-1.5 sm:p-2 hover:bg-white rounded-r-lg transition-colors"
                      >
                        <Plus size={14} className="text-zinc-600" />
                      </button>
                    </div>
                    {item.quantity > 1 && (
                      <span className="text-xs text-zinc-400 font-medium">
                        = R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                      </span>
                    )}
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remover"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 h-fit sticky top-24">
          <h2 className="text-xl font-bold mb-6">Resumo do Pedido</h2>
          
          <div className="mb-6 pb-6 border-b border-zinc-100">
            <label className="block text-sm font-medium text-zinc-700 mb-2 flex items-center gap-2">
              <Truck size={16} />
              Calcular Frete
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="00000-000"
                value={cep}
                onChange={(e) => {
                  setCep(
                    e.target.value
                      .replace(/\D/g, '')
                      .replace(/^(\d{5})(\d)/, '$1-$2')
                      .slice(0, 9)
                  );
                  setValidationMsg('');
                }}
                className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              />
              <button
                onClick={handleCalculateShipping}
                disabled={cep.length < 8 || loadingShipping}
                className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center min-w-[80px]"
              >
                {loadingShipping ? <Loader2 size={16} className="animate-spin" /> : 'OK'}
              </button>
            </div>
            
            {shippingError && <p className="text-red-500 text-xs mt-2">{shippingError}</p>}

            {/* Recalculating indicator */}
            {loadingShipping && shippingOptions.length > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 font-medium">
                <RefreshCw size={14} className="animate-spin" />
                Recalculando frete...
              </div>
            )}

            {/* Stale shipping warning */}
            {isShippingStale && !loadingShipping && shippingOptions.length > 0 && (
              <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                <RefreshCw size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 font-medium">
                  Carrinho alterado. Recalculando frete...
                </p>
              </div>
            )}
            
            {shippingOptions.length > 0 && !isShippingStale && (
              <div className="mt-4 space-y-2">
                {shippingOptions.map(opt => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                      selectedShipping?.id === opt.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-zinc-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="shipping"
                        checked={selectedShipping?.id === opt.id}
                        onChange={() => { setSelectedShipping(opt); setValidationMsg(''); }}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{opt.name}</p>
                        <p className="text-xs text-zinc-500">Ate {opt.delivery_time + 2} dias uteis</p>
                      </div>
                    </div>
                    <span className="font-bold text-zinc-900">R$ {opt.price.toFixed(2).replace('.', ',')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex justify-between text-zinc-500">
              <span>Subtotal</span>
              <span>R$ {itemsTotal.toFixed(2).replace('.', ',')}</span>
            </div>
            {selectedShipping && !isShippingStale && (
              <div className="flex justify-between text-zinc-500">
                <span>Frete ({selectedShipping.name})</span>
                <span>R$ {selectedShipping.price.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
            {isShippingStale && (
              <div className="flex justify-between text-amber-500 text-sm">
                <span>Frete</span>
                <span className="flex items-center gap-1">
                  <RefreshCw size={12} className="animate-spin" /> Atualizando...
                </span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t border-zinc-100 pt-4">
              <span>Total</span>
              <span>R$ {displayTotal.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>

          {/* Validation messages */}
          {validationMsg === 'cep' && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <MapPin size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium">
                Digite seu CEP e calcule o frete para continuar.
              </p>
            </div>
          )}
          {validationMsg === 'shipping' && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium">
                Escolha uma forma de entrega para continuar.
              </p>
            </div>
          )}
          {validationMsg === 'stale' && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <RefreshCw size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium">
                O frete esta sendo recalculado. Aguarde a atualizacao.
              </p>
            </div>
          )}
          {validationMsg === 'loading' && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5">
              <Loader2 size={16} className="text-blue-600 shrink-0 mt-0.5 animate-spin" />
              <p className="text-sm text-blue-800 font-medium">
                Aguarde o calculo do frete ser concluido.
              </p>
            </div>
          )}

          <button
            onClick={handleProceed}
            disabled={loadingShipping || isShippingStale}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingShipping || isShippingStale ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={20} className="animate-spin" />
                Atualizando frete...
              </span>
            ) : (
              'Finalizar Compra'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
