import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Package, Truck, Search, ShoppingBag, Loader2, CheckCircle2, Clock, CreditCard, BoxIcon, MessageCircle, Copy, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

// Status cycle for the timeline
const STATUS_STEPS = [
  { key: 'awaiting_payment', label: 'Aguardando Pagamento', icon: Clock },
  { key: 'paid', label: 'Pagamento Confirmado', icon: CreditCard },
  { key: 'preparing', label: 'Em Preparação', icon: BoxIcon },
  { key: 'shipped', label: 'Enviado', icon: Truck },
  { key: 'delivered', label: 'Entregue', icon: CheckCircle2 },
];

function getStepIndex(status: string): number {
  const idx = STATUS_STEPS.findIndex(s => s.key === status);
  return idx >= 0 ? idx : 0;
}

function OrderTimeline({ status }: { status: string }) {
  const currentIdx = getStepIndex(status);
  const isCancelled = status === 'cancelled';

  if (isCancelled) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 p-4 rounded-2xl">
        <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
          <Package size={20} />
        </div>
        <div>
          <p className="font-bold text-red-700">Pedido Cancelado</p>
          <p className="text-sm text-red-500">Este pedido foi cancelado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {STATUS_STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isPending = idx > currentIdx;
        const Icon = step.icon;
        const isLast = idx === STATUS_STEPS.length - 1;

        return (
          <div key={step.key} className="flex gap-4">
            {/* Vertical line + circle */}
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                isCompleted ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' :
                isCurrent ? 'bg-emerald-500 text-white ring-4 ring-emerald-100 shadow-lg shadow-emerald-200 animate-pulse' :
                'bg-zinc-100 text-zinc-300'
              }`}>
                <Icon size={18} />
              </div>
              {!isLast && (
                <div className={`w-0.5 h-12 my-1 transition-all duration-300 ${
                  isCompleted ? 'bg-emerald-400' : 'bg-zinc-200'
                }`} />
              )}
            </div>

            {/* Text */}
            <div className={`pt-2 pb-4 ${isPending ? 'opacity-40' : ''}`}>
              <p className={`font-semibold text-sm ${
                isCurrent ? 'text-emerald-700' : isCompleted ? 'text-zinc-700' : 'text-zinc-400'
              }`}>
                {step.label}
              </p>
              {isCurrent && (
                <p className="text-xs text-emerald-500 mt-0.5 font-medium">
                  Status atual
                </p>
              )}
              {isCompleted && (
                <p className="text-xs text-zinc-400 mt-0.5">Concluído ✓</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaymentInfo({ order }: { order: any }) {
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<any>(null);

  React.useEffect(() => {
    fetch('/store/config', {
      headers: { "x-publishable-api-key": "pk_b54130691636a84f3172ebbc1d0ac4d9b14bc2430db612d289a055e341b7b706" },
    })
      .then(r => r.json())
      .then(d => setConfig({ ...d, pix_banco: 'Banco Inter' }))
      .catch(() => {});
  }, []);

  if (!config) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(config.pix_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappMsg = encodeURIComponent(
    `Olá! Fiz o pedido #${order.id} no valor de R$ ${Number(order.total_amount).toFixed(2).replace('.', ',')}. Segue o comprovante do PIX:`
  );
  const whatsappLink = `https://wa.me/${config.whatsapp}?text=${whatsappMsg}`;
  const whatsappFormatted = config.whatsapp.replace(/^55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');

  return (
    <div className="space-y-4">
      {/* Reassurance */}
      <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl">
        <p className="text-sm text-amber-800">
          <strong>Já pagou?</strong> Atualizaremos o status em breve. Para agilizar, envie o comprovante no WhatsApp.
        </p>
      </div>

      {/* PIX data */}
      <div className="bg-zinc-50 p-5 rounded-2xl space-y-3">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Dados para pagamento</p>
        <div className="flex items-center gap-2 bg-white border border-zinc-200 p-3 rounded-xl">
          <div className="flex-grow">
            <p className="text-xs text-zinc-400">Chave Pix {config.pix_tipo}</p>
            <code className="font-mono text-base font-bold text-zinc-900">{config.pix_key}</code>
          </div>
          <button onClick={handleCopy} className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Copiar">
            <Copy size={18} />
          </button>
        </div>
        {copied && <p className="text-xs text-emerald-600 font-medium text-center">Chave copiada!</p>}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-zinc-400 text-xs">Nome</p>
            <p className="font-medium text-zinc-800">{config.pix_nome}</p>
          </div>
          <div>
            <p className="text-zinc-400 text-xs">Banco</p>
            <p className="font-medium text-zinc-800">{config.pix_banco}</p>
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-200">
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-500">Valor do pedido:</span>
            <span className="text-lg font-bold text-zinc-900">R$ {Number(order.total_amount).toFixed(2).replace('.', ',')}</span>
          </div>
        </div>
      </div>

      {/* WhatsApp button */}
      <a
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#128C7E] transition-colors whitespace-nowrap"
      >
        <MessageCircle size={18} />
        Enviar Comprovante
      </a>
    </div>
  );
}

function TrackOrderCard({ order, defaultOpen }: { order: any; defaultOpen: boolean; key?: React.Key }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const statusLabel = STATUS_STEPS.find(s => s.key === order.status)?.label || order.status;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
      {/* Clickable Header */}
      <div
        className="p-5 sm:p-6 flex items-center justify-between cursor-pointer hover:bg-zinc-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-bold text-zinc-900">Pedido #{order.id}</h3>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              order.status === 'awaiting_payment' ? 'bg-amber-100 text-amber-700' :
              order.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
              order.status === 'preparing' ? 'bg-purple-100 text-purple-700' :
              order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
              order.status === 'delivered' ? 'bg-green-100 text-green-700' :
              order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
              'bg-zinc-100 text-zinc-700'
            }`}>{statusLabel}</span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">{new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-3 ml-3">
          <p className="text-lg sm:text-xl font-bold text-zinc-900">R$ {Number(order.total_amount).toFixed(2).replace('.', ',')}</p>
          {expanded ? <ChevronUp size={18} className="text-zinc-400 shrink-0" /> : <ChevronDown size={18} className="text-zinc-400 shrink-0" />}
        </div>
      </div>

      {expanded && (
        <>
          {/* Payment info FIRST when awaiting payment */}
          {order.status === 'awaiting_payment' && (
            <div className="px-5 sm:px-6 pt-4 border-t border-zinc-100">
              <PaymentInfo order={order} />
            </div>
          )}

          {/* Timeline */}
          <div className="p-5 sm:p-6">
            <OrderTimeline status={order.status} />
          </div>

          {/* Tracking code */}
          {order.tracking_code && (
            <div className="px-5 sm:px-6 pb-5">
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Truck size={18} />
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Rastreio</p>
                    <p className="font-mono font-bold text-blue-800 text-sm sm:text-lg truncate">{order.tracking_code}</p>
                  </div>
                  <a
                    href={`https://rastreamento.correios.com.br/app/index.php?objeto=${order.tracking_code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-all shrink-0"
                    title="Rastrear nos Correios"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Items */}
          {order.items && order.items.length > 0 && (
            <div className="border-t border-zinc-100 p-5 sm:p-6">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Itens do pedido</p>
              <div className="space-y-3">
                {order.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    {item.image_url && (
                      <img src={item.image_url} alt={item.title} className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-zinc-100 flex-shrink-0" referrerPolicy="no-referrer" />
                    )}
                    <span className="flex-1 text-zinc-700 line-clamp-1 text-xs sm:text-sm">{item.title}</span>
                    <span className="text-zinc-400 text-xs">{item.quantity}x</span>
                    <span className="font-semibold text-zinc-900 text-xs sm:text-sm">R$ {Number(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TrackOrder() {
  const [email, setEmail] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');
    setSearched(false);

    try {
      const data = await api.getUserOrders(email.trim());
      const ordersList = Array.isArray(data) ? data : [];
      setOrders(ordersList.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setSearched(true);
    } catch (err) {
      setError('Erro ao buscar pedidos. Tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Search */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100 text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
          <Package size={32} />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Acompanhar Pedido</h1>
          <p className="text-zinc-500 mt-2">
            Digite o e-mail usado na sua compra para ver o status do seu pedido.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none text-center sm:text-left"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            Buscar
          </button>
        </form>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      {/* No results */}
      {searched && orders.length === 0 && (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 text-center space-y-4">
          <ShoppingBag size={48} className="text-zinc-300 mx-auto" />
          <p className="text-zinc-500">Nenhum pedido encontrado para este e-mail.</p>
          <p className="text-zinc-400 text-sm">Verifique se digitou o e-mail correto ou entre em contato conosco.</p>
          <Link
            to="/store"
            className="inline-block bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors mt-2"
          >
            Ir às Compras
          </Link>
        </div>
      )}

      {/* Results */}
      {orders.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-zinc-500">
            {orders.length} pedido{orders.length > 1 ? 's' : ''} encontrado{orders.length > 1 ? 's' : ''}
          </p>

          {orders.map((order, orderIdx) => (
            <TrackOrderCard key={order.id} order={order} defaultOpen={orders.length === 1} />
          ))}
        </div>
      )}
    </div>
  );
}
