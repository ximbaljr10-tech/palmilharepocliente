import { Mail, MapPin, Clock, Instagram } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Breadcrumbs from '../components/Breadcrumbs';

export default function Contato() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Contato - Dente de Tubarao | Fale Conosco";
    document.querySelector('meta[name="description"]')?.setAttribute('content', "Entre em contato com a Dente de Tubarao. Atendimento por e-mail e Instagram. Horario: Segunda a Sabado, 8h as 18h. Goiania - GO.");
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <Breadcrumbs items={[{ label: 'Contato' }]} />
      <div className="bg-white rounded-3xl border border-zinc-100 p-6 sm:p-10 space-y-6">
        <h1 className="text-3xl font-bold text-zinc-900">Fale Conosco</h1>
        <p className="text-zinc-600 leading-relaxed">
          Estamos disponiveis para atender voce! Seja para duvidas sobre produtos, acompanhamento de pedidos ou qualquer outra necessidade, entre em contato por qualquer um dos canais abaixo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <p className="text-xs text-zinc-400 mt-0.5">Resposta em ate 24h uteis</p>
            </div>
          </a>
          <a
            href="https://www.instagram.com/dentedetubaraooficial"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-pink-50 border border-pink-100 rounded-2xl p-5 hover:border-pink-300 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
              <Instagram size={22} className="text-pink-600" />
            </div>
            <div>
              <p className="font-semibold text-zinc-900 text-sm">Instagram</p>
              <p className="text-sm text-zinc-500">@dentedetubaraooficial</p>
              <p className="text-xs text-zinc-400 mt-0.5">Novidades e atendimento via DM</p>
            </div>
          </a>
        </div>

        <div className="bg-zinc-50 rounded-2xl p-5 flex items-start gap-4">
          <MapPin size={20} className="text-zinc-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Localizacao</p>
            <p className="text-sm text-zinc-500">Goiania - GO, Brasil</p>
            <p className="text-xs text-zinc-400 mt-1">Atendemos todo o territorio nacional com envio pelos Correios (PAC e SEDEX).</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-800 font-bold">Horario de atendimento</p>
              <p className="text-sm text-amber-700 mt-1">Segunda a Sabado, das 8h as 18h.</p>
              <p className="text-xs text-amber-600 mt-1">Pedidos feitos fora desse horario serao processados no proximo dia util.</p>
            </div>
          </div>
        </div>

        <div className="prose prose-zinc max-w-none prose-sm">
          <h2>Perguntas Frequentes</h2>
          <p><strong>Quanto tempo demora para meu pedido ser enviado?</strong><br/>Apos confirmacao do pagamento via PIX, seu pedido sera preparado e postado em ate 3 dias uteis.</p>
          <p><strong>Como acompanho meu pedido?</strong><br/>Voce recebera um e-mail com o codigo de rastreio. Tambem pode consultar na pagina "Acompanhar Pedido" no topo do site.</p>
          <p><strong>Quais formas de pagamento aceitam?</strong><br/>Aceitamos pagamento via PIX. Apos finalizar o pedido, voce recebera os dados para transferencia.</p>
          <p><strong>Posso trocar a cor da linha?</strong><br/>No momento da compra voce escolhe suas cores em ordem de preferencia. Caso a 1a opcao esteja indisponivel, enviaremos a proxima da lista.</p>
        </div>
      </div>
    </div>
  );
}
