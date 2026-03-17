import React, { useEffect, useState } from 'react';
import { Search, Edit3, Save, X, Loader2, Package, Ruler, DollarSign, Hash, Image, RefreshCw, ShoppingBag, ChevronDown, ChevronUp, Eye, EyeOff, AlertTriangle, Palette, Plus, Minus } from 'lucide-react';
import DOMPurify from 'dompurify';
import { adminFetch } from './adminApi';
import { LINE_COLORS, isNylonEsportiva, isKingLine, getColorsForProduct, getColorGroupName } from '../types';

// ============ COLOR MANAGER COMPONENT ============
function ColorManager({ product, onSaveColors, saving }: { product: any; onSaveColors: (productId: string, colors: any) => void; saving: boolean }) {
  const metadata = product.metadata || {};
  const existingColors: { name: string; hex: string; in_stock: boolean }[] = metadata.available_colors || [];
  const [colors, setColors] = useState(existingColors);
  const [changed, setChanged] = useState(false);

  // Determine color group for this product
  const p = { title: product.title, handle: product.handle, yards: metadata.yards || null } as any;
  const groupColors = getColorsForProduct(p);
  const groupName = getColorGroupName(p);

  // If no group found, this product doesn't use colors
  if (!groupName && existingColors.length === 0) return null;

  const addColor = (colorName: string, hex: string) => {
    if (colors.find(c => c.name === colorName)) return;
    setColors([...colors, { name: colorName, hex, in_stock: true }]);
    setChanged(true);
  };

  const removeColor = (colorName: string) => {
    setColors(colors.filter(c => c.name !== colorName));
    setChanged(true);
  };

  const toggleStock = (colorName: string) => {
    setColors(colors.map(c => c.name === colorName ? { ...c, in_stock: !c.in_stock } : c));
    setChanged(true);
  };

  const handleSave = () => {
    onSaveColors(product.id, colors);
    setChanged(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
          <Palette size={9} /> Cores Disponiveis {groupName && <span className="text-purple-500">({groupName})</span>}
        </p>
      </div>

      {/* Current colors */}
      {colors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {colors.map(c => (
            <div key={c.name} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${
              c.in_stock ? 'bg-white border-zinc-200' : 'bg-red-50 border-red-200 opacity-60'
            }`}>
              <span
                className="w-4 h-4 rounded-sm shrink-0 border border-zinc-300"
                style={{ backgroundColor: c.hex.startsWith('linear') ? '#ccc' : c.hex, background: c.hex.startsWith('linear') ? c.hex : undefined }}
              />
              <span className={c.in_stock ? 'text-zinc-700' : 'text-red-500 line-through'}>{c.name}</span>
              <button
                onClick={() => toggleStock(c.name)}
                className={`text-[10px] px-1 rounded ${c.in_stock ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                title={c.in_stock ? 'Marcar fora de estoque' : 'Marcar em estoque'}
              >
                {c.in_stock ? 'Sem estoque' : 'Em estoque'}
              </button>
              <button onClick={() => removeColor(c.name)} className="text-red-300 hover:text-red-500">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add color buttons */}
      {groupColors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {groupColors.filter(gc => !colors.find(c => c.name === gc.name)).map(gc => (
            <button
              key={gc.name}
              onClick={() => addColor(gc.name, gc.hex)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-zinc-300 text-[10px] text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <Plus size={10} />
              <span
                className="w-3 h-3 rounded-sm border border-zinc-200"
                style={{ backgroundColor: gc.hex.startsWith('linear') ? '#ccc' : gc.hex, background: gc.hex.startsWith('linear') ? gc.hex : undefined }}
              />
              {gc.name}
            </button>
          ))}
        </div>
      )}

      {/* Save button */}
      {changed && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar Cores
        </button>
      )}
    </div>
  );
}

// ============ PRODUCT CARD ============
function ProductCard({ product, onSave, onSaveColors, saving }: { product: any; onSave: (id: string, data: any) => void; onSaveColors: (id: string, colors: any) => void; saving: boolean; key?: any }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', price: '', stock: '',
    shipping_height: '', shipping_width: '', shipping_length: '', shipping_weight: '',
    status: 'published',
  });

  const variant = product.variants?.[0];
  // Find the BRL price from admin API prices array (prefer BRL over other currencies)
  const allPrices = variant?.prices || [];
  const brlPrice = allPrices.find((p: any) => p.currency_code === 'brl');
  const priceFromAdmin = brlPrice || allPrices[0];
  const priceFromStore = variant?.calculated_price?.calculated_amount;
  const metadata = product.metadata || {};

  // Price resolution:
  // - Store API calculated_price: already in BRL (e.g., 45.40 = R$ 45,40)
  // - Admin API prices[].amount: also in BRL (Medusa v2 stores actual value, not cents)
  let priceDisplay = '—';
  let priceValue = '';
  if (priceFromStore != null) {
    priceDisplay = Number(priceFromStore).toFixed(2).replace('.', ',');
    priceValue = Number(priceFromStore).toFixed(2);
  } else if (priceFromAdmin?.amount != null) {
    // Admin prices are already in BRL, NOT centavos
    const brlPriceVal = Number(priceFromAdmin.amount);
    priceDisplay = brlPriceVal.toFixed(2).replace('.', ',');
    priceValue = brlPriceVal.toFixed(2);
  }

  const stockDisplay = variant?.inventory_quantity != null ? variant.inventory_quantity : '—';
  const image = product.images?.[0]?.url || product.thumbnail || '';
  const noStock = variant?.inventory_quantity !== undefined && variant.inventory_quantity <= 0;
  const availableColors = metadata.available_colors || [];

  useEffect(() => {
    setForm({
      title: product.title || '',
      description: product.description || '',
      price: priceValue,
      stock: variant?.inventory_quantity != null ? String(variant.inventory_quantity) : '',
      shipping_height: metadata.shipping_height != null ? String(metadata.shipping_height) : '',
      shipping_width: metadata.shipping_width != null ? String(metadata.shipping_width) : '',
      shipping_length: metadata.shipping_length != null ? String(metadata.shipping_length) : '',
      shipping_weight: metadata.shipping_weight != null ? String(metadata.shipping_weight) : '',
      status: product.status || 'published',
    });
  }, [product]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setForm({
      title: product.title || '',
      description: product.description || '',
      price: priceValue,
      stock: variant?.inventory_quantity != null ? String(variant.inventory_quantity) : '',
      shipping_height: metadata.shipping_height != null ? String(metadata.shipping_height) : '',
      shipping_width: metadata.shipping_width != null ? String(metadata.shipping_width) : '',
      shipping_length: metadata.shipping_length != null ? String(metadata.shipping_length) : '',
      shipping_weight: metadata.shipping_weight != null ? String(metadata.shipping_weight) : '',
      status: product.status || 'published',
    });
  };

  const handleSave = () => {
    onSave(product.id, {
      title: form.title,
      description: form.description,
      price: form.price,
      stock: form.stock,
      status: form.status,
      variant_id: variant?.id,
      price_id: priceFromAdmin?.id,
      metadata: {
        ...(metadata || {}),
        shipping_height: form.shipping_height ? parseFloat(form.shipping_height) : undefined,
        shipping_width: form.shipping_width ? parseFloat(form.shipping_width) : undefined,
        shipping_length: form.shipping_length ? parseFloat(form.shipping_length) : undefined,
        shipping_weight: form.shipping_weight ? parseFloat(form.shipping_weight) : undefined,
      },
    });
    setEditing(false);
  };

  // Status badge
  const statusBadge = (() => {
    if (noStock) return { label: 'Sem estoque', bg: 'bg-red-50', text: 'text-red-600' };
    if (product.status === 'published') return { label: 'Publicado', bg: 'bg-emerald-50', text: 'text-emerald-600' };
    if (product.status === 'draft') return { label: 'Rascunho', bg: 'bg-amber-50', text: 'text-amber-600' };
    return { label: product.status, bg: 'bg-zinc-100', text: 'text-zinc-600' };
  })();

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all max-w-full ${
      noStock ? 'border-red-200' : product.status === 'draft' ? 'border-amber-200' : 'border-zinc-100'
    }`}>
      {/* Header */}
      <div className="p-3 sm:p-4 flex items-center gap-3 cursor-pointer hover:bg-zinc-50/50 transition-colors overflow-hidden"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
          {image ? (
            <img src={image} alt={product.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300"><Image size={14} /></div>
          )}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <h3 className="font-bold text-zinc-900 text-sm truncate">{product.title}</h3>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5 flex-wrap">
            <span className="font-medium text-zinc-600 shrink-0">R$ {priceDisplay}</span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">Estoque: {stockDisplay}</span>
            <span className={`${statusBadge.bg} ${statusBadge.text} px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0`}>
              {statusBadge.label}
            </span>
            {availableColors.length > 0 && (
              <>
                <span className="shrink-0">·</span>
                <span className="flex items-center gap-0.5 shrink-0">
                  <Palette size={10} className="text-purple-400" />
                  <span className="text-purple-500">{availableColors.filter((c: any) => c.in_stock).length} cores</span>
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!editing && (
            <button onClick={handleStartEdit} className="p-1.5 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all">
              <Edit3 size={14} />
            </button>
          )}
          {expanded ? <ChevronUp size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-3 sm:px-4 pb-4 border-t border-zinc-100 pt-3 space-y-4">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Titulo</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Descricao</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-y" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Preco (R$)</label>
                  <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Estoque</label>
                  <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                    <option value="published">Publicado</option>
                    <option value="draft">Rascunho</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                  <Ruler size={9} /> Dimensoes de Frete
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-0.5">Altura (cm)</label>
                    <input type="number" step="0.1" value={form.shipping_height} onChange={(e) => setForm({ ...form, shipping_height: e.target.value })}
                      placeholder="ex: 18" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-0.5">Largura (cm)</label>
                    <input type="number" step="0.1" value={form.shipping_width} onChange={(e) => setForm({ ...form, shipping_width: e.target.value })}
                      placeholder="ex: 18" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-0.5">Comp. (cm)</label>
                    <input type="number" step="0.1" value={form.shipping_length} onChange={(e) => setForm({ ...form, shipping_length: e.target.value })}
                      placeholder="ex: 27" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-0.5">Peso (kg)</label>
                    <input type="number" step="0.01" value={form.shipping_weight} onChange={(e) => setForm({ ...form, shipping_weight: e.target.value })}
                      placeholder="ex: 1.0" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={handleSave} disabled={saving}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={handleCancel}
                  className="text-zinc-500 hover:text-zinc-800 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 border border-zinc-200 hover:border-zinc-400 transition-colors">
                  <X size={14} /> Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {product.description && (
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Descricao</p>
                  <div className="text-xs text-zinc-600 line-clamp-3" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.description || '') }} />
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-zinc-50 p-2.5 rounded-xl">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Preco</p>
                  <p className="font-bold text-zinc-900 text-sm mt-0.5">R$ {priceDisplay}</p>
                </div>
                <div className="bg-zinc-50 p-2.5 rounded-xl">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Estoque</p>
                  <p className={`font-bold text-sm mt-0.5 ${noStock ? 'text-red-600' : 'text-zinc-900'}`}>{stockDisplay}</p>
                </div>
                <div className="bg-zinc-50 p-2.5 rounded-xl">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Handle</p>
                  <p className="font-mono text-zinc-600 text-[10px] mt-0.5 truncate">{product.handle || '—'}</p>
                </div>
                <div className="bg-zinc-50 p-2.5 rounded-xl">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Status</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {product.status === 'published' ? (
                      <Eye size={12} className="text-emerald-500" />
                    ) : (
                      <EyeOff size={12} className="text-amber-500" />
                    )}
                    <p className={`font-bold text-sm ${product.status === 'published' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {product.status === 'published' ? 'Publicado' : 'Rascunho'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Color Management */}
              <ColorManager product={product} onSaveColors={onSaveColors} saving={saving} />

              {(metadata.shipping_height || metadata.shipping_width || metadata.shipping_length || metadata.shipping_weight) && (
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Ruler size={9} /> Frete</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: 'Alt.', value: metadata.shipping_height, unit: 'cm' },
                      { label: 'Larg.', value: metadata.shipping_width, unit: 'cm' },
                      { label: 'Comp.', value: metadata.shipping_length, unit: 'cm' },
                      { label: 'Peso', value: metadata.shipping_weight, unit: 'kg' },
                    ].map((d, i) => (
                      <div key={i} className="bg-orange-50 p-2 rounded-lg text-center">
                        <p className="text-[9px] text-orange-400">{d.label}</p>
                        <p className="font-bold text-orange-700 text-xs">{d.value || '—'} {d.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={handleStartEdit}
                className="bg-zinc-100 text-zinc-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-200 flex items-center gap-1.5 transition-colors">
                <Edit3 size={12} /> Editar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      let all: any[] = [];
      let offset = 0;
      const limit = 100;

      // Load ALL products via admin API (single source of truth — includes published + draft)
      let total = 0;
      do {
        const data = await adminFetch(`/admin/produtos-custom?limit=${limit}&offset=${offset}`);
        const batch = data.products || [];
        all = [...all, ...batch];
        total = data.count || all.length;
        offset += limit;
      } while (offset < total);

      setProducts(all);
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        window.location.reload();
      }
      setErrorMsg('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (productId: string, data: any) => {
    setSaving(productId);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const updatePayload: any = {};
      if (data.title) updatePayload.title = data.title;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.status) updatePayload.status = data.status;
      if (data.metadata) updatePayload.metadata = data.metadata;
      if (data.price) updatePayload.price = data.price;
      if (data.variant_id) updatePayload.variant_id = data.variant_id;
      if (data.price_id) updatePayload.price_id = data.price_id;
      if (data.stock !== undefined && data.stock !== '') updatePayload.stock = data.stock;

      const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
        method: 'POST',
        body: JSON.stringify(updatePayload),
      });

      if (!result.success) throw new Error(result.errors?.join(', ') || 'Erro ao salvar');

      setSuccessMsg(`"${data.title}" salvo!`);
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadProducts();
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        window.location.reload();
      }
      setErrorMsg(`Erro: ${err.message || 'desconhecido'}`);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setSaving(null);
    }
  };

  const handleSaveColors = async (productId: string, colors: any[]) => {
    setSaving(productId);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      // Get current product metadata first
      const productData = await adminFetch(`/admin/produtos-custom/${productId}`);
      const currentMetadata = productData.product?.metadata || {};

      const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
        method: 'POST',
        body: JSON.stringify({
          metadata: {
            ...currentMetadata,
            available_colors: colors,
          },
        }),
      });

      if (!result.success) throw new Error(result.errors?.join(', ') || 'Erro ao salvar cores');

      setSuccessMsg('Cores atualizadas!');
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadProducts();
    } catch (err: any) {
      setErrorMsg(`Erro ao salvar cores: ${err.message || 'desconhecido'}`);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setSaving(null);
    }
  };

  let filtered = products;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.handle?.toLowerCase().includes(q)
    );
  }
  if (statusFilter !== 'all') {
    if (statusFilter === 'no_stock') {
      filtered = filtered.filter(p => {
        const v = p.variants?.[0];
        return v && v.inventory_quantity !== undefined && v.inventory_quantity <= 0;
      });
    } else {
      filtered = filtered.filter(p => p.status === statusFilter);
    }
  }

  const publishedCount = products.filter(p => p.status === 'published').length;
  const draftCount = products.filter(p => p.status === 'draft').length;
  const noStockCount = products.filter(p => { const v = p.variants?.[0]; return v && v.inventory_quantity !== undefined && v.inventory_quantity <= 0; }).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <p className="text-xs text-zinc-400">
        {products.length} produto{products.length !== 1 ? 's' : ''}
        {publishedCount > 0 && <> · <span className="text-emerald-500">{publishedCount} publicados</span></>}
        {draftCount > 0 && <> · <span className="text-amber-500">{draftCount} rascunho</span></>}
        {noStockCount > 0 && <> · <span className="text-red-500">{noStockCount} sem estoque</span></>}
      </p>

      {/* Messages */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-2.5 rounded-xl text-xs flex items-center gap-2">
          <Save size={14} /> {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">&times;</button>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle size={14} /> {errorMsg}
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: 'all', label: 'Todos', count: products.length },
            { key: 'published', label: 'Publicados', count: publishedCount },
            { key: 'draft', label: 'Rascunho', count: draftCount },
            { key: 'no_stock', label: 'Sem estoque', count: noStockCount },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium border transition-all whitespace-nowrap ${
                statusFilter === t.key
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1 ${statusFilter === t.key ? 'text-white/60' : 'text-zinc-400'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <button onClick={loadProducts}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-700 text-xs bg-white px-3 py-1.5 rounded-lg border border-zinc-200 transition-colors">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Product List */}
      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={24} className="animate-spin text-zinc-300 mx-auto" />
          <p className="text-zinc-400 mt-3 text-sm">Carregando produtos...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-zinc-100 text-center">
          <ShoppingBag size={32} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">Nenhum produto encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(product => (
            <ProductCard key={product.id} product={product} onSave={handleSave} onSaveColors={handleSaveColors} saving={saving === product.id} />
          ))}
        </div>
      )}

      <p className="text-center text-[10px] text-zinc-400 pb-4">
        {filtered.length} de {products.length} produtos
      </p>
    </div>
  );
}
