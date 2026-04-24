import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Upload, X as XIcon, Image as ImageIcon, FileText,
  Video as VideoIcon, Check, ChevronRight, Footprints, Camera, FileUp,
  Loader2, PlusCircle, AlertCircle, Trash2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

import { api } from '../config';
import {
  TIPO_CALCADO, NUMERACAO_OPTIONS, TIPO_MODELO, TIPO_REVESTIMENTO,
  REVESTIMENTO_EVA, ESPECIFICACOES, DEFAULT_DETAILS, PRECO_BASE, labelFromList,
} from '../lib/insoleConstants';
import FootDiagram from '../components/FootDiagram';

const MAX_FILE_MB = 16;
const ALLOWED_MIMES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-matroska',
];

// ---------------------------------------------------------------------------
// Dropzone para fotos + vídeos
// ---------------------------------------------------------------------------
function MediaDropzone({ label, sub, kind, files, onFiles, onRemove, disabled }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = (list) => {
    const arr = Array.from(list || []);
    const valid = [];
    for (const f of arr) {
      if (!ALLOWED_MIMES.includes(f.type)) {
        toast.error(`Tipo não suportado: ${f.name} (${f.type || '?'})`);
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name} excede ${MAX_FILE_MB}MB`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length) onFiles(valid);
  };

  const accept = ALLOWED_MIMES.join(',');

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-xl p-6 md:p-8 text-center transition-colors cursor-pointer
          ${drag ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'}`}
      >
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="font-medium text-gray-700 text-sm md:text-base">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          data-testid={`file-input-${kind}`}
        />
      </div>
      {files && files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li
              key={f._tempId || f._id}
              className="flex items-center gap-2 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2"
            >
              {f.content_type?.startsWith('video/') ? (
                <VideoIcon className="w-4 h-4 text-indigo-500 shrink-0" />
              ) : f.content_type?.startsWith('image/') ? (
                <ImageIcon className="w-4 h-4 text-teal-500 shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-gray-500 shrink-0" />
              )}
              <span className="flex-1 truncate text-gray-700">{f.name || f.filename}</span>
              <span className={`text-xs shrink-0 ${
                f.uploading ? 'text-amber-600' : f.error ? 'text-red-600' : 'text-green-600'
              }`}>
                {f.uploading
                  ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/>enviando</span>
                  : f.error ? 'erro' : 'ok'}
              </span>
              <button
                type="button"
                onClick={() => onRemove(f)}
                className="text-gray-400 hover:text-red-500 shrink-0"
                aria-label="remover"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abas do modal (Modelo / Detalhes / Observação)
// ---------------------------------------------------------------------------
function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-xs md:text-sm font-medium rounded-full transition-all
        ${active
          ? 'bg-white text-teal-700 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
        }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Seletor nativo estilizado
// ---------------------------------------------------------------------------
function Select({ value, onChange, options, placeholder, 'data-testid': testid }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testid}
      className="w-full h-11 px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-800
                 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 appearance-none
                 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]
                 bg-no-repeat bg-[right_0.75rem_center] pr-10"
    >
      <option value="">{placeholder || 'Selecione o item'}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Aba DETALHES — lista de especificações para um pé
// ---------------------------------------------------------------------------
function SpecList({ title, side, onChange }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <ul className="space-y-2">
        {ESPECIFICACOES.map((e) => {
          const item = side[e.key] || { enabled: false, value: '' };
          return (
            <li key={e.key} className="flex items-center gap-2">
              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!item.enabled}
                  onChange={(ev) =>
                    onChange(e.key, { ...item, enabled: ev.target.checked })
                  }
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700" title={e.hint}>{e.label}</span>
              </label>
              <input
                type="text"
                placeholder="mm"
                disabled={!item.enabled}
                value={item.value || ''}
                onChange={(ev) =>
                  onChange(e.key, { ...item, value: ev.target.value })
                }
                className={`w-20 h-8 px-2 text-sm text-center rounded-md border
                  ${item.enabled ? 'bg-white border-gray-300' : 'bg-gray-100 border-gray-200 text-gray-400'}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina principal — novo pedido
// ---------------------------------------------------------------------------
export default function NewOrder() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('modelo'); // modelo | detalhes | observacao | anexos
  const [patientMode, setPatientMode] = useState('existing'); // existing | new

  const [patient, setPatient] = useState({
    id: '',
    name: '',
    age: '',
    phone: '',
    email: '',
    cpf: '',
  });

  const [presc, setPresc] = useState({
    tipo_calcado: '',
    numeracao: '',
    tipo_modelo: '',
    tipo_revestimento: 'EVA',
    revestimento_eva: '',
    details: DEFAULT_DETAILS(),
    observacao: '',
  });

  const [photoFiles, setPhotoFiles] = useState([]);
  const [videoFiles, setVideoFiles] = useState([]);
  const [exams, setExams] = useState([]);

  // Carrega pacientes
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(api('/api/pro/patients'), { withCredentials: true });
        setPatients(res.data || []);
      } catch (_) { /* silencioso */ }
      finally { setLoadingPatients(false); }
    })();
  }, []);

  const total = useMemo(() => {
    if (!presc.tipo_modelo) return 0;
    return PRECO_BASE[presc.tipo_modelo] || 250;
  }, [presc.tipo_modelo]);

  const canSubmit = !!(
    (patient.id || patient.name) &&
    presc.tipo_calcado && presc.numeracao && presc.tipo_modelo
  );

  // cria paciente novo se necessario
  const ensurePatient = async () => {
    if (patient.id) return patient.id;
    if (!patient.name) {
      throw new Error('Informe o nome do paciente.');
    }
    const body = {
      name: patient.name,
      age: patient.age ? Number(patient.age) : null,
      phone: patient.phone || null,
      email: patient.email || null,
      cpf: patient.cpf || null,
    };
    const res = await axios.post(api('/api/pro/patients'), body, { withCredentials: true });
    setPatient((p) => ({ ...p, id: res.data._id }));
    setPatients((arr) => [res.data, ...arr]);
    return res.data._id;
  };

  const handleSelectPatient = (id) => {
    const p = patients.find((x) => x._id === id);
    if (p) {
      setPatient({
        id: p._id,
        name: p.name || '',
        age: p.age || '',
        phone: p.phone || '',
        email: p.email || '',
        cpf: p.cpf || '',
      });
    } else {
      setPatient({ id: '', name: '', age: '', phone: '', email: '', cpf: '' });
    }
  };

  // ----------------- upload -----------------
  const uploadFiles = async (kind, rawFiles, setter) => {
    let pid;
    try {
      pid = await ensurePatient();
    } catch (e) {
      toast.error(e.message || 'Erro ao preparar paciente para upload.');
      return;
    }
    const staged = rawFiles.map((f) => ({
      _tempId: `${f.name}-${f.size}-${Math.random()}`,
      name: f.name,
      content_type: f.type,
      uploading: true,
    }));
    setter((prev) => [...prev, ...staged]);

    for (let i = 0; i < rawFiles.length; i++) {
      const f = rawFiles[i];
      const tempId = staged[i]._tempId;
      try {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('patient_id', pid);
        fd.append('kind', kind);
        const res = await axios.post(api('/api/uploads'), fd, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setter((prev) => prev.map((x) =>
          x._tempId === tempId
            ? { ...x, uploading: false, _id: res.data._id, filename: res.data.filename, content_type: res.data.content_type }
            : x
        ));
      } catch (err) {
        setter((prev) => prev.map((x) =>
          x._tempId === tempId
            ? { ...x, uploading: false, error: true }
            : x
        ));
        const detail = err.response?.data?.detail || err.message;
        toast.error(`Falha no upload de ${f.name}: ${detail}`);
      }
    }
  };

  const removeFile = async (file, setter) => {
    setter((prev) => prev.filter((x) => x !== file));
    if (file._id) {
      try { await axios.delete(api(`/api/uploads/${file._id}`), { withCredentials: true }); }
      catch (_) { /* ignore */ }
    }
  };

  // ----------------- salvar pedido -----------------
  const handleSave = async () => {
    if (!canSubmit) {
      toast.error('Preencha: paciente + tipo + numeração + modelo.');
      setTab('modelo');
      return;
    }
    setSaving(true);
    try {
      const pid = await ensurePatient();
      const upload_ids = [...photoFiles, ...videoFiles, ...exams]
        .filter((f) => f._id)
        .map((f) => f._id);

      const payload = {
        patient_id: pid,
        prescription: {
          tipo_calcado:      presc.tipo_calcado,
          numeracao:         presc.numeracao,
          tipo_modelo:       presc.tipo_modelo,
          tipo_revestimento: presc.tipo_revestimento,
          revestimento_eva:  presc.revestimento_eva,
          details:           presc.details,
          observacao:        presc.observacao,
        },
        upload_ids,
        price: total,
      };
      await axios.post(api('/api/orders/'), payload, { withCredentials: true });
      toast.success('Pedido salvo com sucesso!');
      navigate('/dashboard/orders');
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail || err.message;
      toast.error(`Erro ${status || ''}: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Cabeçalho fixo mobile-first */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            data-testid="btn-back-dash"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Voltar</span>
          </button>
          <h1 className="font-semibold text-gray-900 text-sm md:text-base">
            Prescrição Palmilhas 3DPÉ
          </h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
            aria-label="Fechar"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-6 pb-32">
        {/* Seleção/criação de paciente */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
              <Footprints className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-gray-900 text-sm md:text-base">Paciente</h2>
          </div>

          <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-full w-full md:w-fit">
            <button
              type="button"
              onClick={() => { setPatientMode('existing'); setPatient({ id: '', name: '', age: '', phone: '', email: '', cpf: '' }); }}
              className={`px-4 py-1.5 text-xs md:text-sm rounded-full transition-all ${patientMode === 'existing' ? 'bg-white shadow-sm text-teal-700' : 'text-gray-500'}`}
              data-testid="tab-patient-existing"
            >
              Existente
            </button>
            <button
              type="button"
              onClick={() => { setPatientMode('new'); setPatient({ id: '', name: '', age: '', phone: '', email: '', cpf: '' }); }}
              className={`px-4 py-1.5 text-xs md:text-sm rounded-full transition-all ${patientMode === 'new' ? 'bg-white shadow-sm text-teal-700' : 'text-gray-500'}`}
              data-testid="tab-patient-new"
            >
              Novo
            </button>
          </div>

          {patientMode === 'existing' ? (
            <div>
              <Label className="text-xs text-gray-500">Selecionar paciente</Label>
              <Select
                value={patient.id}
                onChange={handleSelectPatient}
                options={patients.map((p) => ({
                  value: p._id,
                  label: `${p.name}${p.age ? ` · ${p.age} anos` : ''}${p.phone ? ` · ${p.phone}` : ''}`,
                }))}
                placeholder={loadingPatients ? 'Carregando...' : 'Selecione o paciente cadastrado'}
                data-testid="select-existing-patient"
              />
              {patient.id && (
                <div className="mt-3 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 grid grid-cols-2 gap-y-1">
                  <div>Idade: <b className="text-gray-800">{patient.age || '—'}</b></div>
                  <div>Telefone: <b className="text-gray-800">{patient.phone || '—'}</b></div>
                  <div>E-mail: <b className="text-gray-800">{patient.email || '—'}</b></div>
                  <div>CPF: <b className="text-gray-800">{patient.cpf || '—'}</b></div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">Nome *</Label>
                <Input
                  className="mt-1 h-11 rounded-lg border-gray-200 bg-white"
                  placeholder="Nome completo"
                  value={patient.name}
                  onChange={(e) => setPatient((p) => ({ ...p, name: e.target.value }))}
                  data-testid="input-patient-name"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Idade</Label>
                <Input
                  type="number"
                  min="0" max="130"
                  className="mt-1 h-11 rounded-lg border-gray-200 bg-white"
                  placeholder="33"
                  value={patient.age}
                  onChange={(e) => setPatient((p) => ({ ...p, age: e.target.value }))}
                  data-testid="input-patient-age"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">WhatsApp</Label>
                <Input
                  className="mt-1 h-11 rounded-lg border-gray-200 bg-white"
                  placeholder="(48) 99180-3859"
                  value={patient.phone}
                  onChange={(e) => setPatient((p) => ({ ...p, phone: e.target.value }))}
                  data-testid="input-patient-phone"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">E-mail</Label>
                <Input
                  type="email"
                  className="mt-1 h-11 rounded-lg border-gray-200 bg-white"
                  placeholder="paciente@email.com"
                  value={patient.email}
                  onChange={(e) => setPatient((p) => ({ ...p, email: e.target.value }))}
                  data-testid="input-patient-email"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-gray-500">CPF (para emissão de fatura)</Label>
                <Input
                  className="mt-1 h-11 rounded-lg border-gray-200 bg-white"
                  placeholder="000.000.000-00"
                  value={patient.cpf}
                  onChange={(e) => setPatient((p) => ({ ...p, cpf: e.target.value }))}
                  data-testid="input-patient-cpf"
                />
              </div>
            </div>
          )}
        </section>

        {/* Card principal da prescrição com abas */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
          {/* Campo Nome (topo) */}
          <div className="mb-5">
            <Label className="text-xs text-gray-500">Nome*</Label>
            <Input
              disabled
              className="mt-1 h-11 bg-gray-50 rounded-lg border-gray-200 text-gray-700"
              value={patient.name || '—'}
            />
          </div>

          {/* Abas */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-full mb-5">
            <TabButton active={tab === 'modelo'}     onClick={() => setTab('modelo')}>Modelo</TabButton>
            <TabButton active={tab === 'detalhes'}   onClick={() => setTab('detalhes')}>Detalhes*</TabButton>
            <TabButton active={tab === 'anexos'}     onClick={() => setTab('anexos')}>Anexos</TabButton>
            <TabButton active={tab === 'observacao'} onClick={() => setTab('observacao')}>Observação</TabButton>
          </div>

          {/* -------- MODELO -------- */}
          {tab === 'modelo' && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-gray-500">Tipo*</Label>
                <Select
                  value={presc.tipo_calcado}
                  onChange={(v) => setPresc((p) => ({ ...p, tipo_calcado: v }))}
                  options={TIPO_CALCADO}
                  data-testid="select-tipo"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Numeração*</Label>
                <Select
                  value={presc.numeracao}
                  onChange={(v) => setPresc((p) => ({ ...p, numeracao: v }))}
                  options={NUMERACAO_OPTIONS}
                  data-testid="select-numeracao"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Tipo modelo*</Label>
                <Select
                  value={presc.tipo_modelo}
                  onChange={(v) => setPresc((p) => ({ ...p, tipo_modelo: v }))}
                  options={TIPO_MODELO}
                  data-testid="select-tipo-modelo"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Tipo revestimento</Label>
                <Select
                  value={presc.tipo_revestimento}
                  onChange={(v) => setPresc((p) => ({ ...p, tipo_revestimento: v }))}
                  options={TIPO_REVESTIMENTO}
                />
              </div>
              {presc.tipo_revestimento === 'EVA' && (
                <div>
                  <Label className="text-xs text-gray-500">Revestimento EVA*</Label>
                  <Select
                    value={presc.revestimento_eva}
                    onChange={(v) => setPresc((p) => ({ ...p, revestimento_eva: v }))}
                    options={REVESTIMENTO_EVA}
                    data-testid="select-rev-eva"
                  />
                </div>
              )}
            </div>
          )}

          {/* -------- DETALHES -------- */}
          {tab === 'detalhes' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 items-start">
                <SpecList
                  title="Pé esquerdo"
                  side={presc.details.left}
                  onChange={(key, val) =>
                    setPresc((p) => ({
                      ...p,
                      details: { ...p.details, left: { ...p.details.left, [key]: val } },
                    }))
                  }
                />
                <div className="hidden md:block">
                  <FootDiagram leftDetails={presc.details.left} rightDetails={presc.details.right} />
                </div>
                <SpecList
                  title="Pé direito"
                  side={presc.details.right}
                  onChange={(key, val) =>
                    setPresc((p) => ({
                      ...p,
                      details: { ...p.details, right: { ...p.details.right, [key]: val } },
                    }))
                  }
                />
              </div>
              <div className="md:hidden mt-6">
                <FootDiagram leftDetails={presc.details.left} rightDetails={presc.details.right} />
              </div>
            </div>
          )}

          {/* -------- ANEXOS -------- */}
          {tab === 'anexos' && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Camera className="w-4 h-4 text-teal-600" />
                  <Label className="text-sm font-medium text-gray-700">Fotos dos pés</Label>
                </div>
                <MediaDropzone
                  kind="photo"
                  label="Arraste fotos dos pés ou clique para enviar"
                  sub="PNG, JPG, WEBP — até 16MB"
                  files={photoFiles}
                  onFiles={(fs) => uploadFiles('photo', fs, setPhotoFiles)}
                  onRemove={(f) => removeFile(f, setPhotoFiles)}
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <VideoIcon className="w-4 h-4 text-indigo-600" />
                  <Label className="text-sm font-medium text-gray-700">Vídeos da pisada / marcha</Label>
                </div>
                <MediaDropzone
                  kind="video"
                  label="Arraste vídeos da marcha/pisada ou clique para enviar"
                  sub="MP4, MOV, WEBM — até 16MB"
                  files={videoFiles}
                  onFiles={(fs) => uploadFiles('video', fs, setVideoFiles)}
                  onRemove={(f) => removeFile(f, setVideoFiles)}
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileUp className="w-4 h-4 text-gray-600" />
                  <Label className="text-sm font-medium text-gray-700">Exames (baropodometria, raio-X...)</Label>
                </div>
                <MediaDropzone
                  kind="exam"
                  label="Arraste PDFs/imagens ou clique para enviar"
                  sub="PDF, PNG, JPG — até 16MB"
                  files={exams}
                  onFiles={(fs) => uploadFiles('exam', fs, setExams)}
                  onRemove={(f) => removeFile(f, setExams)}
                />
              </div>
            </div>
          )}

          {/* -------- OBSERVAÇÃO -------- */}
          {tab === 'observacao' && (
            <div>
              <Label className="text-xs text-gray-500">Observações para a fabricação</Label>
              <textarea
                value={presc.observacao}
                onChange={(e) => setPresc((p) => ({ ...p, observacao: e.target.value }))}
                rows={6}
                placeholder="Instruções específicas, ajustes, detalhes biomecânicos relevantes..."
                className="mt-1 w-full min-h-[160px] p-3 bg-white border border-gray-200 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                data-testid="input-observacao"
              />
            </div>
          )}
        </section>

        {/* Resumo inferior (desktop) */}
        <section className="hidden md:flex items-center justify-between mt-4 bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center gap-3 text-sm">
            {canSubmit ? (
              <>
                <Check className="w-4 h-4 text-teal-600" />
                <span className="text-gray-700">Pronto para salvar</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="text-gray-500">Preencha paciente + tipo + numeração + modelo</span>
              </>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Total</div>
            <div className="text-lg font-semibold text-gray-900">
              R$ {total.toFixed(2).replace('.', ',')}
            </div>
          </div>
        </section>
      </main>

      {/* Barra inferior fixa com total + botão Salvar (mobile-first) */}
      <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Total</div>
            <div className="text-lg font-bold text-gray-900">
              R$ {total.toFixed(2).replace('.', ',')}
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={!canSubmit || saving}
            className="h-12 px-6 rounded-full bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-sm disabled:opacity-60"
            data-testid="btn-save-order"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
              : <>Salvar pedido <ChevronRight className="w-4 h-4 ml-1" /></>
            }
          </Button>
        </div>
      </footer>
    </div>
  );
}
