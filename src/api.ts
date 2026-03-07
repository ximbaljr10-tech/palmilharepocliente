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
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
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
  }
};
