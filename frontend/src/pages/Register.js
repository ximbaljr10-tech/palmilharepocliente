import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(name, email, password);
      toast.success('Conta criada com sucesso!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar conta.');
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
            <h2 className="mt-8 text-3xl font-heading font-medium tracking-tight text-foreground">Criar Conta</h2>
            <p className="mt-2 text-sm text-muted-foreground">Junte-se a rede de profissionais parceiros.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="name" className="text-muted-foreground">Nome Completo</Label>
              <div className="mt-1">
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} className="rounded-none border-border bg-input" data-testid="register-name" />
              </div>
            </div>
            
            <div>
              <Label htmlFor="email" className="text-muted-foreground">E-mail Profissional</Label>
              <div className="mt-1">
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-none border-border bg-input" data-testid="register-email" />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-muted-foreground">Senha</Label>
              <div className="mt-1">
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-none border-border bg-input" data-testid="register-password" />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full rounded-none h-12 bg-primary hover:bg-primary/90 text-white font-medium" data-testid="register-submit">
              {loading ? 'Criando...' : 'Criar Conta'}
            </Button>
            
            <div className="text-sm text-center text-muted-foreground">
              Já possui conta? <Link to="/login" className="text-primary hover:underline">Fazer login</Link>
            </div>
          </form>
        </div>
      </div>
      <div className="hidden lg:block relative w-0 flex-1 border-l border-border bg-secondary/30">
        <img
          className="absolute inset-0 h-full w-full object-cover opacity-20"
          src="https://images.unsplash.com/photo-1765914448163-da25d773a87d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxmZWV0JTIwcnVubmluZyUyMHNob2VzJTIwdHJhY2t8ZW58MHx8fHwxNzc2MTE1MTg5fDA&ixlib=rb-4.1.0&q=85"
          alt=""
        />
      </div>
    </div>
  );
}