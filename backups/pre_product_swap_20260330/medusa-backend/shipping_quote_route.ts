import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
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
      products: products.map((p) => ({
        quantity: p.quantity,
        height: p.height,
        length: p.length,
        width: p.width,
        weight: p.weight,
      })),
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(superfreteUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("SuperFrete error:", response.status, errorText)
      return res.status(502).json({
        success: false,
        error: "Erro ao calcular frete com SuperFrete",
      })
    }

    const data = await response.json()
    return res.json({ success: true, options: data })
  } catch (error: any) {
    console.error("Shipping quote error:", error.message)
    return res.status(500).json({
      success: false,
      error: "Erro interno ao calcular frete",
    })
  }
}
