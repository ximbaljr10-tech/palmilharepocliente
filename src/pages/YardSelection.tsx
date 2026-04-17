/**
 * YardSelection.tsx — v3 redesign
 * AdSense slot: 2918102134
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2, HelpCircle, ArrowLeft } from 'lucide-react';
import { Product } from '../types';
import { api } from '../api';
import Breadcrumbs from '../components/Breadcrumbs';

interface YardOption { yards: number; count: number; minPrice: number; }

/* ─── Textura pontilhada no canto (SVG) ─ */
function DotCorner() {
  const dots = [
    { x: 40, y: 5 }, { x: 48, y: 5 },
    { x: 32, y: 13 }, { x: 40, y: 13 }, { x: 48, y: 13 },
    { x: 40, y: 21 }, { x: 48, y: 21 },
    { x: 48, y: 29 },
  ];
  return (
    <svg className="absolute top-0 right-0 w-14 h-10 pointer-events-none opacity-[0.18] group-hover:opacity-40 transition-opacity duration-300" viewBox="0 0 56 40" aria-hidden>
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="2" fill="#dc2626" />)}
    </svg>
  );
}

/* ─── Card de jarda ─ */
function YardCard({ opt }: { opt: YardOption }) {
  return (
    <Link to={`/store/jardas/${opt.yards}`}
      className="relative flex items-center justify-between w-full bg-white rounded-xl border border-zinc-200 px-5 py-4 overflow-hidden hover:border-red-200 hover:shadow-md active:scale-[0.99] transition-all duration-200 group"
    >
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      <DotCorner />
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-zinc-900 group-hover:text-red-700 transition-colors tracking-tight">
            {opt.yards.toLocaleString('pt-BR')}
          </span>
          <span className="text-sm font-medium text-zinc-400 group-hover:text-red-400 transition-colors">jd</span>
        </div>
        <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
          {opt.count} {opt.count === 1 ? 'produto' : 'produtos'}
          <span className="text-zinc-300">·</span>
          a partir de <span className="font-semibold text-zinc-600">R$ {opt.minPrice.toFixed(2).replace('.', ',')}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden sm:block text-[11px] font-semibold text-red-600 px-2.5 py-1 rounded-full bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity">
          Ver produtos
        </span>
        <ChevronRight size={18} className="text-zinc-300 group-hover:text-red-500 transition-colors" />
      </div>
    </Link>
  );
}

/* ─── Bloco de anúncio ─
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
        data-ad-slot="2918102134"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

export default function YardSelection() {
  const [yardOptions, setYardOptions] = useState<YardOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Escolha a Jarda — Linhas | Dente de Tubarão'; }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getProducts(300, 0);
        const all = res.products.filter((p: Product) => !p.title.startsWith('Medusa '));
        const line = all.filter((p: Product) => p.yards != null && p.yards > 0);
        const grouped: Record<number, { count: number; minPrice: number }> = {};
        for (const p of line) {
          const y = p.yards!;
          if (!grouped[y]) grouped[y] = { count: 0, minPrice: p.price };
          grouped[y].count++;
          if (p.price < grouped[y].minPrice) grouped[y].minPrice = p.price;
        }
        setYardOptions(Object.entries(grouped).map(([y, d]) => ({ yards: +y, count: d.count, minPrice: d.minPrice })).sort((a, b) => a.yards - b.yards));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const first = yardOptions.filter(o => o.yards <= 500);
  const second = yardOptions.filter(o => o.yards > 500);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <Loader2 size={28} className="text-red-600 animate-spin" />
      <p className="text-zinc-400 text-sm">Carregando opções…</p>
    </div>
  );

  return (
    <div className="space-y-3 animate-in fade-in duration-400">
      <Breadcrumbs items={[{ label: 'Nova Home', path: '/store/nova-home' }, { label: 'Escolha a Jarda' }]} />

      {/* Header refinado */}
      <div className="rounded-xl bg-zinc-950 px-5 py-5 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.10) 0%, transparent 70%)' }} />
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-zinc-600 mb-2">Linhas disponíveis</p>
        <div className="flex items-center gap-2">
          <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-none">
            {yardOptions[0]?.yards.toLocaleString('pt-BR')}
          </span>
          <span className="text-zinc-700 text-xl font-light">→</span>
          <span className="text-2xl sm:text-3xl font-bold text-red-500 tracking-tight leading-none">
            {yardOptions[yardOptions.length - 1]?.yards.toLocaleString('pt-BR')}
          </span>
          <span className="text-zinc-600 text-xs ml-0.5 mb-0.5 self-end">jardas</span>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">{yardOptions.length} tamanhos · role para ver todos</p>
        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-0.5 pointer-events-none" style={{ scrollbarWidth: 'none' }}>
          {yardOptions.map(o => (
            <span key={o.yards} className="shrink-0 border border-zinc-800 text-zinc-600 text-[10px] font-medium px-2.5 py-1 rounded-full">
              {o.yards.toLocaleString('pt-BR')}
            </span>
          ))}
        </div>
      </div>

      {/* Grupo ≤ 500 */}
      {first.length > 0 && <div className="space-y-2">{first.map(o => <YardCard key={o.yards} opt={o} />)}</div>}

      <AdBlock />

      {/* Grupo > 500 */}
      {second.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-zinc-100" />
            <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-zinc-400">Mais metragens</span>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          {second.map(o => <YardCard key={o.yards} opt={o} />)}
        </div>
      )}

      {yardOptions.length === 0 && <p className="text-center py-12 text-zinc-500 text-sm">Nenhuma jarda disponível.</p>}

      {/* CTA dúvida */}
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
          <HelpCircle size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="font-bold text-zinc-900 text-sm">Não sei qual tamanho escolher</p>
          <p className="text-xs text-zinc-500 mt-0.5">Veja nosso guia para escolher a linha ideal.</p>
        </div>
        <Link to="/store/blog/como-escolher-linha-pipa" className="bg-amber-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors shrink-0">
          Ver guia
        </Link>
      </div>

      <div className="text-center pb-4">
        <Link to="/store/nova-home" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-red-600 transition-colors">
          <ArrowLeft size={14} /> Voltar para a loja
        </Link>
      </div>
    </div>
  );
}