// ============================================================================
// ProductEditor - Orquestra a view de edição (One Page, sem abas)
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, PlusCircle, Pencil, Save, Loader2, Flag,
  AlertTriangle, X,
} from 'lucide-react';
import { SKIP_COLOR_YARDS } from '../../../../types';
import type { ColorItem, ParsedProduct } from '../../types';
import { StatusDot } from '../../components/StatusDot';
import { RankPill } from '../../components/RankPill';
import { centsToReais, reaisToCents } from '../../components/CurrencyInput';
import { TabInfo } from './TabInfo';
import { TabImages } from './TabImages';
import { TabColors } from './TabColors';
import { TabRank } from './TabRank';
import { TabShipping } from './TabShipping';

export interface EditorSavePayload {
  title: string;
  handle?: string;
  description: string;
  status: string;
  price: number;
  shipping_height: number | null;
  shipping_width: number | null;
  shipping_length: number | null;
  shipping_weight: number | null;
  images: string[];
  grupo?: string;
  rank: number | null;
  colors?: ColorItem[];
  isNew: boolean;
}

export function ProductEditor({
  product, allGroups, onSave, onClose, saving,
}: {
  product: ParsedProduct | null;
  allGroups: string[];
  onSave: (data: EditorSavePayload) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const isNew = !product;

  const [title, setTitle] = useState(product?.title || '');
  const [handle, setHandle] = useState(product?.handle || '');
  const [description, setDescription] = useState(product?.description || '');
  const [status, setStatus] = useState(product?.status || 'draft');
  const [priceCents, setPriceCents] = useState<number | null>(
    product ? reaisToCents(product._price) : null
  );
  const [shHeight, setShHeight] = useState(String(product?._shippingHeight || ''));
  const [shWidth, setShWidth] = useState(String(product?._shippingWidth || ''));
  const [shLength, setShLength] = useState(String(product?._shippingLength || ''));
  const [shWeight, setShWeight] = useState(String(product?._shippingWeight || ''));
  const [images, setImages] = useState<{ id?: string; url: string; file?: File }[]>(product?.images || []);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [grupo, setGrupo] = useState(product?.metadata?.grupo || product?._group || '');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [rank, setRank] = useState<string>(
    product?._rank !== null && product?._rank !== undefined ? String(product._rank) : ''
  );

  const needsColorFromProduct = product ? product._needsColorSelection : false;
  const [colors, setColors] = useState<ColorItem[]>(product?._availableColors || []);
  const [colorChanged, setColorChanged] = useState(false);

  const currentYards = useMemo(() => {
    const m = title.match(/(\d+)\s*(j|jds|jardas)\b/i);
    return m ? parseInt(m[1], 10) : null;
  }, [title]);

  const showColorSection = useMemo(() => {
    if (product) return needsColorFromProduct;
    if (currentYards === null) return false;
    return !SKIP_COLOR_YARDS.includes(currentYards);
  }, [product, needsColorFromProduct, currentYards]);

  const autoHandle = (t: string) => {
    if (isNew || !product?.handle) {
      setHandle(
        t.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      );
    }
  };

  const handleSubmit = () => {
    const errs: string[] = [];
    if (!title.trim()) errs.push('Titulo obrigatorio');
    if (priceCents === null || priceCents <= 0) errs.push('Preco invalido');
    let rankValue: number | null = null;
    if (rank.trim() !== '') {
      const n = Number(rank);
      if (isNaN(n) || n < 0) errs.push('Posicao deve ser um numero >= 0');
      else rankValue = Math.floor(n);
    }
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    const finalGroup = showNewGroup && newGroupName.trim() ? newGroupName.trim() : grupo;

    const priceReais = centsToReais(priceCents);

    onSave({
      title: title.trim(),
      handle: handle.trim() || undefined,
      description: description.trim(),
      status,
      price: priceReais,
      shipping_height: Number(shHeight) || null,
      shipping_width: Number(shWidth) || null,
      shipping_length: Number(shLength) || null,
      shipping_weight: Number(shWeight) || null,
      images: images.map(i => i.url),
      grupo: finalGroup,
      rank: rankValue,
      colors: colorChanged ? colors : undefined,
      isNew,
    });
  };

  return (
    <div className="fixed inset-0 bg-zinc-50 z-50 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-zinc-200 px-3 py-2.5 flex items-center gap-2 shrink-0 shadow-sm">
        <button onClick={onClose} className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-xl shrink-0" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5 truncate">
            {isNew
              ? <><PlusCircle size={14} className="text-emerald-600 shrink-0" /> Novo produto</>
              : <><Pencil size={14} className="text-blue-600 shrink-0" /> <span className="truncate">{product?.title || 'Editar'}</span></>
            }
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <StatusDot status={status} />
            <span className="text-[10px] text-zinc-500 font-medium">
              {status === 'published' ? 'Publicado' : 'Rascunho'}
            </span>
            {!isNew && product?._rank !== null && product?._rank !== undefined && (
              <RankPill rank={product._rank} />
            )}
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          <span>{saving ? '...' : 'Salvar'}</span>
        </button>
      </div>

      {!isNew && status === 'draft' && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-[11px] text-amber-900 flex items-center gap-2 shrink-0">
          <Flag size={12} className="shrink-0" />
          <span className="flex-1 min-w-0">
            <strong>Modo Rascunho</strong> — voce pode editar e testar livremente. Nao aparece na loja.
          </span>
        </div>
      )}

      {errors.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-2 text-[12px] text-red-700 shrink-0">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {errors.map((e, i) => <p key={i} className="break-words">- {e}</p>)}
            </div>
            <button onClick={() => setErrors([])} className="text-red-400 p-1 shrink-0">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-3 py-6 pb-28 space-y-8">
          
          <section>
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Informações Básicas</h3>
            <TabInfo
              title={title} setTitle={setTitle}
              handle={handle} setHandle={setHandle}
              description={description} setDescription={setDescription}
              priceCents={priceCents} setPriceCents={setPriceCents}
              status={status} setStatus={setStatus}
              grupo={grupo} setGrupo={setGrupo}
              allGroups={allGroups}
              showNewGroup={showNewGroup} setShowNewGroup={setShowNewGroup}
              newGroupName={newGroupName} setNewGroupName={setNewGroupName}
              autoHandle={autoHandle}
            />
          </section>

          <hr className="border-zinc-200" />

          <section>
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Imagens</h3>
            <TabImages
              images={images}
              setImages={setImages}
              uploading={uploadingImage}
              setUploading={setUploadingImage}
              setErrors={setErrors}
            />
          </section>

          {showColorSection && (
            <>
              <hr className="border-zinc-200" />
              <section>
                <h3 className="text-lg font-bold text-zinc-900 mb-4">Cores Disponíveis</h3>
                <TabColors
                  product={product}
                  colors={colors}
                  setColors={setColors}
                  colorChanged={colorChanged}
                  setColorChanged={setColorChanged}
                  currentYards={currentYards}
                  showColorSection={showColorSection}
                />
              </section>
            </>
          )}

          <hr className="border-zinc-200" />

          <section>
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Frete e Dimensões</h3>
            <TabShipping
              title={title}
              shHeight={shHeight} setShHeight={setShHeight}
              shWidth={shWidth} setShWidth={setShWidth}
              shLength={shLength} setShLength={setShLength}
              shWeight={shWeight} setShWeight={setShWeight}
            />
          </section>

          <hr className="border-zinc-200" />

          <section>
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Organização</h3>
            <TabRank rank={rank} setRank={setRank} />
          </section>

        </div>
      </div>

      <div
        className="sm:hidden bg-white border-t border-zinc-200 px-3 py-2 shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-blue-600 text-white px-4 py-3.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Salvando...' : isNew ? 'Criar Produto' : 'Salvar alteracoes'}
        </button>
      </div>
    </div>
  );
}
