// ============================================================================
// HomeDashboard - TELA INICIAL de Produtos
// Mostra CAMINHOS claros (o usuário escolhe o que quer fazer) em vez de
// despejar uma lista confusa de produtos.
// ============================================================================

import React from 'react';
import {
  PlusCircle, ListOrdered, Palette, TrendingUp, Ruler, LayoutGrid,
  ChevronRight, Package, Eye, EyeOff, AlertTriangle, Loader2,
} from 'lucide-react';
import { StatTile } from '../components/Pills';
import type { ParsedProduct, ViewMode } from '../types';

interface Stats {
  total: number;
  published: number;
  draft: number;
  noColors: number;
  withRank: number;
  outOfStock: number;
}

interface HomeDashboardProps {
  stats: Stats;
  loading: boolean;
  products: ParsedProduct[];
  onNavigate: (v: ViewMode) => void;
  onNewProduct: () => void;
}

export function HomeDashboard({
  stats, loading, products, onNavigate, onNewProduct,
}: HomeDashboardProps) {
  // Extrai jardas únicas para Yard Studio
  const yardsCount = new Set(
    products.filter(p => p._yards !== null).map(p => p._yards)
  ).size;
  const groupsCount = new Set(products.map(p => p._group)).size;

  return (
    <div className="space-y-3 pb-10">
      {/* Stats rápidas */}
      <div className="grid grid-cols-4 gap-1.5">
        <StatTile label="Total" value={stats.total} tone="zinc" />
        <StatTile label="Pub" value={stats.published} tone="emerald" />
        <StatTile label="Rasc" value={stats.draft} tone="amber" />
        <StatTile label="Rank" value={stats.withRank} tone="blue" />
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-500">Carregando produtos...</span>
        </div>
      )}

      {/* Alertas automáticos que direcionam o usuário */}
      {!loading && (stats.noColors > 0 || stats.outOfStock > 0 || stats.draft > 0) && (
        <div className="space-y-1.5">
          {stats.noColors > 0 && (
            <AlertCard
              tone="purple"
              icon={<Palette size={16} />}
              title={`${stats.noColors} produto(s) sem cores`}
              subtitle="Adicione cores em massa com poucos cliques"
              onClick={() => onNavigate('colors')}
            />
          )}
          {stats.outOfStock > 0 && (
            <AlertCard
              tone="red"
              icon={<AlertTriangle size={16} />}
              title={`${stats.outOfStock} sem estoque`}
              subtitle="Revisar produtos com estoque zerado"
              onClick={() => onNavigate('list')}
            />
          )}
          {stats.draft > 0 && (
            <AlertCard
              tone="amber"
              icon={<EyeOff size={16} />}
              title={`${stats.draft} em rascunho`}
              subtitle="Publique produtos prontos na loja"
              onClick={() => onNavigate('list')}
            />
          )}
        </div>
      )}

      {/* Ação principal: criar novo */}
      <button
        onClick={onNewProduct}
        className="w-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
      >
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <PlusCircle size={22} />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-base font-bold">Adicionar Produto</p>
          <p className="text-[12px] text-emerald-50/90 truncate">
            Criar um novo produto do zero (com preco, fotos, cores)
          </p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-white/80" />
      </button>

      {/* Caminhos especializados - cada um leva a uma ferramenta focada */}
      <div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 px-1">
          O que voce quer fazer?
        </p>
        <div className="space-y-1.5">
          <PathCard
            icon={<Palette size={20} />}
            tone="purple"
            title="Gerenciar Cores"
            subtitle={`Ajustar cores de varios produtos de uma vez (${stats.noColors > 0 ? stats.noColors + ' sem cor' : 'visao por grupos'})`}
            hint="Ideal para ajustar linhas e estoques de cor"
            onClick={() => onNavigate('colors')}
          />
          <PathCard
            icon={<Ruler size={20} />}
            tone="blue"
            title="Gerenciar por Jardas"
            subtitle={`Agrupar por jardas (${yardsCount} jardas diferentes)`}
            hint="Trabalhar com uma jarda especifica"
            onClick={() => onNavigate('yards')}
          />
          <PathCard
            icon={<TrendingUp size={20} />}
            tone="amber"
            title="Ajustar Ranking"
            subtitle={`Definir quem aparece primeiro (${stats.withRank} com rank)`}
            hint="Arrastar para reordenar visualmente"
            onClick={() => onNavigate('rank')}
          />
          <PathCard
            icon={<LayoutGrid size={20} />}
            tone="zinc"
            title="Ver Lista Completa"
            subtitle={`Buscar, filtrar e editar (${stats.total} produtos)`}
            hint="Modo tradicional com todos os filtros"
            onClick={() => onNavigate('list')}
          />
        </div>
      </div>

      {/* Rodapé informativo */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-[11px] text-blue-900 flex items-start gap-2">
        <Package size={13} className="shrink-0 mt-0.5 text-blue-500" />
        <div className="min-w-0">
          <strong>Dica:</strong> Cada caminho acima e focado numa tarefa. Se voce so quer mexer em cores, escolha "Gerenciar Cores" — a selecao em massa fica mais simples.
        </div>
      </div>
    </div>
  );
}

// ------------------------ Sub-components ------------------------

function PathCard({
  icon, tone, title, subtitle, hint, onClick,
}: {
  icon: React.ReactNode;
  tone: 'purple' | 'blue' | 'amber' | 'zinc';
  title: string;
  subtitle: string;
  hint: string;
  onClick: () => void;
}) {
  const tones: Record<string, { bg: string; text: string; border: string }> = {
    purple: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'hover:border-purple-300' },
    blue:   { bg: 'bg-blue-100',   text: 'text-blue-600',   border: 'hover:border-blue-300' },
    amber:  { bg: 'bg-amber-100',  text: 'text-amber-600',  border: 'hover:border-amber-300' },
    zinc:   { bg: 'bg-zinc-100',   text: 'text-zinc-600',   border: 'hover:border-zinc-300' },
  };
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      className={`w-full bg-white rounded-2xl border border-zinc-200 p-3 flex items-center gap-3 text-left transition-all ${t.border} active:scale-[0.99]`}
    >
      <div className={`w-11 h-11 rounded-xl ${t.bg} ${t.text} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-900">{title}</p>
        <p className="text-[11px] text-zinc-500 truncate">{subtitle}</p>
        <p className="text-[10px] text-zinc-400 mt-0.5 italic truncate">{hint}</p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-zinc-300" />
    </button>
  );
}

function AlertCard({
  tone, icon, title, subtitle, onClick,
}: {
  tone: 'purple' | 'red' | 'amber';
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  const tones: Record<string, { bg: string; border: string; text: string; subtext: string; iconBg: string }> = {
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', subtext: 'text-purple-600', iconBg: 'bg-purple-100 text-purple-600' },
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-900',    subtext: 'text-red-600',    iconBg: 'bg-red-100 text-red-600' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-900',  subtext: 'text-amber-600',  iconBg: 'bg-amber-100 text-amber-600' },
  };
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      className={`w-full ${t.bg} ${t.border} border rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-left active:scale-[0.99] transition-all`}
    >
      <div className={`w-8 h-8 rounded-lg ${t.iconBg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${t.text} truncate`}>{title}</p>
        <p className={`text-[11px] ${t.subtext} truncate`}>{subtitle}</p>
      </div>
      <ChevronRight size={16} className={`shrink-0 ${t.subtext}`} />
    </button>
  );
}
