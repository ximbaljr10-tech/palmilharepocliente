import React, { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { MEDUSA_URL } from './adminApi';

export default function AdminLogin({ onLogin }: { onLogin: () => void }) {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const authData = await authRes.json();
      if (!authData.token) {
        setError('Email ou senha incorretos.');
        setLoading(false);
        return;
      }

      const verifyRes = await fetch(`${MEDUSA_URL}/admin/pedidos`, {
        headers: { 'Authorization': `Bearer ${authData.token}`, 'Content-Type': 'application/json' },
      });
      if (verifyRes.status === 401 || verifyRes.status === 403) {
        setError('Sem permissao de administrador.');
        setLoading(false);
        return;
      }

      localStorage.setItem('admin_token', authData.token);
      onLogin();
    } catch {
      setError('Erro ao conectar. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-zinc-100 text-center space-y-6">
        <div className="w-14 h-14 bg-zinc-900 text-white rounded-2xl flex items-center justify-center mx-auto">
          <Lock size={28} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Painel Administrativo</h1>
          <p className="text-zinc-400 text-xs mt-1">Acesso restrito</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="Email"
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-400 outline-none text-sm"
            autoFocus
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="Senha"
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-400 outline-none text-sm"
            required
          />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-zinc-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Entrando...</> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
