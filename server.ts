import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.join(__dirname, 'data.json');

// Initialize data.json
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({
    users: [{ id: 1, name: 'Admin', email: 'admin', password: 'admin123', role: 'admin', created_at: new Date().toISOString() }],
    orders: []
  }, null, 2));
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  } catch (e) {
    return { users: [], orders: [] };
  }
}

function writeData(data: any) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth Routes
  app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    const data = readData();
    if (data.users.find((u: any) => u.email === email)) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }
    const newUser = {
      id: data.users.length > 0 ? Math.max(...data.users.map((u:any)=>u.id)) + 1 : 1,
      name, email, password, role: 'customer', created_at: new Date().toISOString()
    };
    data.users.push(newUser);
    writeData(data);
    res.json({ success: true, userId: newUser.id });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const data = readData();
    const user = data.users.find((u: any) => u.email === email && u.password === password);
    if (user) {
      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } else {
      res.status(401).json({ error: 'Credenciais inválidas' });
    }
  });

  // Order Routes
  app.post('/api/orders', (req, res) => {
    const { userId, name, email, whatsapp, address, items, totalAmount } = req.body;
    const data = readData();
    const newOrder = {
      id: data.orders.length > 0 ? Math.max(...data.orders.map((o:any)=>o.id)) + 1 : 1,
      user_id: userId || null,
      customer_name: name,
      customer_email: email,
      customer_whatsapp: whatsapp,
      customer_address: address,
      total_amount: totalAmount,
      status: 'pending',
      tracking_code: null,
      created_at: new Date().toISOString(),
      items: items
    };
    data.orders.push(newOrder);
    writeData(data);
    res.json({ success: true, orderId: newOrder.id });
  });

  app.get('/api/orders/user/:userId', (req, res) => {
    const data = readData();
    const orders = data.orders.filter((o: any) => o.user_id === parseInt(req.params.userId));
    res.json(orders.sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  });

  // Admin Routes
  app.get('/api/admin/orders', (req, res) => {
    const data = readData();
    res.json(data.orders.sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  });

  app.put('/api/admin/orders/:id', (req, res) => {
    const { status, tracking_code } = req.body;
    const data = readData();
    const order = data.orders.find((o: any) => o.id === parseInt(req.params.id));
    if (order) {
      order.status = status;
      order.tracking_code = tracking_code || null;
      writeData(data);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Pedido não encontrado' });
    }
  });

  app.get('/api/admin/users', (req, res) => {
    const data = readData();
    const users = data.users.map((u:any) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at }));
    res.json(users.sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  });

  app.put('/api/admin/users/:id', (req, res) => {
    const { role } = req.body;
    const data = readData();
    const user = data.users.find((u: any) => u.id === parseInt(req.params.id));
    if (user) {
      user.role = role;
      writeData(data);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Usuário não encontrado' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
