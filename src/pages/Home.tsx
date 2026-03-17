import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Product } from '../types';
import { needsColorSelection } from '../types';
import { useCart } from '../CartContext';
import { api } from '../api';
import { Search, Filter, Loader2, Pointer } from 'lucide-react';

const LOGO_URL = "https://d1a9qnv764bsoo.cloudfront.net/stores/002/383/186/themes/common/logo-2076434406-1663802435-2137b08583cacd89f0378fc3f37146e01663802435.png?0";

const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [isAdding, setIsAdding] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  const requiresColor = needsColorSelection(product);

  const handleBuy = () => {
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
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400">
            Sem imagem
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
            disabled={isAdding}
            className={`px-3 py-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 w-full sm:w-auto flex items-center justify-center gap-2 ${
              isAdding 
                ? 'bg-emerald-600 text-white scale-95' 
                : 'bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95'
            }`}
          >
            {showCheck ? (
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

export default function Home() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [yardsOptions, setYardsOptions] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYards, setSelectedYards] = useState<string>('3000');
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);
  const [totalServerCount, setTotalServerCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadInitialProducts();
  }, []);

  const loadInitialProducts = async () => {
    setLoading(true);
    try {
      // Load first batch of 50
      const res = await api.getProducts(50, 0);
      let initial = res.products.filter(p => !p.title.startsWith('Medusa '));
      setTotalServerCount(res.count);
      setAllProducts(initial);
      setProducts(initial);

      const uniqueYards: number[] = Array.from(new Set(initial.map(p => p.yards).filter((y): y is number => y != null)));
      setYardsOptions(uniqueYards.sort((a, b) => a - b));

      // Load remaining products in background for search/filter
      if (res.count > 50) {
        loadRemainingProducts(initial, 50, res.count);
      }
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadRemainingProducts = async (current: Product[], startOffset: number, total: number) => {
    let all = [...current];
    let offset = startOffset;
    const limit = 100;

    while (offset < total) {
      try {
        const res = await api.getProducts(limit, offset);
        const batch = res.products.filter(p => !p.title.startsWith('Medusa '));
        all = [...all, ...batch];
        offset += limit;
      } catch (err) {
        console.error("Erro ao carregar mais produtos:", err);
        break;
      }
    }

    setAllProducts(all);
    // Update yards options with full list
    const uniqueYards = Array.from(new Set(all.map(p => p.yards).filter((y): y is number => y !== null)));
    setYardsOptions(uniqueYards.sort((a, b) => a - b));
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
      {/* Banner */}
      <div className="w-[99%] md:w-[80%] mx-auto">
        <img
          src="/banner-chefao.png"
          alt="Testado e Aprovado - Chefão da Diamante Pipas usa e recomenda Dente de Tubarão"
          className="w-full rounded-2xl shadow-md"
          loading="eager"
        />
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Nossos Produtos</h1>
        
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
    </div>
  );
}
