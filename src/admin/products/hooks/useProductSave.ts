// ============================================================================
// useProductSave - cria ou atualiza um único produto
// ============================================================================

import { useCallback, useState } from 'react';
import { adminFetch } from '../../adminApi';
import type { ParsedProduct } from '../types';

export interface ProductSavePayload {
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
  colors?: any[];
  isNew: boolean;
}

interface SaveDeps {
  showToast: (msg: string, type: 'success' | 'error') => void;
  reload: () => Promise<void> | void;
}

export function useProductSave({ showToast, reload }: SaveDeps) {
  const [saving, setSaving] = useState(false);

  const saveProduct = useCallback(
    async (data: ProductSavePayload, editing: ParsedProduct | null): Promise<boolean> => {
      setSaving(true);
      try {
        if (data.isNew) {
          const metadataPayload: Record<string, any> = {
            shipping_height: data.shipping_height,
            shipping_width: data.shipping_width,
            shipping_length: data.shipping_length,
            shipping_weight: data.shipping_weight,
          };
          if (data.grupo) metadataPayload.grupo = data.grupo;
          if (data.colors && data.colors.length > 0) metadataPayload.available_colors = data.colors;
          if (data.rank !== null && data.rank !== undefined) metadataPayload.rank = data.rank;

          const result = await adminFetch('/admin/produtos-custom', {
            method: 'POST',
            body: JSON.stringify({
              title: data.title,
              handle: data.handle,
              description: data.description,
              status: data.status,
              price: data.price,
              images: data.images,
              metadata: metadataPayload,
            }),
          });
          if (!result.success && !result.product) {
            throw new Error(result.errors?.join(', ') || 'Erro ao criar');
          }
          showToast('Produto criado com sucesso!', 'success');
          await reload();
          return true;
        }

        const productId = editing?.id;
        if (!productId) throw new Error('ID nao encontrado');

        const productData = await adminFetch(`/admin/produtos-custom/${productId}`);
        const currentMetadata = productData.product?.metadata || {};

        const metadataUpdate: Record<string, any> = {
          ...currentMetadata,
          shipping_height: data.shipping_height,
          shipping_width: data.shipping_width,
          shipping_length: data.shipping_length,
          shipping_weight: data.shipping_weight,
        };
        if (data.grupo) metadataUpdate.grupo = data.grupo;
        if (data.colors !== undefined) metadataUpdate.available_colors = data.colors;
        metadataUpdate.rank = data.rank;

        const updatePayload: any = {
          title: data.title,
          handle: data.handle,
          description: data.description,
          status: data.status,
          metadata: metadataUpdate,
        };

        if (data.price && editing && data.price !== editing._price) {
          updatePayload.price = data.price;
          if (editing._variantId) updatePayload.variant_id = editing._variantId;
          if (editing._priceId) updatePayload.price_id = editing._priceId;
        }

        const currentUrls = (editing?.images || []).map(i => i.url);
        const newUrls = data.images || [];
        if (JSON.stringify(currentUrls) !== JSON.stringify(newUrls)) {
          updatePayload.images = newUrls;
        }

        const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
          method: 'POST',
          body: JSON.stringify(updatePayload),
        });
        if (!result.success) {
          throw new Error(result.errors?.join(', ') || 'Erro ao salvar');
        }

        showToast('Produto atualizado!', 'success');
        await reload();
        return true;
      } catch (err: any) {
        showToast(`Erro: ${err.message}`, 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [showToast, reload]
  );

  return { saving, saveProduct };
}
