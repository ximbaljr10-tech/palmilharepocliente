import { ArrowLeft, Truck, Package, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FreteEntrega() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors text-sm">
        <ArrowLeft size={18} /> Voltar
      </button>
      <div className="bg-white rounded-3xl border border-zinc-100 p-6 sm:p-10 space-y-6">
        <h1 className="text-3xl font-bold text-zinc-900">Frete e Entrega</h1>
        <div className="prose prose-zinc max-w-none prose-sm">
          <h2>Como funciona o envio?</h2>
          <p>Todos os envios sao feitos pelos <strong>Correios</strong>, com rastreamento completo. Voce recebera o codigo de rastreio por e-mail assim que o pedido for postado.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Truck size={20} className="text-blue-600" />
              <h3 className="font-bold text-blue-900">PAC</h3>
            </div>
            <p className="text-sm text-blue-700">Entrega economica dos Correios</p>
            <p className="text-xs text-blue-500">Prazo medio: 5 a 12 dias uteis</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Package size={20} className="text-red-600" />
              <h3 className="font-bold text-red-900">SEDEX</h3>
            </div>
            <p className="text-sm text-red-700">Entrega expressa dos Correios</p>
            <p className="text-xs text-red-500">Prazo medio: 2 a 5 dias uteis</p>
          </div>
        </div>

        <div className="prose prose-zinc max-w-none prose-sm">
          <h2>Calculo do frete</h2>
          <p>O valor do frete e calculado automaticamente no carrinho com base no seu CEP. Basta informar o CEP de entrega para ver as opcoes disponiveis e seus respectivos precos.</p>
          <h2>Prazo de preparacao</h2>
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 not-prose flex items-start gap-3">
            <Clock size={18} className="text-zinc-400 shrink-0 mt-0.5" />
            <p className="text-sm text-zinc-600">
              <strong>Ate 3 dias uteis</strong> apos a confirmacao do pagamento para preparacao e postagem do pedido.
            </p>
          </div>
          <h2>Rastreamento</h2>
          <p>Apos o envio, voce recebera um e-mail com o codigo de rastreio. Voce tambem pode acompanhar seu pedido na pagina <strong>"Acompanhar Pedido"</strong> no topo do site.</p>
          <h2>Areas de entrega</h2>
          <p>Realizamos entregas para <strong>todo o territorio nacional</strong>. O prazo e o valor variam de acordo com a regiao de destino.</p>
        </div>
      </div>
    </div>
  );
}
