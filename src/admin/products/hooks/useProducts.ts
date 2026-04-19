// ============================================================================
// useProducts - gerencia lista de produtos (fetch, cache, patch local)
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../../adminApi';
import { parseProduct } from '../utils/parser';
import type { ParsedProduct } from '../types';

export function useProducts() {
  const [products, setProducts] = useState<ParsedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let all: any[] = [];
      let offset = 0;
      const limit = 100;
      let total = 0;
      do {
        const data = await adminFetch(
          `/admin/produtos-custom?limit=${limit}&offset=${offset}`
        );
        const batch = data.products || [];
        all = [...all, ...batch];
        total = data.count || all.length;
        offset += limit;
      } while (offset < total);
      setProducts(all.map(parseProduct));
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        window.location.reload();
        return;
      }
      setError(err.message || 'Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Patch local (otimista) de um produto depois de save
  const patchProduct = useCallback((id: string, patch: Partial<ParsedProduct>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  // Replace batch - útil para ações em massa
  const patchMany = useCallback((updates: Map<string, Partial<ParsedProduct>>) => {
    setProducts(prev => prev.map(p => {
      const patch = updates.get(p.id);
      return patch ? { ...p, ...patch } : p;
    }));
  }, []);

  return {
    products,
    loading,
    error,
    loadProducts,
    patchProduct,
    patchMany,
    setProducts,
  };
}
