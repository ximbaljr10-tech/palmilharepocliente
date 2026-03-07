import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ShoppingCart, Package } from 'lucide-react';
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
            <span className="hidden sm:inline">Acompanhar Pedido</span>
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
