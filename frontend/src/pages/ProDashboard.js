import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, FilePlus, UserPlus, FileText, CheckCircle2, AlertCircle, DollarSign, Send } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

export default function ProDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({ patients_count: 0, orders_count: 0, recent_orders: [] });
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [currentPatientId, setCurrentPatientId] = useState(null);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [billingForm, setBillingForm] = useState({
    cpf: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: ''
  });

  const fetchData = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/pro/dashboard`, { withCredentials: true });
      setStats(res.data);
    } catch (err) {
      toast.error('Erro ao carregar dados.');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGenerateBilling = async (orderId) => {
    try {
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/orders/${orderId}/billing`, {}, { withCredentials: true });
      if (res.data.needs_completion) {
        // Open modal
        setCurrentPatientId(res.data.patient._id);
        setCurrentOrderId(orderId);
        setBillingForm({
          cpf: res.data.patient.cpf || '',
          email: res.data.patient.email || '',
          phone: res.data.patient.phone || '',
          address: res.data.patient.address || '',
          city: '',
          state: ''
        });
        setBillingModalOpen(true);
      } else {
        toast.success('Cobrança gerada com sucesso!');
        fetchData();
      }
    } catch (err) {
      toast.error('Erro ao gerar cobrança.');
    }
  };

  const handleSendInvoice = async (orderId) => {
    try {
      await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/orders/${orderId}/send-invoice`, {}, { withCredentials: true });
      toast.success('Fatura enviada via WhatsApp!');
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erro ao enviar fatura.';
      toast.error(msg);
    }
  };

  const submitBillingInfo = async (e) => {
    e.preventDefault();
    if (!billingForm.cpf || !billingForm.email || !billingForm.phone) {
      toast.error("Preencha CPF, Email e Telefone.");
      return;
    }
    
    try {
      await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/pro/patients/${currentPatientId}`, billingForm, { withCredentials: true });
      setBillingModalOpen(false);
      // Retry billing
      await handleGenerateBilling(currentOrderId);
    } catch (err) {
      toast.error('Erro ao salvar dados do paciente.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row relative">
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
                <th className="px-6 py-4">Paciente</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Ação / Cobrança</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_orders.length === 0 ? (
                <tr><td colSpan="4" className="px-6 py-8 text-center text-muted-foreground">Nenhum pedido realizado.</td></tr>
              ) : stats.recent_orders.map(order => (
                <tr key={order._id} className="border-b border-border/50 bg-card hover:bg-secondary/30">
                  <td className="px-6 py-4 whitespace-nowrap">{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4">{order.patient_name} <br/><span className="text-xs text-muted-foreground">ID: {order.patient_id.substring(0,6)}</span></td>
                  <td className="px-6 py-4"><span className="px-2 py-1 bg-primary/10 text-primary text-xs font-bold border border-primary/20">{order.status}</span></td>
                  <td className="px-6 py-4 space-y-1">
                    {!order.payment_link && (
                      <Button variant="outline" size="sm" className="rounded-none h-8 text-xs border-primary text-primary hover:bg-primary hover:text-white" onClick={() => handleGenerateBilling(order._id)}>
                        <DollarSign className="w-3 h-3 mr-1" /> Gerar Cobrança
                      </Button>
                    )}
                    {order.payment_link && !order.invoice_sent_at && (
                      <Button variant="outline" size="sm" className="rounded-none h-8 text-xs border-primary text-primary hover:bg-primary hover:text-white" onClick={() => handleSendInvoice(order._id)}>
                        <Send className="w-3 h-3 mr-1" /> Enviar Fatura
                      </Button>
                    )}
                    {order.invoice_sent_at && (
                      <span className="text-success flex items-center gap-1 text-xs"><CheckCircle2 className="w-3 h-3"/> Fatura enviada</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal - Completar Dados de Cobrança */}
      {billingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-lg font-heading">Completar Cadastro</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Para gerar a cobrança no Mercado Pago e enviar via WhatsApp, informe os dados obrigatórios do paciente.
            </p>
            
            <form onSubmit={submitBillingInfo} className="space-y-4">
              <div>
                <Label>CPF *</Label>
                <Input required className="rounded-none bg-input" placeholder="000.000.000-00" value={billingForm.cpf} onChange={e => setBillingForm({...billingForm, cpf: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email *</Label>
                  <Input required type="email" className="rounded-none bg-input" value={billingForm.email} onChange={e => setBillingForm({...billingForm, email: e.target.value})} />
                </div>
                <div>
                  <Label>WhatsApp *</Label>
                  <Input required className="rounded-none bg-input" placeholder="(11) 99999-9999" value={billingForm.phone} onChange={e => setBillingForm({...billingForm, phone: e.target.value})} />
                </div>
              </div>
              <div>
                <Label>Endereço Completo</Label>
                <Input className="rounded-none bg-input" placeholder="Rua, Número, Bairro" value={billingForm.address} onChange={e => setBillingForm({...billingForm, address: e.target.value})} />
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="outline" className="rounded-none border-border" onClick={() => setBillingModalOpen(false)}>Cancelar</Button>
                <Button type="submit" className="rounded-none bg-primary text-white">Salvar e Enviar Cobrança</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
