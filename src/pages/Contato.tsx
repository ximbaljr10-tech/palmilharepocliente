import { ArrowLeft, MessageCircle, Mail, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Contato() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors text-sm">
        <ArrowLeft size={18} /> Voltar
      </button>
      <div className="bg-white rounded-3xl border border-zinc-100 p-6 sm:p-10 space-y-6">
        <h1 className="text-3xl font-bold text-zinc-900">Contato</h1>
        <p className="text-zinc-600 leading-relaxed">
          Estamos disponiveis para atender voce! Entre em contato por qualquer um dos canais abaixo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="https://wa.me/5561993576505"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-emerald-50 border border-emerald-100 rounded-2xl p-5 hover:border-emerald-300 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <MessageCircle size={22} className="text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-zinc-900 text-sm">WhatsApp</p>
              <p className="text-sm text-zinc-500">(61) 99357-6505</p>
            </div>
          </a>
          <a
            href="mailto:Compras@dentedetubarao.com.br"
            className="flex items-center gap-4 bg-blue-50 border border-blue-100 rounded-2xl p-5 hover:border-blue-300 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <Mail size={22} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-zinc-900 text-sm">E-mail</p>
              <p className="text-sm text-zinc-500 break-all">Compras@dentedetubarao.com.br</p>
            </div>
          </a>
        </div>
        <div className="bg-zinc-50 rounded-2xl p-5 flex items-start gap-4">
          <MapPin size={20} className="text-zinc-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Localizacao</p>
            <p className="text-sm text-zinc-500">Goiania - GO, Brasil</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-sm text-amber-800">
            <strong>Horario de atendimento:</strong> Segunda a Sabado, das 8h as 18h.
            Pedidos feitos fora desse horario serao processados no proximo dia util.
          </p>
        </div>
      </div>
    </div>
  );
}
