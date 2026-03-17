import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Sobre() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors text-sm">
        <ArrowLeft size={18} /> Voltar
      </button>
      <div className="bg-white rounded-3xl border border-zinc-100 p-6 sm:p-10 space-y-6">
        <h1 className="text-3xl font-bold text-zinc-900">Sobre a Dente de Tubarao</h1>
        <div className="prose prose-zinc max-w-none">
          <p>A <strong>Dente de Tubarao</strong> nasceu da paixao pelo esporte e pela busca incessante de qualidade em linhas e cerol. Somos uma loja especializada, comprometida em oferecer produtos de alta performance para praticantes de todo o Brasil.</p>
          <h2>Nossa Missao</h2>
          <p>Fornecer linhas e acessorios de qualidade superior, com precos justos e atendimento humanizado. Acreditamos que cada cliente merece o melhor produto para a sua pratica esportiva.</p>
          <h2>Nossos Valores</h2>
          <ul>
            <li><strong>Qualidade:</strong> Trabalhamos apenas com materiais de alta resistencia e durabilidade.</li>
            <li><strong>Transparencia:</strong> Precos justos, prazos claros e comunicacao direta pelo WhatsApp.</li>
            <li><strong>Atendimento:</strong> Cada pedido e tratado com cuidado e atencao individual.</li>
            <li><strong>Confianca:</strong> Pagamento seguro via PIX e envio rastreado pelos Correios.</li>
          </ul>
          <h2>Por que Dente de Tubarao?</h2>
          <p>O nome representa forca, precisao e resistencia — exatamente o que voce encontra em cada produto da nossa loja. Testado e aprovado por profissionais do esporte.</p>
        </div>
      </div>
    </div>
  );
}
