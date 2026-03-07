import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { Trash2, Plus, Minus, Truck, Loader2 } from 'lucide-react';
import { api } from '../api';

export default function Cart() {
  const { cart, updateQuantity, removeFromCart, total, shippingOptions, setShippingOptions, selectedShipping, setSelectedShipping } = useCart();
  const navigate = useNavigate();
  const [cep, setCep] = useState('');
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [shippingError, setShippingError] = useState('');

  const handleCalculateShipping = async () => {
    if (cep.length < 8) return;
    setLoadingShipping(true);
    setShippingError('');
    
    try {
      const res = await api.calculateShipping(cep, cart);
      if (res.success && res.options && Array.isArray(res.options)) {
        const options = res.options.map((opt: any) => ({
          id: opt.id,
          name: opt.name,
          price: parseFloat(opt.price),
          delivery_time: opt.delivery_time,
          package: opt.packages?.[0] || null
        })).filter(opt => opt.price > 0);
        
        setShippingOptions(options);
        if (options.length > 0 && !selectedShipping) {
          setSelectedShipping(options[0]);
        }
      } else {
        setShippingError('Não foi possível calcular o frete para este CEP.');
      }
    } catch (err) {
      setShippingError('Erro ao calcular frete.');
    } finally {
      setLoadingShipping(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-3xl shadow-sm border border-zinc-100">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">Seu carrinho está vazio</h2>
        <p className="text-zinc-500 mb-8">Adicione alguns produtos para continuar.</p>
        <Link
          to="/"
          className="inline-block bg-zinc-900 text-white px-8 py-3 rounded-xl font-medium hover:bg-zinc-800 transition-colors"
        >
          Continuar Comprando
        </Link>
      </div>
    );
  }

  const itemsTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Carrinho</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item) => (
            <div key={item.id} className="flex gap-4 bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 items-center">
              <div className="w-24 h-24 bg-zinc-100 rounded-xl overflow-hidden flex-shrink-0">
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              
              <div className="flex-grow">
                <Link to={`/product/${item.id}`} className="font-medium text-zinc-900 hover:text-emerald-600 line-clamp-2">
                  {item.title}
                </Link>
                <div className="text-emerald-600 font-bold mt-1">
                  R$ {item.price.toFixed(2).replace('.', ',')}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center bg-zinc-100 rounded-lg p-1">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="p-1 hover:bg-white rounded-md transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-8 text-center font-medium">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="p-1 hover:bg-white rounded-md transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 h-fit sticky top-24">
          <h2 className="text-xl font-bold mb-6">Resumo do Pedido</h2>
          
          <div className="mb-6 pb-6 border-b border-zinc-100">
            <label className="block text-sm font-medium text-zinc-700 mb-2 flex items-center gap-2">
              <Truck size={16} />
              Calcular Frete
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="00000-000"
                value={cep}
                onChange={(e) => setCep(e.target.value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9))}
                className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              />
              <button
                onClick={handleCalculateShipping}
                disabled={cep.length < 8 || loadingShipping}
                className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center min-w-[80px]"
              >
                {loadingShipping ? <Loader2 size={16} className="animate-spin" /> : 'OK'}
              </button>
            </div>
            
            {shippingError && <p className="text-red-500 text-xs mt-2">{shippingError}</p>}
            
            {shippingOptions.length > 0 && (
              <div className="mt-4 space-y-2">
                {shippingOptions.map(opt => (
                  <label key={opt.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${selectedShipping?.id === opt.id ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-200 hover:border-emerald-300'}`}>
                    <div className="flex items-center gap-3">
                      <input 
                        type="radio" 
                        name="shipping" 
                        checked={selectedShipping?.id === opt.id}
                        onChange={() => setSelectedShipping(opt)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{opt.name}</p>
                        <p className="text-xs text-zinc-500">Até {opt.delivery_time} dias úteis</p>
                      </div>
                    </div>
                    <span className="font-bold text-zinc-900">R$ {opt.price.toFixed(2).replace('.', ',')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex justify-between text-zinc-500">
              <span>Subtotal</span>
              <span>R$ {itemsTotal.toFixed(2).replace('.', ',')}</span>
            </div>
            {selectedShipping && (
              <div className="flex justify-between text-zinc-500">
                <span>Frete ({selectedShipping.name})</span>
                <span>R$ {selectedShipping.price.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t border-zinc-100 pt-4">
              <span>Total</span>
              <span>R$ {total.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/checkout')}
            disabled={!selectedShipping && shippingOptions.length > 0}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Finalizar Compra
          </button>
          {!selectedShipping && shippingOptions.length > 0 && (
            <p className="text-center text-xs text-red-500 mt-2">Selecione uma opção de frete para continuar.</p>
          )}
        </div>
      </div>
    </div>
  );
}
