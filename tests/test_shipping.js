#!/usr/bin/env node
/**
 * TESTE CONTROLADO DE FRETE - ISOLADO
 * Reproduz exatamente a mesma chamada que o sistema faz à API SuperFrete
 * para validar se o cálculo de frete escala corretamente com quantidade.
 *
 * NÃO modifica pedidos reais, apenas consulta cotações.
 */

const SUPERFRETE_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzI4NTY5ODIsInN1YiI6Ik5hcHNWSTgxS0pZTTBaakhrRkFlMHZ1WTlObTEifQ.uaI_fPccNbpAVOjG9Socs2FXd_S9tfmdqAVcnM1eqvk";
const CEP_ORIGEM = "74450380";
const CEP_DESTINO = "01310930"; // São Paulo Av Paulista (diferente região)
const CALC_URL = "https://api.superfrete.com/api/v0/calculator";

// Mesmas dimensões usadas pelo sistema real para o produto
// "48 UNIDADES DT 50JDS - FIO 10 - 1 PASSE - ÁSPERA"
// → metadata: { shipping_width: 12, shipping_height: 12, shipping_length: 19, shipping_weight: 1 }
// (na tabela `product` do banco, real)
const PRODUCT_50JD_48U = {
  height: 12,
  width: 12,
  length: 19,
  weight: 1, // kg (como cadastrado no banco!)
};

// Produto hipotético com peso mais realista para 48 unidades
// (pelo relato do usuário deveria ser ~3kg)
const PRODUCT_50JD_48U_3KG = {
  height: 12,
  width: 12,
  length: 19,
  weight: 3,
};

async function quote(label, products) {
  const body = {
    from: { postal_code: CEP_ORIGEM },
    to: { postal_code: CEP_DESTINO },
    services: "1,2,17",
    options: {
      own_hand: false,
      receipt: false,
      insurance_value: 0,
      use_insurance_value: false,
    },
    products,
  };

  console.log("\n─────────────────────────────────────────────────");
  console.log(`▶ CENÁRIO: ${label}`);
  console.log("─────────────────────────────────────────────────");
  console.log("PAYLOAD enviado:");
  console.log(JSON.stringify(body, null, 2));

  const res = await fetch(CALC_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPERFRETE_TOKEN}`,
      "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  const opts = Array.isArray(data) ? data : data.options || [];

  console.log("\nRESPOSTA SuperFrete (resumo):");
  opts.forEach((opt) => {
    if (opt.error) {
      console.log(`  ✗ [${opt.id}] ${opt.name || "?"}: ERRO = ${opt.error}`);
      return;
    }
    const pkg = opt.packages?.[0] || {};
    const dim = pkg.dimensions || {};
    console.log(
      `  ✓ [${opt.id}] ${opt.name?.padEnd(14)} price=R$${String(opt.price).padStart(6)} ` +
        `pacote=${dim.width || "?"}x${dim.height || "?"}x${dim.length || "?"}cm ` +
        `peso=${pkg.weight || "?"}kg`
    );
  });

  return opts;
}

(async () => {
  console.log("═════════════════════════════════════════════════");
  console.log("  TESTE DE FRETE — ESCALABILIDADE POR QUANTIDADE");
  console.log("═════════════════════════════════════════════════");
  console.log(`CEP origem:  ${CEP_ORIGEM} (Goiânia)`);
  console.log(`CEP destino: ${CEP_DESTINO} (São Paulo)`);

  // ─── GRUPO A: Usando os VALORES REAIS do banco (1kg p/ 48 unid.) ───
  console.log("\n\n═══════════════════════════════════════════════════");
  console.log("  GRUPO A: Produto 48-UN 50JDS (peso REAL do banco=1kg)");
  console.log("═══════════════════════════════════════════════════");
  const a1 = await quote("1 unidade (peso=1kg)", [
    { quantity: 1, ...PRODUCT_50JD_48U },
  ]);
  const a2 = await quote("2 unidades (peso=1kg cada)", [
    { quantity: 2, ...PRODUCT_50JD_48U },
  ]);
  const a3 = await quote("3 unidades (peso=1kg cada)", [
    { quantity: 3, ...PRODUCT_50JD_48U },
  ]);
  const a5 = await quote("5 unidades (peso=1kg cada)", [
    { quantity: 5, ...PRODUCT_50JD_48U },
  ]);
  const a10 = await quote("10 unidades (peso=1kg cada)", [
    { quantity: 10, ...PRODUCT_50JD_48U },
  ]);

  // ─── GRUPO B: Simulando peso correto (3kg p/ 48 unid.) ───
  console.log("\n\n═══════════════════════════════════════════════════");
  console.log("  GRUPO B: Produto hipotético (peso=3kg cada)");
  console.log("═══════════════════════════════════════════════════");
  const b1 = await quote("1 unidade (peso=3kg)", [
    { quantity: 1, ...PRODUCT_50JD_48U_3KG },
  ]);
  const b2 = await quote("2 unidades (peso=3kg cada)", [
    { quantity: 2, ...PRODUCT_50JD_48U_3KG },
  ]);
  const b3 = await quote("3 unidades (peso=3kg cada)", [
    { quantity: 3, ...PRODUCT_50JD_48U_3KG },
  ]);

  // ─── Resumo comparativo ───
  const priceOf = (opts, id) => {
    const o = opts.find((x) => x.id === id && !x.error);
    return o ? parseFloat(o.price) : null;
  };

  console.log("\n\n═══════════════════════════════════════════════════");
  console.log("  RESUMO COMPARATIVO (serviço PAC = id 1)");
  console.log("═══════════════════════════════════════════════════");
  console.log("Grupo A - peso REAL do banco (1kg/und):");
  console.log(`   1un: R$ ${priceOf(a1, 1)}`);
  console.log(`   2un: R$ ${priceOf(a2, 1)}`);
  console.log(`   3un: R$ ${priceOf(a3, 1)}`);
  console.log(`   5un: R$ ${priceOf(a5, 1)}`);
  console.log(`  10un: R$ ${priceOf(a10, 1)}`);
  console.log("\nGrupo B - peso hipotético correto (3kg/und):");
  console.log(`   1un: R$ ${priceOf(b1, 1)}`);
  console.log(`   2un: R$ ${priceOf(b2, 1)}`);
  console.log(`   3un: R$ ${priceOf(b3, 1)}`);
})();
