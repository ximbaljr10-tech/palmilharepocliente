import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Login realizado com sucesso!');
      navigate('/dashboard'); // Redirection will be handled by ProtectedRoute based on role
    } catch (err) {
      // Mostra erro PRECISO com codigo HTTP e detalhe do backend
      let msg;
      if (err.response) {
        const status = err.response.status;
        const detail = err.response.data?.detail || err.response.statusText || 'Erro desconhecido';
        msg = `Erro ${status}: ${detail}`;
      } else if (err.request) {
        msg = `Erro de rede: ${err.message}. Servidor pode estar offline ou bloqueado por CORS.`;
      } else {
        msg = `Erro interno: ${err.message}`;
      }
      console.error('[Login] erro completo:', err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="mb-8">
            <Link to="/" className="font-heading font-bold text-2xl tracking-tighter text-primary">AXIOM</Link>
            <h2 className="mt-8 text-3xl font-heading font-medium tracking-tight text-foreground">Entrar na plataforma</h2>
            <p className="mt-2 text-sm text-muted-foreground">Painel exclusivo para profissionais.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email" className="text-muted-foreground">E-mail / Usuário</Label>
              <div className="mt-1">
                <Input
                  id="email"
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-none border-border bg-input focus-visible:ring-primary focus-visible:border-primary"
                  data-testid="login-email"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-muted-foreground">Senha</Label>
              <div className="mt-1">
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-none border-border bg-input focus-visible:ring-primary focus-visible:border-primary"
                  data-testid="login-password"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-none h-12 bg-primary hover:bg-primary/90 text-white font-medium transition-transform hover:-translate-y-[2px]"
              data-testid="login-submit"
            >
              {loading ? 'Acessando...' : 'Acessar Painel'}
            </Button>
            
            <div className="text-sm text-center text-muted-foreground">
              Não tem conta? <Link to="/register" className="text-primary hover:underline">Cadastre-se</Link>
            </div>
          </form>
        </div>
      </div>
      <div className="hidden lg:block relative w-0 flex-1 border-l border-border bg-secondary/30">
        <img
          className="absolute inset-0 h-full w-full object-cover opacity-30 grayscale"
          src="https://images.unsplash.com/photo-1764443994825-fdf138cb1653?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxhYnN0cmFjdCUyMGFyY2hpdGVjdHVyYWwlMjBzdHJ1Y3R1cmUlMjBkYXJrfGVufDB8fHx8MTc3NjExNTIwOXww&ixlib=rb-4.1.0&q=85"
          alt=""
        />
        <div className="absolute inset-0 bg-background/50 mix-blend-multiply" />
      </div>
    </div>
  );
}