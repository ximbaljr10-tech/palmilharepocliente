import fs from 'fs';
import csv from 'csv-parser';
import db from './db.js';

const results: any[] = [];

fs.createReadStream('products.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    // Drop and recreate table to ensure schema is updated
    db.exec('DROP TABLE IF EXISTS products');
    db.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        handle TEXT,
        description TEXT,
        vendor TEXT,
        price REAL,
        image_url TEXT,
        yards INTEGER
      )
    `);

    const insert = db.prepare(`
      INSERT INTO products (title, handle, description, vendor, price, image_url, yards)
      VALUES (@title, @handle, @description, @vendor, @price, @image_url, @yards)
    `);

    const insertMany = db.transaction((products) => {
      for (const product of products) {
        insert.run(product);
      }
    });

    const productsToInsert = results.map(row => {
      // Extract yards from title (e.g., 1000j, 3000jds, 500 jardas)
      const yardsMatch = row.Title?.match(/(\d+)\s*(j|jds|jardas)\b/i);
      const yards = yardsMatch ? parseInt(yardsMatch[1], 10) : null;

      return {
        title: row.Title,
        handle: row['URL handle'],
        description: row.Description,
        vendor: row.Vendor,
        price: parseFloat(row.Price) || 0,
        image_url: row['Product image URL'],
        yards: yards
      };
    }).filter(p => p.title && p.price > 0);

    insertMany(productsToInsert);
    console.log(`Inserted ${productsToInsert.length} products into the database.`);
  });
