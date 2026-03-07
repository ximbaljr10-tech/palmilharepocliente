// Simulated backend using localStorage for Vercel static deployment

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getData = () => {
  const data = localStorage.getItem('app_data');
  if (data) return JSON.parse(data);
  const initialData = {
    users: [{ id: 1, name: 'Admin', email: 'admin', password: 'admin123', role: 'admin', created_at: new Date().toISOString() }],
    orders: []
  };
  localStorage.setItem('app_data', JSON.stringify(initialData));
  return initialData;
};

const saveData = (data: any) => {
  localStorage.setItem('app_data', JSON.stringify(data));
};

export const api = {
  register: async (userData: any) => {
    await delay(300);
    const data = getData();
    if (data.users.find((u: any) => u.email === userData.email)) {
      return { success: false, error: 'Email já cadastrado' };
    }
    const newUser = {
      id: data.users.length > 0 ? Math.max(...data.users.map((u:any)=>u.id)) + 1 : 1,
      ...userData,
      role: 'customer',
      created_at: new Date().toISOString()
    };
    data.users.push(newUser);
    saveData(data);
    return { success: true, userId: newUser.id };
  },
  
  login: async (credentials: any) => {
    await delay(300);
    const data = getData();
    const user = data.users.find((u: any) => u.email === credentials.email && u.password === credentials.password);
    if (user) {
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role, whatsapp: user.whatsapp } };
    }
    return { success: false, error: 'Credenciais inválidas' };
  },
  
  createOrder: async (orderData: any) => {
    await delay(300);
    const data = getData();
    const newOrder = {
      id: data.orders.length > 0 ? Math.max(...data.orders.map((o:any)=>o.id)) + 1 : 1,
      user_id: orderData.userId || null,
      customer_name: orderData.name,
      customer_email: orderData.email,
      customer_whatsapp: orderData.whatsapp,
      customer_address: orderData.address,
      total_amount: orderData.totalAmount,
      shipping_service: orderData.shipping_service,
      shipping_fee: orderData.shipping_fee,
      package_dimensions: orderData.package_dimensions,
      status: 'pending',
      tracking_code: null,
      created_at: new Date().toISOString(),
      items: orderData.items
    };
    data.orders.push(newOrder);
    saveData(data);
    return { success: true, orderId: newOrder.id };
  },
  
  getUserOrders: async (userId: number) => {
    await delay(300);
    const data = getData();
    return data.orders.filter((o: any) => o.user_id === userId).sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  
  getAdminOrders: async () => {
    await delay(300);
    const data = getData();
    return data.orders.sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  
  updateOrder: async (id: number, updateData: any) => {
    await delay(300);
    const data = getData();
    const order = data.orders.find((o: any) => o.id === id);
    if (order) {
      order.status = updateData.status;
      order.tracking_code = updateData.tracking_code || null;
      saveData(data);
      return { success: true };
    }
    return { success: false, error: 'Pedido não encontrado' };
  },
  
  getAdminUsers: async () => {
    await delay(300);
    const data = getData();
    return data.users.map((u:any) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at })).sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  
  updateUser: async (id: number, updateData: any) => {
    await delay(300);
    const data = getData();
    const userIndex = data.users.findIndex((u: any) => u.id === id);
    if (userIndex !== -1) {
      data.users[userIndex] = { ...data.users[userIndex], ...updateData };
      saveData(data);
      return { success: true, user: data.users[userIndex] };
    }
    return { success: false, error: 'Usuário não encontrado' };
  },

  calculateShipping: async (cep: string, items: any[]) => {
    const getDimensions = (item: any) => {
      const title = item.title.toLowerCase();
      if (title.includes('12000') || item.yards === 12000) return { height: 22, width: 22, length: 25, weight: 3.0 };
      if (title.includes('6000') || item.yards === 6000) return { height: 19, width: 19, length: 25, weight: 1.0 };
      if (title.includes('3000') || item.yards === 3000) return { height: 12, width: 12, length: 19, weight: 0.7 };
      if (title.includes('2000') || item.yards === 2000) return { height: 12, width: 12, length: 19, weight: 0.5 };
      if (title.includes('1000') || item.yards === 1000) return { height: 12, width: 12, length: 19, weight: 0.4 };
      if (title.includes('500') || item.yards === 500) return { height: 12, width: 12, length: 19, weight: 0.3 };
      return { height: 12, width: 12, length: 19, weight: 0.3 }; // Default fallback
    };

    try {
      const response = await fetch('/api/superfrete/calculator', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzI4NDk2MTksInN1YiI6Ik5hcHNWSTgxS0pZTTBaakhrRkFlMHZ1WTlObTEifQ.nHdLf1cY16om5REAt2MLRuArwtlcU-8Ee3WEXcz2Trw',
          'User-Agent': 'LojaOnline (kaykep7@gmail.com)',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          from: { postal_code: "74450380" }, // CEP de origem atualizado
          to: { postal_code: cep.replace(/\D/g, '') },
          services: "1,2,17",
          options: {
            own_hand: false,
            receipt: false,
            insurance_value: 0,
            use_insurance_value: false
          },
          products: items.map(item => {
            const dims = getDimensions(item);
            return {
              quantity: item.quantity,
              height: dims.height,
              length: dims.length,
              width: dims.width,
              weight: dims.weight
            };
          })
        })
      });

      if (!response.ok) {
        throw new Error('Erro ao calcular frete');
      }

      const data = await response.json();
      return { success: true, options: data };
    } catch (error) {
      console.error('Erro no cálculo de frete:', error);
      return { success: false, error: 'Não foi possível calcular o frete. Tente novamente.' };
    }
  },

  generateShippingLabel: async (order: any) => {
    try {
      const response = await fetch('/api/superfrete/cart', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzI4NDk2MTksInN1YiI6Ik5hcHNWSTgxS0pZTTBaakhrRkFlMHZ1WTlObTEifQ.nHdLf1cY16om5REAt2MLRuArwtlcU-8Ee3WEXcz2Trw',
          'User-Agent': 'LojaOnline (kaykep7@gmail.com)',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          from: {
            name: "Loja Dente de Tubarao",
            address: "Rua Almeida Lara quadra 64 lt 14",
            number: "SN",
            district: "Capuava",
            city: "Goiania",
            state_abbr: "GO",
            postal_code: "74450380",
            document: "00000000000000"
          },
          to: {
            name: order.customer_name,
            address: order.customer_address.split(',')[0],
            number: order.customer_address.split(',')[1]?.split('-')[0]?.trim() || "SN",
            district: order.customer_address.split(',')[2]?.trim() || "Bairro",
            city: order.customer_address.split(',')[3]?.split('-')[0]?.trim() || "Cidade",
            state_abbr: order.customer_address.split('-')[1]?.split(',')[0]?.trim() || "SP",
            postal_code: order.customer_address.match(/\d{5}-\d{3}/)?.[0]?.replace('-', '') || "00000000"
          },
          service: order.shipping_service || 1,
          products: order.items.map((item: any) => ({
            name: item.title,
            quantity: item.quantity,
            unitary_value: item.price
          })),
          volumes: order.package_dimensions || {
            height: 12,
            width: 12,
            length: 19,
            weight: 0.3
          },
          options: {
            non_commercial: true
          }
        })
      });

      if (!response.ok) {
        throw new Error('Erro ao gerar etiqueta');
      }

      const data = await response.json();
      return { success: true, label: data };
    } catch (error) {
      console.error('Erro na geração de etiqueta:', error);
      return { success: false, error: 'Não foi possível gerar a etiqueta.' };
    }
  }
};
