import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Product } from '../types';
import { needsColorSelection, isProductAvailable } from '../types';
import { useCart } from '../CartContext';
import { api } from '../api';
import { Search, Filter, Loader2, Pointer, BookOpen } from 'lucide-react';

const LOGO_URL = "https://d1a9qnv764bsoo.cloudfront.net/stores/002/383/186/themes/common/logo-2076434406-1663802435-2137b08583cacd89f0378fc3f37146e01663802435.png?0";

/** Sort products by admin-defined rank. Ranked items first, then unranked. */
function sortByRank(products: Product[]): Product[] {
  const getRank = (p: Product): number | null => {
    const r = p.metadata?.rank;
    if (typeof r === 'number' && !isNaN(r)) return r;
    if (typeof r === 'string' && r.trim() !== '' && !isNaN(Number(r))) return Number(r);
    return null;
  };
  const ranked = products.filter(p => getRank(p) !== null).sort((a, b) => getRank(a)! - getRank(b)!);
  const unranked = products.filter(p => getRank(p) === null);
  return [...ranked, ...unranked];
}

const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [isAdding, setIsAdding] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  const requiresColor = needsColorSelection(product);
  const inStock = isProductAvailable(product);

  const handleBuy = () => {
    if (!inStock) return;
    // If product needs color selection, redirect to product page
    if (requiresColor) {
      navigate(`/store/product/${product.id}`);
      return;
    }
    if (isAdding) return;
    setIsAdding(true);
    addToCart(product);
    setTimeout(() => {
      setShowCheck(true);
      setTimeout(() => {
        setShowCheck(false);
        setIsAdding(false);
      }, 800);
    }, 200);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <Link to={`/store/product/${product.id}`} className="aspect-square bg-zinc-100 overflow-hidden relative">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            className={`w-full h-full object-cover ${!inStock ? 'opacity-50 grayscale' : ''}`}
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400">
            Sem imagem
          </div>
        )}
        {/* Badge esgotado (2026-04-25 FRENTE 2) */}
        {!inStock && (
          <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow">
            ESGOTADO
          </div>
        )}
        {/* Cart animation overlay */}
        {isAdding && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center animate-fade-in-fast">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${showCheck ? 'bg-emerald-500 scale-100' : 'bg-emerald-500/50 scale-75'}`}>
              {showCheck ? (
                <svg className="w-7 h-7 text-white animate-check-pop" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <Loader2 size={24} className="text-white animate-spin" />
              )}
            </div>
          </div>
        )}
      </Link>
      <div className="p-3 sm:p-4 flex flex-col flex-grow">
        <Link to={`/store/product/${product.id}`} className="font-medium text-sm sm:text-base text-zinc-900 hover:text-emerald-600 line-clamp-2 mb-2">
          {product.title}
        </Link>
        <div className="mt-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
          <span className="text-base sm:text-lg font-bold text-zinc-900">
            R$ {product.price.toFixed(2).replace('.', ',')}
          </span>
          <button
            onClick={handleBuy}
            disabled={isAdding || !inStock}
            className={`px-3 py-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 w-full sm:w-auto flex items-center justify-center gap-2 ${
              !inStock
                ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                : isAdding
                ? 'bg-emerald-600 text-white scale-95'
                : 'bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95'
            }`}
          >
            {!inStock ? 'Esgotado' : showCheck ? (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Adicionado!</>
            ) : isAdding ? (
              <Loader2 size={16} className="animate-spin" />
            ) : requiresColor ? 'Escolher Cores' : 'Comprar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingSplash() {
  const slogans = [
    "Preparando as melhores linhas para você...",
    "Linha Dente de Tubarão — resistência que você confia!",
    "Selecionando os melhores produtos...",
    "A linha que não te deixa na mão!",
  ];
  const [sloganIndex, setSloganIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSloganIndex(i => (i + 1) % slogans.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-8">
      {/* Logo pulsando */}
      <div className="animate-pulse">
        <img 
          src={LOGO_URL} 
          alt="Dente de Tubarão" 
          className="h-20 sm:h-28 object-contain drop-shadow-lg"
          referrerPolicy="no-referrer"
        />
      </div>
      
      {/* Barra de loading animada */}
      <div className="w-64 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-red-600 via-emerald-500 to-red-600 rounded-full animate-loading-bar" />
      </div>

      {/* Slogan rotativo */}
      <p className="text-zinc-500 text-center text-sm sm:text-base font-medium animate-fade-in max-w-xs" key={sloganIndex}>
        {slogans[sloganIndex]}
      </p>
    </div>
  );
}

/* AdSenseBanner — slot do catálogo completo (Home).
 * 2026-04-17: garantido label "Publicidade" (política AdSense) e parent
 * sem overflow/altura fixa. O script do AdSense já é carregado globalmente
 * pelo index.html, mas mantemos o fallback defensivo aqui.
 */
function AdSenseBanner() {
  const insRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    // Fallback: injeta o script apenas se, por algum motivo, não estiver presente.
    if (!document.querySelector('script[src*="adsbygoogle"]')) {
      const script = document.createElement('script');
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2374693914602514';
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }

    const timer = setTimeout(() => {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch (_) {}
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="my-4 w-full">
      <p className="text-center text-[10px] font-medium tracking-widest uppercase text-zinc-400 mb-1.5">Publicidade</p>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%' }}
        data-ad-client="ca-pub-2374693914602514"
        data-ad-slot="8543863718"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

export default function Home() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [yardsOptions, setYardsOptions] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  // Catálogo completo: filtro inicial "Todas" (sem pré-filtro por jardas).
  const [selectedYards, setSelectedYards] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);
  const [totalServerCount, setTotalServerCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    document.title = "Dente de Tubarao - Linhas de Pipa de Alta Performance | Loja Oficial";
    document.querySelector('meta[name="description"]')?.setAttribute('content', "Loja oficial Dente de Tubarao. Linhas de pipa de alta resistencia para competicao e lazer. Fio 4, Fio 10, Nylon Indonesia. Envio para todo o Brasil.");
  }, []);

  useEffect(() => {
    loadAllProducts();
  }, []);

  const loadAllProducts = async () => {
    setLoading(true);
    try {
      // Load ALL published products in a single request.
      const res = await api.getProducts(300, 0);
      let all = res.products.filter(p => !p.title.startsWith('Medusa '));

      // Sort by admin-defined rank: ranked products first (ascending rank),
      // then unranked products in their original API order.
      all = sortByRank(all);

      setTotalServerCount(res.count);
      setAllProducts(all);
      setProducts(all);

      const uniqueYards: number[] = Array.from(new Set(all.map(p => p.yards).filter((y): y is number => y != null)));
      setYardsOptions(uniqueYards.sort((a, b) => a - b));
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = allProducts;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(q) || 
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    if (selectedYards && selectedYards !== 'todas') {
      if (selectedYards === 'carretilha') {
        filtered = filtered.filter(p => /carretilha/i.test(p.title));
      } else if (selectedYards === 'camisas') {
        filtered = filtered.filter(p => /camis/i.test(p.title));
      } else if (selectedYards === 'bone') {
        filtered = filtered.filter(p => /bon[eé]/i.test(p.title));
      } else {
        filtered = filtered.filter(p => p.yards === parseInt(selectedYards, 10));
      }
    }

    setProducts(filtered);
  }, [searchQuery, selectedYards, allProducts]);

  const handleShowMore = () => {
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(prev => prev + 50);
      setLoadingMore(false);
    }, 100);
  };

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [searchQuery, selectedYards]);

  const visibleProducts = products.slice(0, visibleCount);
  const hasMore = visibleCount < products.length;

  if (loading) {
    return <LoadingSplash />;
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      
      <div className="w-[99%] md:w-[80%] mx-auto">
        <img
          src="/banner-chefao.png"
          alt="Testado e Aprovado - Chefão da Diamante Pipas usa e recomenda Dente de Tubarão"
          className="w-full rounded-2xl shadow-md"
          loading="eager"
        />
      </div>
      {/* AdSense — topo da home */}
      <AdSenseBanner />

      {/* Banner */}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Nossos Produtos</h1>
          {/* Instagram CTA - mobile only (desktop version is in Header) */}
          <a
            href="https://www.instagram.com/dentedetubaraooficial"
            target="_blank"
            rel="noopener noreferrer"
            className="md:hidden instagram-cta"
            title="@dentedetubaraooficial"
          >
            <span className="ig-text">Nos siga</span>
            <svg className="ig-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
          </a>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input
              type="text"
              placeholder="Buscar produtos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 z-10 pointer-events-none" size={20} />
            <select
              value={selectedYards}
              onChange={(e) => setSelectedYards(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-[8.5rem] py-2 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none shadow-sm shadow-emerald-100"
            >
              <option value="">Todas</option>
              <option value="todas">Todas as jardas</option>
              <option value="carretilha">Carretilha</option>
              <option value="camisas">Camisas</option>
              <option value="bone">Boné</option>
              {yardsOptions.map((yard) => (
                <option key={yard} value={String(yard)}>
                  {yard} jardas
                </option>
              ))}
            </select>
            {/* Animated hint on the right side */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none select-none">
              <span className="text-[10px] text-emerald-500/70 font-medium whitespace-nowrap">toque para alterar</span>
              <Pointer size={14} className="text-emerald-500/70 animate-tap-hint" aria-hidden="true" />
            </div>
          </div>
          <style>{`
            @keyframes tap-hint {
              0%, 100% { opacity: 0.4; transform: translateY(0); }
              50% { opacity: 1; transform: translateY(-2px); }
            }
            .animate-tap-hint {
              animation: tap-hint 2s ease-in-out infinite;
            }
          `}</style>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          Nenhum produto encontrado com esses filtros.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center pt-6 pb-2">
              <button
                onClick={handleShowMore}
                disabled={loadingMore}
                className="bg-zinc-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                {loadingMore ? <Loader2 size={18} className="animate-spin" /> : null}
                Ver mais ({products.length - visibleCount} restantes)
              </button>
            </div>
          )}
          <p className="text-center text-xs text-zinc-400">
            Mostrando {visibleProducts.length} de {products.length} produtos
          </p>
        </>
      )}

      {/* Blog & Dicas CTA - helps with content signals and internal linking */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 sm:p-8 mt-8">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
            <BookOpen size={24} className="text-emerald-600" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-bold text-zinc-900 text-lg">Blog Dente de Tubarao</h2>
            <p className="text-sm text-zinc-500 mt-1">Dicas de como escolher a linha ideal, seguranca ao soltar pipa e muito mais.</p>
          </div>
          <Link to="/store/blog" className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors shrink-0">
            Ver artigos
          </Link>
        </div>
      </div>
    </div>
  );
}