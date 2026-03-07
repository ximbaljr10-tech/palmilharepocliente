import express from 'express';
import { createServer as createViteServer } from 'vite';
import db from './db.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/products', (req, res) => {
    const { q, yards } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: any[] = [];

    if (q) {
      query += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }

    if (yards) {
      query += ' AND yards = ?';
      params.push(yards);
    }

    const products = db.prepare(query).all(...params);
    res.json(products);
  });

  app.get('/api/yards', (req, res) => {
    const yards = db.prepare('SELECT DISTINCT yards FROM products WHERE yards IS NOT NULL ORDER BY yards ASC').all();
    res.json(yards.map((y: any) => y.yards));
  });

  app.get('/api/products/:id', (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  });

  app.post('/api/orders', (req, res) => {
    const { name, email, whatsapp, address, items, totalAmount } = req.body;

    try {
      const insertOrder = db.prepare(`
        INSERT INTO orders (customer_name, customer_email, customer_whatsapp, customer_address, total_amount, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `);
      
      const insertOrderItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
      `);

      const transaction = db.transaction(() => {
        const result = insertOrder.run(name, email, whatsapp, address, totalAmount);
        const orderId = result.lastInsertRowid;

        for (const item of items) {
          insertOrderItem.run(orderId, item.id, item.quantity, item.price);
        }

        return orderId;
      });

      const orderId = transaction();
      res.json({ success: true, orderId });
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ error: 'Failed to create order' });
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
