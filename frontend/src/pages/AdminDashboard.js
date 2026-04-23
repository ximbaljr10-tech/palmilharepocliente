import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../config';
import { LogOut, LayoutDashboard, Users, Settings, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({ pro_count: 0, order_count: 0, recent_orders: [] });
  const [settings, setSettings] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [pros, setPros] = useState([]);

  // WA States
  const [waStatus, setWaStatus] = useState({ connected: false, hasQR: false });
  const [waQR, setWaQR] = useState(null);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get(api(`/api/admin/dashboard`), { withCredentials: true });
      setStats(res.data);
    } catch (err) {
      toast.error('Erro ao buscar dados do painel.');
    }
  };

  const fetchPros = async () => {
    try {
      const res = await axios.get(api(`/api/admin/professionals`), { withCredentials: true });
      setPros(res.data);
    } catch (err) {
      toast.error('Erro ao buscar profissionais.');
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get(api(`/api/admin/settings`), { withCredentials: true });
      setSettings(res.data);
    } catch (err) {}
  };

  const checkWaStatus = async () => {
    try {
      const res = await axios.get(api(`/api/admin/whatsapp/status`), { withCredentials: true });
      setWaStatus(res.data);
      if (res.data.hasQR && !res.data.connected) {
        const qrRes = await axios.get(api(`/api/admin/whatsapp/qr`), { withCredentials: true });
        setWaQR(qrRes.data.qr);
      } else {
        setWaQR(null);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchDashboard();
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') {
      checkWaStatus();
      const interval = setInterval(checkWaStatus, 3000);
      return () => clearInterval(interval);
    }
    if (activeTab === 'pros') {
      fetchPros();
    }
  }, [activeTab]);

  const handleSettingsSave = async (e) => {
    e.preventDefault();
    try {
      await axios.post(api(`/api/admin/settings`), settings, { withCredentials: true });
      toast.success('Configurações salvas com sucesso.');
    } catch (err) {
      toast.error('Erro ao salvar.');
    }
  };

  const handleWaConnect = async () => {
    try {
      await axios.post(api(`/api/admin/whatsapp/connect`), {}, { withCredentials: true });
      toast.info('Gerando QR Code...');
    } catch (err) {}
  };

  const handleWaDisconnect = async () => {
    try {
      await axios.post(api(`/api/admin/whatsapp/disconnect`), {}, { withCredentials: true });
      toast.info('Desconectado.');
    } catch (err) {}
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r border-border bg-card p-6 flex flex-col">
        <div className="font-heading font-bold text-2xl text-primary mb-12 tracking-tighter">AXIOM <span className="text-sm font-normal text-muted-foreground ml-2">ADMIN</span></div>
        <nav className="flex-1 space-y-2">
          <Button variant={activeTab === 'overview' ? 'default' : 'ghost'} className={`w-full justify-start rounded-none ${activeTab === 'overview' ? 'bg-primary text-white' : ''}`} onClick={() => setActiveTab('overview')} data-testid="tab-overview">
            <LayoutDashboard className="mr-2 h-4 w-4" /> Visão Geral
          </Button>
          <Button variant={activeTab === 'pros' ? 'default' : 'ghost'} className={`w-full justify-start rounded-none ${activeTab === 'pros' ? 'bg-primary text-white' : ''}`} onClick={() => setActiveTab('pros')} data-testid="tab-pros">
            <Users className="mr-2 h-4 w-4" /> Profissionais
          </Button>
          <Button variant={activeTab === 'settings' ? 'default' : 'ghost'} className={`w-full justify-start rounded-none ${activeTab === 'settings' ? 'bg-primary text-white' : ''}`} onClick={() => setActiveTab('settings')} data-testid="tab-settings">
            <Settings className="mr-2 h-4 w-4" /> Integrações
          </Button>
        </nav>
        <div className="mt-auto border-t border-border pt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-secondary flex items-center justify-center font-heading text-primary border border-border">A</div>
            <div>
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <Button variant="outline" className="w-full rounded-none border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-colors" onClick={logout} data-testid="btn-logout">
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-12 overflow-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-heading font-medium">Painel de Controle</h1>
          <p className="text-muted-foreground mt-1">Bem-vindo(a), {user?.name}. Aqui estão os dados da plataforma.</p>
        </header>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="rounded-none border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><Users className="w-4 h-4 mr-2" /> Profissionais Ativos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-heading">{stats.pro_count}</div>
                </CardContent>
              </Card>
              <Card className="rounded-none border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><Activity className="w-4 h-4 mr-2" /> Pedidos Totais</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-heading">{stats.order_count}</div>
                </CardContent>
              </Card>
            </div>

            <h2 className="text-xl font-heading font-medium mt-12 mb-6">Pedidos Recentes</h2>
            <div className="border border-border">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4">Data</th>
                    <th className="px-6 py-4">Paciente (ID)</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_orders.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-8 text-center text-muted-foreground">Nenhum pedido recente.</td></tr>
                  ) : stats.recent_orders.map(order => (
                    <tr key={order._id} className="border-b border-border/50 bg-card hover:bg-secondary/30">
                      <td className="px-6 py-4">{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="px-6 py-4">{order.patient_id.substring(0,8)}...</td>
                      <td className="px-6 py-4"><span className="px-2 py-1 bg-primary/10 text-primary text-xs font-bold">{order.status}</span></td>
                      <td className="px-6 py-4 text-right font-mono">R$ {order.price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'pros' && (
          <div className="space-y-6">
            <h2 className="text-xl font-heading font-medium">Profissionais Cadastrados</h2>
            <div className="border border-border">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4">Nome</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Cadastrado em</th>
                  </tr>
                </thead>
                <tbody>
                  {pros.length === 0 ? (
                    <tr><td colSpan="3" className="px-6 py-8 text-center text-muted-foreground">Nenhum profissional cadastrado.</td></tr>
                  ) : pros.map(p => (
                    <tr key={p._id} className="border-b border-border/50 bg-card hover:bg-secondary/30">
                      <td className="px-6 py-4 font-medium">{p.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{p.email}</td>
                      <td className="px-6 py-4 text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-8">
            <div className="p-6 border border-border bg-card flex flex-col items-center justify-center text-center">
              <h3 className="text-lg font-heading mb-2">WhatsApp Web API (Baileys)</h3>
              <p className="text-sm text-muted-foreground mb-4">Escaneie o QR Code abaixo com seu WhatsApp para ativar as notificações automáticas e envio de cobranças.</p>
              
              <div className="w-64 h-64 bg-white p-2 border border-border mb-4 flex items-center justify-center">
                {waStatus.connected ? (
                  <div className="text-success flex flex-col items-center"><CheckCircle2 className="w-16 h-16 mb-2" /> <span className="font-bold">Conectado!</span></div>
                ) : waQR ? (
                  <img src={waQR} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-muted-foreground text-sm flex flex-col items-center"><AlertCircle className="w-8 h-8 mb-2" /> Aguardando inicialização...</div>
                )}
              </div>
              
              <div className="flex gap-4">
                {!waStatus.connected && <Button variant="outline" className="rounded-none border-border" onClick={handleWaConnect}>Gerar QR Code</Button>}
                {waStatus.connected && <Button variant="destructive" className="rounded-none" onClick={handleWaDisconnect}>Desconectar</Button>}
              </div>
            </div>

            <form onSubmit={handleSettingsSave} className="space-y-6">
              <Card className="rounded-none border-border bg-card">
                <CardHeader>
                  <CardTitle className="font-heading">Mercado Pago</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Access Token (Para Geração de PIX Automático)</Label>
                    <Input className="rounded-none bg-input" type="text" value={settings.mp_access_token || ''} onChange={e => setSettings({...settings, mp_access_token: e.target.value})} placeholder="APP_USR-..." data-testid="input-mp-token"/>
                  </div>
                </CardContent>
              </Card>

              <Button type="submit" className="rounded-none bg-primary text-white w-full h-12" data-testid="btn-save-settings">Salvar Configurações API</Button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
