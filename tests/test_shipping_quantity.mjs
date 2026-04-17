#!/usr/bin/env node
/**
 * TESTE CONTROLADO - Auditoria do cálculo de frete SuperFrete
 *
 * Objetivo: identificar se o payload atual (1 entry com quantity N)
 * produz o mesmo resultado que o payload correto (N entries com quantity 1)
 * ou o payload consolidado (package com peso total).
 *
 * IMPORTANTE: endpoint /calculator NÃO cria pedido nem etiqueta.
 * É apenas uma cotação read-only. Não altera produção.
 */

import fs from 'node:fs';

// Load .env from medusa-backend
const envRaw = fs.readFileSync('/home/root/medusa-backend/.env', 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const TOKEN = env.SUPERFRETE_TOKEN;
const CEP_ORIGEM = env.SUPERFRETE_CEP_ORIGEM || '74450380';
const URL = env.SUPERFRETE_URL || 'https://api.superfrete.com/api/v0/calculator';
const CEP_DESTINO = '01153000'; // São Paulo (distância média, típico para testes)

if (!TOKEN) {
  console.error('SUPERFRETE_TOKEN não configurado em .env');
  process.exit(1);
}

const SERVICE_NAMES = { 1: 'PAC', 2: 'Sedex', 17: 'Mini Envios' };

async function cotar(label, body) {
  console.log(`\n[TESTE] ${label}`);
  console.log('  Payload products/package:', JSON.stringify(body.products || body.package, null, 2).replace(/\n/g, '\n  '));
  const t0 = Date.now();
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'DenteDeTubarao (kaykep7@gmail.com)',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const ms = Date.now() - t0;
    if (!res.ok) {
      console.log(`  ERRO HTTP ${res.status} (${ms}ms):`, JSON.stringify(data));
      return null;
    }
    const arr = Array.isArray(data) ? data : data.options || [];
    const summary = {};
    for (const opt of arr) {
      if (opt.error || !opt.price) continue;
      summary[SERVICE_NAMES[opt.id] || `svc${opt.id}`] = {
        price: opt.price,
        delivery: opt.delivery_time,
        packages: opt.packages,
      };
    }
    console.log(`  OK (${ms}ms) → ${JSON.stringify(summary, null, 2).replace(/\n/g, '\n  ')}`);
    return summary;
  } catch (e) {
    console.log(`  EXCEÇÃO: ${e.message}`);
    return null;
  }
}

// Produto base: linha de pesca 500 jardas (um dos mais comuns da loja)
// Conforme getShippingByYards: 500j => 12x12x19, 0.4kg
const prod500 = { height: 12, width: 12, length: 19, weight: 0.4 };
// Produto 3000 jardas (mais pesado)
const prod3000 = { height: 18, width: 18, length: 27, weight: 1.0 };

const base = {
  from: { postal_code: CEP_ORIGEM },
  to:   { postal_code: CEP_DESTINO },
  services: '1,2,17',
  options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false },
};

console.log('================================================================');
console.log('  AUDITORIA DE FRETE SUPERFRETE - TESTE CONTROLADO');
console.log(`  Origem: ${CEP_ORIGEM}  Destino: ${CEP_DESTINO}`);
console.log('  Endpoint /calculator é READ-ONLY (não cria pedidos)');
console.log('================================================================');

async function main() {
  // ===== CENÁRIO A: Linha 500 jardas (0.4 kg) =====
  console.log('\n\n█████ CENÁRIO A: Linha de pesca 500 jardas (0.4kg unit) █████');

  await cotar('A1) 1 unidade (baseline)',
    { ...base, products: [{ quantity: 1, ...prod500 }] });

  // Modo atual do sistema: products: [{ quantity: N, ...dims }]
  await cotar('A2) 2 unidades — MODO ATUAL (1 entry, quantity:2)',
    { ...base, products: [{ quantity: 2, ...prod500 }] });

  // Modo expandido: N entries separadas, quantity:1 cada
  await cotar('A3) 2 unidades — MODO EXPANDIDO (2 entries, quantity:1)',
    { ...base, products: [{ quantity: 1, ...prod500 }, { quantity: 1, ...prod500 }] });

  // Modo consolidado em package
  await cotar('A4) 2 unidades — PACKAGE CONSOLIDADO (peso*qty, dimensões empilhadas)',
    { ...base, package: {
        weight: prod500.weight * 2,
        height: prod500.height * 2,  // empilhado
        width:  prod500.width,
        length: prod500.length,
    } });

  await cotar('A5) 3 unidades — MODO ATUAL (1 entry, quantity:3)',
    { ...base, products: [{ quantity: 3, ...prod500 }] });

  await cotar('A6) 3 unidades — MODO EXPANDIDO (3 entries, quantity:1)',
    { ...base, products: [
        { quantity: 1, ...prod500 },
        { quantity: 1, ...prod500 },
        { quantity: 1, ...prod500 }
    ] });

  // ===== CENÁRIO B: Linha 3000 jardas (1kg) =====
  console.log('\n\n█████ CENÁRIO B: Linha de pesca 3000 jardas (1kg unit) █████');

  await cotar('B1) 1 unidade',
    { ...base, products: [{ quantity: 1, ...prod3000 }] });

  await cotar('B2) 2 unidades — MODO ATUAL',
    { ...base, products: [{ quantity: 2, ...prod3000 }] });

  await cotar('B3) 2 unidades — MODO EXPANDIDO',
    { ...base, products: [{ quantity: 1, ...prod3000 }, { quantity: 1, ...prod3000 }] });

  await cotar('B4) 3 unidades — MODO ATUAL',
    { ...base, products: [{ quantity: 3, ...prod3000 }] });

  await cotar('B5) 3 unidades — MODO EXPANDIDO',
    { ...base, products: [
        { quantity: 1, ...prod3000 },
        { quantity: 1, ...prod3000 },
        { quantity: 1, ...prod3000 }
    ] });

  // ===== CENÁRIO C: Produto 3kg (requisito do usuário) =====
  console.log('\n\n█████ CENÁRIO C: Produto 3kg (conforme requisito do usuário) █████');
  const prod3kg = { height: 20, width: 20, length: 20, weight: 3.0 };

  await cotar('C1) 1 unidade (3kg)',
    { ...base, products: [{ quantity: 1, ...prod3kg }] });

  await cotar('C2) 2 unidades — MODO ATUAL (6kg total esperado)',
    { ...base, products: [{ quantity: 2, ...prod3kg }] });

  await cotar('C3) 2 unidades — MODO EXPANDIDO',
    { ...base, products: [{ quantity: 1, ...prod3kg }, { quantity: 1, ...prod3kg }] });

  await cotar('C4) 3 unidades — MODO ATUAL (9kg total esperado)',
    { ...base, products: [{ quantity: 3, ...prod3kg }] });

  await cotar('C5) 3 unidades — MODO EXPANDIDO',
    { ...base, products: [
        { quantity: 1, ...prod3kg },
        { quantity: 1, ...prod3kg },
        { quantity: 1, ...prod3kg }
    ] });

  console.log('\n\n================================================================');
  console.log('  Testes concluídos. Analise os valores para identificar o bug.');
  console.log('================================================================\n');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
