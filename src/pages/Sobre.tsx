import { ArrowLeft, Shield, Truck, Heart, Award } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import Breadcrumbs from '../components/Breadcrumbs';

export default function Sobre() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Sobre a Dente de Tubarao - Nossa Historia e Missao";
    document.querySelector('meta[name="description"]')?.setAttribute('content', "Conheca a Dente de Tubarao: loja especializada em linhas de pipa de alta performance. Nossa historia, missao, valores e compromisso com qualidade.");
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <Breadcrumbs items={[{ label: 'Sobre' }]} />
      <div className="bg-white rounded-3xl border border-zinc-100 p-6 sm:p-10 space-y-8">
        <h1 className="text-3xl font-bold text-zinc-900">Sobre a Dente de Tubarao</h1>
        <div className="prose prose-zinc max-w-none">
          <p>A <strong>Dente de Tubarao</strong> nasceu da paixao pelo esporte e pela busca por qualidade em linhas de competicao. Somos uma loja especializada em <strong>linhas de pipa de alta performance</strong>, comprometida em oferecer produtos que atendam desde o praticante iniciante ate o pipeiro profissional em todo o Brasil.</p>

          <p>Com sede em <strong>Goiania - GO</strong>, atendemos clientes em todos os estados brasileiros, garantindo envio rastreado pelos Correios e suporte direto pelo WhatsApp e e-mail.</p>

          <h2>Nossa Historia</h2>
          <p>Surgimos a partir da necessidade de oferecer ao mercado brasileiro linhas de pipa de alta resistencia com precos acessiveis e atendimento humanizado. Ao longo da nossa trajetoria, construimos uma base solida de clientes satisfeitos que confiam na qualidade dos nossos produtos. Trabalhamos com linhas de diversos tipos e numeracoes — Fio 4, Fio 10, Fio 24, Nylon Esportiva Indonesia, King Shark — para atender todos os estilos e condicoes de vento.</p>

          <h2>Nossa Missao</h2>
          <p>Fornecer linhas e acessorios de qualidade superior, com precos justos e atendimento humanizado. Acreditamos que cada cliente merece o melhor produto para a sua pratica esportiva, e por isso selecionamos criteriosamente cada item do nosso catalogo.</p>
        </div>

        {/* Trust badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose">
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-start gap-4">
            <Shield size={24} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-zinc-900 text-sm">Qualidade Garantida</h3>
              <p className="text-xs text-zinc-600 mt-1">Materiais de alta resistencia e durabilidade testados por profissionais do esporte.</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-start gap-4">
            <Truck size={24} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-zinc-900 text-sm">Envio para Todo Brasil</h3>
              <p className="text-xs text-zinc-600 mt-1">Entrega pelos Correios (PAC e SEDEX) com rastreamento completo para todas as regioes.</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-start gap-4">
            <Heart size={24} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-zinc-900 text-sm">Atendimento Humanizado</h3>
              <p className="text-xs text-zinc-600 mt-1">Cada pedido e tratado com cuidado individual. Comunicacao direta e transparente.</p>
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5 flex items-start gap-4">
            <Award size={24} className="text-purple-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-zinc-900 text-sm">Confianca Comprovada</h3>
              <p className="text-xs text-zinc-600 mt-1">Pagamento seguro via PIX. Precos justos. Prazos claros e respeitados.</p>
            </div>
          </div>
        </div>

        <div className="prose prose-zinc max-w-none">
          <h2>Nossos Valores</h2>
          <ul>
            <li><strong>Qualidade:</strong> Trabalhamos apenas com materiais de alta resistencia e durabilidade, testados em condicoes reais de uso.</li>
            <li><strong>Transparencia:</strong> Precos justos, prazos claros e comunicacao direta. Sem surpresas, sem taxas escondidas.</li>
            <li><strong>Atendimento:</strong> Cada pedido e tratado com cuidado e atencao individual. Respondemos rapidamente pelo WhatsApp e e-mail.</li>
            <li><strong>Confianca:</strong> Pagamento seguro via PIX e envio rastreado pelos Correios. Milhares de pedidos entregues com sucesso.</li>
            <li><strong>Responsabilidade:</strong> Incentivamos a pratica segura do esporte, com consciencia e respeito ao proximo.</li>
          </ul>

          <h2>Por que Dente de Tubarao?</h2>
          <p>O nome representa forca, precisao e resistencia — exatamente o que voce encontra em cada produto da nossa loja. Assim como o dente do tubarao e projetado para nao falhar, nossas linhas sao feitas para resistir quando voce mais precisa. Testado e aprovado por profissionais do esporte.</p>

          <h2>Nosso Compromisso com o Esporte</h2>
          <p>Acreditamos que soltar pipa e mais do que um passatempo — e cultura, e esporte, e comunidade. Por isso, alem de vender produtos de qualidade, nos esforçamos para educar e orientar nossos clientes sobre praticas seguras. Confira nosso <Link to="/store/blog" className="text-emerald-600 hover:text-emerald-700 font-semibold">Blog com dicas e tutoriais</Link> sobre o mundo das pipas.</p>
        </div>
      </div>
    </div>
  );
}
