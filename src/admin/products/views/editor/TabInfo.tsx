import React from 'react';
import { DollarSign, Folder, FolderPlus, Info } from 'lucide-react';
import { Field, INPUT_CLASS, StatusButton } from '../../components/Field';
import { CurrencyInput, formatCents } from '../../components/CurrencyInput';

export interface TabInfoProps {
  title: string; setTitle: (v: string) => void;
  handle: string; setHandle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  /** Preço em CENTAVOS inteiros (ou null quando vazio) */
  priceCents: number | null;
  setPriceCents: (v: number | null) => void;
  status: string; setStatus: (v: string) => void;
  grupo: string; setGrupo: (v: string) => void;
  allGroups: string[];
  showNewGroup: boolean; setShowNewGroup: (v: boolean) => void;
  newGroupName: string; setNewGroupName: (v: string) => void;
  autoHandle: (t: string) => void;
}

export function TabInfo(props: TabInfoProps) {
  const {
    title, setTitle, handle, setHandle, description, setDescription,
    priceCents, setPriceCents, status, setStatus,
    grupo, setGrupo, allGroups,
    showNewGroup, setShowNewGroup, newGroupName, setNewGroupName,
    autoHandle,
  } = props;

  return (
    <>
      <Field label="Titulo" required>
        <input
          value={title}
          onChange={e => { setTitle(e.target.value); autoHandle(e.target.value); }}
          className={INPUT_CLASS}
          placeholder="Ex: SHARK ATTACK 3000j Fio 4.4"
        />
      </Field>

      <Field label="URL (handle)">
        <input
          value={handle}
          onChange={e => setHandle(e.target.value)}
          className={INPUT_CLASS + ' font-mono text-zinc-600'}
          placeholder="shark-attack-3000j"
        />
      </Field>

      <Field label="Preco" required icon={<DollarSign size={11} />}>
        <CurrencyInput
          valueCents={priceCents}
          onChange={setPriceCents}
          className={INPUT_CLASS + ' font-bold text-zinc-900 text-base tracking-tight'}
          placeholder="R$ 0,00"
          aria-label="Preço em reais"
        />
        <p className="text-[10px] text-zinc-500 mt-1.5 flex items-start gap-1">
          <Info size={10} className="shrink-0 mt-0.5 text-blue-500" />
          <span>
            Digite somente os números. Ex: <strong>4390</strong> vira{' '}
            <strong>{formatCents(4390)}</strong>. A vírgula é inserida automaticamente — os dois
            últimos dígitos sempre são os centavos.
          </span>
        </p>
      </Field>

      <Field label="Status">
        <div className="flex gap-2">
          <StatusButton active={status === 'published'} onClick={() => setStatus('published')} variant="pub" />
          <StatusButton active={status === 'draft'}     onClick={() => setStatus('draft')}     variant="draft" />
        </div>
        <p className="text-[10px] text-zinc-400 mt-1.5">
          Produtos em rascunho podem ser editados e testados sem aparecer na loja.
        </p>
      </Field>

      <Field label="Grupo / Marca" icon={<Folder size={11} />}>
        {!showNewGroup ? (
          <div className="flex gap-2">
            <select
              value={grupo}
              onChange={e => setGrupo(e.target.value)}
              className={INPUT_CLASS + ' flex-1 min-w-0 bg-white'}
            >
              <option value="">Detectar automaticamente</option>
              {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button
              onClick={() => setShowNewGroup(true)}
              className="px-3 py-2 rounded-xl border border-dashed border-zinc-300 text-zinc-500 hover:border-blue-400 hover:text-blue-600 text-xs font-medium flex items-center gap-1 shrink-0"
            >
              <FolderPlus size={14} /> Novo
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              className={INPUT_CLASS + ' flex-1 min-w-0 border-blue-300 bg-blue-50/30'}
              placeholder="Nome do novo grupo..."
              autoFocus
            />
            <button
              onClick={() => { setShowNewGroup(false); setNewGroupName(''); }}
              className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-500 text-xs shrink-0"
            >
              Cancelar
            </button>
          </div>
        )}
      </Field>

      <Field label="Descricao">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          className={INPUT_CLASS + ' resize-y'}
          placeholder="Descricao do produto (suporta HTML)..."
        />
      </Field>
    </>
  );
}
