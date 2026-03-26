import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Menu, X, LayoutDashboard, Package, ShoppingBag, Archive, LogOut, BarChart3, Mail } from 'lucide-react';
import { MEDUSA_URL, logout } from './adminApi';
import AdminLogin from './AdminLogin';

const NAV_ITEMS = [
  { path: '/store/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/store/admin/pedidos', label: 'Pedidos', icon: Package },
  { path: '/store/admin/produtos', label: 'Produtos', icon: ShoppingBag },
  { path: '/store/admin/email', label: 'Email', icon: Mail },
  { path: '/store/admin/itens-vendidos', label: 'Itens Vendidos', icon: BarChart3 },
  { path: '/store/admin/arquivados', label: 'Arquivados', icon: Archive },
];

// Admin scroll restoration: saves/restores scroll positions per admin route
function AdminScrollManager() {
  const { pathname } = useLocation();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;

    // Coming back from detail to list → restore (AdminOrders handles its own via sessionStorage)
    const isBackFromDetail = /^\/store\/admin\/pedido\//.test(prev) && /^\/store\/admin\/pedidos/.test(pathname);
    
    if (isBackFromDetail) {
      // Don't scroll - let the page component handle restoration
      return;
    }

    // For new admin page navigations, scroll to top
    if (prev !== pathname) {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}

export default function AdminLayout() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      fetch(`${MEDUSA_URL}/admin/pedidos`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
        .then(res => {
          if (res.ok) setAuthenticated(true);
          else { localStorage.removeItem('admin_token'); }
        })
        .catch(() => { localStorage.removeItem('admin_token'); })
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Close menu on ESC key
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [menuOpen]);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    setMenuOpen(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return <AdminLogin onLogin={() => setAuthenticated(true)} />;
  }

  const currentPath = location.pathname;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Header */}
      <header className="bg-white border-b border-zinc-100 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-xl hover:bg-zinc-100 transition-colors relative"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {menuOpen ? <X size={20} className="text-zinc-600" /> : <Menu size={20} className="text-zinc-600" />}
            </button>

            {/* Menu Overlay */}
            {menuOpen && (
              <>
                <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setMenuOpen(false)} />
                <nav className="absolute top-14 left-4 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 w-64 py-2 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Menu Admin</p>
                    <button
                      onClick={() => setMenuOpen(false)}
                      className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                      aria-label="Fechar menu"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {NAV_ITEMS.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPath === item.path || 
                      (item.path !== '/store/admin' && currentPath.startsWith(item.path));
                    return (
                      <button
                        key={item.path}
                        onClick={() => { navigate(item.path); setMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                          isActive
                            ? 'bg-zinc-900 text-white'
                            : 'text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        <Icon size={18} />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                  <div className="border-t border-zinc-100 mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={18} />
                      <span className="font-medium">Sair</span>
                    </button>
                  </div>
                </nav>
              </>
            )}

            {/* Page Title */}
            <div>
              <h1 className="text-base sm:text-lg font-bold text-zinc-900">
                {currentPath.startsWith('/store/admin/pedido/')
                  ? 'Detalhes do Pedido'
                  : NAV_ITEMS.find(i => 
                      currentPath === i.path || 
                      (i.path !== '/store/admin' && currentPath.startsWith(i.path))
                    )?.label || 'Admin'}
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-4 sm:py-6">
        <AdminScrollManager />
        <Outlet context={{ authenticated, setAuthenticated: handleLogout }} />
      </main>
    </div>
  );
}
