import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermosUso() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors text-sm">
        <ArrowLeft size={18} /> Voltar
      </button>
      <div className="bg-white rounded-3xl border border-zinc-100 p-6 sm:p-10 space-y-6">
        <h1 className="text-3xl font-bold text-zinc-900">Termos de Uso</h1>
        <p className="text-xs text-zinc-400">Ultima atualizacao: Março de 2026</p>
        <div className="prose prose-zinc max-w-none prose-sm">
          <h2>1. Aceitacao dos Termos</h2>
          <p>Ao acessar e utilizar o site da <strong>Dente de Tubarao</strong>, voce concorda com estes Termos de Uso. Caso nao concorde, recomendamos que nao utilize nossos servicos.</p>
          <h2>2. Produtos e Precos</h2>
          <ul>
            <li>Os precos exibidos no site sao em Reais (BRL) e podem ser alterados sem aviso previo.</li>
            <li>As imagens dos produtos sao ilustrativas. Pequenas variacoes de cor podem ocorrer.</li>
            <li>A disponibilidade de cores e modelos esta sujeita ao estoque.</li>
          </ul>
          <h2>3. Pedidos e Pagamento</h2>
          <ul>
            <li>Os pedidos sao confirmados apos o envio do comprovante de pagamento via PIX pelo WhatsApp.</li>
            <li>O prazo para confirmacao do pagamento e de ate 24 horas apos a realizacao do pedido.</li>
            <li>Pedidos nao pagos dentro deste prazo podem ser cancelados automaticamente.</li>
          </ul>
          <h2>4. Envio e Entrega</h2>
          <ul>
            <li>Os envios sao feitos pelos Correios (PAC ou SEDEX).</li>
            <li>O prazo de preparacao e de ate 3 dias uteis apos confirmacao do pagamento.</li>
            <li>O prazo de entrega depende da modalidade de frete e da regiao de destino.</li>
          </ul>
          <h2>5. Propriedade Intelectual</h2>
          <p>Todo o conteudo do site (textos, imagens, logotipos, design) e de propriedade da Dente de Tubarao ou de seus fornecedores e esta protegido por leis de direitos autorais.</p>
          <h2>6. Limitacao de Responsabilidade</h2>
          <p>A Dente de Tubarao nao se responsabiliza por:</p>
          <ul>
            <li>Atrasos na entrega causados pelos Correios ou forcas maiores</li>
            <li>Uso indevido dos produtos adquiridos</li>
            <li>Informacoes incorretas fornecidas pelo cliente no momento do pedido</li>
          </ul>
          <h2>7. Contato</h2>
          <p>Para duvidas sobre estes termos, entre em contato: <strong>Compras@dentedetubarao.com.br</strong>.</p>
        </div>
      </div>
    </div>
  );
}
