import { Link } from 'react-router-dom';
import { MessageCircle, Mail } from 'lucide-react';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-zinc-900 text-zinc-300 mt-8">
      {/* Top accent line */}
      <div className="h-0.5 bg-gradient-to-r from-red-600 via-emerald-500 to-red-600" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        {/* Mobile: stacked compact | Desktop: 3 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">

          {/* Column 1: Brand + Contact */}
          <div>
            <p className="text-white font-bold text-sm mb-1.5">Dente de Tubarao</p>
            <div className="space-y-1">

              <a
                href="mailto:Compras@dentedetubarao.com.br"
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
              >
                <Mail size={12} className="text-emerald-500 shrink-0" />
                Compras@dentedetubarao.com.br
              </a>
            </div>
          </div>

          {/* Column 2: Institutional links */}
          <div>
            <p className="text-white font-semibold text-xs mb-1.5">Institucional</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <Link to="/store/sobre" className="text-xs text-zinc-400 hover:text-white transition-colors">Sobre</Link>
              <Link to="/store/contato" className="text-xs text-zinc-400 hover:text-white transition-colors">Contato</Link>
              <Link to="/store/blog" className="text-xs text-zinc-400 hover:text-white transition-colors">Blog e Dicas</Link>
              <Link to="/store/frete-entrega" className="text-xs text-zinc-400 hover:text-white transition-colors">Frete e Entrega</Link>
              <Link to="/store/trocas-devolucoes" className="text-xs text-zinc-400 hover:text-white transition-colors">Trocas e Devolucoes</Link>
            </div>
          </div>

          {/* Column 3: Legal links */}
          <div>
            <p className="text-white font-semibold text-xs mb-1.5">Legal</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <Link to="/store/politica-privacidade" className="text-xs text-zinc-400 hover:text-white transition-colors">Politica de Privacidade</Link>
              <Link to="/store/termos-uso" className="text-xs text-zinc-400 hover:text-white transition-colors">Termos de Uso</Link>
            </div>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="border-t border-zinc-800 mt-4 pt-3 text-center">
          <p className="text-[10px] text-zinc-600">
            &copy; {year} Dente de Tubarao &middot; Todos os direitos reservados
          </p>
        </div>
      </div>
    </footer>
  );
}
