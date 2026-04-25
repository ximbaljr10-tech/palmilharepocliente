import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * Custom admin products endpoint.
 * Uses the same Bearer token auth pattern as /admin/pedidos.
 * Proxies to native Medusa admin API internally using an internal admin token
 * so the frontend never needs cookie/session auth for native routes.
 *
 * GET  /admin/produtos-custom         — List all products (published + draft)
 * POST /admin/produtos-custom         — (reserved for future: create product)
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
  // Return cached token if still valid (cache for 10 minutes)
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
      _cachedTokenExpiry = Date.now() + 10 * 60 * 1000 // 10 minutes
    }
    return token
  } catch {
    return null
  }
}

/**
 * Verify that the caller's token is valid by hitting a known admin endpoint.
 * Returns true if the token grants admin access.
 */
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

// GET /admin/produtos-custom — List all products (published + draft)
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const callerToken = getTokenFromRequest(req)
    if (!callerToken) return res.status(401).json({ error: "Token obrigatorio" })

    // Verify the caller is a valid admin
    const isValid = await verifyCallerToken(callerToken)
    if (!isValid) return res.status(401).json({ error: "Token invalido" })

    // Use internal admin token for native Medusa API calls
    const internalToken = await getInternalAdminToken()
    const workingToken = internalToken || callerToken

    const limit = Number(req.query.limit) || 100
    const offset = Number(req.query.offset) || 0
    const status = req.query.status // optional: "published", "draft", or comma-separated
    const search = req.query.q || req.query.search // optional: text search

    // Build query params — include images for product cards
    let queryParams = `limit=${limit}&offset=${offset}&order=-created_at&fields=*variants,*variants.prices,*images`
    if (status) {
      const statuses = String(status).split(",")
      for (const s of statuses) {
        queryParams += `&status[]=${s.trim()}`
      }
    }
    if (search) {
      queryParams += `&q=${encodeURIComponent(String(search))}`
    }

    console.log(`[GET /admin/produtos-custom] Fetching products: q="${search || ''}", status="${status || 'any'}", limit=${limit}, offset=${offset}`)

    const productsRes = await fetch(
      `${MEDUSA_URL}/admin/products?${queryParams}`,
      {
        headers: {
          Authorization: `Bearer ${workingToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!productsRes.ok) {
      const errText = await productsRes.text()
      console.error("Failed to fetch products from native API:", productsRes.status, errText)
      return res.status(productsRes.status).json({ error: "Erro ao buscar produtos" })
    }

    const data = await productsRes.json()
    let products = data.products || []

    // If Medusa's q= search returned all products (known Medusa v2 issue where
    // short search terms return everything), do manual title filtering
    if (search && String(search).trim().length >= 2 && products.length > 0) {
      const searchLower = String(search).toLowerCase().trim()
      const searchTerms = searchLower.split(/\s+/).filter(Boolean)
      const filtered = products.filter((p: any) => {
        const title = (p.title || '').toLowerCase()
        const handle = (p.handle || '').toLowerCase()
        const description = (p.description || '').toLowerCase()
        // All search terms must match at least one field
        return searchTerms.every(term =>
          title.includes(term) || handle.includes(term) || description.includes(term)
        )
      })
      // Only use filtered results if they actually narrowed the set
      // (prevents returning empty when Medusa search was correct)
      if (filtered.length > 0 || products.length > limit / 2) {
        console.log(`[GET /admin/produtos-custom] Search "${search}": Medusa returned ${products.length}, filtered to ${filtered.length}`)
        products = filtered
      }
    }

    // IMPORTANT: Use Medusa's total count for pagination, not products.length.
    // products.length is only the current page size (max = limit).
    // data.count is the TOTAL number of matching products across all pages.
    // When search filtering is applied locally, use the filtered length as count
    // since the total is no longer accurate for the narrowed result set.
    const totalCount = search ? products.length : (data.count || products.length)

    return res.json({
      products,
      count: totalCount,
      offset,
      limit,
    })
  } catch (error: any) {
    console.error("GET /admin/produtos-custom error:", error.message)
    return res.status(500).json({ error: "Erro interno ao listar produtos" })
  }
}

// POST /admin/produtos-custom — Create a new product
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const callerToken = getTokenFromRequest(req)
    if (!callerToken) return res.status(401).json({ error: "Token obrigatorio" })

    const isValid = await verifyCallerToken(callerToken)
    if (!isValid) return res.status(401).json({ error: "Token invalido" })

    const internalToken = await getInternalAdminToken()
    const workingToken = internalToken || callerToken

    const body = req.body as any
    
    // Parse dimensions. Product (root) accepts string; variant requires integer.
    const parseNum = (v: any) =>
      v !== undefined && v !== null && v !== "" && !isNaN(Number(v)) ? Number(v) : undefined
    const weight = parseNum(body.weight)
    const length = parseNum(body.length)
    const height = parseNum(body.height)
    const width = parseNum(body.width)

    // Create payload
    const createPayload: any = {
      title: body.title || "Novo Produto",
      status: body.status || "draft",
      metadata: body.metadata || {},
      options: [{ title: "Cor", values: ["Padrão"] }], // Need at least one option to create a variant
    }
    
    if (body.description) createPayload.description = body.description;
    if (body.handle) createPayload.handle = body.handle;
    if (body.images && Array.isArray(body.images)) {
      // Normalize: accept string[] OR {url}[] from the frontend
      createPayload.images = body.images.map((img: any) => {
        if (typeof img === "string") return { url: img }
        if (img && typeof img === "object" && img.url) return { url: img.url }
        return img
      })
    }
    
    // Medusa Admin API validates these as numbers (even though the DB column
    // is TEXT — Medusa's ORM casts internally). Pass as numbers.
    if (weight !== undefined) createPayload.weight = weight;
    if (length !== undefined) createPayload.length = length;
    if (height !== undefined) createPayload.height = height;
    if (width !== undefined) createPayload.width = width;

    // We can also create the initial variant in the same call
    const priceInReais = parseFloat(body.price || 0)
    
    const variantPayload: any = {
      title: "Padrão",
      options: { "Cor": "Padrão" },
      manage_inventory: true,
      prices: priceInReais > 0 ? [{ amount: priceInReais, currency_code: "brl" }] : []
    }
    
    // Variant table has INTEGER columns — round to integer
    if (weight !== undefined) variantPayload.weight = Math.round(weight);
    if (length !== undefined) variantPayload.length = Math.round(length);
    if (height !== undefined) variantPayload.height = Math.round(height);
    if (width !== undefined) variantPayload.width = Math.round(width);
    
    createPayload.variants = [variantPayload];

    const createRes = await fetch(`${MEDUSA_URL}/admin/products`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workingToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createPayload),
    })

    if (!createRes.ok) {
      const errData = await createRes.text()
      console.error("Failed to create product:", createRes.status, errData)
      return res.status(createRes.status).json({ error: `Erro ao criar produto: HTTP ${createRes.status}`, details: errData })
    }

    const data = await createRes.json()
    return res.json({ success: true, product: data.product })
  } catch (error: any) {
    console.error("POST /admin/produtos-custom error:", error.message)
    return res.status(500).json({ error: "Erro interno ao criar produto" })
  }
}
