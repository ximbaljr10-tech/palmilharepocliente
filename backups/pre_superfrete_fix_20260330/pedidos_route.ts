import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendOrderEmail } from "../../../services/email"

/**
 * Admin orders endpoint - reads/updates Medusa orders in PostgreSQL.
 * Handles status updates and SuperFrete integration.
 *
 * STATUS LIFECYCLE:
 *   awaiting_payment -> paid -> preparing -> shipped -> delivered
 *   (cancelled can happen from any state)
 *
 * IMPORTANT: When updating metadata, we MUST fetch the CURRENT full metadata
 * first, then merge ONLY the fields we want to change. Medusa's admin POST
 * /admin/orders/:id REPLACES the entire metadata object.
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
  } catch { return null }
}

function parseOrderAddress(order: any) {
  const meta = order.metadata || {}
  if (meta.address_components && meta.address_components.cep) return meta.address_components

  const sa = order.shipping_address
  if (sa) {
    return {
      street: sa.address_1 || "", number: "",
      complement: sa.address_2 || "", neighborhood: sa.company || "",
      city: sa.city || "", state: sa.province || "",
      cep: (sa.postal_code || "").replace(/\D/g, ""),
    }
  }
  return null
}

async function sendToSuperfrete(order: any): Promise<{ success: boolean; data?: any; error?: string }> {
  const token = process.env.SUPERFRETE_TOKEN
  if (!token) return { success: false, error: "Token SuperFrete nao configurado" }

  const addr = parseOrderAddress(order)
  if (!addr || !addr.cep) return { success: false, error: "Endereco incompleto para SuperFrete" }

  const meta = order.metadata || {}
  const pkg = meta.package_dimensions || {}
  const dims = pkg.dimensions || pkg
  const volume = {
    height: Number(dims.height) || 12,
    width: Number(dims.width) || 12,
    length: Number(dims.length) || 12,
    weight: Number(pkg.weight || dims.weight) || 0.2,
  }

  const sa = order.shipping_address || {}
  let customerName = `${sa.first_name || ""} ${sa.last_name || ""}`.trim() || "Cliente"
  // SuperFrete OBRIGA ter nome e sobrenome. Se tiver só uma palavra, adiciona um sobrenome genérico.
  if (!customerName.includes(" ")) {
    customerName += " Cliente"
  }

  // SuperFrete exige string vazia "" se não houver número, e não aceita "0", "SN", "S/N"
  let parsedNumber = addr.number || ""
  const upperNumber = parsedNumber.trim().toUpperCase()
  if (upperNumber === "SN" || upperNumber === "S/N" || upperNumber === "0" || upperNumber === "SEM NUMERO" || upperNumber === "NAO TEM") {
    parsedNumber = ""
  }

  const body = {
    from: {
      name: process.env.SUPERFRETE_SENDER_NAME || "Loja Dente de Tubarao",
      address: process.env.SUPERFRETE_SENDER_ADDRESS || "Rua Almeida Lara quadra 64 lt 14",
      number: process.env.SUPERFRETE_SENDER_NUMBER || "SN",
      district: process.env.SUPERFRETE_SENDER_DISTRICT || "Capuava",
      city: process.env.SUPERFRETE_SENDER_CITY || "Goiania",
      state_abbr: process.env.SUPERFRETE_SENDER_STATE || "GO",
      postal_code: process.env.SUPERFRETE_CEP_ORIGEM || "74450380",
    },
    to: {
      name: customerName,
      address: addr.street || "",
      number: parsedNumber,
      complement: addr.complement || "",
      district: addr.district || addr.neighborhood || "NA",
      city: addr.city || "",
      state_abbr: (addr.state || "").toUpperCase(),
      postal_code: (addr.cep || "").replace(/\D/g, ""),
      email: order.email || "",
    },
    service: Number(meta.shipping_service) || 1,
    products: (order.items || []).map((item: any) => ({
      name: (item.title || item.product_title || "Produto").substring(0, 100),
      quantity: Number(item.quantity) || 1,
      unitary_value: Number(item.unit_price) || 0,
    })),
    volumes: volume,
    options: { non_commercial: true, insurance_value: null, receipt: false, own_hand: false },
  }

  try {
    const superfreteUrl = process.env.SUPERFRETE_CART_URL || "https://api.superfrete.com/api/v0/cart"
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)

    const response = await fetch(superfreteUrl, {
      method: "POST", signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })
    clearTimeout(timeoutId)

    let data: any
    try { data = JSON.parse(await response.text()) } catch {
      return { success: false, error: `SuperFrete resposta invalida (HTTP ${response.status})` }
    }
    if (!response.ok) return { success: false, error: `SuperFrete: ${data.message || data.error || `HTTP ${response.status}`}` }
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: `Erro de conexao com SuperFrete: ${error.message}` }
  }
}

// GET /admin/pedidos - List ALL orders from Medusa PostgreSQL (with pagination)
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const callerToken = getTokenFromRequest(req)
    if (!callerToken) return res.status(401).json({ error: "Token obrigatorio" })

    // Fetch ALL orders using pagination loop (no more limit=100 bug)
    const allOrders: any[] = []
    const PAGE_SIZE = 100
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const ordersRes = await fetch(
        `${MEDUSA_URL}/admin/orders?fields=id,display_id,email,status,created_at,updated_at,currency_code,metadata,*items,*shipping_address,*summary&order=-created_at&limit=${PAGE_SIZE}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${callerToken}`, "Content-Type": "application/json" } }
      )

      if (ordersRes.status === 401) return res.status(401).json({ error: "Token invalido" })

      const data = await ordersRes.json()
      const pageOrders = data.orders || []
      allOrders.push(...pageOrders)

      // Stop if we got fewer than PAGE_SIZE (means no more pages)
      if (pageOrders.length < PAGE_SIZE) {
        hasMore = false
      } else {
        offset += PAGE_SIZE
      }

      // Safety limit: max 5000 orders to prevent infinite loops
      if (allOrders.length >= 5000) {
        hasMore = false
      }
    }

    console.log(`[GET /admin/pedidos] Fetched ${allOrders.length} total orders (pagination complete)`)
    const orders = allOrders

    const mapped = orders.map((o: any) => {
      const sa = o.shipping_address || {}
      const meta = o.metadata || {}
      return {
        id: o.display_id,
        medusa_order_id: o.id,
        customer_name: `${sa.first_name || ""} ${sa.last_name || ""}`.trim(),
        customer_email: o.email,
        customer_whatsapp: meta.customer_whatsapp || sa.phone || "",
        customer_address: meta.customer_full_address || `${sa.address_1 || ""}, ${sa.city || ""} - ${sa.province || ""}`,
        address_components: meta.address_components || null,
        total_amount: Number(o.summary?.raw_current_order_total?.value || o.summary?.current_order_total || 0) + Number(meta.shipping_fee || 0),
        shipping_service: meta.shipping_service || null,
        shipping_fee: meta.shipping_fee || 0,
        package_dimensions: meta.package_dimensions || null,
        status: meta.custom_status || "awaiting_payment",
        tracking_code: meta.tracking_code || null,
        items: (o.items || []).map((item: any) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          title: item.title || item.product_title,
          quantity: item.quantity,
          price: item.unit_price || 0,
          image_url: item.thumbnail || "",
        })),
        items_color_preferences: meta.items_color_preferences || null,
        created_at: o.created_at,
        updated_at: o.updated_at,
        superfrete_id: meta.superfrete_id || null,
        superfrete_status: meta.superfrete_status || null,
        superfrete_protocol: meta.superfrete_protocol || null,
        superfrete_error: meta.superfrete_error || null,
        superfrete_price: meta.superfrete_price || null,
        superfrete_tracking: meta.superfrete_tracking || null,
        label_generated_at: meta.label_generated_at || null,
        archived: meta.archived === true || meta.archived === 'true',
        archived_at: meta.archived_at || null,
        admin_observation: meta.admin_observation || "",
      }
    })

    return res.json(mapped)
  } catch (error: any) {
    console.error("Get orders error:", error.message)
    return res.json([])
  }
}

// PUT /admin/pedidos - Update order status
// CRITICAL: Fetches current metadata first, then merges changes.
// This prevents the bug where updating one order resets others.
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { orderId, medusa_order_id, status, tracking_code, skip_superfrete, action } = req.body as any

    const callerToken = getTokenFromRequest(req)
    if (!callerToken) return res.status(401).json({ success: false, error: "Token obrigatorio" })

    const internalToken = await getInternalAdminToken()
    const workingToken = internalToken || callerToken

    // === BATCH MARK AS PAID (mass operation on awaiting_payment orders) ===
    if (action === 'batch_mark_paid' || action === 'batch_mark_paid_label') {
      const { order_ids } = req.body as any  // array of display_ids or medusa_order_ids
      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return res.json({ success: false, error: "order_ids (array) obrigatorio" })
      }

      console.log(`[BATCH ${action.toUpperCase()}] Processing ${order_ids.length} orders...`)

      // Fetch all orders
      const allBatchOrders: any[] = []
      const BATCH_PAGE = 100
      let bOffset = 0
      let bMore = true
      while (bMore) {
        const bRes = await fetch(
          `${MEDUSA_URL}/admin/orders?fields=id,display_id,email,metadata,*items,*shipping_address,*summary&limit=${BATCH_PAGE}&offset=${bOffset}`,
          { headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" } }
        )
        if (!bRes.ok) break
        const bData = await bRes.json()
        const pageOrders = bData.orders || []
        allBatchOrders.push(...pageOrders)
        if (pageOrders.length < BATCH_PAGE) bMore = false
        else bOffset += BATCH_PAGE
        if (allBatchOrders.length >= 5000) bMore = false
      }

      const results: { id: number; medusa_id: string; success: boolean; error?: string; superfrete_id?: string }[] = []
      const BATCH_SIZE = 3
      const generateLabel = action === 'batch_mark_paid_label'

      for (let i = 0; i < order_ids.length; i += BATCH_SIZE) {
        const batch = order_ids.slice(i, i + BATCH_SIZE)
        const batchPromises = batch.map(async (oid: any) => {
          // Find order by medusa_order_id or display_id
          const order = allBatchOrders.find((o: any) =>
            o.id === oid || String(o.display_id) === String(oid)
          )
          if (!order) return { id: oid, medusa_id: '', success: false, error: 'Pedido nao encontrado' }

          const meta = { ...(order.metadata || {}) }
          const currentStatus = meta.custom_status || 'awaiting_payment'

          // Only process awaiting_payment orders
          if (currentStatus !== 'awaiting_payment') {
            return { id: order.display_id, medusa_id: order.id, success: false, error: `Status atual: ${currentStatus} (precisa ser awaiting_payment)` }
          }

          // Mark as paid
          meta.custom_status = 'paid'

          // If batch_mark_paid_label, also generate label
          if (generateLabel && !meta.superfrete_id) {
            const sfResult = await sendToSuperfrete(order)
            if (sfResult.success && sfResult.data) {
              meta.superfrete_id = sfResult.data.id || null
              meta.superfrete_protocol = sfResult.data.protocol || null
              meta.superfrete_status = sfResult.data.status || "pending"
              meta.superfrete_price = sfResult.data.price || null
              meta.superfrete_tracking = sfResult.data.self_tracking || null
              meta.label_generated_at = new Date().toISOString()
              delete meta.superfrete_error
            } else {
              // Label failed — do NOT mark as paid to prevent inconsistency
              meta.custom_status = 'awaiting_payment'
              return { id: order.display_id, medusa_id: order.id, success: false, error: `Etiqueta falhou: ${sfResult.error}` }
            }
          }

          // Save
          try {
            const updateRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ metadata: meta }),
            })
            if (!updateRes.ok) {
              return { id: order.display_id, medusa_id: order.id, success: false, error: 'Erro ao salvar' }
            }

            // Send email
            const sa = order.shipping_address || {}
            const cn = `${sa.first_name || ""} ${sa.last_name || ""}`.trim()
            const emailOrder = {
              display_id: order.display_id, id: order.display_id, customer_name: cn, customer_email: order.email,
              items: (order.items || []).map((i: any) => ({ title: i.title || i.product_title, quantity: i.quantity, price: i.unit_price || 0 })),
              total_amount: Number(order.summary?.raw_current_order_total?.value || 0) + Number(meta.shipping_fee || 0),
              shipping_fee: Number(meta.shipping_fee || 0),
            }
            sendOrderEmail('paid', emailOrder).catch(e => console.error("[BATCH EMAIL]", e.message))

            return { id: order.display_id, medusa_id: order.id, success: true, superfrete_id: meta.superfrete_id || null }
          } catch (err: any) {
            return { id: order.display_id, medusa_id: order.id, success: false, error: err.message }
          }
        })

        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)

        if (i + BATCH_SIZE < order_ids.length) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }

      const succeeded = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      console.log(`[BATCH ${action.toUpperCase()}] Complete: ${succeeded} OK, ${failed} failed`)
      return res.json({ success: true, total: results.length, succeeded, failed, results })
    }

    // === BATCH PAY LABELS (mass checkout of already-generated labels) ===
    if (action === 'batch_pay_labels') {
      const { order_ids } = req.body as any
      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return res.json({ success: false, error: "order_ids (array) obrigatorio" })
      }

      const SUPERFRETE_BASE = process.env.SUPERFRETE_API_BASE || "https://api.superfrete.com/api/v0"
      const sfToken = process.env.SUPERFRETE_TOKEN
      if (!sfToken) return res.json({ success: false, error: "Token SuperFrete nao configurado" })

      // Fetch all orders to get their superfrete_ids
      const allPayOrders: any[] = []
      const PAY_PAGE = 100
      let pOffset = 0
      let pMore = true
      while (pMore) {
        const pRes = await fetch(
          `${MEDUSA_URL}/admin/orders?fields=id,display_id,metadata&limit=${PAY_PAGE}&offset=${pOffset}`,
          { headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" } }
        )
        if (!pRes.ok) break
        const pData = await pRes.json()
        const pageOrders = pData.orders || []
        allPayOrders.push(...pageOrders)
        if (pageOrders.length < PAY_PAGE) pMore = false
        else pOffset += PAY_PAGE
        if (allPayOrders.length >= 5000) pMore = false
      }

      // Collect superfrete_ids for checkout
      const sfIds: string[] = []
      const orderSfMap: { orderId: string; displayId: number; sfId: string }[] = []

      for (const oid of order_ids) {
        const order = allPayOrders.find((o: any) => o.id === oid || String(o.display_id) === String(oid))
        if (!order) continue
        const meta = order.metadata || {}
        if (meta.superfrete_id && meta.superfrete_status === 'pending') {
          sfIds.push(meta.superfrete_id)
          orderSfMap.push({ orderId: order.id, displayId: order.display_id, sfId: meta.superfrete_id })
        }
      }

      if (sfIds.length === 0) {
        return res.json({ success: false, error: "Nenhuma etiqueta pendente para pagar" })
      }

      console.log(`[BATCH PAY LABELS] Paying ${sfIds.length} labels...`)

      // Checkout in batches of 10 (SuperFrete may have limits)
      const PAY_BATCH = 10
      const payResults: { sfId: string; displayId: number; success: boolean; error?: string }[] = []

      for (let i = 0; i < sfIds.length; i += PAY_BATCH) {
        const batchSfIds = sfIds.slice(i, i + PAY_BATCH)
        try {
          const checkoutRes = await fetch(`${SUPERFRETE_BASE}/checkout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sfToken}`,
              "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ orders: batchSfIds }),
          })

          let checkoutData: any
          try { checkoutData = JSON.parse(await checkoutRes.text()) } catch { checkoutData = {} }

          if (checkoutRes.ok) {
            // Update all orders in this batch
            for (const sfId of batchSfIds) {
              const mapping = orderSfMap.find(m => m.sfId === sfId)
              if (mapping) {
                // Update order metadata
                const order = allPayOrders.find((o: any) => o.id === mapping.orderId)
                if (order) {
                  const meta = { ...(order.metadata || {}) }
                  meta.superfrete_status = 'released'
                  meta.custom_status = 'preparing'
                  meta.finalized_at = new Date().toISOString()
                  delete meta.superfrete_error
                  await fetch(`${MEDUSA_URL}/admin/orders/${mapping.orderId}`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ metadata: meta }),
                  })
                }
                payResults.push({ sfId, displayId: mapping.displayId, success: true })
              }
            }
          } else {
            const errMsg = checkoutData?.message || checkoutData?.error || `HTTP ${checkoutRes.status}`
            for (const sfId of batchSfIds) {
              const mapping = orderSfMap.find(m => m.sfId === sfId)
              payResults.push({ sfId, displayId: mapping?.displayId || 0, success: false, error: errMsg })
            }
          }
        } catch (err: any) {
          for (const sfId of batchSfIds) {
            const mapping = orderSfMap.find(m => m.sfId === sfId)
            payResults.push({ sfId, displayId: mapping?.displayId || 0, success: false, error: err.message })
          }
        }

        if (i + PAY_BATCH < sfIds.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      const payOk = payResults.filter(r => r.success).length
      const payFail = payResults.filter(r => !r.success).length
      console.log(`[BATCH PAY LABELS] Complete: ${payOk} OK, ${payFail} failed`)
      return res.json({ success: true, total: payResults.length, succeeded: payOk, failed: payFail, results: payResults })
    }

    // === BATCH SYNC SUPERFRETE (global sync — does NOT require a specific order) ===
    if (action === 'batch_sync_superfrete') {
      const SUPERFRETE_BASE = process.env.SUPERFRETE_API_BASE || "https://api.superfrete.com/api/v0"
      const sfToken = process.env.SUPERFRETE_TOKEN
      if (!sfToken) {
        return res.json({ success: false, error: "Token SuperFrete nao configurado" })
      }

      // Fetch ALL orders to find those with superfrete_id
      const allSyncOrders: any[] = []
      const SYNC_PAGE = 100
      let syncOffset = 0
      let syncMore = true
      while (syncMore) {
        const syncRes = await fetch(
          `${MEDUSA_URL}/admin/orders?fields=id,display_id,email,metadata,*items,*shipping_address,*summary&limit=${SYNC_PAGE}&offset=${syncOffset}`,
          { headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" } }
        )
        if (!syncRes.ok) break
        const syncData = await syncRes.json()
        const pageOrders = syncData.orders || []
        allSyncOrders.push(...pageOrders)
        if (pageOrders.length < SYNC_PAGE) syncMore = false
        else syncOffset += SYNC_PAGE
        if (allSyncOrders.length >= 5000) syncMore = false
      }

      // Filter only orders with superfrete_id (not archived, not delivered/cancelled)
      const ordersWithLabel = allSyncOrders.filter((o: any) => {
        const m = o.metadata || {}
        return !!m.superfrete_id && m.archived !== true && m.archived !== 'true'
      })

      console.log(`[BATCH SYNC] Found ${ordersWithLabel.length} orders with SuperFrete labels to sync`)

      const results: any[] = []
      let updated = 0
      let errors = 0
      const BATCH_SIZE = 5

      for (let i = 0; i < ordersWithLabel.length; i += BATCH_SIZE) {
        const batch = ordersWithLabel.slice(i, i + BATCH_SIZE)
        const batchPromises = batch.map(async (syncOrder: any) => {
          const meta = { ...(syncOrder.metadata || {}) }
          const sfId = meta.superfrete_id
          try {
            const infoRes = await fetch(`${SUPERFRETE_BASE}/order/info/${sfId}`, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${sfToken}`,
                "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
                Accept: "application/json",
              },
            })
            if (!infoRes.ok) {
              errors++
              return { id: syncOrder.display_id, sfId, error: `HTTP ${infoRes.status}` }
            }
            const infoData = await infoRes.json()
            const prevStatus = meta.custom_status || "awaiting_payment"
            let statusChanged = false

            meta.superfrete_status = infoData.status || meta.superfrete_status
            if (infoData.tracking) {
              meta.superfrete_tracking = infoData.tracking
              meta.tracking_code = infoData.tracking
            }
            if (infoData.print?.url) {
              meta.superfrete_print_url = infoData.print.url
            }

            const statusMap: Record<string, string> = {
              released: "preparing", posted: "shipped", delivered: "delivered", canceled: "cancelled",
            }
            const mappedStatus = statusMap[infoData.status]
            if (mappedStatus) {
              const statusOrder = ["awaiting_payment", "paid", "preparing", "shipped", "delivered"]
              const prevIdx = statusOrder.indexOf(prevStatus)
              const newIdx = statusOrder.indexOf(mappedStatus)
              if (mappedStatus === "cancelled" || newIdx > prevIdx) {
                meta.custom_status = mappedStatus
                statusChanged = true
              }
            }

            await fetch(`${MEDUSA_URL}/admin/orders/${syncOrder.id}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ metadata: meta }),
            })

            if (statusChanged) updated++
            return {
              id: syncOrder.display_id, sfId,
              sf_status: infoData.status,
              status_changed: statusChanged,
              new_status: meta.custom_status,
            }
          } catch (err: any) {
            errors++
            return { id: syncOrder.display_id, sfId, error: err.message }
          }
        })

        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)

        if (i + BATCH_SIZE < ordersWithLabel.length) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }

      console.log(`[BATCH SYNC] Complete: ${ordersWithLabel.length} orders synced, ${updated} status changes, ${errors} errors`)
      return res.json({
        success: true,
        total: ordersWithLabel.length,
        updated,
        errors,
        results,
      })
    }

    // All other actions require a specific order
    if (!orderId && !medusa_order_id) return res.status(400).json({ success: false, error: "orderId ou medusa_order_id obrigatorio" })

    // Find order: prefer medusa_order_id (direct, no ambiguity) over display_id search
    let order: any = null

    if (medusa_order_id && typeof medusa_order_id === 'string' && medusa_order_id.startsWith('order_')) {
      // DIRECT lookup by Medusa internal ID - safest method, no ambiguity
      console.log(`[PUT /admin/pedidos] Direct lookup by medusa_order_id: ${medusa_order_id}`)
      const directRes = await fetch(
        `${MEDUSA_URL}/admin/orders/${medusa_order_id}?fields=id,display_id,email,metadata,*items,*shipping_address,*summary`,
        { headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" } }
      )
      if (directRes.status === 401) return res.status(401).json({ success: false, error: "Token invalido" })
      if (directRes.ok) {
        const directData = await directRes.json()
        order = directData.order || null
      }
    }

    // Fallback: search by display_id if medusa_order_id not provided or failed
    if (!order && orderId) {
      console.log(`[PUT /admin/pedidos] Fallback: searching by display_id: ${orderId}`)
      // Use paginated search to find by display_id (more reliable than q= text search)
      const PAGE_SIZE = 100
      let offset = 0
      let found = false

      while (!found) {
        const findRes = await fetch(
          `${MEDUSA_URL}/admin/orders?fields=id,display_id,email,metadata,*items,*shipping_address,*summary&limit=${PAGE_SIZE}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" } }
        )
        if (findRes.status === 401) return res.status(401).json({ success: false, error: "Token invalido" })

        const findData = await findRes.json()
        const pageOrders = findData.orders || []

        const match = pageOrders.find((o: any) => o.display_id === orderId || String(o.display_id) === String(orderId))
        if (match) {
          order = match
          found = true
        } else if (pageOrders.length < PAGE_SIZE) {
          break // No more pages
        } else {
          offset += PAGE_SIZE
        }

        // Safety: max 5000 scanned
        if (offset >= 5000) break
      }
    }

    if (!order) {
      console.error(`[PUT /admin/pedidos] Order not found: orderId=${orderId}, medusa_order_id=${medusa_order_id}`)
      return res.status(404).json({ success: false, error: "Pedido nao encontrado" })
    }

    console.log(`[PUT /admin/pedidos] Found order: display_id=${order.display_id}, id=${order.id}`)

    // CRITICAL: Get the FULL current metadata from the order
    // We must preserve ALL existing fields and only update what changed
    const currentMeta = { ...(order.metadata || {}) }
    const previousStatus = currentMeta.custom_status || "awaiting_payment"

    // === SAVE OBSERVATION ===
    if (action === 'save_observation') {
      const { observation } = req.body as any
      currentMeta.admin_observation = observation || ""
      console.log(`[OBSERVATION] Order #${order.display_id} (${order.id}) - Saving observation: "${(observation || "").substring(0, 50)}..."`) 
      const obsRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: currentMeta }),
      })
      if (!obsRes.ok) {
        return res.status(500).json({ success: false, error: "Erro ao salvar observacao" })
      }
      return res.json({ success: true, order: { id: order.display_id, admin_observation: currentMeta.admin_observation } })
    }

    // === ARCHIVE / UNARCHIVE ACTIONS ===
    if (action === 'archive' || action === 'unarchive') {
      const isArchive = action === 'archive'
      currentMeta.archived = isArchive
      currentMeta.archived_at = isArchive ? new Date().toISOString() : null
      console.log(`[ARCHIVE] Order #${order.display_id} (${order.id}) - ${isArchive ? 'Archiving' : 'Unarchiving'}...`)
      const archRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: currentMeta }),
      })
      if (!archRes.ok) {
        return res.status(500).json({ success: false, error: `Erro ao ${isArchive ? 'arquivar' : 'desarquivar'} pedido` })
      }
      return res.json({ success: true, order: { id: order.display_id, archived: isArchive } })
    }

    // === SEPARATE ACTION: Generate SuperFrete label (independent of status change) ===
    if (action === 'generate_label') {
      if (currentMeta.superfrete_id) {
        return res.json({ success: false, error: "Etiqueta já foi gerada para este pedido", superfrete: { success: false, error: "Etiqueta já existe" } })
      }
      console.log(`[LABEL] Order #${order.display_id} (${order.id}) - Generating SuperFrete label (manual)...`)
      const sfResult = await sendToSuperfrete(order)
      if (sfResult.success && sfResult.data) {
        currentMeta.superfrete_id = sfResult.data.id || null
        currentMeta.superfrete_protocol = sfResult.data.protocol || null
        currentMeta.superfrete_status = sfResult.data.status || "pending"
        currentMeta.superfrete_price = sfResult.data.price || null
        currentMeta.superfrete_tracking = sfResult.data.self_tracking || null
        currentMeta.label_generated_at = new Date().toISOString()
        delete currentMeta.superfrete_error
        console.log(`[LABEL] Order #${order.display_id} - Label generated successfully: ${sfResult.data.id}`)
      } else {
        currentMeta.superfrete_error = sfResult.error
        console.error(`[LABEL] Order #${order.display_id} - Label generation failed: ${sfResult.error}`)
      }
      await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: currentMeta }),
      })
      return res.json({ success: sfResult.success, superfrete: sfResult, order: { id: order.display_id, medusa_order_id: order.id, superfrete_id: currentMeta.superfrete_id || null } })
    }

    // === ACTION: Finalize order and generate label (full flow) ===
    // 1. Generate label on SuperFrete (if not already)
    // 2. Pay/checkout the label using SuperFrete balance
    // 3. Mark order as "preparing"
    // 4. Save all SuperFrete data (id, protocol, tracking, status)
    // 5. Send email with tracking code if available
    if (action === 'finalize_and_label') {
      console.log(`[FINALIZE] Order #${order.display_id} (${order.id}) - Starting finalize_and_label flow...`)

      const SUPERFRETE_BASE = process.env.SUPERFRETE_API_BASE || "https://api.superfrete.com/api/v0"
      const sfToken = process.env.SUPERFRETE_TOKEN

      if (!sfToken) {
        return res.status(500).json({ success: false, error: "Token SuperFrete nao configurado" })
      }

      // Step 1: Generate label if not already generated
      let sfId = currentMeta.superfrete_id
      if (!sfId) {
        console.log(`[FINALIZE] Step 1: Generating label...`)
        const sfResult = await sendToSuperfrete(order)
        if (!sfResult.success || !sfResult.data) {
          currentMeta.superfrete_error = sfResult.error
          await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ metadata: currentMeta }),
          })
          return res.json({ success: false, error: `Erro ao gerar etiqueta: ${sfResult.error}`, step: "generate" })
        }
        sfId = sfResult.data.id
        currentMeta.superfrete_id = sfResult.data.id || null
        currentMeta.superfrete_protocol = sfResult.data.protocol || null
        currentMeta.superfrete_status = sfResult.data.status || "pending"
        currentMeta.superfrete_price = sfResult.data.price || null
        currentMeta.superfrete_tracking = sfResult.data.self_tracking || null
        currentMeta.label_generated_at = new Date().toISOString()
        delete currentMeta.superfrete_error
        console.log(`[FINALIZE] Step 1 OK: Label generated: ${sfId}`)
      } else {
        console.log(`[FINALIZE] Step 1: Label already exists: ${sfId}`)
      }

      // Step 2: Checkout (pay) the label — only if status is still "pending"
      // If already "released" or beyond, skip checkout
      const currentSfStatus = currentMeta.superfrete_status || "pending"
      if (currentSfStatus === "pending") {
        console.log(`[FINALIZE] Step 2: Paying label ${sfId}...`)
        try {
          const checkoutRes = await fetch(`${SUPERFRETE_BASE}/checkout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sfToken}`,
              "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ orders: [sfId] }),
          })

          let checkoutData: any
          try { checkoutData = JSON.parse(await checkoutRes.text()) } catch { checkoutData = {} }

          if (!checkoutRes.ok) {
            const errMsg = checkoutData?.message || checkoutData?.error || `HTTP ${checkoutRes.status}`
            console.error(`[FINALIZE] Step 2 FAILED: ${errMsg}`)
            currentMeta.superfrete_error = `Checkout falhou: ${errMsg}`
            // Save metadata but DON'T change status
            await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ metadata: currentMeta }),
            })
            return res.json({ success: false, error: `Erro ao pagar etiqueta: ${errMsg}`, step: "checkout" })
          }

          console.log(`[FINALIZE] Step 2 OK: Label paid`)
          currentMeta.superfrete_status = "released"
          delete currentMeta.superfrete_error
        } catch (err: any) {
          console.error(`[FINALIZE] Step 2 ERROR: ${err.message}`)
          return res.json({ success: false, error: `Erro de conexao ao pagar etiqueta: ${err.message}`, step: "checkout" })
        }
      } else {
        console.log(`[FINALIZE] Step 2: Skipping checkout, SF status already: ${currentSfStatus}`)
      }

      // Step 3: Get updated info from SuperFrete (to get tracking code)
      console.log(`[FINALIZE] Step 3: Fetching updated info for ${sfId}...`)
      try {
        const infoRes = await fetch(`${SUPERFRETE_BASE}/order/info/${sfId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${sfToken}`,
            "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
            Accept: "application/json",
          },
        })
        if (infoRes.ok) {
          const infoData = await infoRes.json()
          if (infoData.tracking) {
            currentMeta.superfrete_tracking = infoData.tracking
            currentMeta.tracking_code = infoData.tracking
          }
          if (infoData.status) {
            currentMeta.superfrete_status = infoData.status
          }
          if (infoData.print?.url) {
            currentMeta.superfrete_print_url = infoData.print.url
          }
          console.log(`[FINALIZE] Step 3 OK: tracking=${infoData.tracking || 'N/A'}, status=${infoData.status}`)
        }
      } catch (err: any) {
        console.log(`[FINALIZE] Step 3 WARNING: Could not fetch info: ${err.message} (non-critical)`)
      }

      // Step 4: Mark as "preparing"
      currentMeta.custom_status = "preparing"
      currentMeta.finalized_at = new Date().toISOString()
      console.log(`[FINALIZE] Step 4: Setting status to preparing...`)

      const updateRes2 = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: currentMeta }),
      })

      if (!updateRes2.ok) {
        console.error(`[FINALIZE] Step 4 FAILED: Could not update order metadata`)
        return res.status(500).json({ success: false, error: "Erro ao atualizar status do pedido", step: "update_status" })
      }

      console.log(`[FINALIZE] Step 4 OK: Order #${order.display_id} is now 'preparing'`)

      // Step 5: Send email notification
      const sa2 = order.shipping_address || {}
      const customerName2 = `${sa2.first_name || ""} ${sa2.last_name || ""}`.trim()
      const emailOrder = {
        display_id: order.display_id,
        id: order.display_id,
        customer_name: customerName2,
        customer_email: order.email,
        items: (order.items || []).map((i: any) => ({
          title: i.title || i.product_title,
          quantity: i.quantity,
          price: i.unit_price || 0,
        })),
        total_amount: Number(order.summary?.raw_current_order_total?.value || order.summary?.current_order_total || 0) + Number(currentMeta.shipping_fee || 0),
        shipping_fee: Number(currentMeta.shipping_fee || 0),
      }

      // Send shipped email if we got tracking, otherwise send preparing notification
      if (currentMeta.tracking_code) {
        sendOrderEmail("shipped", emailOrder, currentMeta.tracking_code).catch(e => console.error("[FINALIZE EMAIL]", e.message))
        console.log(`[FINALIZE] Step 5: Sent 'shipped' email with tracking: ${currentMeta.tracking_code}`)
      } else {
        // Still send paid confirmation if not already sent
        sendOrderEmail("paid", emailOrder).catch(e => console.error("[FINALIZE EMAIL]", e.message))
        console.log(`[FINALIZE] Step 5: Sent 'paid' email (no tracking yet)`)
      }

      console.log(`[FINALIZE] COMPLETE: Order #${order.display_id} finalized successfully`)
      return res.json({
        success: true,
        order: {
          id: order.display_id,
          medusa_order_id: order.id,
          status: "preparing",
          superfrete_id: currentMeta.superfrete_id,
          superfrete_status: currentMeta.superfrete_status,
          superfrete_tracking: currentMeta.superfrete_tracking || null,
          tracking_code: currentMeta.tracking_code || null,
          superfrete_print_url: currentMeta.superfrete_print_url || null,
        },
      })
    }

    // === ACTION: Sync status from SuperFrete ===
    if (action === 'sync_superfrete') {
      const sfId = currentMeta.superfrete_id
      if (!sfId) {
        return res.json({ success: false, error: "Pedido nao tem etiqueta SuperFrete" })
      }

      const SUPERFRETE_BASE = process.env.SUPERFRETE_API_BASE || "https://api.superfrete.com/api/v0"
      const sfToken = process.env.SUPERFRETE_TOKEN
      if (!sfToken) {
        return res.json({ success: false, error: "Token SuperFrete nao configurado" })
      }

      console.log(`[SYNC] Syncing SuperFrete status for order #${order.display_id}, SF ID: ${sfId}`)
      try {
        const infoRes = await fetch(`${SUPERFRETE_BASE}/order/info/${sfId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${sfToken}`,
            "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
            Accept: "application/json",
          },
        })

        if (!infoRes.ok) {
          return res.json({ success: false, error: "Erro ao consultar SuperFrete" })
        }

        const infoData = await infoRes.json()
        const prevStatus = currentMeta.custom_status

        // Update metadata from SuperFrete
        currentMeta.superfrete_status = infoData.status || currentMeta.superfrete_status
        if (infoData.tracking) {
          currentMeta.superfrete_tracking = infoData.tracking
          currentMeta.tracking_code = infoData.tracking
        }
        if (infoData.print?.url) {
          currentMeta.superfrete_print_url = infoData.print.url
        }

        // Map SF status to our status
        const statusMap: Record<string, string> = {
          released: "preparing",
          posted: "shipped",
          delivered: "delivered",
          canceled: "cancelled",
        }
        const mappedStatus = statusMap[infoData.status]
        if (mappedStatus) {
          const statusOrder = ["awaiting_payment", "paid", "preparing", "shipped", "delivered"]
          const prevIdx = statusOrder.indexOf(prevStatus || "awaiting_payment")
          const newIdx = statusOrder.indexOf(mappedStatus)
          if (mappedStatus === "cancelled" || newIdx > prevIdx) {
            currentMeta.custom_status = mappedStatus
          }
        }

        await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: currentMeta }),
        })

        // Send emails if status changed
        if (currentMeta.custom_status !== prevStatus) {
          const sa3 = order.shipping_address || {}
          const cn3 = `${sa3.first_name || ""} ${sa3.last_name || ""}`.trim()
          const eo = {
            display_id: order.display_id,
            id: order.display_id,
            customer_name: cn3,
            customer_email: order.email,
            items: (order.items || []).map((i: any) => ({ title: i.title || i.product_title, quantity: i.quantity, price: i.unit_price || 0 })),
            total_amount: Number(order.summary?.raw_current_order_total?.value || 0) + Number(currentMeta.shipping_fee || 0),
            shipping_fee: Number(currentMeta.shipping_fee || 0),
          }
          if (currentMeta.custom_status === "shipped" && currentMeta.tracking_code) {
            sendOrderEmail("shipped", eo, currentMeta.tracking_code).catch(e => console.error("[SYNC EMAIL]", e.message))
          } else if (currentMeta.custom_status === "delivered") {
            sendOrderEmail("delivered", eo).catch(e => console.error("[SYNC EMAIL]", e.message))
          }
        }

        return res.json({
          success: true,
          order: {
            id: order.display_id,
            status: currentMeta.custom_status,
            superfrete_status: currentMeta.superfrete_status,
            tracking_code: currentMeta.tracking_code || null,
          },
          status_changed: currentMeta.custom_status !== prevStatus,
        })
      } catch (err: any) {
        return res.json({ success: false, error: `Erro ao sincronizar: ${err.message}` })
      }
    }

    // Only update the fields that were provided
    if (status) currentMeta.custom_status = status
    if (tracking_code !== undefined) currentMeta.tracking_code = tracking_code

    let superfreteResult: any = null

    // Auto-generate SuperFrete label on payment if not skipped and not already generated
    if (status === 'paid' && previousStatus !== 'paid' && !skip_superfrete && !currentMeta.superfrete_id) {
      const autoLabel = process.env.SUPERFRETE_AUTO_LABEL !== 'false'
      if (autoLabel) {
        console.log(`[AUTO-LABEL] Order #${order.display_id} (${order.id}) - Auto-generating SuperFrete label on payment...`)
        const sfResult = await sendToSuperfrete(order)
        superfreteResult = sfResult
        if (sfResult.success && sfResult.data) {
          currentMeta.superfrete_id = sfResult.data.id || null
          currentMeta.superfrete_protocol = sfResult.data.protocol || null
          currentMeta.superfrete_status = sfResult.data.status || "pending"
          currentMeta.superfrete_price = sfResult.data.price || null
          currentMeta.superfrete_tracking = sfResult.data.self_tracking || null
          currentMeta.label_generated_at = new Date().toISOString()
          delete currentMeta.superfrete_error
          console.log(`[AUTO-LABEL] Order #${order.display_id} - Label generated: ${sfResult.data.id}`)
        } else {
          currentMeta.superfrete_error = sfResult.error
          console.error(`[AUTO-LABEL] Order #${order.display_id} - Label failed: ${sfResult.error}`)
        }
      }
    }

    // Update ONLY this order's metadata
    const updateRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: currentMeta }),
    })

    if (!updateRes.ok) {
      const err = await updateRes.text()
      console.error("Failed to update order metadata:", err)
      return res.status(500).json({ success: false, error: "Erro ao atualizar pedido" })
    }

    const sa = order.shipping_address || {}
    const customerName = `${sa.first_name || ""} ${sa.last_name || ""}`.trim()

    // Send email notification based on status change (async, don't block response)
    if (status && status !== previousStatus) {
      const emailOrder = {
        display_id: order.display_id,
        id: order.display_id,
        customer_name: customerName,
        customer_email: order.email,
        items: (order.items || []).map((i: any) => ({
          title: i.title || i.product_title,
          quantity: i.quantity,
          price: i.unit_price || 0,
        })),
        total_amount: Number(order.summary?.raw_current_order_total?.value || order.summary?.current_order_total || 0) + Number((order.metadata || {}).shipping_fee || 0),
        shipping_fee: Number((order.metadata || {}).shipping_fee || 0),
      }

      if (status === 'paid') {
        sendOrderEmail('paid', emailOrder).catch(e => console.error("[EMAIL]", e.message))
      } else if (status === 'shipped' && tracking_code) {
        sendOrderEmail('shipped', emailOrder, tracking_code).catch(e => console.error("[EMAIL]", e.message))
      } else if (status === 'delivered') {
        sendOrderEmail('delivered', emailOrder).catch(e => console.error("[EMAIL]", e.message))
      }
    }

    return res.json({
      success: true,
      order: {
        id: order.display_id,
        medusa_order_id: order.id,
        status: currentMeta.custom_status,
        tracking_code: currentMeta.tracking_code || null,
        customer_name: customerName,
        customer_email: order.email,
        superfrete_id: currentMeta.superfrete_id || null,
        superfrete_status: currentMeta.superfrete_status || null,
        superfrete_price: currentMeta.superfrete_price || null,
      },
      superfrete: superfreteResult,
    })
  } catch (error: any) {
    console.error("Update order error:", error.message)
    return res.status(500).json({ success: false, error: "Erro ao atualizar pedido" })
  }
}
