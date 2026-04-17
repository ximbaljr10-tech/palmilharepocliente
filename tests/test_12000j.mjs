import fs from 'node:fs';
const envRaw = fs.readFileSync('/home/root/medusa-backend/.env', 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const TOKEN = env.SUPERFRETE_TOKEN;
const CEP_ORIGEM = env.SUPERFRETE_CEP_ORIGEM || '74450380';
const URL = 'https://api.superfrete.com/api/v0/calculator';
const CEP_DESTINO = '01153000';

async function cot(label, products) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'DenteDeTubarao (kaykep7@gmail.com)', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: { postal_code: CEP_ORIGEM },
      to: { postal_code: CEP_DESTINO },
      services: '1,2,17',
      options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false },
      products,
    }),
  });
  const data = await res.json();
  const pac = data.find(o => o.id === 1);
  const sedex = data.find(o => o.id === 2);
  console.log(`${label.padEnd(40)} | PAC: ${String(pac?.price || '---').padStart(6)} (${pac?.packages?.[0]?.weight || '-'}kg, ${pac?.packages?.[0]?.dimensions?.height || '-'}x${pac?.packages?.[0]?.dimensions?.width || '-'}x${pac?.packages?.[0]?.dimensions?.length || '-'}) | SEDEX: ${String(sedex?.price || '---').padStart(6)}`);
}

console.log('\n███ LINHA 12000j (3kg unit, 21x21x30) — caso-exemplo do usuário ███\n');
const p12k = { height: 21, width: 21, length: 30, weight: 3.0 };
await cot('12000j × 1', [{ quantity: 1, ...p12k }]);
await cot('12000j × 2 (modo atual: qty=2)', [{ quantity: 2, ...p12k }]);
await cot('12000j × 2 (expandido)', [{ quantity: 1, ...p12k }, { quantity: 1, ...p12k }]);
await cot('12000j × 3', [{ quantity: 3, ...p12k }]);
await cot('12000j × 4', [{ quantity: 4, ...p12k }]);

console.log('\n███ CARRETILHA (1kg, 25x33x31) ███\n');
const pCar = { height: 25, width: 33, length: 31, weight: 1.0 };
await cot('Carretilha × 1', [{ quantity: 1, ...pCar }]);
await cot('Carretilha × 2', [{ quantity: 2, ...pCar }]);
await cot('Carretilha × 3', [{ quantity: 3, ...pCar }]);

// Agora teste o padrão genérico da loja: quando admin esquece de cadastrar
// dimensões, caem no default. O default é 12x12x12, 0.2kg.
console.log('\n███ PRODUTO COM DEFAULT 0.2kg (edge case: sem dims cadastradas) ███\n');
const pDef = { height: 12, width: 12, length: 12, weight: 0.2 };
await cot('Default × 1', [{ quantity: 1, ...pDef }]);
await cot('Default × 2', [{ quantity: 2, ...pDef }]);
await cot('Default × 3', [{ quantity: 3, ...pDef }]);
await cot('Default × 5', [{ quantity: 5, ...pDef }]);
await cot('Default × 10', [{ quantity: 10, ...pDef }]);
await cot('Default × 20', [{ quantity: 20, ...pDef }]);
