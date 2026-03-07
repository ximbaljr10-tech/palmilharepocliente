import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { useUser } from '../UserContext';
import { api } from '../api';
import { CheckCircle2, Copy, MapPin, Truck } from 'lucide-react';

export default function Checkout() {
  const { cart, total, clearCart, selectedShipping } = useCart();
  const { user, login } = useUser();
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'pix'>('form');
  const [loadingCep, setLoadingCep] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    whatsapp: user?.whatsapp || '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  });
  const [orderId, setOrderId] = useState<number | null>(null);
  const [finalTotal, setFinalTotal] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  const pixKey = '12.345.678/0001-90'; // Exemplo de chave PIX
  const whatsappNumber = '5511999999999'; // Exemplo de número de WhatsApp

  React.useEffect(() => {
    if ((cart.length === 0 || !selectedShipping) && step === 'form') {
      navigate('/cart');
    }
  }, [cart.length, selectedShipping, step, navigate]);

  if ((cart.length === 0 || !selectedShipping) && step === 'form') {
    return null;
  }

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let cep = e.target.value.replace(/\D/g, '');
    if (cep.length > 8) cep = cep.slice(0, 8);
    
    const formattedCep = cep.replace(/^(\d{5})(\d)/, '$1-$2');
    setFormData(prev => ({ ...prev, cep: formattedCep }));

    if (cep.length === 8) {
      setLoadingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf,
          }));
          document.getElementById('number')?.focus();
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let currentUserId = user?.id;

    // Se estiver logado, verifica se mudou os dados e atualiza
    if (user) {
      if (formData.name !== user.name || formData.email !== user.email || formData.whatsapp !== user.whatsapp) {
        try {
          await api.updateUser(user.id, {
            name: formData.name,
            email: formData.email,
            whatsapp: formData.whatsapp
          });
          login({ ...user, name: formData.name, email: formData.email, whatsapp: formData.whatsapp });
        } catch (err) {
          console.error('Erro ao atualizar dados do usuário', err);
        }
      }
    }

    // Se não estiver logado, cria a conta
    if (!user) {
      try {
        const regData = await api.register({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          whatsapp: formData.whatsapp,
        });
        
        if (!regData.success && regData.error === 'Email já cadastrado') {
          // Tenta fazer login com a senha fornecida
          const loginData = await api.login({ email: formData.email, password: formData.password });
          if (loginData.success) {
            currentUserId = loginData.user.id;
            login(loginData.user);
          } else {
            alert('Este email já está cadastrado. A senha informada está incorreta.');
            return;
          }
        } else if (regData.success) {
          currentUserId = regData.userId;
          login({ id: regData.userId, name: formData.name, email: formData.email, role: 'customer', whatsapp: formData.whatsapp });
        } else {
          alert(regData.error || 'Erro ao criar conta.');
          return;
        }
      } catch (err) {
        alert('Erro de conexão ao criar conta.');
        return;
      }
    }

    const fullAddress = `${formData.street}, ${formData.number}${formData.complement ? ` - ${formData.complement}` : ''}, ${formData.neighborhood}, ${formData.city} - ${formData.state}, CEP: ${formData.cep}`;
    
    try {
      const data = await api.createOrder({
        userId: currentUserId,
        name: formData.name,
        email: formData.email,
        whatsapp: formData.whatsapp,
        address: fullAddress,
        items: cart,
        totalAmount: total,
        shipping_service: selectedShipping?.id,
        shipping_fee: selectedShipping?.price,
        package_dimensions: selectedShipping?.package
      });
      
      if (data.success) {
        setOrderId(data.orderId);
        setFinalTotal(total); // Salva o total antes de limpar o carrinho
        setStep('pix');
        clearCart();
      }
    } catch (error) {
      console.error('Erro ao finalizar pedido:', error);
      alert('Ocorreu um erro ao processar seu pedido. Tente novamente.');
    }
  };

  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === 'pix') {
    const whatsappMessage = encodeURIComponent(
      `Olá! Fiz o pedido #${orderId} no valor de R$ ${finalTotal.toFixed(2).replace('.', ',')}. Segue o comprovante do PIX:`
    );
    const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

    return (
      <div className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900">Pedido Realizado!</h2>
        <p className="text-zinc-500">Seu pedido #{orderId} foi registrado com sucesso.</p>
        
        <div className="bg-zinc-50 p-6 rounded-2xl space-y-4">
          <p className="font-medium text-zinc-900">Valor a pagar: R$ {finalTotal.toFixed(2).replace('.', ',')}</p>
          
          <div className="space-y-2">
            <p className="text-sm text-zinc-500">Chave PIX (CNPJ):</p>
            <div className="flex items-center gap-2 bg-white border border-zinc-200 p-3 rounded-xl">
              <code className="flex-grow text-left font-mono">{pixKey}</code>
              <button
                onClick={handleCopyPix}
                className="text-zinc-400 hover:text-zinc-900 transition-colors"
                title="Copiar chave PIX"
              >
                <Copy size={20} />
              </button>
            </div>
            {copied && <p className="text-xs text-emerald-600 font-medium">Chave copiada!</p>}
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <p className="text-sm text-zinc-500">
            Após realizar o pagamento, envie o comprovante no nosso WhatsApp para liberarmos seu pedido.
          </p>
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-[#25D366] text-white py-4 rounded-xl text-lg font-bold hover:bg-[#128C7E] transition-colors"
          >
            Enviar Comprovante
          </a>
          <button
            onClick={() => navigate('/customer')}
            className="block w-full text-zinc-500 font-medium hover:text-zinc-900 transition-colors py-2"
          >
            Acompanhar meu pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-7 space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Finalizar Compra</h1>
        
        <form id="checkout-form" onSubmit={handleSubmit} className="space-y-8">
          {/* Contato */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100 space-y-6">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-sm">1</span>
              Dados de Contato
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    id="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="seu@email.com"
                  />
                </div>
                {!user && (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1">Crie uma senha</label>
                    <input
                      type="password"
                      id="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="Para acompanhar o pedido"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="João da Silva"
                  />
                </div>
                <div>
                  <label htmlFor="whatsapp" className="block text-sm font-medium text-zinc-700 mb-1">WhatsApp</label>
                  <input
                    type="tel"
                    id="whatsapp"
                    required
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Entrega */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100 space-y-6">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-sm">2</span>
              Endereço de Entrega
            </h2>
            
            <div className="space-y-4">
              <div className="relative">
                <label htmlFor="cep" className="block text-sm font-medium text-zinc-700 mb-1">CEP</label>
                <input
                  type="text"
                  id="cep"
                  required
                  maxLength={9}
                  value={formData.cep}
                  onChange={handleCepChange}
                  className="w-full sm:w-1/2 px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="00000-000"
                />
                {loadingCep && (
                  <span className="absolute right-4 top-10 text-xs text-zinc-500">Buscando...</span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-8">
                  <label htmlFor="street" className="block text-sm font-medium text-zinc-700 mb-1">Rua / Avenida</label>
                  <input
                    type="text"
                    id="street"
                    required
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-zinc-50"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label htmlFor="number" className="block text-sm font-medium text-zinc-700 mb-1">Número</label>
                  <input
                    type="text"
                    id="number"
                    required
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label htmlFor="complement" className="block text-sm font-medium text-zinc-700 mb-1">Complemento <span className="text-zinc-400 font-normal">(Opcional)</span></label>
                  <input
                    type="text"
                    id="complement"
                    value={formData.complement}
                    onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="Apto, Bloco, Casa 2"
                  />
                </div>
                <div className="sm:col-span-6">
                  <label htmlFor="neighborhood" className="block text-sm font-medium text-zinc-700 mb-1">Bairro</label>
                  <input
                    type="text"
                    id="neighborhood"
                    required
                    value={formData.neighborhood}
                    onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-zinc-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-8">
                  <label htmlFor="city" className="block text-sm font-medium text-zinc-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    id="city"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-zinc-50"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label htmlFor="state" className="block text-sm font-medium text-zinc-700 mb-1">Estado</label>
                  <input
                    type="text"
                    id="state"
                    required
                    maxLength={2}
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-zinc-50 uppercase"
                    placeholder="SP"
                  />
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Resumo do Pedido */}
      <div className="lg:col-span-5">
        <div className="bg-zinc-50 p-6 sm:p-8 rounded-3xl border border-zinc-200 sticky top-24">
          <h2 className="text-xl font-bold text-zinc-900 mb-6">Resumo do Pedido</h2>
          
          <div className="space-y-4 mb-6 max-h-[40vh] overflow-y-auto pr-2">
            {cart.map((item) => (
              <div key={item.id} className="flex gap-4">
                <div className="w-16 h-16 bg-white rounded-xl border border-zinc-200 overflow-hidden flex-shrink-0 relative">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-zinc-100" />
                  )}
                  <span className="absolute -top-2 -right-2 bg-zinc-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">
                    {item.quantity}
                  </span>
                </div>
                <div className="flex-grow">
                  <h3 className="text-sm font-medium text-zinc-900 line-clamp-2">{item.title}</h3>
                  <p className="text-sm font-bold text-zinc-900 mt-1">R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-200 pt-4 space-y-3 mb-6">
            <div className="flex justify-between text-sm text-zinc-600">
              <span>Subtotal</span>
              <span>R$ {(total - (selectedShipping?.price || 0)).toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between text-sm text-zinc-600">
              <span>Frete ({selectedShipping?.name})</span>
              <span className="text-zinc-900 font-medium">R$ {selectedShipping?.price.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-zinc-900 pt-3 border-t border-zinc-200">
              <span>Total</span>
              <span>R$ {total.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>

          <button
            type="submit"
            form="checkout-form"
            className="w-full bg-emerald-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
          >
            Finalizar Compra
          </button>
          
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-500">
            <CheckCircle2 size={14} className="text-emerald-500" />
            Pagamento 100% seguro via PIX
          </div>
        </div>
      </div>
    </div>
  );
}
