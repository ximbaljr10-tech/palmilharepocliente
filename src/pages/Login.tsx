import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUser } from '../UserContext';
import { api } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const data = await api.login({ email, password });

      if (data.success) {
        login(data.user);
        if (data.user.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/customer');
        }
      } else {
        setError(data.error || 'Erro ao fazer login');
      }
    } catch (err) {
      setError('Erro de conexão');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 mt-12">
      <h1 className="text-2xl font-bold text-zinc-900 mb-6 text-center">Acessar Conta</h1>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-6 text-sm text-center">
          {error}
        </div>
      )}

      <div className="bg-blue-50 text-blue-600 p-3 rounded-xl mb-6 text-xs text-center">
        Para acessar o painel admin, faça login com o e-mail <strong>admin</strong> e senha <strong>admin123</strong>.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">E-mail</label>
          <input
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none"
            placeholder="seu@email.com ou admin"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Senha</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors mt-4"
        >
          Entrar
        </button>
        
        <div className="flex flex-col sm:flex-row justify-between items-center mt-6 pt-6 border-t border-zinc-100 gap-4 text-sm">
          <button 
            type="button"
            onClick={() => alert('Em breve: Envio de código de verificação para o e-mail.')}
            className="text-zinc-500 hover:text-emerald-600 transition-colors"
          >
            Esqueci minha senha
          </button>
          <Link 
            to="/register" 
            className="font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            Criar uma conta
          </Link>
        </div>
      </form>
    </div>
  );
}
