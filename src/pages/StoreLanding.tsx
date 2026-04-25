/**
 * StoreLanding.tsx — v4
 * AdSense slot: 2918102134
 *
 * Banners de categoria: INALTERADOS visualmente
 * UX hint: embutido no subtitle "Linhas Profissionais" — sem elemento extra
 * Produtos: line-clamp-3 + fonte menor → nome completo visível
 * Anúncios: a cada 6 produtos no catálogo completo
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Product, needsColorSelection } from '../types';
import { useCart } from '../CartContext';
import { api } from '../api';
import { Loader2, BookOpen, ArrowRight, Flame, Medal, TrendingUp, ChevronRight } from 'lucide-react';

const LOGO_URL = "https://d1a9qnv764bsoo.cloudfront.net/stores/002/383/186/themes/common/logo-2076434406-1663802435-2137b08583cacd89f0378fc3f37146e01663802435.png?0";

/** Sort products by admin-defined rank. Ranked items first (ascending), then unranked. */
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

/* ─── ProductCard ─ */
interface ProductCardProps { product: Product; rank?: number; isTrending?: boolean; }

const ProductCard: React.FC<ProductCardProps> = ({ product, rank, isTrending }) => {
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [isAdding, setIsAdding] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const requiresColor = needsColorSelection(product);

  const handleBuy = () => {
    if (requiresColor) { navigate(`/store/product/${product.id}`); return; }
    if (isAdding) return;
    setIsAdding(true);
    addToCart(product);
    setTimeout(() => { setShowCheck(true); setTimeout(() => { setShowCheck(false); setIsAdding(false); }, 800); }, 200);
  };

  return (
    <div className="relative bg-white rounded-xl border border-zinc-200 overflow-hidden flex flex-col group transition-all duration-200 hover:shadow-lg hover:border-red-100">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-red-600 z-10 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
      {rank && (
        <div className="absolute top-2 left-2 z-20 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow flex items-center gap-1 uppercase tracking-wide">
          {rank === 1 ? <Medal size={12} /> : <Flame size={12} />} TOP {rank}
        </div>
      )}
      {!rank && isTrending && (
        <div className="absolute top-2 left-2 z-20 bg-zinc-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow flex items-center gap-1 uppercase tracking-wide">
          <TrendingUp size={12} className="text-red-500" /> Em Alta
        </div>
      )}
      <Link to={`/store/product/${product.id}`} className="aspect-square bg-zinc-50 overflow-hidden relative">
        {product.image_url
          ? <img src={product.image_url} alt={product.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" referrerPolicy="no-referrer" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">Sem imagem</div>
        }
        {isAdding && (
          <div className="absolute inset-0 bg-red-600/10 backdrop-blur-[2px] flex items-center justify-center z-30">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${showCheck ? 'bg-red-600 scale-100' : 'bg-red-600/80 scale-75'}`}>
              {showCheck
                ? <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                : <Loader2 size={20} className="text-white animate-spin" />
              }
            </div>
          </div>
        )}
      </Link>
      <div className="p-2.5 sm:p-3 flex flex-col flex-grow bg-white relative z-10">
        <Link to={`/store/product/${product.id}`} title={product.title}
          className="text-[11px] sm:text-xs font-semibold text-zinc-800 hover:text-red-600 line-clamp-3 mb-2 leading-snug transition-colors">
          {product.title}
        </Link>
        <div className="mt-auto">
          <span className="block text-sm sm:text-base font-black text-zinc-900 mb-1.5">
            R$ {product.price.toFixed(2).replace('.', ',')}
          </span>
          <button onClick={handleBuy} disabled={isAdding}
            className={`w-full py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 border ${isAdding ? 'bg-red-600 border-red-600 text-white' : 'border-zinc-200 text-zinc-800 hover:border-red-600 hover:bg-red-50 hover:text-red-600 active:scale-95'}`}>
            {showCheck
              ? <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Foi!</>
              : isAdding ? <Loader2 size={14} className="animate-spin" />
              : requiresColor ? 'Ver Cores' : 'Comprar'
            }
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── LoadingSplash ─ */
function LoadingSplash() {
  const slogans = ["Preparando as melhores linhas…", "Linha Dente de Tubarão — resistência que você confia!", "Selecionando os melhores produtos…", "A linha que não te deixa na mão!"];
  const [idx, setIdx] = useState(0);
  useEffect(() => { const t = setInterval(() => setIdx(i => (i + 1) % slogans.length), 2500); return () => clearInterval(t); }, []);
  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-8">
      <div className="animate-pulse">
        <img src={LOGO_URL} alt="Dente de Tubarão" className="h-20 sm:h-28 object-contain drop-shadow-lg" referrerPolicy="no-referrer" />
      </div>
      <div className="w-64 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div className="h-full bg-red-600 rounded-full animate-loading-bar" />
      </div>
      <p className="text-zinc-500 text-center text-sm font-medium max-w-xs" key={idx}>{slogans[idx]}</p>
    </div>
  );
}

/* ─── Categorias (banners) — INALTERADO visualmente ─
   UX hint embutido no subtitle de "Linhas Profissionais"
   sem nenhum elemento externo extra
─ */
const RIBBON_CATEGORIES = [
  {
    label: 'Linhas Profissionais',
    // Hint de ação direto no subtitle — já está no banner, sem poluir
    subtitle: 'Toque aqui → escolha o tamanho em jardas',
    to: '/store/nova-home/jardas',
    bgImage: 'https://i.postimg.cc/nhmyCSZZ/Captura-de-tela-2026-04-13-004937.png',
  },
  {
    label: 'Carretilhas',
    subtitle: 'As melhores do mercado',
    to: '/store/nova-home/carretilhas',
    bgImage: 'https://i.postimg.cc/Rh3P2qZw/Captura-de-tela-2026-04-13-005046.png',
  },
  {
    label: 'Roupas e Acessórios',
    subtitle: 'Camisas, bonés e mais',
    to: '/store/nova-home/roupas-acessorios',
    bgImage: 'https://i.postimg.cc/fbDMZQX3/Captura-de-tela-2026-04-13-010217.png',
  },
];

/* ─── AdSenseBanner ─
 * 2026-04-17: "libertado" do container. O AdSense responsive ads precisa medir
 * o parent LIVRE para decidir formato/altura. Qualquer `overflow-hidden`,
 * `min-height` fixa ou padding/border em volta aprisiona o ad (força o Google
 * a servir apenas banners pequenos). Mantemos somente o label "Publicidade",
 * que É recomendado pela política do AdSense (ads precisam estar claramente
 * identificados como publicidade). Nada de bg/border que simule um card.
 */
const AdSenseBanner: React.FC = () => {
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
        data-ad-slot="2918102134"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
};

/* ─── Grid com anúncios a cada 6 produtos ─ */
const CHUNK = 6;
function ProductGridWithAds({ products }: { products: Product[] }) {
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < products.length; i += CHUNK) {
    nodes.push(
      <div key={`c-${i}`} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {products.slice(i, i + CHUNK).map(p => <ProductCard key={p.id} product={p} />)}
      </div>
    );
    if (i + CHUNK < products.length) nodes.push(<AdSenseBanner key={`ad-${i}`} />);
  }
  return <>{nodes}</>;
}

/* ─── StoreLanding ─ */
export default function StoreLanding() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    document.title = "Dente de Tubarão — Linhas de Pipa de Alta Performance | Loja Oficial";
    (async () => {
      try {
        const res = await api.getProducts(300, 0);
        let all = res.products.filter((p: Product) => !p.title.startsWith('Medusa '));
        // Sort by admin-defined rank: ranked products first, then unranked
        all = sortByRank(all);
        setAllProducts(all); setProducts(all);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // ============================================================================
  // "Mais Vendidos" — alimentado pelo RANKING MANUAL do admin (metadata.rank)
  // ----------------------------------------------------------------------------
  // Regras:
  //   • TOP 1–3:  produtos com menor `rank` (1, 2, 3).
  //   • Em Alta:  rank 4, 5, 6.
  //   • Restantes (até 12 no total) preenchem a grid.
  //
  // Estratégia de fallback (graciosa):
  //   • Se há PELO MENOS 1 produto com rank → usamos os ranqueados PRIMEIRO,
  //     e completamos o que faltar (até 12) com produtos sem rank, priorizando
  //     os mais vendidos legados (yards === 3000, carro-chefe histórico).
  //   • Se NENHUM tem rank → cai no comportamento antigo: yards=3000 como
  //     proxy de "mais vendido"; se ainda não tiver 4, lista qualquer coisa.
  //
  // Isso resolve o problema em que o admin definia apenas 3 TOPs e a seção
  // sumia porque `ranked.length < 4` — agora aparece sempre que houver pelo
  // menos 1 rank definido, mantendo a seção estável.
  // ============================================================================
  const bestSellers = React.useMemo(() => {
    const getRank = (p: Product): number | null => {
      const r = p.metadata?.rank;
      if (typeof r === 'number' && !isNaN(r)) return r;
      if (typeof r === 'string' && r.trim() !== '' && !isNaN(Number(r))) return Number(r);
      return null;
    };

    const ranked = allProducts
      .filter(p => getRank(p) !== null)
      .sort((a, b) => (getRank(a)! - getRank(b)!));

    // Há ranking manual? Usa ele e complementa com fallback suave.
    if (ranked.length > 0) {
      const rankedIds = new Set(ranked.map(p => p.id));
      const popFill = allProducts.filter(p => !rankedIds.has(p.id) && p.yards === 3000);
      const anyFill = allProducts.filter(p => !rankedIds.has(p.id) && p.yards !== 3000);
      const filler = [...popFill, ...anyFill];
      return [...ranked, ...filler].slice(0, 12);
    }

    // Sem ranking manual — comportamento legado.
    const pop = allProducts.filter(p => p.yards === 3000);
    return (pop.length >= 4 ? pop : allProducts).slice(0, 12);
  }, [allProducts]);

  const visibleProducts = products.slice(0, visibleCount);
  const hasMore = visibleCount < products.length;

  const handleShowMore = () => {
    setLoadingMore(true);
    setTimeout(() => { setVisibleCount(v => v + 50); setLoadingMore(false); }, 100);
  };

  if (loading) return <LoadingSplash />;

  return (
    <div className="space-y-8 sm:space-y-10 animate-in fade-in duration-500 pb-10">

      {/* 1. Banner principal */}
      <div className="w-[99%] md:w-[80%] mx-auto">
        <img src="/banner-chefao.png" alt="Testado e Aprovado — Chefão da Diamante Pipas usa e recomenda Dente de Tubarão"
          className="w-full rounded-2xl shadow-xl border border-zinc-100" loading="eager" />
      </div>

      {/* 2. Tres linhas profissionais (logo abaixo do banner) — banners INALTERADOS visualmente */}
      <div className="px-2 sm:px-0">
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 uppercase tracking-tight">
            O que você busca hoje?
          </h2>
          <div className="h-[3px] w-8 bg-red-600 mx-auto mt-2 rounded-full" />
        </div>

        <div className="flex flex-col gap-4">
          {RIBBON_CATEGORIES.map((cat) => (
            <Link key={cat.label} to={cat.to}
              className="relative group overflow-hidden rounded-2xl h-24 sm:h-32 flex flex-col justify-center px-6 sm:px-10 border border-zinc-100 shadow-sm transition-all duration-500 hover:shadow-xl hover:-translate-y-1 w-full bg-zinc-50">
              <img src={cat.bgImage} alt={cat.label}
                className="absolute inset-0 w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent z-10" />
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-30 flex items-center justify-between w-full">
                <div>
                  <h3 className="text-white text-lg sm:text-xl font-black tracking-wide uppercase drop-shadow-md group-hover:text-red-500 transition-colors">
                    {cat.label}
                  </h3>
                  <p className="text-zinc-300 text-xs sm:text-sm font-medium mt-0.5 opacity-80">
                    {cat.subtitle}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 group-hover:bg-red-600 group-hover:border-red-600 group-hover:scale-110 transition-all duration-300">
                  <ChevronRight size={18} />
                </div>
              </div>
            </Link>
          ))}

          <Link to="/store/catalogo"
            className="flex items-center justify-center gap-2 w-full py-4 mt-2 rounded-2xl border-2 border-zinc-900 text-zinc-900 font-black text-xs uppercase tracking-[0.2em] transition-all duration-300 hover:bg-zinc-900 hover:text-white active:scale-[0.98]">
            Ver Todos os Produtos <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {/* 3. Top 3 (destaque dedicado para o pódio) */}
      {bestSellers.length >= 1 && (
        <div>
          <div className="flex items-center gap-3 mb-5 px-1 sm:px-0">
            <div className="w-1 h-6 bg-red-600 rounded-full" />
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 uppercase">Top 3</h2>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Mais procurados</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {bestSellers.slice(0, 3).map((p, i) => (
              <ProductCard key={p.id} product={p} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* 4. Mais Vendidos (restante) */}
      {bestSellers.length > 3 && (
        <div>
          <div className="flex items-center gap-3 mb-5 px-1 sm:px-0">
            <div className="w-1 h-6 bg-red-600 rounded-full" />
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 uppercase">Mais Vendidos</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {bestSellers.slice(3).map((p, i) => (
              <ProductCard key={p.id} product={p} isTrending={i < 3} />
            ))}
          </div>
        </div>
      )}

      {/* 5. Anúncio entre seções */}
      <AdSenseBanner />

      {/* 6. Catálogo completo com anúncios intercalados */}
      {products.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-5 px-1 sm:px-0">
            <h2 className="text-lg sm:text-xl font-bold text-zinc-800">Todos os produtos</h2>
          </div>

          <ProductGridWithAds products={visibleProducts} />

          {hasMore && (
            <div className="text-center pt-8">
              <button onClick={handleShowMore} disabled={loadingMore}
                className="bg-white border-2 border-zinc-900 text-zinc-900 px-8 py-3 rounded-xl font-black hover:bg-zinc-900 hover:text-white transition-all disabled:opacity-50 flex items-center gap-3 mx-auto uppercase tracking-wide text-sm">
                {loadingMore && <Loader2 size={18} className="animate-spin" />}
                Carregar mais ({products.length - visibleCount})
              </button>
            </div>
          )}
        </div>
      )}

      {/* 7. Blog CTA */}
      <div className="bg-gradient-to-br from-zinc-900 to-black rounded-3xl border border-zinc-800 p-8 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 rounded-full blur-3xl" />
        <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
          <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-red-600/30">
            <BookOpen size={28} className="text-white" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="font-black text-white text-xl tracking-wide">Blog Oficial Dente de Tubarão</h2>
            <p className="text-sm text-zinc-400 mt-1.5 max-w-xl">Dicas de como escolher a linha ideal por jardas, segurança no combate e segredos de alta performance.</p>
          </div>
          <Link to="/store/blog" className="bg-red-600 text-white px-7 py-3 rounded-xl font-black hover:bg-red-500 transition-colors shrink-0 shadow-md flex items-center gap-2 text-sm">
            Ver Artigos <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}