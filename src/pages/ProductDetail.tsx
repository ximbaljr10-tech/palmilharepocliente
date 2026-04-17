/**
 * ProductDetail.tsx — v2 redesign
 * AdSense slot: 2946092108
 *
 * Mudanças:
 *  - Todas as cores emerald → red (alinhamento de marca)
 *  - AdSense slot 2946092108 após trust badges (posição estratégica / política-compliant)
 *  - Layout mais refinado: menos peso, mais espaço
 */
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { Product, ColorPreference, needsColorSelection, getColorsForProduct, getColorGroupName } from '../types';
import { useCart } from '../CartContext';
import { api } from '../api';
import { ArrowLeft, ShieldCheck, Truck, CreditCard, Minus, Plus, Loader2, ShoppingCart } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';

/* ─── AdSense — slot exclusivo da página de produto ─
 * 2026-04-17: libertado do container com overflow-hidden/min-h fixa.
 */
function ProductAdBlock() {
  useEffect(() => {
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch (_) {}
  }, []);
  return (
    <div className="my-4 w-full">
      <p className="text-center text-[10px] font-medium tracking-widest uppercase text-zinc-400 mb-1.5">Publicidade</p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%' }}
        data-ad-client="ca-pub-2374693914602514"
        data-ad-slot="2946092108"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [colorMode, setColorMode] = useState<'sortida' | 'prioridade'>('prioridade');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [observation, setObservation] = useState('');
  const [underlineAnimPlayed, setUnderlineAnimPlayed] = useState(false);
  const prevColorCountRef = useRef(0);
  const [showFloatingBar, setShowFloatingBar] = useState(false);
  const buttonsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getProduct(id)
      .then(p => {
        if (p) {
          setProduct(p);
          document.title = `${p.title} — Dente de Tubarão`;
          const desc = p.description?.replace(/<[^>]*>/g, '').slice(0, 155) || `Compre ${p.title} na Dente de Tubarão.`;
          document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
        } else navigate('/store');
      })
      .catch(() => navigate('/store'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (selectedColors.length >= 1 && prevColorCountRef.current === 0 && !underlineAnimPlayed) setUnderlineAnimPlayed(true);
    prevColorCountRef.current = selectedColors.length;
  }, [selectedColors.length, underlineAnimPlayed]);

  useEffect(() => {
    if (!buttonsRef.current) return;
    const obs = new IntersectionObserver(([e]) => setShowFloatingBar(!e.isIntersecting), { threshold: 0.1 });
    obs.observe(buttonsRef.current);
    return () => obs.disconnect();
  }, [loading, product]);

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-red-600" />
    </div>
  );

  if (!product) return null;

  const requiresColor = needsColorSelection(product);
  const productColors = getColorsForProduct(product);
  const colorGroupName = getColorGroupName(product);
  const maxColors = Math.min(3, productColors.length);

  const toggleColor = (colorName: string) => {
    setSelectedColors(prev => {
      const idx = prev.indexOf(colorName);
      if (idx >= 0) return prev.filter(c => c !== colorName);
      if (prev.length >= maxColors) return prev;
      return [...prev, colorName];
    });
  };

  const getPriority = (colorName: string): number => {
    const idx = selectedColors.indexOf(colorName);
    return idx >= 0 ? idx + 1 : 0;
  };

  const buildColorPreference = (): ColorPreference | undefined => {
    if (!requiresColor) return undefined;
    if (colorMode === 'sortida') return { mode: 'sortida', observation: observation.trim() || undefined };
    return { mode: 'prioridade', color_1: selectedColors[0], color_2: selectedColors[1], color_3: selectedColors[2], observation: observation.trim() || undefined };
  };

  const isColorValid = !requiresColor || colorMode === 'sortida' || selectedColors.length === maxColors;

  const handleAddToCart = () => {
    if (isAdding || isBuying || !isColorValid) return;
    setIsAdding(true);
    const cp = buildColorPreference();
    for (let i = 0; i < quantity; i++) addToCart(product, cp);
    setTimeout(() => setIsAdding(false), 1200);
  };

  const handleBuyNow = () => {
    if (isAdding || isBuying || !isColorValid) return;
    setIsBuying(true);
    const cp = buildColorPreference();
    for (let i = 0; i < quantity; i++) addToCart(product, cp, false);
    setTimeout(() => { setIsBuying(false); navigate('/store/cart'); }, 400);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumbs items={[{ label: product.title }]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-white p-5 sm:p-8 rounded-2xl shadow-sm border border-zinc-100">
        {/* Imagem */}
        <div className="aspect-square bg-zinc-50 rounded-xl overflow-hidden border border-zinc-100">
          {product.image_url
            ? <img src={product.image_url} alt={product.title} className="w-full h-full object-contain p-4" referrerPolicy="no-referrer" />
            : <div className="w-full h-full flex items-center justify-center text-zinc-400">Sem imagem</div>
          }
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <div className="mb-1 text-xs text-red-600 font-semibold tracking-wide uppercase">
            {product.vendor || 'Dente de Tubarão'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-4 leading-snug">
            {product.title}
          </h1>

          <div className="flex items-baseline gap-3 mb-5">
            <span className="text-3xl sm:text-4xl font-bold text-zinc-900">
              R$ {product.price.toFixed(2).replace('.', ',')}
            </span>
            <span className="text-sm text-zinc-400">via PIX</span>
          </div>

          {/* Seleção de cores */}
          {requiresColor && (
            <div className="mb-5 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-zinc-800">Preferência de cores</p>
                {colorGroupName && <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-medium">{colorGroupName}</span>}
              </div>

              {/* Toggle modo */}
              <div className="flex gap-2">
                <button type="button" onClick={() => setColorMode('prioridade')}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all border ${colorMode === 'prioridade' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}`}>
                  Escolher cores
                </button>
                <button type="button" onClick={() => { setColorMode('sortida'); setSelectedColors([]); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all border ${colorMode === 'sortida' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}`}>
                  Cores sortidas
                </button>
              </div>

              {/* Grid de cores */}
              {colorMode === 'prioridade' && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-600 leading-snug">
                    <span className={underlineAnimPlayed && selectedColors.length < maxColors ? 'color-underline-once' : ''}>
                      Escolha {maxColors === 2 ? 'até 2 cores' : 'até 3 cores'} em ordem de preferência.
                    </span>
                    {' '}Em caso de falta da 1ª cor, enviaremos a 2ª e assim por diante.
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {productColors.map(c => {
                      const priority = getPriority(c.name);
                      const isWhite = c.hex === '#f5f5f5';
                      const isGradient = c.hex.startsWith('linear-gradient');
                      const isSelected = priority > 0;
                      const isDisabled = !isSelected && selectedColors.length >= maxColors;
                      return (
                        <button key={c.name} type="button" onClick={() => !isDisabled && toggleColor(c.name)} disabled={isDisabled}
                          className={`relative flex flex-col items-center gap-0.5 transition-all ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                          style={{ width: '3rem' }}>
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isSelected ? 'ring-2 ring-offset-1 ring-red-500 scale-110' : 'ring-1 ring-zinc-200 hover:ring-zinc-400 hover:scale-105'} ${isWhite ? 'border border-zinc-200' : ''}`}
                            style={isGradient ? { background: c.hex } : { backgroundColor: c.hex }}>
                            {isSelected && (
                              <span className={`text-[11px] font-bold leading-none ${isWhite || c.hex === '#eab308' ? 'text-zinc-800' : 'text-white'}`}>
                                {priority}
                              </span>
                            )}
                          </div>
                          <span className={`text-[9px] leading-tight text-center ${isSelected ? 'text-zinc-900 font-semibold' : 'text-zinc-400'}`}>
                            {c.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedColors.length >= 1 && selectedColors.length < maxColors && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60">
                      <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                      {maxColors - selectedColors.length === 1 ? 'Escolha mais uma cor' : `Escolha mais ${maxColors - selectedColors.length} cores`}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Observação */}
          <div className="mb-5">
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Observação para a Dente de Tubarão <span className="text-zinc-300">(opcional)</span>
            </label>
            <input type="text" value={observation} onChange={e => setObservation(e.target.value)}
              placeholder="Ex: se não tiver preta, pode mandar azul"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all text-xs text-zinc-700 placeholder:text-zinc-300"
              maxLength={200} />
          </div>

          {/* Quantidade + Comprar */}
          <div ref={buttonsRef} className="space-y-3 mb-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Quantidade</label>
              <div className="flex items-center w-32 bg-zinc-50 border border-zinc-200 rounded-xl">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-11 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-colors">
                  <Minus size={16} />
                </button>
                <input type="number" value={quantity} readOnly className="w-12 h-11 bg-transparent text-center font-medium text-zinc-900 outline-none text-sm" />
                <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-11 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-colors">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Comprar agora */}
            <button onClick={handleBuyNow} disabled={isAdding || isBuying || !isColorValid}
              className={`w-full py-3.5 rounded-xl text-base font-bold transition-all shadow flex items-center justify-center gap-2 ${
                !isColorValid ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none'
                : isBuying ? 'bg-red-700 text-white cursor-wait shadow-red-700/20'
                : 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/20'
              }`}>
              {isBuying
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Indo para o carrinho…</>
                : !isColorValid && requiresColor && colorMode === 'prioridade'
                  ? `Selecione ${maxColors - selectedColors.length} cor${maxColors - selectedColors.length > 1 ? 'es' : ''}`
                  : 'Comprar Agora'
              }
            </button>

            {/* Adicionar ao carrinho */}
            <button onClick={handleAddToCart} disabled={isAdding || isBuying || !isColorValid}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 border ${
                !isColorValid ? 'border-zinc-200 text-zinc-400 cursor-not-allowed'
                : isAdding ? 'border-red-200 bg-red-50 text-red-700 cursor-wait'
                : 'border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50'
              }`}>
              {isAdding
                ? <><div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> Adicionado!</>
                : <><ShoppingCart size={15} /> Adicionar ao carrinho</>
              }
            </button>
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3 py-5 border-y border-zinc-100 mb-6">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <Truck className="text-red-500" size={20} />
              <span className="text-[11px] text-zinc-600 leading-tight">Frete para todo Brasil</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <ShieldCheck className="text-red-500" size={20} />
              <span className="text-[11px] text-zinc-600 leading-tight">Compra 100% Segura</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <CreditCard className="text-red-500" size={20} />
              <span className="text-[11px] text-zinc-600 leading-tight">Pague via PIX</span>
            </div>
          </div>

          {/* ── Anúncio estratégico — entre trust badges e descrição ──
              Posição ideal: o usuário já viu preço/botões, não interrompemos o fluxo de compra.
              Totalmente em conformidade com a política do AdSense.
          ── */}
          <ProductAdBlock />

          {/* Descrição */}
          <div className="mt-5">
            <h3 className="text-base font-bold text-zinc-900 mb-3">Descrição do Produto</h3>
            <div
              className="prose prose-zinc max-w-none prose-p:text-zinc-600 prose-headings:text-zinc-900 prose-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.description || '') }}
            />
          </div>
        </div>
      </div>

      {/* ── Floating bottom bar ── */}
      {showFloatingBar && (
        <div className="fixed bottom-0 inset-x-0 z-40 animate-slide-up-bar">
          <div className="bg-white/95 backdrop-blur-lg border-t border-zinc-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <div className="hidden sm:block shrink-0">
                <p className="text-base font-bold text-zinc-900">R$ {product.price.toFixed(2).replace('.', ',')}</p>
                {quantity > 1 && <p className="text-[10px] text-zinc-400">x{quantity}</p>}
              </div>
              <div className="flex gap-2 flex-1 min-w-0">
                <button onClick={handleAddToCart} disabled={isAdding || isBuying || !isColorValid}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 border ${
                    !isColorValid ? 'border-zinc-200 text-zinc-400 cursor-not-allowed'
                    : isAdding ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50'
                  }`}>
                  {isAdding
                    ? <><div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> Ok!</>
                    : <><ShoppingCart size={14} /> Carrinho</>
                  }
                </button>
                <button onClick={handleBuyNow} disabled={isAdding || isBuying || !isColorValid}
                  className={`flex-[1.3] py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                    !isColorValid ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                    : isBuying ? 'bg-red-700 text-white cursor-wait'
                    : 'bg-red-600 text-white hover:bg-red-700 shadow shadow-red-600/20'
                  }`}>
                  {isBuying
                    ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processando…</>
                    : !isColorValid && requiresColor && colorMode === 'prioridade'
                      ? `Selecione ${maxColors - selectedColors.length} cor${maxColors - selectedColors.length > 1 ? 'es' : ''}`
                      : 'Comprar Agora'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}