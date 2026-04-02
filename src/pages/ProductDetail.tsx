import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { Product, ColorPreference, LINE_COLORS, needsColorSelection, getColorsForProduct, getColorGroupName } from '../types';
import { useCart } from '../CartContext';
import { api } from '../api';
import { ArrowLeft, ShieldCheck, Truck, CreditCard, Minus, Plus, Loader2, ShoppingCart } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [loading, setLoading] = useState(true);

  // Color selection state — default is 'prioridade' (Escolher cores)
  const [colorMode, setColorMode] = useState<'sortida' | 'prioridade'>('prioridade');
  // Single array of selected colors in priority order (max 3)
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [observation, setObservation] = useState('');
  // Track whether underline animation has already played (only once per page load)
  const [underlineAnimPlayed, setUnderlineAnimPlayed] = useState(false);
  const prevColorCountRef = useRef(0);

  // Floating bottom bar visibility — tracks if original buttons are out of viewport
  const [showFloatingBar, setShowFloatingBar] = useState(false);
  const buttonsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getProduct(id)
      .then((p) => {
        if (p) {
          setProduct(p);
          // Dynamic SEO for product pages
          document.title = `${p.title} - Dente de Tubarao`;
          const desc = p.description?.replace(/<[^>]*>/g, '').slice(0, 155) || `Compre ${p.title} na Dente de Tubarao. Envio para todo o Brasil com rastreamento.`;
          document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
        } else {
          navigate('/store');
        }
      })
      .catch(() => navigate('/store'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  // Trigger underline animation exactly once: when user goes from 0→1 color for the first time
  // IMPORTANT: This hook MUST be before any early returns to respect React's rules of hooks
  useEffect(() => {
    if (selectedColors.length >= 1 && prevColorCountRef.current === 0 && !underlineAnimPlayed) {
      setUnderlineAnimPlayed(true);
    }
    prevColorCountRef.current = selectedColors.length;
  }, [selectedColors.length, underlineAnimPlayed]);

  // IntersectionObserver for floating bar — show when original buttons scroll out
  useEffect(() => {
    if (!buttonsRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowFloatingBar(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(buttonsRef.current);
    return () => observer.disconnect();
  }, [loading, product]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!product) return null;

  const requiresColor = needsColorSelection(product);

  // Get product-specific colors and max selection count
  const productColors = getColorsForProduct(product);
  const colorGroupName = getColorGroupName(product);
  const maxColors = Math.min(3, productColors.length);

  // Toggle a color in the selection
  const toggleColor = (colorName: string) => {
    setSelectedColors(prev => {
      const idx = prev.indexOf(colorName);
      if (idx >= 0) {
        // Remove it
        return prev.filter(c => c !== colorName);
      }
      if (prev.length >= maxColors) return prev;
      return [...prev, colorName];
    });
  };

  // Get priority number for a color (1, 2, 3) or 0 if not selected
  const getPriority = (colorName: string): number => {
    const idx = selectedColors.indexOf(colorName);
    return idx >= 0 ? idx + 1 : 0;
  };

  // Build color preference for cart
  const buildColorPreference = (): ColorPreference | undefined => {
    if (!requiresColor) return undefined;
    if (colorMode === 'sortida') {
      return { mode: 'sortida', observation: observation.trim() || undefined };
    }
    return {
      mode: 'prioridade',
      color_1: selectedColors[0] || undefined,
      color_2: selectedColors[1] || undefined,
      color_3: selectedColors[2] || undefined,
      observation: observation.trim() || undefined,
    };
  };

  // Validate: in prioridade mode, all required colors must be selected
  const isColorValid = !requiresColor || colorMode === 'sortida' || selectedColors.length === maxColors;

  // "Adicionar ao carrinho" — adds and stays on page
  const handleAddToCart = () => {
    if (isAdding || isBuying || !isColorValid) return;
    setIsAdding(true);
    const colorPref = buildColorPreference();
    for (let i = 0; i < quantity; i++) {
      addToCart(product, colorPref);
    }
    setTimeout(() => setIsAdding(false), 1200);
  };

  // "Comprar agora" — adds and navigates to cart
  const handleBuyNow = () => {
    if (isAdding || isBuying || !isColorValid) return;
    setIsBuying(true);
    const colorPref = buildColorPreference();
    for (let i = 0; i < quantity; i++) {
      addToCart(product, colorPref, false);
    }
    setTimeout(() => {
      setIsBuying(false);
      navigate('/store/cart');
    }, 400);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <Breadcrumbs items={[{ label: product.title }]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 bg-white p-6 sm:p-10 rounded-3xl shadow-sm border border-zinc-100">
        {/* Product Image */}
        <div className="aspect-square bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-100">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              className="w-full h-full object-contain p-4"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400">
              Sem imagem
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="flex flex-col">
          <div className="mb-2 text-sm text-emerald-600 font-medium tracking-wide uppercase">
            {product.vendor || 'Dente de Tubarao'}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4 leading-tight">
            {product.title}
          </h1>

          <div className="flex items-baseline gap-4 mb-6">
            <span className="text-4xl font-bold text-zinc-900">
              R$ {product.price.toFixed(2).replace('.', ',')}
            </span>
            <span className="text-sm text-zinc-500">via PIX</span>
          </div>

          {/* ============ COLOR SELECTION — compact single grid ============ */}
          {requiresColor && (
            <div className="mb-5 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-zinc-800">Preferencia de cores</p>
                {colorGroupName && (
                  <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-medium">{colorGroupName}</span>
                )}
              </div>

              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setColorMode('prioridade')}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all border ${
                    colorMode === 'prioridade'
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  Escolher cores
                </button>
                <button
                  type="button"
                  onClick={() => { setColorMode('sortida'); setSelectedColors([]); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all border ${
                    colorMode === 'sortida'
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  Cores sortidas
                </button>
              </div>

              {/* Color grid — only visible in prioridade mode */}
              {colorMode === 'prioridade' && (
                <div className="space-y-2">
                  {/* Explanatory text */}
                  <p className="text-xs text-zinc-600 leading-snug">
                    <span className={underlineAnimPlayed && selectedColors.length < maxColors ? 'color-underline-once' : ''}>
                      Escolha {maxColors === 2 ? 'ate 2 cores' : 'ate 3 cores'} em ordem de preferencia.
                    </span>
                    {' '}Em caso de falta da 1a cor escolhida, enviaremos a 2a e assim por diante.
                  </p>

                  {/* Single compact grid */}
                  <div className="flex flex-wrap gap-1.5">
                    {productColors.map(c => {
                      const priority = getPriority(c.name);
                      const isWhite = c.hex === '#f5f5f5';
                      const isGradient = c.hex.startsWith('linear-gradient');
                      const isSelected = priority > 0;
                      const isDisabled = !isSelected && selectedColors.length >= maxColors;

                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => !isDisabled && toggleColor(c.name)}
                          disabled={isDisabled}
                          className={`relative flex flex-col items-center gap-0.5 transition-all ${
                            isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                          style={{ width: '3rem' }}
                        >
                          {/* Color circle */}
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                              isSelected
                                ? 'ring-2 ring-offset-1 ring-emerald-500 scale-110'
                                : 'ring-1 ring-zinc-200 hover:ring-zinc-400 hover:scale-105'
                            } ${isWhite ? 'border border-zinc-200' : ''}`}
                            style={isGradient ? { background: c.hex } : { backgroundColor: c.hex }}
                          >
                            {isSelected && (
                              <span className={`text-[11px] font-bold leading-none ${
                                isWhite || c.hex === '#eab308' ? 'text-zinc-800' : 'text-white'
                              }`}>
                                {priority}
                              </span>
                            )}
                          </div>
                          {/* Color name */}
                          <span className={`text-[9px] leading-tight text-center ${
                            isSelected ? 'text-zinc-900 font-semibold' : 'text-zinc-400'
                          }`}>
                            {c.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Dynamic yellow hint — only when not all colors selected yet */}
                  {selectedColors.length >= 1 && selectedColors.length < maxColors && (
                    <div
                      key={selectedColors.length}
                      className="color-hint-sweep inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60"
                      style={{ animation: 'hint-fade-in 0.35s ease-out' }}
                    >
                      <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                      {maxColors - selectedColors.length === 1
                        ? 'Escolha mais uma cor'
                        : `Escolha mais ${maxColors - selectedColors.length} cores`}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Observation field — always visible, compact */}
          <div className="mb-5">
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Observacao para a Dente de Tubarao <span className="text-zinc-300">(opcional)</span>
            </label>
            <input
              type="text"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Ex: se nao tiver preta, pode mandar azul"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-xs text-zinc-700 placeholder:text-zinc-300"
              maxLength={200}
            />
          </div>

          {/* Quantity + Buy */}
          <div ref={buttonsRef} className="space-y-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Quantidade</label>
              <div className="flex items-center w-32 bg-zinc-50 border border-zinc-200 rounded-xl">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-12 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <Minus size={18} />
                </button>
                <input
                  type="number"
                  value={quantity}
                  readOnly
                  className="w-12 h-12 bg-transparent text-center font-medium text-zinc-900 outline-none"
                />
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-12 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {/* Primary: Comprar agora — adds to cart + navigates to cart */}
            <button
              onClick={handleBuyNow}
              disabled={isAdding || isBuying || !isColorValid}
              className={`w-full py-4 rounded-xl text-lg font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                !isColorValid
                  ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed shadow-none'
                  : isBuying
                    ? 'bg-emerald-700 text-white shadow-emerald-700/20 cursor-wait'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
              }`}
            >
              {isBuying ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Indo para o carrinho...
                </>
              ) : !isColorValid && requiresColor && colorMode === 'prioridade' ? (
                `Selecione ${maxColors - selectedColors.length} cor${maxColors - selectedColors.length > 1 ? 'es' : ''}`
              ) : (
                'Comprar Agora'
              )}
            </button>

            {/* Secondary: Adicionar ao carrinho — adds and stays */}
            <button
              onClick={handleAddToCart}
              disabled={isAdding || isBuying || !isColorValid}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 border ${
                !isColorValid
                  ? 'border-zinc-200 text-zinc-400 cursor-not-allowed'
                  : isAdding
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 cursor-wait'
                    : 'border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50'
              }`}
            >
              {isAdding ? (
                <>
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  Adicionado!
                </>
              ) : (
                <>
                  <ShoppingCart size={16} />
                  Adicionar ao carrinho
                </>
              )}
            </button>
          </div>

          {/* Info badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-6 border-y border-zinc-100 mb-8">
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <Truck className="text-emerald-500" size={24} />
              <span>Frete para todo Brasil</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <ShieldCheck className="text-emerald-500" size={24} />
              <span>Compra 100% Segura</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <CreditCard className="text-emerald-500" size={24} />
              <span>Pague via PIX</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Descricao do Produto</h3>
            <div
              className="prose prose-zinc max-w-none prose-p:text-zinc-600 prose-headings:text-zinc-900"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.description || '') }}
            />
          </div>
        </div>
      </div>

      {/* ============ FLOATING BOTTOM BAR ============ */}
      {showFloatingBar && (
        <div className="fixed bottom-0 inset-x-0 z-40 animate-slide-up-bar">
          <div className="bg-white/95 backdrop-blur-lg border-t border-zinc-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {/* Price */}
              <div className="hidden sm:block shrink-0">
                <p className="text-lg font-bold text-zinc-900">
                  R$ {product.price.toFixed(2).replace('.', ',')}
                </p>
                {quantity > 1 && (
                  <p className="text-[10px] text-zinc-400">x{quantity}</p>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-2 flex-1 min-w-0">
                {/* Add to Cart */}
                <button
                  onClick={handleAddToCart}
                  disabled={isAdding || isBuying || !isColorValid}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 border ${
                    !isColorValid
                      ? 'border-zinc-200 text-zinc-400 cursor-not-allowed'
                      : isAdding
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50'
                  }`}
                >
                  {isAdding ? (
                    <><div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> Adicionado!</>
                  ) : (
                    <><ShoppingCart size={15} /> Carrinho</>
                  )}
                </button>

                {/* Buy Now */}
                <button
                  onClick={handleBuyNow}
                  disabled={isAdding || isBuying || !isColorValid}
                  className={`flex-[1.3] py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                    !isColorValid
                      ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                      : isBuying
                        ? 'bg-emerald-700 text-white cursor-wait'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20'
                  }`}
                >
                  {isBuying ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processando...</>
                  ) : !isColorValid && requiresColor && colorMode === 'prioridade' ? (
                    `Selecione ${maxColors - selectedColors.length} cor${maxColors - selectedColors.length > 1 ? 'es' : ''}`
                  ) : (
                    'Comprar Agora'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
