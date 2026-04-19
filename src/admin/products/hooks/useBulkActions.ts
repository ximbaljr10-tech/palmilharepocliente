// ============================================================================
// useBulkActions - todas as operações em massa (status, color, rank, reorder)
// ============================================================================

import { useCallback, useState } from 'react';
import { adminFetch } from '../../adminApi';
import type { ColorItem, ParsedProduct } from '../types';
import { buildColorConfigKey, getColorHex } from '../utils/parser';

interface BulkDeps {
  products: ParsedProduct[];
  patchProduct: (id: string, patch: Partial<ParsedProduct>) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

async function patchMetadataAPI(productId: string, patch: Record<string, any>) {
  const productData = await adminFetch(`/admin/produtos-custom/${productId}`);
  const currentMetadata = productData.product?.metadata || {};
  const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
    method: 'POST',
    body: JSON.stringify({ metadata: { ...currentMetadata, ...patch } }),
  });
  if (!result.success) throw new Error(result.errors?.join(', ') || 'Erro');
  return { ...currentMetadata, ...patch };
}

export function useBulkActions({ products, patchProduct, showToast }: BulkDeps) {
  const [bulkSaving, setBulkSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // -------------------- Status individual --------------------
  const applyStatus = useCallback(async (productId: string, newStatus: string) => {
    setSavingId(productId);
    try {
      const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!result.success) throw new Error(result.errors?.join(', ') || 'Erro');
      patchProduct(productId, { status: newStatus });
      showToast(`Produto ${newStatus === 'published' ? 'publicado' : 'despublicado'}!`, 'success');
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setSavingId(null);
    }
  }, [patchProduct, showToast]);

  // -------------------- Rank individual --------------------
  const applyQuickRank = useCallback(async (productId: string, rank: number | null) => {
    setSavingId(productId);
    try {
      const newMeta = await patchMetadataAPI(productId, { rank });
      patchProduct(productId, { metadata: newMeta, _rank: rank });
      showToast(rank === null ? 'Posicao removida' : `Posicao: #${rank}`, 'success');
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setSavingId(null);
    }
  }, [patchProduct, showToast]);

  // -------------------- Status em massa --------------------
  const applyBulkStatus = useCallback(async (productIds: string[], newStatus: string) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;
    for (const pid of productIds) {
      try {
        const result = await adminFetch(`/admin/produtos-custom/${pid}`, {
          method: 'POST',
          body: JSON.stringify({ status: newStatus }),
        });
        if (result.success) { ok++; patchProduct(pid, { status: newStatus }); }
        else fail++;
      } catch { fail++; }
    }
    setBulkSaving(false);
    showToast(
      fail === 0
        ? `${ok} produto(s) ${newStatus === 'published' ? 'publicado(s)' : 'despublicado(s)'}!`
        : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, [patchProduct, showToast]);

  // -------------------- Cores em massa (grupos) --------------------
  const applyBulkColors = useCallback(
    async (updates: { productId: string; colors: ColorItem[] }[]) => {
      setBulkSaving(true);
      let ok = 0, fail = 0;
      for (const { productId, colors } of updates) {
        try {
          const newMeta = await patchMetadataAPI(productId, { available_colors: colors });
          ok++;
          patchProduct(productId, {
            _availableColors: colors,
            metadata: newMeta,
            _colorConfigKey: buildColorConfigKey(colors),
            _colorSource: 'metadata',
          });
        } catch { fail++; }
      }
      setBulkSaving(false);
      showToast(
        fail === 0 ? `Cores atualizadas em ${ok} produto(s)!` : `${ok} OK, ${fail} erro(s)`,
        fail === 0 ? 'success' : 'error'
      );
    },
    [patchProduct, showToast]
  );

  // -------------------- Adicionar / Remover cor rapidamente --------------------
  const applyQuickBulkColor = useCallback(
    async (productIds: string[], colorNames: string[], action: 'add' | 'remove') => {
      setBulkSaving(true);
      let ok = 0, fail = 0;
      for (const pid of productIds) {
        try {
          const productData = await adminFetch(`/admin/produtos-custom/${pid}`);
          const currentMetadata = productData.product?.metadata || {};
          let currentColors: ColorItem[] = currentMetadata.available_colors || [];
          if (currentColors.length === 0) {
            const product = products.find(p => p.id === pid);
            if (product && product._colorSource === 'derived') {
              currentColors = [...product._availableColors];
            }
          }
          if (action === 'add') {
            for (const name of colorNames) {
              if (!currentColors.find(c => c.name === name)) {
                currentColors.push({ name, hex: getColorHex(name), in_stock: true });
              }
            }
          } else {
            currentColors = currentColors.filter(c => !colorNames.includes(c.name));
          }
          const result = await adminFetch(`/admin/produtos-custom/${pid}`, {
            method: 'POST',
            body: JSON.stringify({
              metadata: { ...currentMetadata, available_colors: currentColors },
            }),
          });
          if (result.success) {
            ok++;
            patchProduct(pid, {
              _availableColors: currentColors,
              metadata: { ...currentMetadata, available_colors: currentColors },
              _colorConfigKey: buildColorConfigKey(currentColors),
              _colorSource: 'metadata',
            });
          } else fail++;
        } catch { fail++; }
      }
      setBulkSaving(false);
      showToast(
        fail === 0
          ? `Cores ${action === 'add' ? 'adicionadas' : 'removidas'} em ${ok} produto(s)!`
          : `${ok} OK, ${fail} erro(s)`,
        fail === 0 ? 'success' : 'error'
      );
    },
    [products, patchProduct, showToast]
  );

  // -------------------- Rank em massa --------------------
  const applyBulkRank = useCallback(
    async (
      productIds: string[],
      rankOrOpts: number | null | { __sequential: true; start: number }
    ) => {
      setBulkSaving(true);
      let ok = 0, fail = 0;
      const isSequential = rankOrOpts !== null
        && typeof rankOrOpts === 'object'
        && (rankOrOpts as any).__sequential;
      const startValue = isSequential ? (rankOrOpts as any).start : 0;

      for (let i = 0; i < productIds.length; i++) {
        const pid = productIds[i];
        const rankToSet: number | null = isSequential
          ? startValue + i
          : (rankOrOpts as number | null);
        try {
          const newMeta = await patchMetadataAPI(pid, { rank: rankToSet });
          ok++;
          patchProduct(pid, { metadata: newMeta, _rank: rankToSet });
        } catch { fail++; }
      }
      setBulkSaving(false);
      showToast(
        fail === 0
          ? isSequential
            ? `Posicao sequencial aplicada em ${ok} produto(s)!`
            : rankOrOpts === null
              ? `Posicao removida de ${ok} produto(s)`
              : `Posicao #${rankOrOpts} aplicada em ${ok} produto(s)!`
          : `${ok} OK, ${fail} erro(s)`,
        fail === 0 ? 'success' : 'error'
      );
    },
    [patchProduct, showToast]
  );

  // -------------------- Reordenação (salva ranks sequenciais) --------------------
  const applyReorder = useCallback(async (ordered: ParsedProduct[]) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < ordered.length; i++) {
      const p = ordered[i];
      const newRank = i + 1;
      if (p._rank === newRank) { ok++; continue; }
      try {
        const newMeta = await patchMetadataAPI(p.id, { rank: newRank });
        ok++;
        patchProduct(p.id, { metadata: newMeta, _rank: newRank });
      } catch { fail++; }
    }
    setBulkSaving(false);
    showToast(
      fail === 0 ? `Ordem salva em ${ok} produto(s)!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, [patchProduct, showToast]);

  return {
    bulkSaving,
    savingId,
    applyStatus,
    applyQuickRank,
    applyBulkStatus,
    applyBulkColors,
    applyQuickBulkColor,
    applyBulkRank,
    applyReorder,
  };
}
