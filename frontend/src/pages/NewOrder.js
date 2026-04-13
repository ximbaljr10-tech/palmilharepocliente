import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronRight, ArrowLeft, Upload, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

export default function NewOrder() {
  const [step, setStep] = useState(1);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Order state
  const [formData, setFormData] = useState({
    patient_id: '',
    new_patient_name: '',
    new_patient_email: '',
    shoe_size: '',
    foot_type: '',
    pathology: '',
    weight: '',
    height: '',
    activity_level: '',
    notes: ''
  });

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/pro/patients`, { withCredentials: true });
        setPatients(res.data);
      } catch (err) {}
    };
    fetchPatients();
  }, []);

  const handleNext = () => {
    if (step === 1 && !formData.patient_id && !formData.new_patient_name) {
      toast.error('Selecione ou crie um paciente.');
      return;
    }
    if (step === 2 && (!formData.shoe_size || !formData.foot_type)) {
      toast.error('Preencha os campos obrigatórios da pisada.');
      return;
    }
    setStep(s => s + 1);
  };

  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let patId = formData.patient_id;
      // If new patient, create first
      if (!patId && formData.new_patient_name) {
        const pRes = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/pro/patients`, {
          name: formData.new_patient_name,
          email: formData.new_patient_email
        }, { withCredentials: true });
        patId = pRes.data._id;
      }

      // Submit order
      await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/orders`, {
        patient_id: patId,
        shoe_size: formData.shoe_size,
        foot_type: formData.foot_type,
        pathology: formData.pathology,
        weight: formData.weight,
        height: formData.height,
        activity_level: formData.activity_level,
        notes: formData.notes,
        baropodometry_data: "mock_base64_data_here"
      }, { withCredentials: true });

      toast.success('Pedido criado com sucesso! O link de pagamento será enviado ao paciente.');
      navigate('/dashboard');
    } catch (err) {
      toast.error('Erro ao criar pedido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="rounded-none hover:bg-secondary" onClick={() => navigate('/dashboard')} data-testid="btn-back-dash">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="font-heading font-medium text-lg">Novo Projeto de Palmilha</h1>
          </div>
          <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <span className={step >= 1 ? 'text-primary' : ''}>1. Paciente</span>
            <ChevronRight className="w-4 h-4" />
            <span className={step >= 2 ? 'text-primary' : ''}>2. Avaliação</span>
            <ChevronRight className="w-4 h-4" />
            <span className={step >= 3 ? 'text-primary' : ''}>3. Anexos</span>
            <ChevronRight className="w-4 h-4" />
            <span className={step >= 4 ? 'text-primary' : ''}>4. Revisão</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 md:px-12 py-12 max-w-3xl">
        <div className="bg-card border border-border p-8 md:p-12 relative overflow-hidden">
          
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom">
              <h2 className="text-2xl font-heading mb-6">Identificação do Paciente</h2>
              <div className="space-y-6">
                <div>
                  <Label>Selecionar Paciente Existente</Label>
                  <select 
                    className="w-full mt-2 h-10 px-3 bg-input border border-border rounded-none focus:outline-none focus:border-primary"
                    value={formData.patient_id}
                    onChange={e => {
                      setFormData({...formData, patient_id: e.target.value, new_patient_name: ''});
                    }}
                    data-testid="select-patient"
                  >
                    <option value="">-- Selecione --</option>
                    {patients.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                </div>
                
                <div className="relative py-4 flex items-center">
                  <div className="flex-grow border-t border-border"></div>
                  <span className="flex-shrink-0 mx-4 text-muted-foreground text-sm uppercase tracking-wider">OU NOVO</span>
                  <div className="flex-grow border-t border-border"></div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Nome do Paciente</Label>
                    <Input className="rounded-none bg-input mt-1" disabled={!!formData.patient_id} value={formData.new_patient_name} onChange={e => setFormData({...formData, new_patient_name: e.target.value})} data-testid="input-new-patient-name" />
                  </div>
                  <div>
                    <Label>WhatsApp / Email do Paciente (Para cobrança)</Label>
                    <Input className="rounded-none bg-input mt-1" disabled={!!formData.patient_id} value={formData.new_patient_email} onChange={e => setFormData({...formData, new_patient_email: e.target.value})} data-testid="input-new-patient-email" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom">
              <h2 className="text-2xl font-heading mb-6">Dados Biomecânicos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Tamanho do Calçado *</Label>
                  <Input className="rounded-none bg-input mt-1" placeholder="Ex: 39/40" value={formData.shoe_size} onChange={e => setFormData({...formData, shoe_size: e.target.value})} data-testid="input-shoe-size" />
                </div>
                <div>
                  <Label>Tipo de Pisada *</Label>
                  <select className="w-full mt-1 h-10 px-3 bg-input border border-border rounded-none focus:outline-none focus:border-primary" value={formData.foot_type} onChange={e => setFormData({...formData, foot_type: e.target.value})} data-testid="select-foot-type">
                    <option value="">-- Selecione --</option>
                    <option value="Neutra">Neutra</option>
                    <option value="Pronada">Pronada (Plana)</option>
                    <option value="Supinada">Supinada (Cava)</option>
                  </select>
                </div>
                <div>
                  <Label>Patologia / Queixa Principal</Label>
                  <Input className="rounded-none bg-input mt-1" placeholder="Ex: Fascite Plantar" value={formData.pathology} onChange={e => setFormData({...formData, pathology: e.target.value})} data-testid="input-pathology" />
                </div>
                <div>
                  <Label>Nível de Atividade</Label>
                  <select className="w-full mt-1 h-10 px-3 bg-input border border-border rounded-none focus:outline-none focus:border-primary" value={formData.activity_level} onChange={e => setFormData({...formData, activity_level: e.target.value})}>
                    <option value="">-- Selecione --</option>
                    <option value="Sedentario">Sedentário</option>
                    <option value="Ativo">Ativo (1-3x semana)</option>
                    <option value="Esportista">Esportista Alta Perf.</option>
                  </select>
                </div>
                <div>
                  <Label>Peso (kg)</Label>
                  <Input className="rounded-none bg-input mt-1" type="number" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} />
                </div>
                <div>
                  <Label>Altura (cm)</Label>
                  <Input className="rounded-none bg-input mt-1" type="number" value={formData.height} onChange={e => setFormData({...formData, height: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom">
              <h2 className="text-2xl font-heading mb-6">Anexos e Imagens</h2>
              <div className="space-y-6">
                <div className="border-2 border-dashed border-border/60 p-12 text-center hover:bg-secondary/20 transition-colors cursor-pointer relative group">
                  <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4 group-hover:text-primary transition-colors" />
                  <p className="font-medium">Upload de Exame de Baropodometria</p>
                  <p className="text-sm text-muted-foreground mt-1">Arraste os arquivos JPG, PNG ou PDF</p>
                  {/* Mocked file input */}
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
                <div className="border-2 border-dashed border-border/60 p-12 text-center hover:bg-secondary/20 transition-colors cursor-pointer relative group">
                  <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4 group-hover:text-primary transition-colors" />
                  <p className="font-medium">Fotos dos Pés (Podoscópio / Plantígrafo)</p>
                </div>
                <div>
                  <Label>Observações Adicionais para a Manufatura</Label>
                  <textarea className="w-full mt-1 min-h-[100px] p-3 bg-input border border-border rounded-none focus:outline-none focus:border-primary text-sm" placeholder="Instruções específicas para os técnicos..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/20">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-heading">Revisão do Pedido</h2>
                <p className="text-muted-foreground">O paciente receberá uma cobrança via Pix no valor de R$ 250,00.</p>
              </div>

              <div className="bg-secondary/30 p-6 border border-border space-y-4 text-sm mb-8">
                <div className="grid grid-cols-2 py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Paciente</span>
                  <span className="font-medium text-right">{formData.new_patient_name || 'Paciente Existente'}</span>
                </div>
                <div className="grid grid-cols-2 py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Tamanho</span>
                  <span className="font-medium text-right">{formData.shoe_size}</span>
                </div>
                <div className="grid grid-cols-2 py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Pisada / Patologia</span>
                  <span className="font-medium text-right">{formData.foot_type} • {formData.pathology}</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-12 flex justify-between pt-6 border-t border-border">
            <Button variant="outline" className="rounded-none border-border" onClick={handleBack} disabled={step === 1 || loading} data-testid="btn-back">
              Voltar
            </Button>
            {step < 4 ? (
              <Button className="rounded-none bg-primary hover:bg-primary/90 text-white" onClick={handleNext} data-testid="btn-next">
                Próximo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button className="rounded-none bg-primary hover:bg-primary/90 text-white" onClick={handleSubmit} disabled={loading} data-testid="btn-submit-order">
                {loading ? 'Processando...' : 'Confirmar e Gerar Cobrança'}
              </Button>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}