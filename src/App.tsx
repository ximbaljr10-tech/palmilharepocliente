import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, X } from 'lucide-react';
import { CartProvider, useCart } from './CartContext';
import { UserProvider, useUser } from './UserContext';
import Home from './pages/Home';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Register from './pages/Register';
import CustomerPanel from './pages/CustomerPanel';
import AdminPanel from './pages/AdminPanel';

function FloatingCart() {
  const { cart, isFloatingCartOpen, setIsFloatingCartOpen, total } = useCart();
  const navigate = useNavigate();

  if (!isFloatingCartOpen || cart.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 w-80 bg-white rounded-2xl shadow-2xl border border-zinc-200 z-50 overflow-hidden animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
        <h3 className="font-bold text-zinc-900 flex items-center gap-2">
          <ShoppingCart size={18} className="text-emerald-600" />
          Adicionado ao carrinho
        </h3>
        <button onClick={() => setIsFloatingCartOpen(false)} className="text-zinc-400 hover:text-zinc-600">
          <X size={20} />
        </button>
      </div>
      <div className="p-4 max-h-60 overflow-y-auto space-y-3">
        {cart.map(item => (
          <div key={item.id} className="flex gap-3">
            <img src={item.image_url} alt={item.title} className="w-12 h-12 object-cover rounded-lg border border-zinc-100" />
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-900 line-clamp-1">{item.title}</p>
              <p className="text-xs text-zinc-500">{item.quantity}x R$ {item.price.toFixed(2).replace('.', ',')}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-zinc-100 bg-zinc-50">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-zinc-600">Subtotal:</span>
          <span className="font-bold text-zinc-900">R$ {cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2).replace('.', ',')}</span>
        </div>
        <button 
          onClick={() => {
            setIsFloatingCartOpen(false);
            navigate('/cart');
          }}
          className="w-full bg-emerald-600 text-white py-2 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors"
        >
          Ir para o Carrinho
        </button>
      </div>
    </div>
  );
}

function Header() {
  const { cart } = useCart();
  const { user } = useUser();
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="bg-white text-zinc-900 p-4 shadow-sm border-b border-zinc-200 border-t-2 border-t-red-600 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center">
          <img 
            src="https://d1a9qnv764bsoo.cloudfront.net/stores/002/383/186/themes/common/logo-2076434406-1663802435-2137b08583cacd89f0378fc3f37146e01663802435.png?0" 
            alt="Dente de Tubarão Logo" 
            className="h-12 object-contain"
            referrerPolicy="no-referrer"
          />
        </Link>
        <div className="flex items-center gap-6">
          <Link 
            to={user ? (user.role === 'admin' ? '/admin' : '/customer') : '/login'} 
            className="text-sm font-medium hover:text-emerald-600 transition-colors flex items-center gap-2"
          >
            <Package size={20} />
            <span>Acompanhar Pedido</span>
          </Link>
          <Link to="/cart" className="relative flex items-center gap-2 hover:text-emerald-600 transition-colors">
            <ShoppingCart size={24} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <UserProvider>
      <CartProvider>
        <Router>
          <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
            <Header />
            <FloatingCart />
            <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/customer" element={<CustomerPanel />} />
                <Route path="/admin" element={<AdminPanel />} />
              </Routes>
            </main>
          </div>
        </Router>
      </CartProvider>
    </UserProvider>
  );
}
