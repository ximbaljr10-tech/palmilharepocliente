import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Breadcrumbs from '../components/Breadcrumbs';

export default function PoliticaPrivacidade() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Politica de Privacidade - Dente de Tubarao";
    document.querySelector('meta[name="description"]')?.setAttribute('content', "Politica de privacidade da Dente de Tubarao. Saiba como coletamos, usamos e protegemos seus dados pessoais.");
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <Breadcrumbs items={[{ label: 'Politica de Privacidade' }]} />
      <div className="bg-white rounded-3xl border border-zinc-100 p-6 sm:p-10 space-y-6">
        <h1 className="text-3xl font-bold text-zinc-900">Politica de Privacidade</h1>
        <p className="text-xs text-zinc-400">Ultima atualizacao: Março de 2026</p>
        <div className="prose prose-zinc max-w-none prose-sm">
          <p>A <strong>Dente de Tubarao</strong> esta comprometida com a protecao da privacidade dos seus dados pessoais. Esta Politica descreve como coletamos, usamos e protegemos suas informacoes.</p>
          <h2>1. Dados Coletados</h2>
          <p>Coletamos apenas os dados necessarios para processar seu pedido:</p>
          <ul>
            <li>Nome completo</li>
            <li>Endereco de e-mail</li>
            <li>Numero de WhatsApp</li>
            <li>Endereco de entrega (CEP, rua, numero, bairro, cidade, estado)</li>
          </ul>
          <h2>2. Uso dos Dados</h2>
          <p>Seus dados sao utilizados exclusivamente para:</p>
          <ul>
            <li>Processar e enviar seu pedido</li>
            <li>Enviar notificacoes sobre o status do pedido</li>
            <li>Entrar em contato sobre sua compra, se necessario</li>
            <li>Gerar etiquetas de envio pelos Correios</li>
          </ul>
          <h2>3. Compartilhamento</h2>
          <p>Seus dados podem ser compartilhados apenas com:</p>
          <ul>
            <li><strong>Correios / SuperFrete:</strong> para geracao de etiquetas e rastreamento</li>
            <li><strong>Servico de e-mail:</strong> para envio de notificacoes automaticas sobre seu pedido</li>
          </ul>
          <p>Nao vendemos, alugamos ou compartilhamos seus dados com terceiros para fins de marketing.</p>
          <h2>4. Seguranca</h2>
          <p>Adotamos medidas tecnicas e organizacionais para proteger seus dados contra acesso nao autorizado, perda ou destruicao.</p>
          <h2>5. Seus Direitos</h2>
          <p>Voce pode solicitar a qualquer momento:</p>
          <ul>
            <li>Acesso aos dados que armazenamos sobre voce</li>
            <li>Correcao de dados incorretos</li>
            <li>Exclusao dos seus dados pessoais</li>
          </ul>
          <p>Para exercer esses direitos, entre em contato pelo e-mail <strong>Compras@dentedetubarao.com.br</strong>.</p>
          <h2>6. Cookies</h2>
          <p>Utilizamos cookies essenciais para manter o carrinho de compras e preferencias de navegacao. Nao utilizamos cookies de rastreamento de terceiros.</p>
          <h2>7. Alteracoes</h2>
          <p>Esta politica pode ser atualizada periodicamente. Recomendamos que consulte esta pagina regularmente.</p>
        </div>
      </div>
    </div>
  );
}
