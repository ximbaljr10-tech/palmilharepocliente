import React, { useEffect, useState } from 'react';
import { ArrowLeft, Search, Edit3, Save, X, Loader2, Package, Ruler, Weight, DollarSign, Hash, ChevronDown, ChevronUp, Image, Tag, RefreshCw, LogOut, Lock, ShoppingBag, Truck, Menu } from 'lucide-react';
import DOMPurify from 'dompurify';

const MEDUSA_URL = (() => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const port = window.location.port;
    if (port === '' || port === '80' || port === '443') {
      return `${window.location.protocol}//${host}`;
    }
    if (host === 'localhost' || host === '127.0.0.1') {
      return "http://localhost:9000";
    }
    return `http://${host}:9000`;
  }
  return "http://localhost:9000";
})();

const PUBLISHABLE_KEY = "pk_b54130691636a84f3172ebbc1d0ac4d9b14bc2430db612d289a055e341b7b706";
const REGION_ID = "reg_01KK3F27J2GGKVBAPK30N9VBBH";

// Fetch for CUSTOM admin endpoints (/admin/pedidos) — clears token on 401
async function adminFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado');

  const res = await fetch(`${MEDUSA_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers as Record<string, string> || {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  return res.json();
}

// NOTE: All product admin operations now use adminFetch() with custom endpoints
// (/admin/produtos-custom) that share the same Bearer token auth as /admin/pedidos.
// This eliminates the 401 Unauthorized issue that occurred when calling native
// Medusa /admin/products routes directly with a Bearer token.

// ============ LOGIN SCREEN ============
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const authRes = await fetch(`${MEDUSA_URL}/auth/user/emailpass`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const authData = await authRes.json();
      if (!authData.token) { setError('Email ou senha incorretos.'); setLoading(false); return; }

      // Verify admin access using the same custom endpoint as AdminOrders
      const verifyRes = await fetch(`${MEDUSA_URL}/admin/pedidos`, {
        headers: { 'Authorization': `Bearer ${authData.token}`, 'Content-Type': 'application/json' },
      });
      if (verifyRes.status === 401 || verifyRes.status === 403) { setError('Sem permissao de administrador.'); setLoading(false); return; }

      localStorage.setItem('admin_token', authData.token);
      onLogin();
    } catch { setError('Erro ao conectar. Tente novamente.'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 text-center space-y-6">
        <div className="w-16 h-16 bg-zinc-900 text-white rounded-full flex items-center justify-center mx-auto"><Lock size={32} /></div>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Painel Administrativo</h1>
          <p className="text-zinc-500 text-sm mt-1">Acesso restrito - Produtos</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="Email do administrador" className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-400 outline-none" autoFocus required />
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="Senha" className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-400 outline-none" required />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading || !email || !password}
            className="w-full bg-zinc-900 text-white py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============ PRODUCT CARD (Envelope) ============
function ProductCard({ product, onSave, saving }: { product: any; onSave: (id: string, data: any) => void; saving: boolean; key?: any }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: product.title || '',
    description: product.description || '',
    price: '',
    stock: '',
    shipping_height: '',
    shipping_width: '',
    shipping_length: '',
    shipping_weight: '',
    status: product.status || 'published',
  });

  // Initialize form with product data
  useEffect(() => {
    const variant = product.variants?.[0];
    const priceFromAdmin = variant?.prices?.[0];
    const priceFromStore = variant?.calculated_price?.calculated_amount;
    const metadata = product.metadata || {};

    // Store API returns calculated_amount in currency units (e.g. 29.90)
    // Admin API returns prices[].amount in cents (e.g. 2990)
    let priceValue = '';
    if (priceFromStore != null) {
      priceValue = Number(priceFromStore).toFixed(2);
    } else if (priceFromAdmin?.amount != null) {
      priceValue = (priceFromAdmin.amount / 100).toFixed(2);
    }

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
    // Reset form
    const variant = product.variants?.[0];
    const priceFromAdmin = variant?.prices?.[0];
    const priceFromStore = variant?.calculated_price?.calculated_amount;
    const metadata = product.metadata || {};
    let priceValue = '';
    if (priceFromStore != null) {
      priceValue = Number(priceFromStore).toFixed(2);
    } else if (priceFromAdmin?.amount != null) {
      priceValue = (priceFromAdmin.amount / 100).toFixed(2);
    }
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
      variant_id: product.variants?.[0]?.id,
      price_id: product.variants?.[0]?.prices?.[0]?.id,
      metadata: {
        ...(product.metadata || {}),
        shipping_height: form.shipping_height ? parseFloat(form.shipping_height) : undefined,
        shipping_width: form.shipping_width ? parseFloat(form.shipping_width) : undefined,
        shipping_length: form.shipping_length ? parseFloat(form.shipping_length) : undefined,
        shipping_weight: form.shipping_weight ? parseFloat(form.shipping_weight) : undefined,
      },
    });
    setEditing(false);
  };

  const variant = product.variants?.[0];
  const priceFromAdmin = variant?.prices?.[0];
  const priceFromStore = variant?.calculated_price?.calculated_amount;
  // Store API: calculated_amount in currency units; Admin API: prices[].amount in cents
  let priceDisplay = '—';
  if (priceFromStore != null) {
    priceDisplay = Number(priceFromStore).toFixed(2).replace('.', ',');
  } else if (priceFromAdmin?.amount != null) {
    priceDisplay = (priceFromAdmin.amount / 100).toFixed(2).replace('.', ',');
  }
  const stockDisplay = variant?.inventory_quantity != null ? variant.inventory_quantity : '—';
  const image = product.images?.[0]?.url || product.thumbnail || '';
  const metadata = product.metadata || {};

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all ${
      product.status === 'draft' ? 'border-amber-200' : 'border-zinc-200'
    }`}>
      {/* Header - always visible */}
      <div
        className="p-4 flex items-center gap-3 cursor-pointer hover:bg-zinc-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-100 flex-shrink-0 border border-zinc-200">
          {image ? (
            <img src={image} alt={product.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300"><Image size={16} /></div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-zinc-900 text-sm truncate">{product.title}</h3>
          <div className="flex items-center gap-3 text-xs text-zinc-400 mt-0.5">
            <span>R$ {priceDisplay}</span>
            <span>Estoque: {stockDisplay}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              product.status === 'published' ? 'bg-emerald-100 text-emerald-700' :
              product.status === 'draft' ? 'bg-amber-100 text-amber-700' :
              'bg-zinc-100 text-zinc-600'
            }`}>{product.status === 'published' ? 'Ativo' : product.status === 'draft' ? 'Rascunho' : product.status}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!editing && (
            <button onClick={handleStartEdit} className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Editar">
              <Edit3 size={16} />
            </button>
          )}
          {expanded ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-100 pt-4 space-y-4">
          {editing ? (
            // ======= EDIT MODE =======
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Titulo</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Descricao</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-y" />
              </div>

              {/* Price + Stock */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider flex items-center gap-1"><DollarSign size={10} /> Preco (R$)</label>
                  <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider flex items-center gap-1"><Hash size={10} /> Estoque</label>
                  <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none bg-white">
                    <option value="published">Ativo</option>
                    <option value="draft">Rascunho</option>
                  </select>
                </div>
              </div>

              {/* Shipping Dimensions */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase tracking-wider flex items-center gap-1">
                  <Ruler size={10} /> Dimensoes de Frete (SuperFrete)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                    <label className="block text-[10px] text-zinc-400 mb-0.5">Comprimento (cm)</label>
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

              {/* Save / Cancel Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button onClick={handleSave} disabled={saving}
                  className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={handleCancel}
                  className="text-zinc-500 hover:text-zinc-800 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors border border-zinc-200 hover:border-zinc-400">
                  <X size={16} /> Cancelar
                </button>
              </div>
            </div>
          ) : (
            // ======= VIEW MODE =======
            <div className="space-y-3">
              {/* Description */}
              {product.description && (
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Descricao</p>
                  <div className="text-sm text-zinc-600 line-clamp-3" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.description || '') }} />
                </div>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-zinc-50 p-3 rounded-xl">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1"><DollarSign size={9} /> Preco</p>
                  <p className="font-bold text-zinc-900 text-sm mt-0.5">R$ {priceDisplay}</p>
                </div>
                <div className="bg-zinc-50 p-3 rounded-xl">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1"><Hash size={9} /> Estoque</p>
                  <p className="font-bold text-zinc-900 text-sm mt-0.5">{stockDisplay}</p>
                </div>
                <div className="bg-zinc-50 p-3 rounded-xl">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Handle</p>
                  <p className="font-mono text-zinc-600 text-xs mt-0.5 truncate">{product.handle || '—'}</p>
                </div>
                <div className="bg-zinc-50 p-3 rounded-xl">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ID</p>
                  <p className="font-mono text-zinc-600 text-xs mt-0.5 truncate">{product.id}</p>
                </div>
              </div>

              {/* Shipping Dimensions */}
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Ruler size={10} /> Dimensoes de Frete</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-orange-50 p-2 rounded-lg text-center">
                    <p className="text-[10px] text-orange-500">Altura</p>
                    <p className="font-bold text-orange-800 text-xs">{metadata.shipping_height || '—'} cm</p>
                  </div>
                  <div className="bg-orange-50 p-2 rounded-lg text-center">
                    <p className="text-[10px] text-orange-500">Largura</p>
                    <p className="font-bold text-orange-800 text-xs">{metadata.shipping_width || '—'} cm</p>
                  </div>
                  <div className="bg-orange-50 p-2 rounded-lg text-center">
                    <p className="text-[10px] text-orange-500">Compr.</p>
                    <p className="font-bold text-orange-800 text-xs">{metadata.shipping_length || '—'} cm</p>
                  </div>
                  <div className="bg-orange-50 p-2 rounded-lg text-center">
                    <p className="text-[10px] text-orange-500">Peso</p>
                    <p className="font-bold text-orange-800 text-xs">{metadata.shipping_weight || '—'} kg</p>
                  </div>
                </div>
              </div>

              {/* Variant info */}
              {variant && (
                <div className="text-xs text-zinc-400 space-y-0.5">
                  <p>Variante: {variant.title} (SKU: {variant.sku || '—'})</p>
                  {variant.barcode && <p>Cod. Barras: {variant.barcode}</p>}
                </div>
              )}

              {/* Edit button */}
              <button onClick={handleStartEdit}
                className="bg-zinc-100 text-zinc-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-200 flex items-center gap-2 transition-colors">
                <Edit3 size={14} /> Editar Produto
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
  const [authenticated, setAuthenticated] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      // Validate token using the same custom endpoint as AdminOrders
      fetch(`${MEDUSA_URL}/admin/pedidos`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      }).then(res => { if (res.ok) setAuthenticated(true); else { localStorage.removeItem('admin_token'); setLoading(false); } })
        .catch(() => { localStorage.removeItem('admin_token'); setLoading(false); });
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (authenticated) loadProducts(); }, [authenticated]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      let all: any[] = [];
      let offset = 0;
      const limit = 100;
      let total = 0;

      // Load products via Store API (works with publishable key, no admin session needed)
      do {
        const res = await fetch(`${MEDUSA_URL}/store/products?limit=${limit}&offset=${offset}&region_id=${REGION_ID}&fields=*variants,*variants.calculated_price,*variants.prices`, {
          headers: {
            'Content-Type': 'application/json',
            'x-publishable-api-key': PUBLISHABLE_KEY,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const batch = data.products || [];
        all = [...all, ...batch];
        total = data.count || all.length;
        offset += limit;
      } while (offset < total);

      // Load draft products via custom admin endpoint
      // (Store API only returns published products)
      try {
        let adminAll: any[] = [];
        let adminOffset = 0;
        let adminTotal = 0;
        do {
          const data = await adminFetch(`/admin/produtos-custom?limit=${limit}&offset=${adminOffset}&status=draft`);
          const batch = data.products || [];
          adminAll = [...adminAll, ...batch];
          adminTotal = data.count || adminAll.length;
          adminOffset += limit;
        } while (adminOffset < adminTotal);

        // Merge: add draft products not already in the list
        const existingIds = new Set(all.map(p => p.id));
        for (const dp of adminAll) {
          if (!existingIds.has(dp.id)) {
            all.push(dp);
          }
        }
      } catch (draftErr: any) {
        // If draft loading fails, we still have all published products from the Store API
        console.warn('Nao foi possivel carregar rascunhos:', draftErr.message);
      }

      setProducts(all);
      setTotalCount(all.length);
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        setAuthenticated(false);
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
      // Update product via custom admin endpoint (same auth as pedidos)
      // This endpoint handles title, description, status, metadata, price, and stock
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

      if (!result.success) {
        throw new Error(result.errors?.join(', ') || 'Erro ao salvar produto');
      }

      // Log partial errors (e.g. price update failed but product update succeeded)
      if (result.errors && result.errors.length > 0) {
        console.warn('Avisos ao salvar produto:', result.errors);
      }

      setSuccessMsg(`Produto "${data.title}" atualizado com sucesso!`);
      setTimeout(() => setSuccessMsg(null), 3000);

      // Reload products
      await loadProducts();
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        setAuthenticated(false);
      }
      setErrorMsg(`Erro ao salvar: ${err.message || 'desconhecido'}`);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setSaving(null);
    }
  };

  if (!authenticated) return <LoginScreen onLogin={() => setAuthenticated(true)} />;

  // Filter products
  let filtered = products;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.handle?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q)
    );
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter(p => p.status === statusFilter);
  }

  const publishedCount = products.filter(p => p.status === 'published').length;
  const draftCount = products.filter(p => p.status === 'draft').length;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Sticky Header */}
      <header className="bg-white border-b border-zinc-200 border-t-2 border-t-red-600 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded-xl border border-zinc-200 hover:bg-zinc-100 transition-colors">
                <Menu size={20} className="text-zinc-600" />
              </button>
              {menuOpen && (
                <div className="absolute top-12 left-0 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 min-w-[200px] py-2">
                  <a href="/store/admin" className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 text-sm text-zinc-700 transition-colors">
                    <Package size={16} /> Gerenciar Pedidos
                  </a>
                  <a href="https://web.superfrete.com" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 text-sm text-orange-600 transition-colors">
                    <Truck size={16} /> SuperFrete
                  </a>
                  <div className="border-t border-zinc-100 my-1" />
                  <button onClick={() => { localStorage.removeItem('admin_token'); setAuthenticated(false); setMenuOpen(false); }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 text-sm text-red-500 transition-colors w-full text-left">
                    <LogOut size={16} /> Sair
                  </button>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <ShoppingBag size={20} className="text-emerald-600" /> Produtos
              </h1>
              <p className="text-zinc-400 text-xs">
                {totalCount} produto{totalCount !== 1 ? 's' : ''} no total
                {publishedCount > 0 && <> &middot; <span className="text-emerald-600">{publishedCount} ativos</span></>}
                {draftCount > 0 && <> &middot; <span className="text-amber-600">{draftCount} rascunhos</span></>}
              </p>
            </div>
          </div>
          <button onClick={loadProducts}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 text-sm bg-white px-3 py-2 rounded-xl border border-zinc-200 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Success / Error messages */}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-2xl text-sm flex items-center gap-2">
            <Save size={16} /> {successMsg}
            <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">&times;</button>
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-2xl text-sm flex items-center gap-2">
            <X size={16} /> {errorMsg}
            <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, handle ou ID..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
          </div>
          <div className="flex gap-1.5">
            {[
              { key: 'all', label: 'Todos', count: products.length },
              { key: 'published', label: 'Ativos', count: publishedCount },
              { key: 'draft', label: 'Rascunhos', count: draftCount },
            ].map(t => (
              <button key={t.key} onClick={() => setStatusFilter(t.key)}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all whitespace-nowrap ${
                  statusFilter === t.key
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                }`}>
                {t.label}
                {t.count > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-xs ${
                    statusFilter === t.key ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'
                  }`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Product List */}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-3 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 mt-4 text-sm">Carregando produtos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white p-16 rounded-2xl border border-zinc-200 text-center">
            <ShoppingBag size={40} className="text-zinc-200 mx-auto mb-3" />
            <p className="text-zinc-400">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(product => (
              <ProductCard key={product.id} product={product} onSave={handleSave} saving={saving === product.id} />
            ))}
          </div>
        )}

        <p className="text-center text-xs text-zinc-400 pb-4">
          Mostrando {filtered.length} de {products.length} produtos
        </p>
      </main>
    </div>
  );
}
