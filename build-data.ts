import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const results: any[] = [];

fs.createReadStream(path.join(__dirname, 'products.csv'))
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    const products = results.map((row, index) => {
      const yardsMatch = row.Title?.match(/(\d+)\s*(j|jds|jardas)\b/i);
      const yards = yardsMatch ? parseInt(yardsMatch[1], 10) : null;

      return {
        id: index + 1,
        title: row.Title,
        handle: row['URL handle'],
        description: row.Description,
        vendor: row.Vendor,
        price: parseFloat(row.Price) || 0,
        image_url: row['Product image URL'],
        yards: yards
      };
    }).filter(p => p.title && p.price > 0);

    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir);
    }

    fs.writeFileSync(
      path.join(publicDir, 'products.json'),
      JSON.stringify(products, null, 2)
    );

    console.log(`Successfully generated public/products.json with ${products.length} products.`);
  });
