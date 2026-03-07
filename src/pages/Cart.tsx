import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { Trash2, Plus, Minus } from 'lucide-react';

export default function Cart() {
  const { cart, updateQuantity, removeFromCart, total } = useCart();
  const navigate = useNavigate();

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
          
          <div className="space-y-4 mb-6">
            <div className="flex justify-between text-zinc-500">
              <span>Subtotal</span>
              <span>R$ {total.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t border-zinc-100 pt-4">
              <span>Total</span>
              <span>R$ {total.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/checkout')}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-emerald-700 transition-colors"
          >
            Finalizar Compra
          </button>
        </div>
      </div>
    </div>
  );
}
