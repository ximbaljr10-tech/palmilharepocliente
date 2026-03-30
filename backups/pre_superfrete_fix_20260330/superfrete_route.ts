import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

/**
 * SuperFrete Admin API endpoints
 * GET  /admin/superfrete          → Get balance/user info
 * POST /admin/superfrete          → Actions: checkout, print, info, sync_status
 */

const SUPERFRETE_BASE = process.env.SUPERFRETE_API_BASE || "https://api.superfrete.com/api/v0"

function getSuperfreteToken(): string | null {
  return process.env.SUPERFRETE_TOKEN || null
}

function getTokenFromRequest(req: MedusaRequest): string | null {
  const authHeader = req.headers.authorization || ""
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
}

async function superfreteGet(path: string): Promise<{ ok: boolean; status: number; data: any }> {
  const token = getSuperfreteToken()
  if (!token) return { ok: false, status: 500, data: { error: "Token SuperFrete nao configurado" } }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(`${SUPERFRETE_BASE}${path}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
        Accept: "application/json",
      },
    })
    clearTimeout(timeoutId)
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch (err: any) {
    return { ok: false, status: 500, data: { error: err.message } }
  }
}

async function superfretePost(path: string, body: any): Promise<{ ok: boolean; status: number; data: any }> {
  const token = getSuperfreteToken()
  if (!token) return { ok: false, status: 500, data: { error: "Token SuperFrete nao configurado" } }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)
    const res = await fetch(`${SUPERFRETE_BASE}${path}`, {
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
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch (err: any) {
    return { ok: false, status: 500, data: { error: err.message } }
  }
}

// GET /admin/superfrete - Get SuperFrete user info (balance, shipments, etc.)
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const callerToken = getTokenFromRequest(req)
  if (!callerToken) return res.status(401).json({ error: "Token obrigatorio" })

  try {
    const result = await superfreteGet("/user")
    if (!result.ok) {
      console.error("[SUPERFRETE] Error fetching user info:", result.data)
      return res.status(result.status).json({ error: "Erro ao buscar informacoes da SuperFrete", details: result.data })
    }

    return res.json({
      balance: result.data.balance ?? null,
      shipments: result.data.shipments ?? 0,
      shipments_available: result.data.shipments_available ?? 0,
      firstname: result.data.firstname || "",
      lastname: result.data.lastname || "",
      email: result.data.email || "",
    })
  } catch (err: any) {
    console.error("[SUPERFRETE] User info error:", err.message)
    return res.status(500).json({ error: "Erro interno" })
  }
}

// POST /admin/superfrete - Various actions
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const callerToken = getTokenFromRequest(req)
  if (!callerToken) return res.status(401).json({ error: "Token obrigatorio" })

  const { action, orders, order_id } = req.body as any

  // ---- CHECKOUT: Finalize/pay labels using SuperFrete balance ----
  if (action === "checkout") {
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: "orders (array de IDs SuperFrete) obrigatorio" })
    }

    console.log(`[SUPERFRETE CHECKOUT] Paying for ${orders.length} labels: ${orders.join(", ")}`)
    const result = await superfretePost("/checkout", { orders })

    if (!result.ok) {
      console.error("[SUPERFRETE CHECKOUT] Error:", result.data)
      return res.status(result.status).json({
        success: false,
        error: result.data?.message || result.data?.error || `SuperFrete checkout failed (HTTP ${result.status})`,
        details: result.data,
      })
    }

    console.log("[SUPERFRETE CHECKOUT] Success:", JSON.stringify(result.data))
    return res.json({ success: true, data: result.data })
  }

  // ---- PRINT: Get label PDF, optionally add order identification headers ----
  if (action === "print") {
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: "orders (array de IDs SuperFrete) obrigatorio" })
    }

    // order_info is optional: array of { superfrete_id, order_id, customer_name, cep }
    // When provided, the backend will download the PDF, add identification headers, and return base64
    const { order_info } = req.body as any

    console.log(`[SUPERFRETE PRINT] Getting print URL for: ${orders.join(", ")}`)
    const result = await superfretePost("/tag/print", { orders })

    if (!result.ok) {
      console.error("[SUPERFRETE PRINT] Error:", result.data)
      return res.status(result.status).json({
        success: false,
        error: result.data?.message || result.data?.error || `SuperFrete print failed (HTTP ${result.status})`,
        details: result.data,
      })
    }

    const pdfUrl = result.data?.url

    // If no order_info provided or no PDF URL, return the URL as before (backward compatible)
    if (!order_info || !Array.isArray(order_info) || order_info.length === 0 || !pdfUrl) {
      return res.json({ success: true, data: result.data })
    }

    // --- Enhanced flow: download PDF, add headers, return modified PDF ---
    try {
      console.log(`[SUPERFRETE PRINT] Downloading PDF to add headers for ${order_info.length} orders...`)

      const pdfResponse = await fetch(pdfUrl, { signal: AbortSignal.timeout(30000) })
      if (!pdfResponse.ok) {
        console.error(`[SUPERFRETE PRINT] Failed to download PDF: HTTP ${pdfResponse.status}`)
        // Fallback: return URL as before
        return res.json({ success: true, data: result.data })
      }

      const pdfBytes = await pdfResponse.arrayBuffer()
      const pdfDoc = await PDFDocument.load(pdfBytes)
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const pages = pdfDoc.getPages()

      // Build a map: superfrete_id → order info
      const infoMap = new Map<string, { order_id: string; customer_name: string; cep: string }>()
      for (const info of order_info) {
        if (info.superfrete_id) {
          infoMap.set(String(info.superfrete_id), {
            order_id: String(info.order_id || ""),
            customer_name: String(info.customer_name || ""),
            cep: String(info.cep || ""),
          })
        }
      }

      // SuperFrete generates 2 pages per order (label + declaration)
      // The orders in the PDF follow the same sequence as the `orders` array sent to the API
      // So page 0-1 = orders[0], page 2-3 = orders[1], etc.
      const pagesPerOrder = pages.length > 0 && orders.length > 0
        ? Math.max(1, Math.floor(pages.length / orders.length))
        : 2

      console.log(`[SUPERFRETE PRINT] PDF has ${pages.length} pages, ${orders.length} orders, ~${pagesPerOrder} pages/order`)

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const { width, height } = page.getSize()

        // Determine which order this page belongs to
        const orderIndex = Math.floor(i / pagesPerOrder)
        const sfId = orders[orderIndex]
        const info = sfId ? infoMap.get(String(sfId)) : null

        if (!info) continue // No info for this order, skip header

        // Build header text
        const headerText = `Pedido #${info.order_id} | ${info.customer_name} | CEP ${info.cep}`

        // Draw a small background bar at the very top
        const barHeight = 14
        const fontSize = 7.5

        // Semi-transparent white background bar
        page.drawRectangle({
          x: 0,
          y: height - barHeight,
          width: width,
          height: barHeight,
          color: rgb(0.96, 0.96, 0.97),
          opacity: 0.92,
        })

        // Thin accent line below the bar
        page.drawRectangle({
          x: 0,
          y: height - barHeight,
          width: width,
          height: 0.5,
          color: rgb(0.85, 0.85, 0.87),
        })

        // Draw the text centered
        const textWidth = helveticaFont.widthOfTextAtSize(headerText, fontSize)
        const textX = (width - textWidth) / 2
        const textY = height - barHeight + 4

        // Order number in bold
        const orderPrefix = `Pedido #${info.order_id}`
        const orderPrefixWidth = helveticaBold.widthOfTextAtSize(orderPrefix, fontSize)
        const restText = ` | ${info.customer_name} | CEP ${info.cep}`

        // Calculate starting X to center the full text
        const fullWidth = orderPrefixWidth + helveticaFont.widthOfTextAtSize(restText, fontSize)
        const startX = (width - fullWidth) / 2

        page.drawText(orderPrefix, {
          x: startX,
          y: textY,
          size: fontSize,
          font: helveticaBold,
          color: rgb(0.15, 0.15, 0.17),
        })

        page.drawText(restText, {
          x: startX + orderPrefixWidth,
          y: textY,
          size: fontSize,
          font: helveticaFont,
          color: rgb(0.35, 0.35, 0.4),
        })
      }

      const modifiedPdfBytes = await pdfDoc.save()
      const base64Pdf = Buffer.from(modifiedPdfBytes).toString("base64")

      console.log(`[SUPERFRETE PRINT] PDF modified successfully. ${pages.length} pages with headers.`)

      return res.json({
        success: true,
        data: {
          ...result.data,
          pdf_base64: base64Pdf,
          modified: true,
        },
      })
    } catch (pdfError: any) {
      console.error("[SUPERFRETE PRINT] Error processing PDF, falling back to URL:", pdfError.message)
      // Fallback: return original URL if PDF processing fails
      return res.json({ success: true, data: result.data })
    }
  }

  // ---- INFO: Get label/order info from SuperFrete ----
  if (action === "info") {
    if (!order_id) {
      return res.status(400).json({ error: "order_id (ID SuperFrete) obrigatorio" })
    }

    console.log(`[SUPERFRETE INFO] Fetching info for: ${order_id}`)
    const result = await superfreteGet(`/order/info/${order_id}`)

    if (!result.ok) {
      console.error("[SUPERFRETE INFO] Error:", result.data)
      return res.status(result.status).json({
        success: false,
        error: result.data?.message || result.data?.error || `SuperFrete info failed`,
        details: result.data,
      })
    }

    return res.json({ success: true, data: result.data })
  }

  // ---- CANCEL: Cancel a SuperFrete label ----
  if (action === "cancel") {
    if (!order_id) {
      return res.status(400).json({ error: "order_id (ID SuperFrete) obrigatorio" })
    }

    console.log(`[SUPERFRETE CANCEL] Cancelling: ${order_id}`)
    const result = await superfretePost("/order/cancel", {
      order: { id: order_id, reason_id: "2", description: "Cancelamento pelo admin" }
    })

    if (!result.ok) {
      console.error("[SUPERFRETE CANCEL] Error:", result.data)
      return res.status(result.status).json({
        success: false,
        error: result.data?.message || result.data?.error || "Erro ao cancelar",
        details: result.data,
      })
    }

    return res.json({ success: true, data: result.data })
  }

  return res.status(400).json({ error: "Acao invalida. Use: checkout, print, info, cancel" })
}
