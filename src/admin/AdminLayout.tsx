import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Menu, X, LayoutDashboard, Package, ShoppingBag, Archive, LogOut, BarChart3, Mail, ClipboardList, User } from 'lucide-react';
import { MEDUSA_URL, logout, needsActorLabel, setActorLabel, getActorLabel, clearActorLabel } from './adminApi';
import AdminLogin from './AdminLogin';

const NAV_ITEMS = [
  { path: '/store/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/store/admin/pedidos', label: 'Pedidos', icon: Package },
  { path: '/store/admin/produtos', label: 'Produtos', icon: ShoppingBag },
  { path: '/store/admin/email', label: 'Email', icon: Mail },
  { path: '/store/admin/itens-vendidos', label: 'Itens Vendidos', icon: BarChart3 },
  { path: '/store/admin/arquivados', label: 'Arquivados', icon: Archive },
  { path: '/store/admin/historico', label: 'Historico', icon: ClipboardList },
];

// Fixed operator options
const OPERATOR_OPTIONS = ['Luana', 'Programador', 'Auditoria'];

// Operator selection modal — shown once per session when actor_label is not set
function OperatorSelectModal({ onSelect }: { onSelect: (label: string) => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-5 shadow-2xl border border-zinc-200">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto bg-zinc-100 rounded-full flex items-center justify-center">
            <User size={28} className="text-zinc-600" />
          </div>
          <h3 className="font-bold text-zinc-900 text-lg">Quem esta operando agora?</h3>
          <p className="text-sm text-zinc-500">Selecione seu perfil para continuar</p>
        </div>
        <div className="space-y-2">
          {OPERATOR_OPTIONS.map((label) => (
            <button
              key={label}
              onClick={() => onSelect(label)}
              className="w-full text-left px-4 py-3.5 rounded-xl border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 active:bg-zinc-100 transition-all text-sm font-semibold text-zinc-800 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-bold text-sm">
                {label.charAt(0)}
              </div>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const [showOperatorSelect, setShowOperatorSelect] = useState(false);
  const [currentOperator, setCurrentOperator] = useState<string | null>(null);
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
          if (res.ok) {
            setAuthenticated(true);
            // Check if operator identification is needed
            if (needsActorLabel()) {
              setShowOperatorSelect(true);
            } else {
              setCurrentOperator(getActorLabel());
            }
          } else {
            localStorage.removeItem('admin_token');
          }
        })
        .catch(() => { localStorage.removeItem('admin_token'); })
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  // Handle operator selection
  const handleOperatorSelect = (label: string) => {
    setActorLabel(label);
    setCurrentOperator(label);
    setShowOperatorSelect(false);
  };

  // Handle login success — check for actor_label
  const handleLoginSuccess = () => {
    setAuthenticated(true);
    if (needsActorLabel()) {
      setShowOperatorSelect(true);
    } else {
      setCurrentOperator(getActorLabel());
    }
  };

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
    return <AdminLogin onLogin={handleLoginSuccess} />;
  }

  const currentPath = location.pathname;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Operator Selection Modal */}
      {showOperatorSelect && <OperatorSelectModal onSelect={handleOperatorSelect} />}

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

          {/* Current operator indicator */}
          {currentOperator && (
            <button
              onClick={() => setShowOperatorSelect(true)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1.5 rounded-lg transition-colors border border-zinc-200"
              title="Trocar operador"
            >
              <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-600">
                {currentOperator.charAt(0)}
              </div>
              <span className="hidden sm:inline font-medium">{currentOperator}</span>
            </button>
          )}
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
