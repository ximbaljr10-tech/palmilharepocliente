#!/usr/bin/env node
/**
 * TESTE END-TO-END: chama o endpoint /store/shipping-quote do backend
 * usando produtos REAIS do catálogo (via API Medusa), simulando
 * exatamente o fluxo do frontend (Cart/Checkout).
 *
 * SOMENTE LEITURA — o endpoint /calculator não cria nem modifica pedidos.
 */

import fs from 'node:fs';

const envRaw = fs.readFileSync('/home/root/medusa-backend/.env', 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const MEDUSA_URL = 'http://localhost:9000';
// Same publishable key as frontend src/api.ts
const PUBLISHABLE_KEY = 'pk_b54130691636a84f3172ebbc1d0ac4d9b14bc2430db612d289a055e341b7b706';
const REGION_ID = 'reg_01KK3F27J2GGKVBAPK30N9VBBH';
const CEP_DESTINO = '01153000';

function getShippingByYards(yards, title) {
  if (title && /carretilha/i.test(title)) return { height: 25, width: 33, length: 31, weight: 1.0 };
  switch (yards) {
    case 50:   return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 100:  return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 200:  return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 500:  return { height: 12, width: 12, length: 19, weight: 0.4 };
    case 600:  return { height: 12, width: 18, length: 18, weight: 0.3 };
    case 1000: return { height: 15, width: 15, length: 18, weight: 0.5 };
    case 2000: return { height: 18, width: 18, length: 19, weight: 1.0 };
    case 3000: return { height: 18, width: 18, length: 27, weight: 1.0 };
    case 6000: return { height: 19, width: 19, length: 25, weight: 2.0 };
    case 12000: return { height: 21, width: 21, length: 30, weight: 3.0 };
    default:   return { height: 12, width: 12, length: 12, weight: 0.2 };
  }
}

function mapProduct(p) {
  const variant = p.variants?.[0];
  const metadata = p.metadata || {};
  const yardsMatch = p.title?.match(/(\d+)\s*(j|jds|jardas)\b/i);
  const yards = yardsMatch ? parseInt(yardsMatch[1], 10) : (metadata.yards || null);
  const shipping = getShippingByYards(yards, p.title || '');
  return {
    id: p.id,
    title: p.title,
    yards,
    price: variant?.calculated_price?.calculated_amount || 0,
    variant_id: variant?.id,
    metadata,
    shipping: {
      height: metadata.shipping_height || shipping.height,
      width: metadata.shipping_width || shipping.width,
      length: metadata.shipping_length || shipping.length,
      weight: metadata.shipping_weight || shipping.weight,
    },
  };
}

async function quoteForCart(cartItems, label) {
  console.log(`\n[E2E] ${label}`);
  console.log('  Cart:', cartItems.map(i => `${i.quantity}x "${i.title}" [${i.shipping.weight}kg, ${i.shipping.height}x${i.shipping.width}x${i.shipping.length}]`).join('  |  '));

  // SIMULA exatamente o que o api.ts frontend faz:
  const products = cartItems.map(item => ({
    quantity: item.quantity,
    height: item.shipping.height,
    width: item.shipping.width,
    length: item.shipping.length,
    weight: item.shipping.weight,
  }));
  console.log('  Payload enviado ao /store/shipping-quote:', JSON.stringify(products));

  const res = await fetch(`${MEDUSA_URL}/store/shipping-quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-publishable-api-key': PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ cep: CEP_DESTINO, products }),
  });
  const data = await res.json();
  if (!data.success) {
    console.log('  ERRO:', data.error || JSON.stringify(data));
    return null;
  }
  const opts = Array.isArray(data.options) ? data.options : [];
  const summary = {};
  for (const o of opts) {
    if (o.error || !o.price) continue;
    summary[o.name || `svc${o.id}`] = { price: o.price, weight: o.packages?.[0]?.weight, dims: o.packages?.[0]?.dimensions };
  }
  console.log('  Resposta:', JSON.stringify(summary, null, 2).replace(/\n/g, '\n  '));
  return summary;
}

async function main() {
  console.log('================================================================');
  console.log('  TESTE E2E: Frontend -> /store/shipping-quote -> SuperFrete');
  console.log(`  CEP destino: ${CEP_DESTINO}`);
  console.log('================================================================');

  // Fetch real products from Medusa
  const prodRes = await fetch(
    `${MEDUSA_URL}/store/products?limit=100&offset=0&region_id=${REGION_ID}&fields=*variants.calculated_price`,
    { headers: { 'x-publishable-api-key': PUBLISHABLE_KEY } }
  );
  const prodData = await prodRes.json();
  const products = (prodData.products || []).map(mapProduct);

  // Find some representative products (by yards)
  const p500 = products.find(p => p.yards === 500 && p.shipping.weight > 0);
  const p3000 = products.find(p => p.yards === 3000);
  const p6000 = products.find(p => p.yards === 6000);
  console.log(`\nProdutos do catálogo encontrados:`);
  console.log(`  500j:  ${p500 ? p500.title : 'nenhum'}`);
  console.log(`  3000j: ${p3000 ? p3000.title : 'nenhum'}`);
  console.log(`  6000j: ${p6000 ? p6000.title : 'nenhum'}`);

  // ===== TEST: quantity scaling of the same product =====
  if (p500) {
    console.log('\n\n█████ 500 JARDAS — escalando quantity █████');
    await quoteForCart([{ ...p500, quantity: 1 }], '500j × 1');
    await quoteForCart([{ ...p500, quantity: 2 }], '500j × 2');
    await quoteForCart([{ ...p500, quantity: 3 }], '500j × 3');
    await quoteForCart([{ ...p500, quantity: 5 }], '500j × 5');
    await quoteForCart([{ ...p500, quantity: 10 }], '500j × 10');
  }

  if (p3000) {
    console.log('\n\n█████ 3000 JARDAS — escalando quantity █████');
    await quoteForCart([{ ...p3000, quantity: 1 }], '3000j × 1');
    await quoteForCart([{ ...p3000, quantity: 2 }], '3000j × 2');
    await quoteForCart([{ ...p3000, quantity: 3 }], '3000j × 3');
    await quoteForCart([{ ...p3000, quantity: 5 }], '3000j × 5');
  }

  if (p6000) {
    console.log('\n\n█████ 6000 JARDAS — escalando quantity █████');
    await quoteForCart([{ ...p6000, quantity: 1 }], '6000j × 1');
    await quoteForCart([{ ...p6000, quantity: 2 }], '6000j × 2');
    await quoteForCart([{ ...p6000, quantity: 3 }], '6000j × 3');
  }

  console.log('\n\n================================================================');
  console.log('  Teste E2E concluído.');
  console.log('================================================================');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
