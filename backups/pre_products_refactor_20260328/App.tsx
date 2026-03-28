import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import React from 'react';
import { ShoppingCart, Package, X } from 'lucide-react';
import { CartProvider, useCart } from './CartContext';
import { LINE_COLORS } from './types';
import Home from './pages/Home';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import TrackOrder from './pages/TrackOrder';
import Sobre from './pages/Sobre';
import Contato from './pages/Contato';
import PoliticaPrivacidade from './pages/PoliticaPrivacidade';
import TermosUso from './pages/TermosUso';
import TrocasDevolucoes from './pages/TrocasDevolucoes';
import FreteEntrega from './pages/FreteEntrega';
import Footer from './components/Footer';

// New admin imports
import AdminLayout from './admin/AdminLayout';
import AdminDashboard from './admin/AdminDashboard';
import AdminOrders from './admin/AdminOrders';
import AdminOrderDetail from './admin/AdminOrderDetail';
import AdminProducts from './admin/AdminProducts';
import AdminArchived from './admin/AdminArchived';
import AdminSoldItems from './admin/AdminSoldItems';
import AdminEmailInbox from './admin/AdminEmailInbox';

// Smart scroll management:
// - New top-level page navigation → scroll to top
// - Back from detail view → restore previous scroll position
function ScrollManager() {
  const { pathname } = useLocation();
  const prevPathRef = React.useRef(pathname);

  React.useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;

    // Check if navigating BACK from a detail/sub page to a list page
    // Pattern: /store/admin/pedido/:id → /store/admin/pedidos (restore scroll)
    // Pattern: /store/product/:id → /store (restore scroll)
    const isReturningToList = (() => {
      // Admin: from order detail back to orders list
      if (/^\/store\/admin\/pedido\//.test(prev) && /^\/store\/admin\/pedidos/.test(pathname)) return true;
      // Store: from product detail back to store home
      if (/^\/store\/product\//.test(prev) && pathname === '/store') return true;
      return false;
    })();

    if (isReturningToList) {
      // Restore scroll - let the page's own scroll restoration handle it
      // (AdminOrders already has sessionStorage-based scroll restoration)
      return;
    }

    // For all new top-level navigations, scroll to top
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

// Analytics tracker - sends pageview + heartbeat for real-time presence
// Fixed: ensures session persistence, proper page tracking, and reliable heartbeats
function AnalyticsTracker() {
  const { pathname } = useLocation();
  const sessionRef = React.useRef<string>('');
  const heartbeatRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Initialize session ID once (persisted in sessionStorage)
  React.useEffect(() => {
    let sessionId = sessionStorage.getItem('analytics_session');
    if (!sessionId) {
      sessionId = 'sid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem('analytics_session', sessionId);
    }
    sessionRef.current = sessionId;
  }, []);

  React.useEffect(() => {
    // Don't track admin pages
    if (pathname.includes('/admin')) return;

    const sessionId = sessionRef.current || sessionStorage.getItem('analytics_session');
    if (!sessionId) return;

    // Determine page type based on current path
    let page = 'site';
    if (pathname.includes('/cart')) page = 'cart';
    else if (pathname.includes('/checkout')) page = 'checkout';

    // Send analytics event to backend
    const sendEvent = (eventType: string, currentPage?: string) => {
      const payload = {
        session_id: sessionId,
        event_type: eventType,
        page: currentPage || page,
        path: pathname,
        referrer: document.referrer || '',
        timestamp: new Date().toISOString(),
      };

      fetch('/store/analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-publishable-api-key': 'pk_b54130691636a84f3172ebbc1d0ac4d9b14bc2430db612d289a055e341b7b706',
        },
        body: JSON.stringify(payload),
        keepalive: true, // Ensure delivery even on page unload
      }).catch(() => {}); // Silently fail
    };

    // Send pageview on route change
    sendEvent('pageview');

    // Clear previous heartbeat interval if any
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }

    // Heartbeat every 25 seconds for real-time presence (slightly under 30s to avoid gaps)
    heartbeatRef.current = setInterval(() => {
      // Re-check current page context for heartbeat
      let currentPage = 'site';
      const currentPath = window.location.pathname;
      if (currentPath.includes('/cart')) currentPage = 'cart';
      else if (currentPath.includes('/checkout')) currentPage = 'checkout';
      
      sendEvent('heartbeat', currentPage);
    }, 25000);

    // Send a "leave" event when the tab becomes hidden (user switches tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        sendEvent('leave');
      } else if (document.visibilityState === 'visible') {
        sendEvent('heartbeat');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [pathname]);

  return null;
}

function FloatingCart() {
  const { cart, isFloatingCartOpen, setIsFloatingCartOpen } = useCart();
  const navigate = useNavigate();

  if (!isFloatingCartOpen || cart.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 w-80 bg-white rounded-2xl shadow-2xl border border-zinc-200 z-50 overflow-hidden animate-fade-in-fast" style={{ animation: 'fade-in 0.3s ease-out, slide-down 0.3s ease-out' }}>
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
              {item.color_preference && item.color_preference.mode === 'prioridade' && (
                <div className="flex items-center gap-1 mt-0.5">
                  {[item.color_preference.color_1, item.color_preference.color_2, item.color_preference.color_3].filter(Boolean).map((colorName, idx) => {
                    const c = LINE_COLORS.find(lc => lc.name === colorName);
                    return c ? <span key={idx} className="w-3 h-3 rounded-sm" style={{ ...(c.hex.startsWith('linear-gradient') ? { background: c.hex } : { backgroundColor: c.hex }), border: c.hex === '#f5f5f5' ? '1px solid #d4d4d8' : 'none' }} title={`${idx+1}ª ${c.name}`} /> : null;
                  })}
                </div>
              )}
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
            navigate('/store/cart');
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
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="bg-white text-zinc-900 p-4 shadow-sm border-b border-zinc-200 border-t-2 border-t-red-600 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/store" className="flex items-center">
          <img 
            src="https://d1a9qnv764bsoo.cloudfront.net/stores/002/383/186/themes/common/logo-2076434406-1663802435-2137b08583cacd89f0378fc3f37146e01663802435.png?0" 
            alt="Dente de Tubarão Logo" 
            className="h-12 object-contain"
            referrerPolicy="no-referrer"
          />
        </Link>
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Instagram CTA - desktop only */}
          <a
            href="https://www.instagram.com/dentedetubaraooficial"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex instagram-cta"
            title="@dentedetubaraooficial"
          >
            <span className="ig-text">Nos siga</span>
            <svg className="ig-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
          </a>
          <Link 
            to="/store/acompanhar"
            className="text-xs sm:text-sm font-medium hover:text-emerald-600 transition-colors flex items-center gap-1.5 sm:gap-2"
          >
            <Package size={18} />
            <span>Acompanhar Pedido</span>
          </Link>
          <Link to="/store/cart" className="relative flex items-center gap-2 hover:text-emerald-600 transition-colors">
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

function StoreLayout() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col">
      <Header />
      <FloatingCart />
      <ScrollManager />
      <AnalyticsTracker />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex-grow w-full">
        <Routes>
          <Route index element={<Home />} />
          <Route path="product/:id" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="acompanhar" element={<TrackOrder />} />
          <Route path="sobre" element={<Sobre />} />
          <Route path="contato" element={<Contato />} />
          <Route path="politica-privacidade" element={<PoliticaPrivacidade />} />
          <Route path="termos-uso" element={<TermosUso />} />
          <Route path="trocas-devolucoes" element={<TrocasDevolucoes />} />
          <Route path="frete-entrega" element={<FreteEntrega />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <CartProvider>
      <Router>
        <Routes>
          {/* Root redirects to store */}
          <Route path="/" element={<Navigate to="/store" replace />} />
          
          {/* Admin routes under /store/admin - MUST be before /store/* */}
          <Route path="/store/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="pedidos" element={<AdminOrders />} />
            <Route path="pedido/:id" element={<AdminOrderDetail />} />
            <Route path="produtos" element={<AdminProducts />} />
            <Route path="email" element={<AdminEmailInbox />} />
            <Route path="itens-vendidos" element={<AdminSoldItems />} />
            <Route path="arquivados" element={<AdminArchived />} />
          </Route>

          {/* Store routes - all under /store */}
          <Route path="/store/*" element={<StoreLayout />} />
        </Routes>
      </Router>
    </CartProvider>
  );
}
