import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Product } from '../types';
import { useCart } from '../CartContext';
import { ArrowLeft, ShieldCheck, Truck, CreditCard, Minus, Plus } from 'lucide-react';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Product not found');
        return res.json();
      })
      .then((data) => setProduct(data))
      .catch(() => navigate('/'));
  }, [id, navigate]);

  if (!product) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const handleBuy = () => {
    // Add multiple items if quantity > 1
    for (let i = 0; i < quantity; i++) {
      addToCart(product);
    }
    navigate('/cart');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <ArrowLeft size={20} />
        Voltar para a loja
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 bg-white p-6 sm:p-10 rounded-3xl shadow-sm border border-zinc-100">
        {/* Imagem do Produto */}
        <div className="aspect-square bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-100 sticky top-24">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              className="w-full h-full object-contain p-4"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400">
              Sem imagem
            </div>
          )}
        </div>

        {/* Detalhes do Produto */}
        <div className="flex flex-col">
          <div className="mb-2 text-sm text-emerald-600 font-medium tracking-wide uppercase">
            {product.vendor || 'Dente de Tubarão'}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4 leading-tight">
            {product.title}
          </h1>
          
          <div className="flex items-baseline gap-4 mb-8">
            <span className="text-4xl font-bold text-zinc-900">
              R$ {product.price.toFixed(2).replace('.', ',')}
            </span>
            <span className="text-sm text-zinc-500">
              em até 12x no cartão
            </span>
          </div>

          <div className="space-y-6 mb-8">
            {/* Seletor de Quantidade */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Quantidade</label>
              <div className="flex items-center w-32 bg-zinc-50 border border-zinc-200 rounded-xl">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-12 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <Minus size={18} />
                </button>
                <input 
                  type="number" 
                  value={quantity}
                  readOnly
                  className="w-12 h-12 bg-transparent text-center font-medium text-zinc-900 outline-none"
                />
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-12 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <button
              onClick={handleBuy}
              className="w-full bg-emerald-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
            >
              Comprar Agora
            </button>
          </div>

          {/* Badges de Confiança */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-6 border-y border-zinc-100 mb-8">
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <Truck className="text-emerald-500" size={24} />
              <span>Frete para todo Brasil</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <ShieldCheck className="text-emerald-500" size={24} />
              <span>Compra 100% Segura</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <CreditCard className="text-emerald-500" size={24} />
              <span>Pague via PIX</span>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Descrição do Produto</h3>
            <div className="prose prose-zinc max-w-none prose-p:text-zinc-600 prose-headings:text-zinc-900" dangerouslySetInnerHTML={{ __html: product.description }} />
          </div>
        </div>
      </div>
    </div>
  );
}
