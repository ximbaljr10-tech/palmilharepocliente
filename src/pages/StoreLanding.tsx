/**
 * StoreLanding.tsx — NOVA PÁGINA DE ENTRADA (teste de UX)
 *
 * Rota: /store/nova-home
 * Objetivo: testar uma nova experiência de entrada mobile-first,
 *           SEM substituir a home atual (/store → Home.tsx).
 *
 * Esta página NÃO substitui Home.tsx.
 * Esta página NÃO é carregada por padrão.
 * Ela existe apenas para testes manuais via URL direta.
 *
 * Criada em: 2026-04-12
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, Loader2, HelpCircle, ChevronRight, Star, Megaphone } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../CartContext';
import { api } from '../api';

const LOGO_URL =
  'https://d1a9qnv764bsoo.cloudfront.net/stores/002/383/186/themes/common/logo-2076434406-1663802435-2137b08583cacd89f0378fc3f37146e01663802435.png?0';

/* ─── Yard option buttons ─── */
const YARD_OPTIONS = [200, 500, 1000, 3000, 6000, 12000] as const;

/* ─── Mini product card used in the "Mais vendidos" section ─── */
const MiniProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/store/product/${product.id}`)}
      className="flex-shrink-0 w-36 sm:w-44 bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden text-left hover:shadow-md transition-shadow snap-start"
    >
      <div className="aspect-square bg-zinc-100 overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">
            Sem foto
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-medium text-zinc-800 line-clamp-2 leading-snug">
          {product.title}
        </p>
        <p className="mt-1.5 text-sm font-bold text-zinc-900">
          R$ {product.price.toFixed(2).replace('.', ',')}
        </p>
      </div>
    </button>
  );
};

/* ─── Main component ─── */
export default function StoreLanding() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  /* Load products once */
  useEffect(() => {
    document.title = 'Dente de Tubarao — Entrada Nova (Teste UX)';
    (async () => {
      try {
        const res = await api.getProducts(300, 0);
        const all = res.products.filter((p: Product) => !p.title.startsWith('Medusa '));
        setProducts(all);
      } catch (err) {
        console.error('StoreLanding: erro ao carregar produtos', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* Best sellers: top 8 cheapest products from the most popular yard (3000) */
  const bestSellers = React.useMemo(() => {
    const popular = products.filter((p) => p.yards === 3000);
    if (popular.length >= 4) return popular.slice(0, 8);
    // Fallback: any first 8 products
    return products.slice(0, 8);
  }, [products]);

  /* Navigate when searching */
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // Navigate to the main store with search term (existing flow)
    navigate(`/store?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  /* Navigate to main store filtered by yard */
  const handleYardClick = (yard: number) => {
    // Uses existing /store page which already supports yards filter
    navigate(`/store`);
    // Note: The existing Home.tsx doesn't support URL query params for yard
    // For now, navigating to /store. In the future a dedicated yard page
    // can be created at /store/jardas/:yard
  };

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-6 animate-fade-in">
        <img
          src={LOGO_URL}
          alt="Dente de Tubarao"
          className="h-16 sm:h-20 object-contain animate-pulse"
          referrerPolicy="no-referrer"
        />
        <div className="w-48 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-red-600 via-emerald-500 to-red-600 rounded-full animate-loading-bar" />
        </div>
        <p className="text-zinc-400 text-sm">Carregando vitrine...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ═══════════════════════════════════════════════════════
          1. BANNER PRINCIPAL — altura controlada, impacto visual
          ═══════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden rounded-2xl shadow-md">
        <img
          src="/banner-chefao.png"
          alt="Testado e Aprovado - Chefao da Diamante Pipas usa Dente de Tubarao"
          className="w-full h-40 sm:h-52 md:h-60 object-cover"
          loading="eager"
        />
        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <div>
            <p className="text-white font-bold text-base sm:text-lg drop-shadow-lg leading-tight">
              Linhas de Pipa
            </p>
            <p className="text-white/80 text-xs sm:text-sm drop-shadow">
              Alta performance para quem leva a sério
            </p>
          </div>
          <img
            src={LOGO_URL}
            alt="Logo"
            className="h-8 sm:h-10 object-contain drop-shadow-lg"
            referrerPolicy="no-referrer"
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          2. MAIS VENDIDOS — produtos visíveis cedo (horizontal scroll)
          ═══════════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Star size={18} className="text-amber-500" />
            Mais vendidos
          </h2>
          <Link
            to="/store"
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5"
          >
            Ver todos <ChevronRight size={14} />
          </Link>
        </div>

        {bestSellers.length === 0 ? (
          <p className="text-zinc-400 text-sm py-6 text-center">Nenhum produto disponivel.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory -mx-1 px-1">
            {bestSellers.map((p) => (
              <MiniProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════
          3. ESCOLHA SUA JARDA — botoes grandes, compactos
          ═══════════════════════════════════════════════════════ */}
      <section className="bg-white rounded-2xl border border-zinc-100 p-4 sm:p-5 shadow-sm">
        <h2 className="text-base font-bold text-zinc-900 mb-3">Escolha sua jarda</h2>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {YARD_OPTIONS.map((yard) => (
            <button
              key={yard}
              onClick={() => handleYardClick(yard)}
              className="bg-zinc-50 hover:bg-emerald-50 border border-zinc-200 hover:border-emerald-400 rounded-xl py-3 sm:py-3.5 text-center transition-all active:scale-95 group"
            >
              <span className="text-lg sm:text-xl font-bold text-zinc-800 group-hover:text-emerald-700 transition-colors">
                {yard >= 1000 ? `${(yard / 1000).toFixed(0)}k` : yard}
              </span>
              <span className="block text-[10px] sm:text-xs text-zinc-400 group-hover:text-emerald-500 font-medium">
                jardas
              </span>
            </button>
          ))}
        </div>

        {/* CTA "Nao sei qual escolher" */}
        <button
          onClick={() => {
            // TODO: No futuro, levar para /store/guia-jardas ou seção de ajuda
            // Por agora, navega para a loja principal
            navigate('/store');
          }}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-zinc-200 text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 transition-all text-sm font-medium"
        >
          <HelpCircle size={16} />
          Nao sei qual escolher
        </button>
      </section>

      {/* ═══════════════════════════════════════════════════════
          4. BUSCA — campo acessivel sem poluir o topo
          ═══════════════════════════════════════════════════════ */}
      <section className="bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              placeholder="Buscar linhas, carretilhas, acessorios..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
            />
          </div>
          <button
            type="submit"
            className="bg-zinc-900 text-white px-4 rounded-xl text-sm font-medium hover:bg-zinc-800 active:scale-95 transition-all shrink-0"
          >
            Buscar
          </button>
        </form>
      </section>

      {/* ═══════════════════════════════════════════════════════
          5. CATEGORIAS RAPIDAS — acesso rapido a tipos de produto
          ═══════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-2 gap-3">
        <Link
          to="/store"
          className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow-sm hover:shadow-md transition-shadow"
        >
          <ShoppingBag size={20} className="mb-1.5 opacity-80" />
          <p className="font-bold text-sm">Todas as Linhas</p>
          <p className="text-[10px] opacity-70 mt-0.5">{products.length} produtos</p>
        </Link>
        <Link
          to="/store/blog"
          className="bg-gradient-to-br from-zinc-700 to-zinc-800 rounded-2xl p-4 text-white shadow-sm hover:shadow-md transition-shadow"
        >
          <Megaphone size={20} className="mb-1.5 opacity-80" />
          <p className="font-bold text-sm">Blog e Dicas</p>
          <p className="text-[10px] opacity-70 mt-0.5">Aprenda sobre linhas</p>
        </Link>
      </section>

      {/* ═══════════════════════════════════════════════════════
          6. ESPACO PARA ANUNCIOS — estrutura preparada, sem conteudo real
          ═══════════════════════════════════════════════════════ */}
      {/* 
        Placeholder para anuncio futuro.
        Descomente o bloco abaixo quando houver conteudo de anuncio pronto.
        Nao exibe nada por padrao para nao poluir a primeira dobra.
      */}
      {/*
      <section className="bg-zinc-50 border border-zinc-200 border-dashed rounded-2xl p-4 text-center">
        <p className="text-xs text-zinc-400">Espaco reservado para anuncios</p>
      </section>
      */}

      {/* ═══════════════════════════════════════════════════════
          AMOSTRA DE TODOS OS PRODUTOS — grid compacto
          ═══════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-base font-bold text-zinc-900 mb-3">Explore nosso catalogo</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.slice(0, 12).map((product) => (
            <Link
              key={product.id}
              to={`/store/product/${product.id}`}
              className="bg-white rounded-xl border border-zinc-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="aspect-square bg-zinc-100 overflow-hidden">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">
                    Sem foto
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-medium text-zinc-800 line-clamp-2 leading-snug">
                  {product.title}
                </p>
                <p className="mt-1 text-sm font-bold text-zinc-900">
                  R$ {product.price.toFixed(2).replace('.', ',')}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {products.length > 12 && (
          <div className="text-center mt-4">
            <Link
              to="/store"
              className="inline-flex items-center gap-2 bg-zinc-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors"
            >
              Ver todos os produtos
              <ChevronRight size={16} />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
