import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, FilePlus, UserPlus, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { toast } from 'sonner';

export default function ProDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({ patients_count: 0, orders_count: 0, recent_orders: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/pro/dashboard`, { withCredentials: true });
        setStats(res.data);
      } catch (err) {
        toast.error('Erro ao carregar dados.');
      }
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r border-border bg-card p-6 flex flex-col">
        <div className="font-heading font-bold text-2xl text-primary mb-12 tracking-tighter">AXIOM <span className="text-sm font-normal text-muted-foreground ml-2">PRO</span></div>
        
        <Link to="/dashboard/new-order" data-testid="link-new-order">
          <Button className="w-full rounded-none h-12 bg-primary hover:bg-primary/90 text-white mb-6 font-medium shadow-none transition-transform hover:-translate-y-[2px]">
            <FilePlus className="mr-2 h-4 w-4" /> Novo Pedido
          </Button>
        </Link>
        
        <div className="mt-auto border-t border-border pt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-secondary flex items-center justify-center font-heading text-primary border border-border uppercase">
              {user?.name?.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <Button variant="outline" className="w-full rounded-none border-border hover:bg-destructive/10 hover:text-destructive" onClick={logout} data-testid="btn-logout">
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-12 overflow-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-heading font-medium">Seu Consultório</h1>
          <p className="text-muted-foreground mt-1">Gerencie seus pacientes e pedidos de palmilhas.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <Card className="rounded-none border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><UserPlus className="w-4 h-4 mr-2" /> Pacientes Cadastrados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-heading">{stats.patients_count}</div>
            </CardContent>
          </Card>
          <Card className="rounded-none border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><FileText className="w-4 h-4 mr-2" /> Pedidos Realizados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-heading">{stats.orders_count}</div>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-xl font-heading font-medium mb-6">Meus Pedidos Recentes</h2>
        <div className="border border-border">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Paciente (ID)</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Link de Pagamento (Pix)</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_orders.length === 0 ? (
                <tr><td colSpan="4" className="px-6 py-8 text-center text-muted-foreground">Nenhum pedido realizado.</td></tr>
              ) : stats.recent_orders.map(order => (
                <tr key={order._id} className="border-b border-border/50 bg-card hover:bg-secondary/30">
                  <td className="px-6 py-4">{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4">{order.patient_id.substring(0,8)}...</td>
                  <td className="px-6 py-4"><span className="px-2 py-1 bg-primary/10 text-primary text-xs font-bold border border-primary/20">{order.status}</span></td>
                  <td className="px-6 py-4">
                    {order.payment_link.startsWith('000201') ? (
                      <span className="text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Pix Gerado</span>
                    ) : (
                      <span className="text-muted-foreground">{order.payment_link}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}