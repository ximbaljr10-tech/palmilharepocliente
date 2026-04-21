/**
 * CategoryCatalog.tsx — v3 redesign
 * AdSense slot: 6148016699
 * Anúncio a cada 6 produtos (3 fileiras mobile)
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Loader2, ShoppingBag, ArrowLeft } from 'lucide-react';
import { Product, needsColorSelection } from '../types';
import { useCart } from '../CartContext';
import { api } from '../api';
import Breadcrumbs from '../components/Breadcrumbs';

/* ─── Classificadores ─ */
function isLineProduct(p: Product): boolean {
  if (p.yards != null && p.yards > 0) return true;
  const t = (p.title || '').toLowerCase();
  if (/\bfio\s*[\d]/i.test(t)) return true;
  if (/\b(shark\s*attack|king\s*shark|indon[eé]sia|aero\s*fun|linha\s*(pura|dente|indian))\b/i.test(t)) return true;
  return false;
}
function isCarretilha(p: Product): boolean { return /carretilha/i.test(p.title || ''); }

interface CategoryDef { title: string; subtitle: string; breadcrumbLabel: string; pageTitle: string; emptyMessage: string; filter: (p: Product) => boolean; }

const CATEGORIES: Record<string, CategoryDef> = {
  carretilhas: {
    title: 'Carretilhas', subtitle: 'Chilenas, Catraca, Madeira, Rolamento e mais',
    breadcrumbLabel: 'Carretilhas', pageTitle: 'Carretilhas — Dente de Tubarão',
    emptyMessage: 'Nenhuma carretilha disponível no momento.',
    filter: p => isCarretilha(p),
  },
  'roupas-acessorios': {
    title: 'Roupas e Acessórios', subtitle: 'Camisas, bonés, adesivos e mais',
    breadcrumbLabel: 'Roupas e Acessórios', pageTitle: 'Roupas e Acessórios — Dente de Tubarão',
    emptyMessage: 'Nenhum produto disponível no momento.',
    filter: p => !isLineProduct(p) && !isCarretilha(p),
  },
};

/* ─── AdBlock — slot yardcatalog/category ─
 * 2026-04-17: libertado do container com overflow-hidden/min-h fixa.
 */
function AdBlock() {
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
        data-ad-slot="6148016699"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

/* ─── ProductCard ─ */
const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
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
    <div className="bg-white rounded-xl border border-zinc-100 overflow-hidden flex flex-col hover:shadow-md hover:border-zinc-200 transition-all duration-200">
      <Link to={`/store/product/${product.id}`} className="aspect-square bg-zinc-50 overflow-hidden relative">
        {product.image_url
          ? <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">Sem imagem</div>
        }
        {isAdding && (
          <div className="absolute inset-0 bg-red-600/10 flex items-center justify-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${showCheck ? 'bg-red-600 scale-100' : 'bg-red-600/70 scale-75'}`}>
              {showCheck
                ? <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                : <Loader2 size={20} className="text-white animate-spin" />
              }
            </div>
          </div>
        )}
      </Link>
      <div className="p-2.5 sm:p-3 flex flex-col flex-grow">
        <Link to={`/store/product/${product.id}`} title={product.title}
          className="text-[11px] sm:text-xs font-medium text-zinc-800 hover:text-red-600 line-clamp-3 mb-2 leading-snug transition-colors">
          {product.title}
        </Link>
        <div className="mt-auto">
          <span className="block text-sm sm:text-base font-bold text-zinc-900 mb-1.5">
            R$ {product.price.toFixed(2).replace('.', ',')}
          </span>
          <button onClick={handleBuy} disabled={isAdding}
            className={`w-full py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 ${isAdding ? 'bg-red-600 text-white' : 'bg-zinc-900 text-white hover:bg-zinc-700 active:scale-95'}`}>
            {showCheck
              ? <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Adicionado!</>
              : isAdding ? <Loader2 size={14} className="animate-spin" />
              : requiresColor ? 'Escolher Cores' : 'Comprar'
            }
          </button>
        </div>
      </div>
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
    if (i + CHUNK < products.length) nodes.push(<AdBlock key={`ad-${i}`} />);
  }
  return <>{nodes}</>;
}

export default function CategoryCatalog() {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const catDef = category ? CATEGORIES[category] : undefined;

  useEffect(() => {
    if (!catDef) return;
    document.title = catDef.pageTitle;
    (async () => {
      try {
        const res = await api.getProducts(300, 0);
        const all = res.products.filter((p: Product) => !p.title.startsWith('Medusa '));
        // Sort by admin rank, then show
        const filtered = all.filter(catDef.filter);
        const getRank = (p: Product): number | null => {
          const r = p.metadata?.rank;
          if (typeof r === 'number' && !isNaN(r)) return r;
          if (typeof r === 'string' && r.trim() !== '' && !isNaN(Number(r))) return Number(r);
          return null;
        };
        const ranked = filtered.filter(p => getRank(p) !== null).sort((a, b) => getRank(a)! - getRank(b)!);
        const unranked = filtered.filter(p => getRank(p) === null);
        setProducts([...ranked, ...unranked]);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [category]);

  if (!catDef) return (
    <div className="text-center py-20">
      <h2 className="text-xl font-bold text-zinc-900 mb-4">Categoria não encontrada</h2>
      <button onClick={() => navigate('/store/nova-home')} className="text-red-600 font-bold hover:underline">Voltar para a loja</button>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <Loader2 size={32} className="text-red-600 animate-spin" />
      <p className="text-zinc-400 text-sm">Carregando {catDef.title.toLowerCase()}…</p>
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <Breadcrumbs items={[{ label: 'Nova Home', path: '/store/nova-home' }, { label: catDef.breadcrumbLabel }]} />
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">{catDef.title}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {catDef.subtitle} · {products.length} {products.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
        </p>
      </div>

      {products.length === 0
        ? (
          <div className="text-center py-16 bg-white rounded-xl border border-zinc-100">
            <ShoppingBag size={36} className="text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 font-medium">{catDef.emptyMessage}</p>
            <Link to="/store/nova-home" className="inline-block mt-3 text-red-600 font-bold hover:underline text-sm">Voltar para a loja</Link>
          </div>
        )
        : <ProductGridWithAds products={products} />
      }

      <div className="text-center pb-4">
        <Link to="/store/nova-home" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-red-600 transition-colors">
          <ArrowLeft size={14} /> Voltar para a loja
        </Link>
      </div>
    </div>
  );
}