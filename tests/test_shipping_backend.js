#!/usr/bin/env node
/**
 * TESTE: Chama o endpoint real /store/shipping-quote do Medusa
 * simulando o Cart (frontend) com produto 50JDS 48un.
 *
 * Verifica se o backend recalcula corretamente quando varia o quantity.
 */
const MEDUSA_URL = "http://localhost:9000";
const PUB_KEY =
  "pk_b54130691636a84f3172ebbc1d0ac4d9b14bc2430db612d289a055e341b7b706";
const CEP = "01310930";

// Dados REAIS do produto no banco:
// prod_01KK3F3JVKXDY3V0N5P172BTXR "48 UNIDADES DT 50JDS..."
// metadata: { shipping_width: 12, shipping_height: 12, shipping_length: 19, shipping_weight: 1 }
const PROD_48U = {
  quantity: 1, // será substituído
  height: 12,
  width: 12,
  length: 19,
  weight: 1,
};

async function callBackend(label, products) {
  console.log(`\n──── ${label} ────`);
  console.log("Request:", JSON.stringify({ cep: CEP, products }));
  const res = await fetch(`${MEDUSA_URL}/store/shipping-quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PUB_KEY,
    },
    body: JSON.stringify({ cep: CEP, products }),
  });
  const data = await res.json();
  console.log("Response status:", res.status);
  if (data.success && data.options) {
    const opts = Array.isArray(data.options) ? data.options : [];
    opts.forEach((o) => {
      if (o.error) {
        console.log(`  ✗ [${o.id}] ${o.name}: ${o.error}`);
      } else {
        const pkg = o.packages?.[0];
        console.log(
          `  ✓ [${o.id}] ${o.name}: R$ ${o.price}` +
            (pkg ? ` (peso_pacote=${pkg.weight}kg)` : "")
        );
      }
    });
    return opts;
  } else {
    console.log("  ERROR:", JSON.stringify(data).slice(0, 200));
    return [];
  }
}

(async () => {
  console.log("══════════════════════════════════════════════════════");
  console.log("TESTE: endpoint /store/shipping-quote (fluxo Cart real)");
  console.log("Produto: 50JDS 48UN (peso cadastrado: 1kg)");
  console.log("══════════════════════════════════════════════════════");

  const a1 = await callBackend("1 unidade", [{ ...PROD_48U, quantity: 1 }]);
  const a2 = await callBackend("2 unidades", [{ ...PROD_48U, quantity: 2 }]);
  const a3 = await callBackend("3 unidades", [{ ...PROD_48U, quantity: 3 }]);
  const a5 = await callBackend("5 unidades", [{ ...PROD_48U, quantity: 5 }]);
  const a10 = await callBackend("10 unidades", [{ ...PROD_48U, quantity: 10 }]);

  const pac = (opts) => {
    const o = opts.find((x) => x.id === 1 && !x.error);
    return o ? Number(o.price) : null;
  };

  console.log("\n══════════════════════════════════════════════════════");
  console.log("RESUMO - PAC (serviço id 1):");
  console.log("══════════════════════════════════════════════════════");
  const p1 = pac(a1),
    p2 = pac(a2),
    p3 = pac(a3),
    p5 = pac(a5),
    p10 = pac(a10);
  console.log(` 1un: R$ ${p1}`);
  console.log(` 2un: R$ ${p2}  (delta vs 1un: R$ ${(p2 - p1).toFixed(2)})`);
  console.log(` 3un: R$ ${p3}  (delta vs 1un: R$ ${(p3 - p1).toFixed(2)})`);
  console.log(` 5un: R$ ${p5}  (delta vs 1un: R$ ${(p5 - p1).toFixed(2)})`);
  console.log(`10un: R$ ${p10} (delta vs 1un: R$ ${(p10 - p1).toFixed(2)})`);

  console.log("\n══════════════════════════════════════════════════════");
  console.log("AGORA COM PESO CORRIGIDO (3kg):");
  console.log("══════════════════════════════════════════════════════");
  const P3 = { ...PROD_48U, weight: 3 };
  const b1 = await callBackend("1un @ 3kg", [{ ...P3, quantity: 1 }]);
  const b2 = await callBackend("2un @ 3kg", [{ ...P3, quantity: 2 }]);
  const b3 = await callBackend("3un @ 3kg", [{ ...P3, quantity: 3 }]);
  const c1 = pac(b1), c2 = pac(b2), c3 = pac(b3);
  console.log(` 1un: R$ ${c1}`);
  console.log(` 2un: R$ ${c2}  (delta: R$ ${(c2-c1).toFixed(2)})`);
  console.log(` 3un: R$ ${c3}  (delta: R$ ${(c3-c1).toFixed(2)})`);
})();
