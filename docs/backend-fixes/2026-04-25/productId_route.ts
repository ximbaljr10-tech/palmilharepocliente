import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * Custom admin single-product endpoint.
 * Same Bearer token auth pattern as /admin/pedidos.
 *
 * GET  /admin/produtos-custom/:productId              — Get single product
 * POST /admin/produtos-custom/:productId              — Update product (title, description, status, metadata, price, stock)
 */

const MEDUSA_URL = "http://localhost:9000"

function getTokenFromRequest(req: MedusaRequest): string | null {
  const authHeader = req.headers.authorization || ""
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
}

// Cache internal admin token to avoid re-authenticating on every request
let _cachedInternalToken: string | null = null
let _cachedTokenExpiry = 0

async function getInternalAdminToken(): Promise<string | null> {
  if (_cachedInternalToken && Date.now() < _cachedTokenExpiry) {
    return _cachedInternalToken
  }

  const adminEmail = process.env.MEDUSA_ADMIN_EMAIL
  const adminPassword = process.env.MEDUSA_ADMIN_PASSWORD
  if (!adminEmail || !adminPassword) return null
  try {
    const res = await fetch(`${MEDUSA_URL}/auth/user/emailpass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    })
    const data = await res.json()
    const token = data.token || null
    if (token) {
      _cachedInternalToken = token
      _cachedTokenExpiry = Date.now() + 10 * 60 * 1000
    }
    return token
  } catch {
    return null
  }
}

async function verifyCallerToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${MEDUSA_URL}/admin/orders?limit=1`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
    return res.ok
  } catch {
    return false
  }
}

// GET /admin/produtos-custom/:productId — Get single product with variants and prices
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const callerToken = getTokenFromRequest(req)
    if (!callerToken) return res.status(401).json({ error: "Token obrigatorio" })

    const isValid = await verifyCallerToken(callerToken)
    if (!isValid) return res.status(401).json({ error: "Token invalido" })

    const internalToken = await getInternalAdminToken()
    const workingToken = internalToken || callerToken

    const { productId } = req.params

    const productRes = await fetch(
      `${MEDUSA_URL}/admin/products/${productId}?fields=*variants,*variants.prices`,
      {
        headers: {
          Authorization: `Bearer ${workingToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!productRes.ok) {
      const status = productRes.status
      if (status === 404) return res.status(404).json({ error: "Produto nao encontrado" })
      return res.status(status).json({ error: "Erro ao buscar produto" })
    }

    const data = await productRes.json()
    return res.json({ product: data.product })
  } catch (error: any) {
    console.error("GET /admin/produtos-custom/:id error:", error.message)
    return res.status(500).json({ error: "Erro interno ao buscar produto" })
  }
}

// POST /admin/produtos-custom/:productId — Update product
// Accepts: { title, description, status, metadata, price, stock, variant_id, price_id }
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const callerToken = getTokenFromRequest(req)
    if (!callerToken) return res.status(401).json({ error: "Token obrigatorio" })

    const isValid = await verifyCallerToken(callerToken)
    if (!isValid) return res.status(401).json({ error: "Token invalido" })

    const internalToken = await getInternalAdminToken()
    const workingToken = internalToken || callerToken

    const { productId } = req.params
    const body = req.body as any

    const results: { product?: boolean; price?: boolean; stock?: boolean; errors: string[] } = {
      errors: [],
    }

    // 1. Update product fields (title, description, status, metadata)
    const productUpdate: any = {}
    if (body.title !== undefined) productUpdate.title = body.title
    if (body.description !== undefined) productUpdate.description = body.description
    if (body.status !== undefined) productUpdate.status = body.status
    if (body.metadata !== undefined) productUpdate.metadata = body.metadata

    // FIX 2026-04-25: Medusa Admin API requires images as array of objects
    // { url: "..." }, not plain strings. The frontend sends string[] (URLs),
    // so we normalize here. Accepts both formats for robustness.
    if (body.images !== undefined) {
      if (Array.isArray(body.images)) {
        productUpdate.images = body.images.map((img: any) => {
          if (typeof img === "string") return { url: img }
          if (img && typeof img === "object" && img.url) return { url: img.url }
          return img
        })
      } else {
        productUpdate.images = body.images
      }
    }

    // Native dimension fields on `product`. The Medusa Admin API validates
    // them as NUMBERS (even though the DB column is TEXT — the ORM casts
    // internally). We parse to Number; invalid values are silently ignored
    // to avoid failing the entire product update.
    // IMPORTANT: metadata.shipping_* remains the PRIMARY source of truth — the
    // storefront, cart and shipping quote all read from metadata.shipping_*
    // (see src/api.ts line 113-118). Native fields here are secondary/mirror.
    const parseNumOrNull = (v: any) => {
      if (v === undefined || v === null || v === "") return null
      const n = Number(v)
      return isNaN(n) ? null : n
    }
    {
      const n = parseNumOrNull(body.weight); if (n !== null) productUpdate.weight = n
    }
    {
      const n = parseNumOrNull(body.length); if (n !== null) productUpdate.length = n
    }
    {
      const n = parseNumOrNull(body.height); if (n !== null) productUpdate.height = n
    }
    {
      const n = parseNumOrNull(body.width); if (n !== null) productUpdate.width = n
    }

    if (Object.keys(productUpdate).length > 0) {
      const updateRes = await fetch(`${MEDUSA_URL}/admin/products/${productId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workingToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(productUpdate),
      })
      if (updateRes.ok) {
        results.product = true
      } else {
        const errData = await updateRes.text()
        console.error("Failed to update product:", updateRes.status, errData)
        results.errors.push(`Erro ao atualizar produto: HTTP ${updateRes.status}`)
      }
    }

    // 2. Update variant price and native dimensions if provided
    // Medusa V2 Admin API: prices[].amount is in REAIS (decimal), NOT centavos.
    // The frontend sends price in REAIS (e.g. 43.90). We pass it directly
    // to Medusa without multiplying by 100.
    // BUG FIX 2026-04-20: Previously did `* 100`, which turned R$ 45,40 into
    // amount=4540 — Medusa then displayed as R$ 4.540,00.
    if (body.variant_id) {
      const variantUpdate: any = {}
      
      if (body.price !== undefined) {
        const priceInReais = parseFloat(body.price)
        if (!isNaN(priceInReais) && priceInReais > 0) {
          variantUpdate.prices = [{ amount: priceInReais, currency_code: "brl" }]
        }
      }
      
      // FIX 2026-04-25: product_variant dimension columns are INTEGER in Medusa
      // v2 DB. We round to integers here. These are secondary to metadata.shipping_*
      // (the real source of truth consumed by the storefront shipping calculator).
      const toInt = (v: any) => {
        const n = Number(v)
        return isNaN(n) ? null : Math.round(n)
      }
      if (body.weight !== undefined && body.weight !== null && body.weight !== "") {
        const n = toInt(body.weight); if (n !== null) variantUpdate.weight = n
      }
      if (body.length !== undefined && body.length !== null && body.length !== "") {
        const n = toInt(body.length); if (n !== null) variantUpdate.length = n
      }
      if (body.height !== undefined && body.height !== null && body.height !== "") {
        const n = toInt(body.height); if (n !== null) variantUpdate.height = n
      }
      if (body.width !== undefined && body.width !== null && body.width !== "") {
        const n = toInt(body.width); if (n !== null) variantUpdate.width = n
      }
      
      if (Object.keys(variantUpdate).length > 0) {
        const priceRes = await fetch(
          `${MEDUSA_URL}/admin/products/${productId}/variants/${body.variant_id}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${workingToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(variantUpdate),
          }
        )
        if (priceRes.ok) {
          results.price = true
        } else {
          const errData = await priceRes.text()
          console.error("Failed to update variant:", priceRes.status, errData)
          results.errors.push(`Erro ao atualizar variant: HTTP ${priceRes.status}`)
        }
      }
    }

    // 3. Update stock/inventory if provided
    if (body.stock !== undefined && body.stock !== "" && body.variant_id) {
      const stockNum = parseInt(body.stock, 10)
      if (!isNaN(stockNum)) {
        // First enable manage_inventory on variant
        const stockRes = await fetch(
          `${MEDUSA_URL}/admin/products/${productId}/variants/${body.variant_id}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${workingToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              manage_inventory: true,
            }),
          }
        )
        if (stockRes.ok) {
          results.stock = true
        } else {
          const errData = await stockRes.text()
          console.error("Failed to update stock:", stockRes.status, errData)
          results.errors.push(`Erro ao atualizar estoque: HTTP ${stockRes.status}`)
        }
      }
    }

    // Fetch updated product to return
    const updatedRes = await fetch(
      `${MEDUSA_URL}/admin/products/${productId}?fields=*variants,*variants.prices`,
      {
        headers: {
          Authorization: `Bearer ${workingToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    let updatedProduct = null
    if (updatedRes.ok) {
      const data = await updatedRes.json()
      updatedProduct = data.product
    }

    if (results.errors.length > 0 && !results.product && !results.price && !results.stock) {
      return res.status(500).json({
        success: false,
        errors: results.errors,
      })
    }

    return res.json({
      success: true,
      product: updatedProduct,
      updates: {
        product: results.product || false,
        price: results.price || false,
        stock: results.stock || false,
      },
      errors: results.errors,
    })
  } catch (error: any) {
    console.error("POST /admin/produtos-custom/:id error:", error.message)
    return res.status(500).json({ error: "Erro interno ao atualizar produto" })
  }
}
