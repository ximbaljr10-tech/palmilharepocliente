/**
 * YardCatalog.tsx — v3 redesign
 * AdSense slot: 6148016699
 * Anúncio a cada 6 produtos (3 fileiras no mobile, 2 no tablet, 1.5 no desktop)
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Loader2, ShoppingBag, ChevronDown } from 'lucide-react';
import { Product, needsColorSelection } from '../types';
import { useCart } from '../CartContext';
import { api } from '../api';
import Breadcrumbs from '../components/Breadcrumbs';

/* ─── AdBlock — slot yardcatalog ─
 * 2026-04-17: removida a "prisão CSS" (overflow-hidden/min-h/border/bg).
 * Ad responsive precisa de parent livre para escolher tamanho.
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
        {/*
          Nome completo: line-clamp-3 + fonte pequena para caber sem quebrar o grid.
          O CSS grid equaliza a altura das linhas automaticamente.
          title= garante tooltip nativo para nomes extremamente longos.
        */}
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

/* ─── Grid com anúncios a cada 6 produtos (3 fileiras mobile) ─ */
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

/* ─── Sticky yard bar ─ */
function StickyYardBar({ yardNumber }: { yardNumber: number }) {
  const label = yardNumber >= 1000 ? `${yardNumber.toLocaleString('pt-BR')} jardas` : `${yardNumber} jardas`;
  return (
    <div className="sticky top-[60px] z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
      <Link to="/store/nova-home/jardas"
        className="flex items-center justify-center gap-2 w-full py-2.5 bg-red-700 text-white font-bold text-sm rounded-b-xl shadow-md hover:bg-red-800 active:scale-[0.99] transition-all duration-200">
        <span>{label}</span>
        <ChevronDown size={16} className="opacity-70" />
        <span className="text-[11px] font-medium opacity-70 ml-0.5">Trocar jarda</span>
      </Link>
    </div>
  );
}

export default function YardCatalog() {
  const { yard } = useParams<{ yard: string }>();
  const yardNumber = yard ? parseInt(yard, 10) : 0;
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!yardNumber || isNaN(yardNumber)) return;
    document.title = `Linhas de ${yardNumber} Jardas — Dente de Tubarão`;
    (async () => {
      try {
        const res = await api.getProducts(300, 0);
        const all = res.products.filter((p: Product) => !p.title.startsWith('Medusa '));
        setProducts(all.filter((p: Product) => p.yards === yardNumber));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [yardNumber]);

  if (!yardNumber || isNaN(yardNumber)) return (
    <div className="text-center py-20">
      <h2 className="text-xl font-bold text-zinc-900 mb-4">Jarda inválida</h2>
      <button onClick={() => navigate('/store/nova-home/jardas')} className="text-red-600 font-bold hover:underline">Escolher outra jarda</button>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <Loader2 size={32} className="text-red-600 animate-spin" />
      <p className="text-zinc-400 text-sm">Carregando linhas de {yardNumber} jardas…</p>
    </div>
  );

  const label = yardNumber >= 1000 ? `${yardNumber.toLocaleString('pt-BR')} jardas` : `${yardNumber} jardas`;

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <StickyYardBar yardNumber={yardNumber} />
      <Breadcrumbs items={[
        { label: 'Nova Home', path: '/store/nova-home' },
        { label: 'Escolha a Jarda', path: '/store/nova-home/jardas' },
        { label: label },
      ]} />
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">Linhas de {label}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {products.length} {products.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
        </p>
      </div>

      {products.length === 0
        ? (
          <div className="text-center py-16 bg-white rounded-xl border border-zinc-100">
            <ShoppingBag size={36} className="text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 font-medium">Nenhum produto disponível em {label}</p>
            <Link to="/store/nova-home/jardas" className="inline-block mt-3 text-red-600 font-bold hover:underline text-sm">Escolher outra jarda</Link>
          </div>
        )
        : <ProductGridWithAds products={products} />
      }
    </div>
  );
}