import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TrocasDevolucoes() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors text-sm">
        <ArrowLeft size={18} /> Voltar
      </button>
      <div className="bg-white rounded-3xl border border-zinc-100 p-6 sm:p-10 space-y-6">
        <h1 className="text-3xl font-bold text-zinc-900">Trocas e Devolucoes</h1>
        <div className="prose prose-zinc max-w-none prose-sm">
          <h2>Politica de Trocas</h2>
          <p>A <strong>Dente de Tubarao</strong> trabalha para que voce receba seus produtos em perfeito estado. Caso identifique algum problema, estamos prontos para ajudar.</p>
          <h2>Quando posso solicitar troca?</h2>
          <ul>
            <li><strong>Produto com defeito:</strong> se o produto apresentar defeito de fabricacao, voce pode solicitar a troca em ate 7 dias corridos apos o recebimento.</li>
            <li><strong>Produto incorreto:</strong> se enviarmos um produto diferente do pedido, faremos a troca sem custo.</li>
          </ul>
          <h2>Como solicitar?</h2>
          <ol>
            <li>Entre em contato pelo <strong>WhatsApp (61) 99357-6505</strong> informando o numero do pedido.</li>
            <li>Envie fotos do produto recebido.</li>
            <li>Aguarde a analise (ate 2 dias uteis).</li>
            <li>Apos aprovacao, enviaremos as instrucoes para devolucao.</li>
          </ol>
          <h2>Sobre devolucoes</h2>
          <ul>
            <li>O produto deve estar na embalagem original, sem sinais de uso.</li>
            <li>O frete de devolucao sera por conta da loja em caso de defeito ou erro nosso.</li>
            <li>Apos recebermos o produto, o reembolso ou troca sera processado em ate 5 dias uteis.</li>
          </ul>
          <h2>Observacoes importantes</h2>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 not-prose">
            <p className="text-sm text-amber-800">
              <strong>Preferencia de cores:</strong> Como trabalhamos com sistema de prioridade de cores (e nao escolha exata), variacoes de cor nao sao consideradas motivo para troca. Faremos sempre o possivel para atender suas preferencias.
            </p>
          </div>
          <h2>Contato</h2>
          <p>Para qualquer duvida, entre em contato: <strong>Compras@dentedetubarao.com.br</strong> ou pelo WhatsApp.</p>
        </div>
      </div>
    </div>
  );
}
