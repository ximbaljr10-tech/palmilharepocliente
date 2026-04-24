import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * POST /store/shipping-quote
 *
 * Calcula o frete via SuperFrete para um conjunto de produtos individuais.
 *
 * ─── 2026-04-24 FIX CÁLCULO FRETE ────────────────────────────────────────
 * MUDANÇAS IMPORTANTES (v2):
 *   1. SEMPRE enviamos `products[]` para a SuperFrete (nunca `package`).
 *      Assim a própria SuperFrete calcula a CAIXA IDEAL e retorna em
 *      `option.packages[0]` com { weight, height, width, length }.
 *
 *   2. A caixa ideal retornada pela SuperFrete é normalizada e devolvida
 *      ao frontend em `options[].ideal_package`. Essa é a dimensão que DEVE
 *      ser usada na hora de gerar a etiqueta (API de Envio de Frete), não
 *      as dimensões dos produtos individuais — isso evita divergência com
 *      a transportadora.
 *
 *   3. ZERO CACHE: request headers e fetch options desabilitam cache em
 *      todos os níveis (fetch, CDN, navegador).
 *
 *   4. Logs de auditoria completos (request + response summary + ideal box).
 *
 * ─── SEGURANÇA ───────────────────────────────────────────────────────────
 * Este endpoint é público (Store API). Nunca persiste nada no banco aqui —
 * a persistência da caixa ideal acontece só no momento da criação do
 * pedido, via `/store/shipping-quote/persist` ou dentro de `orders-custom`.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const reqId = `sq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`

  // Prevent any intermediate cache from storing this response
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")

  try {
    const { cep, products } = req.body as {
      cep: string
      products: Array<{
        quantity: number
        height: number
        width: number
        length: number
        weight: number
      }>
    }

    if (!cep || !products || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: "CEP e produtos são obrigatórios",
      })
    }

    const cleanCep = cep.replace(/\D/g, "")
    if (cleanCep.length !== 8) {
      return res.status(400).json({
        success: false,
        error: "CEP inválido",
      })
    }

    const token = process.env.SUPERFRETE_TOKEN
    const cepOrigem = process.env.SUPERFRETE_CEP_ORIGEM || "74450380"

    if (!token) {
      return res.status(500).json({
        success: false,
        error: "Token SuperFrete não configurado",
      })
    }

    const superfreteUrl = process.env.SUPERFRETE_URL || "https://api.superfrete.com/api/v0/calculator"

    // ─── Sanitize & normalize products ────────────────────────────────
    // Coerce everything to Number in case the client sent strings,
    // and enforce minimum sensible defaults so a broken metadata entry
    // (e.g. weight=0 from a bad save) never yields a "free" quote.
    //
    // FIX 2026-04-24 (order #1471 audit):
    //   - Medusa stores product.weight in GRAMS (e.g. 1000 = 1 kg).
    //     SuperFrete API requires KG. Heuristic: any weight > 30 (kg) is
    //     obviously grams → divide by 1000 (SuperFrete absolute max per
    //     parcel is 30 kg anyway).
    //   - Dimensions: values > 150 cm are probably millimeters → /10.
    const normalizeWeightKg = (w: number): number => {
      if (!Number.isFinite(w) || w <= 0) return 0.3
      return w > 30 ? w / 1000 : w
    }
    const normalizeDimCm = (d: number, fallback: number): number => {
      if (!Number.isFinite(d) || d <= 0) return fallback
      return d > 150 ? d / 10 : d
    }
    const sanitized = products.map((p) => {
      const qty = Math.max(1, Math.floor(Number(p.quantity) || 1))
      const weight = Math.max(0.01, normalizeWeightKg(Number(p.weight)))
      const height = Math.max(1, normalizeDimCm(Number(p.height), 12))
      const width  = Math.max(1, normalizeDimCm(Number(p.width),  12))
      const length = Math.max(1, normalizeDimCm(Number(p.length), 19))
      return { quantity: qty, height, width, length, weight }
    })

    // ─── Audit log: request ────────────────────────────────────────────
    const totalWeight = sanitized.reduce((s, p) => s + p.weight * p.quantity, 0)
    const totalItems = sanitized.reduce((s, p) => s + p.quantity, 0)
    console.log(
      `[SHIPPING_QUOTE][${reqId}] REQ cep=${cleanCep} items=${totalItems} total_weight=${totalWeight.toFixed(2)}kg ` +
      `products=${JSON.stringify(sanitized)}`
    )

    const body = {
      from: { postal_code: cepOrigem },
      to: { postal_code: cleanCep },
      services: "1,2,17",
      options: {
        own_hand: false,
        receipt: false,
        insurance_value: 0,
        use_insurance_value: false,
      },
      products: sanitized,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(superfreteUrl, {
      method: "POST",
      // Node's undici supports this; ensures zero cache on the SuperFrete call
      cache: "no-store" as RequestCache,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[SHIPPING_QUOTE][${reqId}] SuperFrete HTTP ${response.status}: ${errorText}`)
      return res.status(502).json({
        success: false,
        error: "Erro ao calcular frete com SuperFrete",
      })
    }

    const data = await response.json()

    // ─── Extract ideal package per service ────────────────────────────
    // SuperFrete returns an array (or { options: [...] }). Each option with
    // a valid price has `packages[0]` containing the caixa ideal:
    //   { weight, height, width, length, format, ... }
    const rawOptions: any[] = Array.isArray(data) ? data : (data?.options || [])

    const enriched = rawOptions.map((o: any) => {
      if (o?.error) return o
      const pkg = Array.isArray(o?.packages) && o.packages.length > 0 ? o.packages[0] : null
      const ideal_package = pkg
        ? {
            weight: Number(pkg.weight) || 0,
            height: Number(pkg.height) || 0,
            width: Number(pkg.width) || 0,
            length: Number(pkg.length) || 0,
            format: pkg.format || o.format || "box",
          }
        : null

      return {
        ...o,
        ideal_package,
      }
    })

    // ─── Audit log: response summary (incluindo caixa ideal) ──────────
    try {
      const summary = enriched.map((o: any) => {
        if (o?.error) return `[${o.id}]${o.name}=ERR:${o.error}`
        const ip = o.ideal_package
        const ipStr = ip ? `box ${ip.width}x${ip.height}x${ip.length}cm/${ip.weight}kg` : "no-box"
        return `[${o.id}]${o.name}=R$${o.price}(${ipStr})`
      }).join(" | ")
      console.log(`[SHIPPING_QUOTE][${reqId}] RES ${summary}`)
    } catch (logErr) {
      // logging failure must never break the request
    }

    return res.json({
      success: true,
      options: enriched,
      // products sent are echoed back so the frontend/order creation can
      // persist the exact payload used in the quote (for audit + etiqueta)
      products_sent: sanitized,
      quote_id: reqId,
    })
  } catch (error: any) {
    console.error(`[SHIPPING_QUOTE][${reqId}] UNEXPECTED:`, error?.message || error)
    return res.status(500).json({
      success: false,
      error: "Erro interno ao calcular frete",
    })
  }
}
