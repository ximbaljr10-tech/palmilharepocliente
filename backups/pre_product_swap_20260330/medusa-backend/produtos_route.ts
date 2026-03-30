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

async function getInternalAdminToken(): Promise<string | null> {
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
    return data.token || null
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

    // Build query params
    let queryParams = `limit=${limit}&offset=${offset}&order=-created_at&fields=*variants,*variants.prices`
    if (status) {
      const statuses = String(status).split(",")
      for (const s of statuses) {
        queryParams += `&status[]=${s.trim()}`
      }
    }

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
    return res.json({
      products: data.products || [],
      count: data.count || 0,
      offset,
      limit,
    })
  } catch (error: any) {
    console.error("GET /admin/produtos-custom error:", error.message)
    return res.status(500).json({ error: "Erro interno ao listar produtos" })
  }
}
