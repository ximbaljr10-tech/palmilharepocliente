import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendOrderEmail, type SendEmailOptions } from "../../../services/email"
import { logAudit, startBatch, completeBatch, extractAuditMeta, generateBatchId } from "../../../services/audit"

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
 *
 * AUDIT: Every critical action is logged to PostgreSQL audit_log table.
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

  // ─── 2026-04-24 FIX CÁLCULO FRETE (v2) ──────────────────────────────
  // FONTE CANÔNICA das dimensões da caixa ideal (usada na etiqueta):
  //   1. order_shipping_box — caixa ideal retornada pela SuperFrete no
  //      momento do cálculo do frete. É a fonte da verdade.
  //   2. Fallback: metadata.package_dimensions (sistema legado).
  //   3. Último recurso: 12x12x12 0.3kg + log de ALERTA.
  //
  // Consulta é SEMPRE direto no banco (ZERO CACHE) para garantir que a
  // etiqueta use as MESMAS dimensões que a SuperFrete usou no cálculo.
  let volume = { height: 12, width: 12, length: 12, weight: 0.3 }
  let volumeSource = "fallback"
  const serviceRequested = Number(meta.shipping_service) || 1

  try {
    const pool = await getOrdersPool()
    const boxQ = await pool.query(
      `SELECT ideal_weight_kg, ideal_height_cm, ideal_width_cm, ideal_length_cm, service_code
         FROM order_shipping_box
        WHERE order_id = $1
        ORDER BY
          CASE WHEN service_code = $2 THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT 1`,
      [order.id, String(serviceRequested)]
    )
    if (boxQ.rows.length > 0) {
      const b = boxQ.rows[0]
      volume = {
        height: Number(b.ideal_height_cm),
        width: Number(b.ideal_width_cm),
        length: Number(b.ideal_length_cm),
        weight: Number(b.ideal_weight_kg),
      }
      volumeSource = `order_shipping_box(svc=${b.service_code})`
    }
  } catch (boxErr: any) {
    console.warn(`[SUPERFRETE][ORDER ${order.display_id || order.id}] order_shipping_box lookup falhou: ${boxErr.message}`)
  }

  // Fallback legado: metadata.package_dimensions
  if (volumeSource === "fallback") {
    const pkg = meta.package_dimensions || {}
    const dims = pkg.dimensions || pkg
    const rawH = Number(dims.height)
    const rawW = Number(dims.width)
    const rawL = Number(dims.length)
    const rawKg = Number(pkg.weight || dims.weight)
    const hasIdealBox =
      Number.isFinite(rawH) && rawH > 0 &&
      Number.isFinite(rawW) && rawW > 0 &&
      Number.isFinite(rawL) && rawL > 0 &&
      Number.isFinite(rawKg) && rawKg > 0
    if (hasIdealBox) {
      volume = { height: rawH, width: rawW, length: rawL, weight: rawKg }
      volumeSource = "metadata.package_dimensions(legacy)"
    } else {
      console.warn(
        `[SUPERFRETE][ORDER ${order.display_id || order.id}] Sem caixa ideal em order_shipping_box ` +
        `nem metadata.package_dimensions. Fallback 12x12x12 0.3kg — ALERTA: operador deve revisar!`
      )
    }
  }
  console.log(
    `[SUPERFRETE][ORDER ${order.display_id || order.id}] volume ` +
    `${volume.width}x${volume.height}x${volume.length}cm/${volume.weight}kg source=${volumeSource}`
  )

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

  // Parse sender number: SuperFrete docs say send "" if no number (not "SN")
  let senderNumber = process.env.SUPERFRETE_SENDER_NUMBER || ""
  const upperSenderNum = senderNumber.trim().toUpperCase()
  if (upperSenderNum === "SN" || upperSenderNum === "S/N" || upperSenderNum === "0" || upperSenderNum === "SEM NUMERO") {
    senderNumber = ""
  }

  // to.document is REQUIRED per SuperFrete docs for all carriers (DC-e guarantee)
  // "é obrigatório o envio do CPF ou CNPJ do destinatário para todas as transportadoras"
  // Source of truth: order.metadata.customer_cpf (set at checkout or updated via admin)
  const customerDocument = (meta.customer_cpf || "").replace(/\D/g, "")
  console.log(`[SUPERFRETE] Customer document (CPF) from metadata: "${customerDocument}" (raw: "${meta.customer_cpf}")`)

  // Truncate complement for SuperFrete/Correios compatibility
  // Correios SIGEP/SRO limit complement to ~20 characters.
  // The full complement is preserved in order metadata (address_components.complement).
  // Only the payload sent to SuperFrete is truncated.
  const COMPLEMENT_MAX_SUPERFRETE = 20
  const rawComplement = addr.complement || ""
  const truncatedComplement = rawComplement.length > COMPLEMENT_MAX_SUPERFRETE
    ? rawComplement.substring(0, COMPLEMENT_MAX_SUPERFRETE).trim()
    : rawComplement

  // Build the 'to' (destinatário) object
  const toObj: any = {
    name: customerName,
    address: addr.street || "",
    complement: truncatedComplement,
    number: parsedNumber,
    district: addr.district || addr.neighborhood || "NA",
    city: addr.city || "",
    state_abbr: (addr.state || "").toUpperCase(),
    postal_code: (addr.cep || "").replace(/\D/g, ""),
    email: order.email || "",
  }

  // Only include document field if we actually have a CPF/CNPJ
  // Per SuperFrete docs: document is required for DC-e guarantee
  // Sending empty string may cause API errors on some carriers
  if (customerDocument && customerDocument.length >= 11) {
    toObj.document = customerDocument
  }

  // Build from (remetente) object
  const fromObj: any = {
    name: process.env.SUPERFRETE_SENDER_NAME || "Loja Dente de Tubarao",
    address: process.env.SUPERFRETE_SENDER_ADDRESS || "Rua Almeida Lara quadra 64 lt 14",
    complement: process.env.SUPERFRETE_SENDER_COMPLEMENT || "",
    number: senderNumber,
    district: process.env.SUPERFRETE_SENDER_DISTRICT || "Capuava",
    city: process.env.SUPERFRETE_SENDER_CITY || "Goiania",
    state_abbr: (process.env.SUPERFRETE_SENDER_STATE || "GO").toUpperCase(),
    postal_code: process.env.SUPERFRETE_CEP_ORIGEM || "74450380",
  }

  // Include sender document if configured (optional per docs, but helps with Loggi/Jadlog)
  const senderDocument = (process.env.SUPERFRETE_SENDER_DOCUMENT || "").replace(/\D/g, "")
  if (senderDocument) {
    fromObj.document = senderDocument
  }

  // SuperFrete products: unitary_value must be in BRL (reais), NOT centavos
  // In THIS system, prices are stored in REAIS (e.g., 45.4 = R$45,40, 121 = R$121,00)
  // This is confirmed by: adminApi.ts mapAdminProduct comments, api.ts mapMedusaProduct,
  // and the store product listing (calculated_price.calculated_amount returns reais).
  // PREVIOUS BUG: A heuristic `rawPrice > 100 ? rawPrice / 100 : rawPrice` was incorrectly
  // dividing prices >= R$100 by 100 (e.g., R$121 became R$1.21 on the label).
  // FIX: Use the price directly — it is already in reais.
  // Use items_override if available (product was swapped)
  const sourceItems = meta.items_override || order.items || []
  const products = sourceItems.map((item: any) => {
    const rawPrice = Number(item.unit_price || item.price) || 0
    // Price is already in reais — use directly, no conversion needed
    const unitaryValue = rawPrice
    return {
      name: (item.title || item.product_title || "Produto").substring(0, 100),
      quantity: Number(item.quantity) || 1,
      unitary_value: Number(unitaryValue.toFixed(2)),
    }
  })

  const body = {
    from: fromObj,
    to: toObj,
    service: Number(meta.shipping_service) || 1,
    products,
    volumes: volume,
    options: { non_commercial: true, insurance_value: null, receipt: false, own_hand: false },
  }

  try {
    const superfreteUrl = process.env.SUPERFRETE_CART_URL || "https://api.superfrete.com/api/v0/cart"
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)

    // Log the payload for debugging (mask sensitive data)
    console.log(`[SUPERFRETE] Sending to ${superfreteUrl}:`, JSON.stringify({
      from: { ...body.from, document: body.from.document ? '***' : undefined },
      to: { ...body.to, document: body.to.document ? `${body.to.document.substring(0, 3)}***` : '(not set)' },
      service: body.service,
      products: body.products,
      volumes: body.volumes,
    }))

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
    if (!response.ok) {
      console.error(`[SUPERFRETE] Error response:`, JSON.stringify(data))
      return { success: false, error: `SuperFrete: ${data.message || data.error || `HTTP ${response.status}`}` }
    }
    console.log(`[SUPERFRETE] Success: id=${data.id}, status=${data.status}, price=${data.price}`)
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: `Erro de conexao com SuperFrete: ${error.message}` }
  }
}

// ── Direct PostgreSQL pool for fast GET queries ──
// Avoids the overhead of multiple sequential HTTP requests through Medusa API.
// The Medusa API pagination loop (7 requests × ~0.9s each = ~6.5s) is replaced
// by a single SQL query (~0.4s) that returns identical data.
let _ordersPool: any = null
async function getOrdersPool() {
  if (_ordersPool) return _ordersPool
  const pg = require("pg")
  const url = process.env.DATABASE_URL || "postgresql://postgres:665a19359d272dc4007a533fa4e2b9e6@localhost:5432/medusa_db"
  const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/)
  if (!match) throw new Error("Invalid DATABASE_URL")
  _ordersPool = new pg.Pool({
    user: match[1], password: match[2], host: match[3],
    port: parseInt(match[4]), database: match[5],
    max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
  })
  return _ordersPool
}

// GET /admin/pedidos - List ALL orders via direct SQL (fast path)
// Previously used a pagination loop of 7+ HTTP requests through Medusa API (~6.5s).
// Now uses a single PostgreSQL query with JOINs (~0.4s for 600+ orders).
// Output format is IDENTICAL to the previous version.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const callerToken = getTokenFromRequest(req)
    if (!callerToken) return res.status(401).json({ error: "Token obrigatorio" })

    // Quick token validation: hit Medusa with a minimal request
    const authCheck = await fetch(
      `${MEDUSA_URL}/admin/orders?fields=id&limit=1&offset=0`,
      { headers: { Authorization: `Bearer ${callerToken}`, "Content-Type": "application/json" } }
    )
    if (authCheck.status === 401) return res.status(401).json({ error: "Token invalido" })

    // Direct SQL: single query fetches ALL orders with shipping_address, items, and summary
    const pool = await getOrdersPool()
    const { rows } = await pool.query(`
      SELECT o.id, o.display_id, o.email, o.created_at, o.updated_at, o.currency_code,
             o.metadata,
             json_build_object(
               'first_name', sa.first_name, 'last_name', sa.last_name,
               'address_1', sa.address_1, 'address_2', sa.address_2,
               'city', sa.city, 'province', sa.province,
               'postal_code', sa.postal_code, 'phone', sa.phone, 'company', sa.company
             ) as shipping_address,
             (SELECT COALESCE(json_agg(json_build_object(
               'product_id', li.product_id, 'variant_id', li.variant_id,
               'title', li.title, 'product_title', li.product_title,
               'quantity', oi.quantity, 'unit_price', COALESCE(oi.unit_price, li.unit_price),
               'thumbnail', li.thumbnail
             )), '[]'::json)
             FROM order_item oi
             JOIN order_line_item li ON li.id = oi.item_id
             WHERE oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
             ) as items,
             (SELECT os.totals FROM order_summary os
              WHERE os.order_id = o.id AND os.deleted_at IS NULL LIMIT 1) as summary
      FROM public.order o
      LEFT JOIN order_address sa ON sa.id = o.shipping_address_id
      WHERE o.deleted_at IS NULL
      ORDER BY o.created_at DESC
    `)

    console.log(`[GET /admin/pedidos] Fetched ${rows.length} orders via direct SQL`)

    const mapped = rows.map((o: any) => {
      const sa = o.shipping_address || {}
      const meta = o.metadata || {}
      const summary = o.summary || {}

      // When items_override exists (product was swapped), calculate total from override
      const resolvedItems = (meta.items_override || (o.items || []).map((item: any) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        title: item.title || item.product_title,
        quantity: item.quantity,
        price: item.unit_price || 0,
        image_url: item.thumbnail || "",
      }))).map((item: any) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        title: item.title,
        quantity: item.quantity,
        price: item.unit_price || item.price || 0,
        image_url: item.thumbnail || item.image_url || "",
      }))

      // Compute total_amount: prefer items_override subtotal, then Medusa summary, then items fallback
      const shippingFee = Number(meta.shipping_fee || 0)
      let totalAmount: number
      if (meta.items_override) {
        // Swapped items: compute from override
        const itemsSubtotal = resolvedItems.reduce((s: number, it: any) => s + (Number(it.price) || 0) * (it.quantity || 1), 0)
        totalAmount = itemsSubtotal + shippingFee
      } else {
        // Normal items: use Medusa summary (preferred), fall back to computing from items
        const summaryTotal = Number(summary?.raw_current_order_total?.value || summary?.current_order_total || 0)
        if (summaryTotal > 0) {
          totalAmount = summaryTotal + shippingFee
        } else {
          // Fallback: compute subtotal from items when summary is missing or zero
          const itemsSubtotal = resolvedItems.reduce((s: number, it: any) => s + (Number(it.price) || 0) * (it.quantity || 1), 0)
          totalAmount = itemsSubtotal > 0 ? itemsSubtotal + shippingFee : shippingFee
        }
      }

      return {
        id: o.display_id,
        medusa_order_id: o.id,
        customer_name: `${sa.first_name || ""} ${sa.last_name || ""}`.trim(),
        customer_email: o.email,
        customer_whatsapp: meta.customer_whatsapp || sa.phone || "",
        customer_cpf: meta.customer_cpf || null,
        customer_address: meta.customer_full_address || `${sa.address_1 || ""}, ${sa.city || ""} - ${sa.province || ""}`,
        address_components: meta.address_components || null,
        total_amount: totalAmount,
        shipping_service: meta.shipping_service || null,
        shipping_fee: shippingFee,
        package_dimensions: meta.package_dimensions || null,
        status: meta.custom_status || "awaiting_payment",
        tracking_code: meta.tracking_code || null,
        items: resolvedItems,
        items_color_preferences: meta.items_color_preferences || null,
        swapped_items: meta.swapped_items || null,
        swap_adjustment: meta.swap_adjustment || null,
        swap_history: meta.swap_history || null,
        original_shipping_fee: meta.original_shipping_fee ?? null,
        created_at: o.created_at,
        updated_at: o.updated_at,
        superfrete_id: meta.superfrete_id || null,
        superfrete_status: meta.superfrete_status || null,
        superfrete_protocol: meta.superfrete_protocol || null,
        superfrete_error: meta.superfrete_error || null,
        superfrete_price: meta.superfrete_price || null,
        superfrete_tracking: meta.superfrete_tracking || null,
        label_generated_at: meta.label_generated_at || null,
        label_cancelled_at: meta.label_cancelled_at || null,
        restored_manually_at: meta.restored_manually_at || null,
        restoration_history: meta.restoration_history || null,
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

      const auditMeta = extractAuditMeta(req)
      const batchId = generateBatchId(action)
      await startBatch({
        batch_id: batchId, batch_type: action,
        actor_type: auditMeta.actor_type, actor_label: auditMeta.actor_label || undefined,
        session_id: auditMeta.session_id || undefined, ip_address: auditMeta.ip_address || undefined,
        user_agent: auditMeta.user_agent || undefined, total_orders: order_ids.length, order_ids,
      })

      console.log(`[BATCH ${action.toUpperCase()}] Processing ${order_ids.length} orders... (batch: ${batchId})`)

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
            logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: action, previous_status: currentStatus, new_status: currentStatus, ...auditMeta, batch_id: batchId, result: 'error', error_message: `Status atual: ${currentStatus}`, payload_summary: { skipped: true } })
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
              logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: action, previous_status: currentStatus, new_status: 'awaiting_payment', ...auditMeta, batch_id: batchId, result: 'error', error_message: `Etiqueta falhou: ${sfResult.error}`, payload_summary: { label_failed: true } })
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
              logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: action, previous_status: currentStatus, new_status: 'paid', ...auditMeta, batch_id: batchId, result: 'error', error_message: 'Erro ao salvar' })
              return { id: order.display_id, medusa_id: order.id, success: false, error: 'Erro ao salvar' }
            }

            // Audit: success
            logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: action, previous_status: currentStatus, new_status: 'paid', ...auditMeta, batch_id: batchId, result: 'success', payload_summary: { superfrete_id: meta.superfrete_id || null, generate_label: generateLabel } })

            // Send email
            const sa = order.shipping_address || {}
            const cn = `${sa.first_name || ""} ${sa.last_name || ""}`.trim()
            const emailOrder = {
              display_id: order.display_id, id: order.display_id, customer_name: cn, customer_email: order.email,
              items: (order.items || []).map((i: any) => ({ title: i.title || i.product_title, quantity: i.quantity, price: i.unit_price || 0 })),
              total_amount: Number(order.summary?.raw_current_order_total?.value || 0) + Number(meta.shipping_fee || 0),
              shipping_fee: Number(meta.shipping_fee || 0),
            }
            const emailOpts: SendEmailOptions = {
              trigger_source: 'pedidos_route',
              trigger_action: action,
              is_automatic: false,
              actor_type: auditMeta.actor_type || 'admin',
              actor_label: auditMeta.actor_label || undefined,
              session_id: auditMeta.session_id || undefined,
              ip_address: auditMeta.ip_address || undefined,
            }
            sendOrderEmail('paid', emailOrder, undefined, emailOpts).catch(e => console.error("[BATCH EMAIL]", e.message))

            return { id: order.display_id, medusa_id: order.id, success: true, superfrete_id: meta.superfrete_id || null }
          } catch (err: any) {
            logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: action, previous_status: currentStatus, new_status: 'paid', ...auditMeta, batch_id: batchId, result: 'error', error_message: err.message })
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
      await completeBatch(batchId, succeeded, failed, results)
      return res.json({ success: true, total: results.length, succeeded, failed, results, batch_id: batchId })
    }

    // === BATCH PAY LABELS (mass checkout of already-generated labels) ===
    if (action === 'batch_pay_labels') {
      const { order_ids } = req.body as any
      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return res.json({ success: false, error: "order_ids (array) obrigatorio" })
      }

      const auditMeta = extractAuditMeta(req)
      const batchId = generateBatchId('batch_pay_labels')
      await startBatch({
        batch_id: batchId, batch_type: 'batch_pay_labels',
        actor_type: auditMeta.actor_type, actor_label: auditMeta.actor_label || undefined,
        session_id: auditMeta.session_id || undefined, ip_address: auditMeta.ip_address || undefined,
        user_agent: auditMeta.user_agent || undefined, total_orders: order_ids.length, order_ids,
      })

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
                logAudit({ order_id: mapping.orderId, order_display_id: mapping.displayId, action_type: 'batch_pay_labels', previous_status: 'paid', new_status: 'preparing', ...auditMeta, batch_id: batchId, result: 'success', payload_summary: { superfrete_id: sfId } })
              }
            }
          } else {
            const errMsg = checkoutData?.message || checkoutData?.error || `HTTP ${checkoutRes.status}`
            for (const sfId of batchSfIds) {
              const mapping = orderSfMap.find(m => m.sfId === sfId)
              payResults.push({ sfId, displayId: mapping?.displayId || 0, success: false, error: errMsg })
              if (mapping) logAudit({ order_id: mapping.orderId, order_display_id: mapping.displayId, action_type: 'batch_pay_labels', ...auditMeta, batch_id: batchId, result: 'error', error_message: errMsg })
            }
          }
        } catch (err: any) {
          for (const sfId of batchSfIds) {
            const mapping = orderSfMap.find(m => m.sfId === sfId)
            payResults.push({ sfId, displayId: mapping?.displayId || 0, success: false, error: err.message })
            if (mapping) logAudit({ order_id: mapping.orderId, order_display_id: mapping.displayId, action_type: 'batch_pay_labels', ...auditMeta, batch_id: batchId, result: 'error', error_message: err.message })
          }
        }

        if (i + PAY_BATCH < sfIds.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      const payOk = payResults.filter(r => r.success).length
      const payFail = payResults.filter(r => !r.success).length
      console.log(`[BATCH PAY LABELS] Complete: ${payOk} OK, ${payFail} failed`)
      await completeBatch(batchId, payOk, payFail, payResults)
      return res.json({ success: true, total: payResults.length, succeeded: payOk, failed: payFail, results: payResults, batch_id: batchId })
    }

    // === BATCH REVERT TO PAID (manual reversal for cancelled orders) ===
    if (action === 'batch_revert_to_paid') {
      const { order_ids } = req.body as any
      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return res.json({ success: false, error: "order_ids (array) obrigatorio" })
      }

      const auditMeta = extractAuditMeta(req)
      const batchId = generateBatchId('batch_revert_to_paid')
      await startBatch({
        batch_id: batchId, batch_type: 'batch_revert_to_paid',
        actor_type: auditMeta.actor_type, actor_label: auditMeta.actor_label || undefined,
        session_id: auditMeta.session_id || undefined, ip_address: auditMeta.ip_address || undefined,
        user_agent: auditMeta.user_agent || undefined, total_orders: order_ids.length, order_ids,
      })

      console.log(`[BATCH REVERT] Reverting ${order_ids.length} orders to paid... (batch: ${batchId})`)

      // Fetch all orders
      const allRevertOrders: any[] = []
      const REVERT_PAGE = 100
      let rOffset = 0
      let rMore = true
      while (rMore) {
        const rRes = await fetch(
          `${MEDUSA_URL}/admin/orders?fields=id,display_id,metadata&limit=${REVERT_PAGE}&offset=${rOffset}`,
          { headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" } }
        )
        if (!rRes.ok) break
        const rData = await rRes.json()
        const pageOrders = rData.orders || []
        allRevertOrders.push(...pageOrders)
        if (pageOrders.length < REVERT_PAGE) rMore = false
        else rOffset += REVERT_PAGE
        if (allRevertOrders.length >= 5000) rMore = false
      }

      const results: { id: number; medusa_id: string; success: boolean; error?: string }[] = []

      for (const oid of order_ids) {
        const order = allRevertOrders.find((o: any) =>
          o.id === oid || String(o.display_id) === String(oid)
        )
        if (!order) {
          results.push({ id: oid, medusa_id: '', success: false, error: 'Pedido nao encontrado' })
          continue
        }

        const meta = { ...(order.metadata || {}) }
        const currentStatus = meta.custom_status || 'awaiting_payment'

        // Only revert cancelled orders
        if (currentStatus !== 'cancelled') {
          logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'batch_revert_to_paid', previous_status: currentStatus, new_status: currentStatus, ...auditMeta, batch_id: batchId, result: 'error', error_message: `Status atual: ${currentStatus}` })
          results.push({ id: order.display_id, medusa_id: order.id, success: false, error: `Status atual: ${currentStatus} (precisa ser cancelled)` })
          continue
        }

        // === PRESERVE HISTORY: Move old label data to restoration_history before clearing ===
        const restorationHistory = meta.restoration_history || []
        restorationHistory.push({
          restored_at: new Date().toISOString(),
          previous_status: currentStatus,
          cancelled_label: {
            superfrete_id: meta.superfrete_id || null,
            superfrete_tracking: meta.superfrete_tracking || null,
            tracking_code: meta.tracking_code || null,
            superfrete_status: meta.superfrete_status || null,
            superfrete_price: meta.superfrete_price || null,
            superfrete_protocol: meta.superfrete_protocol || null,
            superfrete_print_url: meta.superfrete_print_url || null,
            label_generated_at: meta.label_generated_at || null,
            label_cancelled_at: meta.label_cancelled_at || null,
          },
        })
        meta.restoration_history = restorationHistory

        // === CLEAR ALL ACTIVE LABEL/LOGISTIC FIELDS (current state) ===
        // This ensures the order is treated as a fresh "paid" order
        // with no active label/tracking blocking product swaps.
        meta.custom_status = 'paid'
        meta.superfrete_id = null
        meta.superfrete_tracking = null
        meta.tracking_code = null
        meta.superfrete_print_url = null
        meta.superfrete_status = null
        meta.superfrete_error = null
        meta.superfrete_price = null
        meta.superfrete_protocol = null
        meta.label_generated_at = null        // CRITICAL: must be cleared to unblock swaps
        meta.label_cancelled_at = null        // Already historical (moved to restoration_history)
        meta.finalized_at = null              // Clear finalization timestamp
        meta.restored_manually_at = new Date().toISOString()
        meta.previous_status_before_revert = currentStatus

        try {
          const updateRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ metadata: meta }),
          })
          if (!updateRes.ok) {
            logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'batch_revert_to_paid', previous_status: currentStatus, new_status: 'paid', ...auditMeta, batch_id: batchId, result: 'error', error_message: 'Erro ao salvar' })
            results.push({ id: order.display_id, medusa_id: order.id, success: false, error: 'Erro ao salvar' })
            continue
          }
          logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'batch_revert_to_paid', previous_status: currentStatus, new_status: 'paid', ...auditMeta, batch_id: batchId, result: 'success', payload_summary: { restored_manually: true } })
          console.log(`[BATCH REVERT] Order #${order.display_id} reverted to paid`)
          results.push({ id: order.display_id, medusa_id: order.id, success: true })
        } catch (err: any) {
          logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'batch_revert_to_paid', previous_status: currentStatus, new_status: 'paid', ...auditMeta, batch_id: batchId, result: 'error', error_message: err.message })
          results.push({ id: order.display_id, medusa_id: order.id, success: false, error: err.message })
        }
      }

      const succeeded = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      console.log(`[BATCH REVERT] Complete: ${succeeded} OK, ${failed} failed`)
      await completeBatch(batchId, succeeded, failed, results)
      return res.json({ success: true, total: results.length, succeeded, failed, results, batch_id: batchId })
    }

    // === BATCH FINALIZE AND LABEL (sequential, one order at a time with delay) ===
    if (action === 'batch_finalize_and_label') {
      const { order_ids } = req.body as any
      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return res.json({ success: false, error: "order_ids (array) obrigatorio" })
      }

      const auditMeta = extractAuditMeta(req)
      const batchId = generateBatchId('batch_finalize_and_label')
      await startBatch({
        batch_id: batchId, batch_type: 'batch_finalize_and_label',
        actor_type: auditMeta.actor_type, actor_label: auditMeta.actor_label || undefined,
        session_id: auditMeta.session_id || undefined, ip_address: auditMeta.ip_address || undefined,
        user_agent: auditMeta.user_agent || undefined, total_orders: order_ids.length, order_ids,
      })

      const SUPERFRETE_BASE = process.env.SUPERFRETE_API_BASE || "https://api.superfrete.com/api/v0"
      const sfToken = process.env.SUPERFRETE_TOKEN
      if (!sfToken) return res.json({ success: false, error: "Token SuperFrete nao configurado" })

      console.log(`[BATCH FINALIZE] Starting sequential processing of ${order_ids.length} orders...`)

      // Fetch all orders at once
      const allFinalizeOrders: any[] = []
      const FIN_PAGE = 100
      let fOffset = 0
      let fMore = true
      while (fMore) {
        const fRes = await fetch(
          `${MEDUSA_URL}/admin/orders?fields=id,display_id,email,metadata,*items,*shipping_address,*summary&limit=${FIN_PAGE}&offset=${fOffset}`,
          { headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" } }
        )
        if (!fRes.ok) break
        const fData = await fRes.json()
        const pageOrders = fData.orders || []
        allFinalizeOrders.push(...pageOrders)
        if (pageOrders.length < FIN_PAGE) fMore = false
        else fOffset += FIN_PAGE
        if (allFinalizeOrders.length >= 5000) fMore = false
      }

      const results: any[] = []
      let succeeded = 0
      let failed = 0

      // Process ONE order at a time, sequentially
      for (let i = 0; i < order_ids.length; i++) {
        const oid = order_ids[i]
        const order = allFinalizeOrders.find((o: any) =>
          o.id === oid || String(o.display_id) === String(oid)
        )

        if (!order) {
          failed++
          results.push({ id: oid, medusa_id: '', success: false, error: 'Pedido nao encontrado', step: 'find' })
          continue
        }

        const currentMeta = { ...(order.metadata || {}) }
        const orderNum = order.display_id

        console.log(`[BATCH FINALIZE] [${i + 1}/${order_ids.length}] Processing order #${orderNum}...`)

        try {
          // Step 1: Generate label if not already generated
          let sfId = currentMeta.superfrete_id
          if (!sfId) {
            console.log(`[BATCH FINALIZE] [${i + 1}] Step 1: Generating label for #${orderNum}...`)
            const sfResult = await sendToSuperfrete(order)
            if (!sfResult.success || !sfResult.data) {
              currentMeta.superfrete_error = sfResult.error
              await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ metadata: currentMeta }),
              })
              failed++
              results.push({ id: orderNum, medusa_id: order.id, success: false, error: `Etiqueta: ${sfResult.error}`, step: 'generate' })
              logAudit({ order_id: order.id, order_display_id: orderNum, action_type: 'batch_finalize_and_label', previous_status: currentMeta.custom_status, ...auditMeta, batch_id: batchId, result: 'error', error_message: `Etiqueta: ${sfResult.error}` })
              console.error(`[BATCH FINALIZE] [${i + 1}] FAILED generate for #${orderNum}: ${sfResult.error}`)
              if (i < order_ids.length - 1) await new Promise(r => setTimeout(r, 2000))
              continue
            }
            sfId = sfResult.data.id
            currentMeta.superfrete_id = sfResult.data.id || null
            currentMeta.superfrete_protocol = sfResult.data.protocol || null
            currentMeta.superfrete_status = sfResult.data.status || "pending"
            currentMeta.superfrete_price = sfResult.data.price || null
            currentMeta.superfrete_tracking = sfResult.data.self_tracking || null
            currentMeta.label_generated_at = new Date().toISOString()
            delete currentMeta.superfrete_error
            console.log(`[BATCH FINALIZE] [${i + 1}] Label generated: ${sfId}`)
          } else {
            console.log(`[BATCH FINALIZE] [${i + 1}] Label already exists: ${sfId}`)
          }

          // Step 2: Checkout (pay) the label — only if pending
          const currentSfStatus = currentMeta.superfrete_status || "pending"
          if (currentSfStatus === "pending") {
            console.log(`[BATCH FINALIZE] [${i + 1}] Step 2: Paying label ${sfId}...`)
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
              currentMeta.superfrete_error = `Checkout falhou: ${errMsg}`
              await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ metadata: currentMeta }),
              })
              failed++
              results.push({ id: orderNum, medusa_id: order.id, success: false, error: `Pagamento: ${errMsg}`, step: 'checkout' })
              logAudit({ order_id: order.id, order_display_id: orderNum, action_type: 'batch_finalize_and_label', previous_status: currentMeta.custom_status, ...auditMeta, batch_id: batchId, result: 'error', error_message: `Pagamento: ${errMsg}` })
              console.error(`[BATCH FINALIZE] [${i + 1}] FAILED checkout for #${orderNum}: ${errMsg}`)
              if (i < order_ids.length - 1) await new Promise(r => setTimeout(r, 2000))
              continue
            }
            currentMeta.superfrete_status = "released"
            delete currentMeta.superfrete_error
            console.log(`[BATCH FINALIZE] [${i + 1}] Label paid OK`)
          }

          // Step 3: Get updated info (tracking code)
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
              if (infoData.status) currentMeta.superfrete_status = infoData.status
              if (infoData.print?.url) currentMeta.superfrete_print_url = infoData.print.url
            }
          } catch (err: any) {
            console.log(`[BATCH FINALIZE] [${i + 1}] Info fetch warning: ${err.message} (non-critical)`)
          }

          // Step 4: Mark as preparing
          currentMeta.custom_status = "preparing"
          currentMeta.finalized_at = new Date().toISOString()
          const updateRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ metadata: currentMeta }),
          })
          if (!updateRes.ok) {
            failed++
            results.push({ id: orderNum, medusa_id: order.id, success: false, error: 'Erro ao salvar status', step: 'update' })
            logAudit({ order_id: order.id, order_display_id: orderNum, action_type: 'batch_finalize_and_label', previous_status: currentMeta.custom_status, new_status: 'preparing', ...auditMeta, batch_id: batchId, result: 'error', error_message: 'Erro ao salvar status' })
            if (i < order_ids.length - 1) await new Promise(r => setTimeout(r, 2000))
            continue
          }

          // Step 5: Send email
          const sa = order.shipping_address || {}
          const cn = `${sa.first_name || ""} ${sa.last_name || ""}`.trim()
          const emailOrder = {
            display_id: order.display_id, id: order.display_id, customer_name: cn, customer_email: order.email,
            items: (order.items || []).map((i: any) => ({ title: i.title || i.product_title, quantity: i.quantity, price: i.unit_price || 0 })),
            total_amount: Number(order.summary?.raw_current_order_total?.value || 0) + Number(currentMeta.shipping_fee || 0),
            shipping_fee: Number(currentMeta.shipping_fee || 0),
          }
          const finEmailOpts: SendEmailOptions = {
            trigger_source: 'pedidos_route',
            trigger_action: 'batch_finalize_and_label',
            is_automatic: false,
            actor_type: auditMeta.actor_type || 'admin',
            actor_label: auditMeta.actor_label || undefined,
            session_id: auditMeta.session_id || undefined,
            ip_address: auditMeta.ip_address || undefined,
          }
          if (currentMeta.tracking_code) {
            sendOrderEmail("shipped", emailOrder, currentMeta.tracking_code, finEmailOpts).catch(e => console.error("[BATCH FINALIZE EMAIL]", e.message))
          } else {
            sendOrderEmail("paid", emailOrder, undefined, finEmailOpts).catch(e => console.error("[BATCH FINALIZE EMAIL]", e.message))
          }

          succeeded++
          results.push({
            id: orderNum, medusa_id: order.id, success: true,
            tracking: currentMeta.tracking_code || null,
            superfrete_id: currentMeta.superfrete_id,
          })
          logAudit({ order_id: order.id, order_display_id: orderNum, action_type: 'batch_finalize_and_label', previous_status: currentMeta.custom_status, new_status: 'preparing', ...auditMeta, batch_id: batchId, result: 'success', payload_summary: { superfrete_id: currentMeta.superfrete_id, tracking: currentMeta.tracking_code || null } })
          console.log(`[BATCH FINALIZE] [${i + 1}] Order #${orderNum} COMPLETE`)
        } catch (err: any) {
          failed++
          results.push({ id: orderNum, medusa_id: order.id, success: false, error: err.message, step: 'unknown' })
          logAudit({ order_id: order.id, order_display_id: orderNum, action_type: 'batch_finalize_and_label', ...auditMeta, batch_id: batchId, result: 'error', error_message: err.message })
          console.error(`[BATCH FINALIZE] [${i + 1}] EXCEPTION for #${orderNum}: ${err.message}`)
        }

        // 2-second delay between orders (sequential processing)
        if (i < order_ids.length - 1) {
          await new Promise(r => setTimeout(r, 2000))
        }
      }

      console.log(`[BATCH FINALIZE] Complete: ${succeeded} OK, ${failed} failed out of ${order_ids.length}`)
      await completeBatch(batchId, succeeded, failed, results)
      return res.json({ success: true, total: order_ids.length, succeeded, failed, results, batch_id: batchId })
    }

    // === BATCH SYNC SUPERFRETE (global sync — does NOT require a specific order) ===
    if (action === 'batch_sync_superfrete') {
      const auditMeta = extractAuditMeta(req)
      const batchId = generateBatchId('batch_sync_superfrete')
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

            // When SuperFrete label is canceled, the order status should reflect that.
            // The admin can manually revert to 'paid' using the bulk revert feature.
            const statusMap: Record<string, string> = {
              released: "preparing", posted: "shipped", delivered: "delivered",
              canceled: "cancelled",
            }
            if (infoData.status === "canceled" || infoData.status === "cancelled") {
              meta.superfrete_status = "canceled"
              meta.custom_status = "cancelled"
              meta.label_cancelled_at = new Date().toISOString()
              statusChanged = true
              console.log(`[BATCH SYNC] Order #${syncOrder.display_id}: Label cancelled -> order marked as CANCELLED`) 
            } else {
              const mappedStatus = statusMap[infoData.status]
              if (mappedStatus) {
                const statusOrder = ["awaiting_payment", "paid", "preparing", "shipped", "delivered"]
                const prevIdx = statusOrder.indexOf(prevStatus)
                const newIdx = statusOrder.indexOf(mappedStatus)
                if (newIdx > prevIdx) {
                  meta.custom_status = mappedStatus
                  statusChanged = true
                }
              }
            }

            await fetch(`${MEDUSA_URL}/admin/orders/${syncOrder.id}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ metadata: meta }),
            })

            if (statusChanged) {
              updated++
              logAudit({ order_id: syncOrder.id, order_display_id: syncOrder.display_id, action_type: 'batch_sync_superfrete', previous_status: prevStatus, new_status: meta.custom_status, ...auditMeta, batch_id: batchId, origin: 'admin_panel', result: 'success', payload_summary: { sf_status: infoData.status, tracking: infoData.tracking || null } })
            }
            return {
              id: syncOrder.display_id, sfId,
              sf_status: infoData.status,
              status_changed: statusChanged,
              new_status: meta.custom_status,
            }
          } catch (err: any) {
            errors++
            logAudit({ order_id: syncOrder.id, order_display_id: syncOrder.display_id, action_type: 'batch_sync_superfrete', ...auditMeta, batch_id: batchId, result: 'error', error_message: err.message })
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
      await completeBatch(batchId, updated, errors, results)
      return res.json({
        success: true,
        total: ordersWithLabel.length,
        updated,
        errors,
        results,
        batch_id: batchId,
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

    // Extract audit metadata for all single-order actions
    const auditMeta = extractAuditMeta(req)
    // CRITICAL: Get the FULL current metadata from the order
    // We must preserve ALL existing fields and only update what changed
    const currentMeta = { ...(order.metadata || {}) }
    const previousStatus = currentMeta.custom_status || "awaiting_payment"

    // === SWAP ITEM (Product Exchange within Order) ===
    // V2: Full from-scratch recalculation + pending/resolved adjustment state.
    //
    // BUSINESS RULES:
    // - Allowed only when status is 'awaiting_payment' or 'paid'
    // - Blocked if active superfrete_id, tracking_code, or superfrete_tracking exists
    // - Each swap recalculates EVERYTHING from scratch (never incremental)
    // - While adjustment is 'pending', multiple swaps overwrite each other (no history pollution)
    // - History is only consolidated when adjustment is marked 'resolved'
    //
    // METADATA MODEL:
    //   swap_adjustment: {
    //     status: 'pending' | 'resolved',
    //     original_state: { items, shipping_fee, package_dimensions, subtotal, total },  // frozen at first swap
    //     current_state:  { items, shipping_fee, package_dimensions, subtotal, total },  // updated on each swap
    //     swap_count: number,
    //     first_swap_at: ISO string,
    //     last_swap_at: ISO string,
    //   }
    //   swap_history: [ { resolved_at, original_state, final_state, swap_count } ]  // only on resolve
    //   items_override: [ ... ]  // current items for admin display
    if (action === 'swap_item') {
      const { old_item_index, new_product_id, new_variant_id, new_product_title, new_product_price, new_product_image, new_product_shipping, quantity } = req.body as any

      // VALIDATION: Status
      const allowedStatuses = ['awaiting_payment', 'paid']
      const currentStatus = currentMeta.custom_status || 'awaiting_payment'
      if (!allowedStatuses.includes(currentStatus)) {
        return res.status(400).json({ success: false, error: `Troca nao permitida. Status atual: ${currentStatus}. Troca so e permitida em: aguardando pagamento ou pago.` })
      }

      // VALIDATION: No active label/tracking
      if (currentMeta.superfrete_id) {
        return res.status(400).json({ success: false, error: 'Troca nao permitida. Existe etiqueta SuperFrete ativa para este pedido.' })
      }
      if (currentMeta.tracking_code) {
        return res.status(400).json({ success: false, error: 'Troca nao permitida. Existe codigo de rastreio ativo para este pedido.' })
      }
      if (currentMeta.superfrete_tracking) {
        return res.status(400).json({ success: false, error: 'Troca nao permitida. Existe rastreio SuperFrete ativo para este pedido.' })
      }

      // VALIDATION: Required fields
      if (old_item_index === undefined || old_item_index === null || !new_variant_id) {
        return res.status(400).json({ success: false, error: 'old_item_index e new_variant_id sao obrigatorios' })
      }

      const orderItems = order.items || []
      if (old_item_index < 0 || old_item_index >= orderItems.length) {
        return res.status(400).json({ success: false, error: `Indice do item invalido: ${old_item_index}` })
      }

      const oldItem = orderItems[old_item_index]
      const swapQty = quantity || oldItem.quantity || 1
      const newItemPrice = Number(new_product_price) || 0

      console.log(`[SWAP_ITEM] Order #${order.display_id} — Swapping item[${old_item_index}] "${oldItem.title}" -> "${new_product_title}" (qty: ${swapQty})`)

      try {
        // =====================================================================
        // STEP 1: Capture or retrieve ORIGINAL STATE (frozen at first swap)
        // =====================================================================
        let adjustment = currentMeta.swap_adjustment || null
        let originalState: any

        if (!adjustment || adjustment.status === 'resolved') {
          // First swap in a new cycle — freeze the original state from Medusa native items
          const nativeItems = orderItems.map((it: any) => ({
            product_id: it.product_id,
            variant_id: it.variant_id,
            title: it.title || it.product_title,
            quantity: it.quantity,
            unit_price: it.unit_price,
            thumbnail: it.thumbnail,
          }))
          const origSubtotal = nativeItems.reduce((s: number, it: any) => s + (Number(it.unit_price) || 0) * (it.quantity || 1), 0)
          const origShippingFee = Number(currentMeta.original_shipping_fee ?? currentMeta.shipping_fee ?? 0)
          const origPkgDims = currentMeta.original_package_dimensions || currentMeta.package_dimensions || null

          originalState = {
            items: nativeItems,
            shipping_fee: origShippingFee,
            package_dimensions: origPkgDims,
            subtotal: origSubtotal,
            total: origSubtotal + origShippingFee,
          }

          // Also freeze the original values in separate fields (survives metadata changes)
          if (currentMeta.original_shipping_fee === undefined) {
            currentMeta.original_shipping_fee = origShippingFee
          }
          if (!currentMeta.original_package_dimensions) {
            currentMeta.original_package_dimensions = origPkgDims
          }
          if (!currentMeta.original_items) {
            currentMeta.original_items = nativeItems
          }

          adjustment = {
            status: 'pending',
            original_state: originalState,
            current_state: null, // will be set below
            swap_count: 0,
            first_swap_at: new Date().toISOString(),
            last_swap_at: new Date().toISOString(),
          }
        } else {
          // Subsequent swap in an existing pending cycle — use frozen original
          originalState = adjustment.original_state
        }

        // =====================================================================
        // STEP 2: Build the NEW items list from scratch (original + swap)
        // =====================================================================
        // Start from the ORIGINAL items, not the current items_override
        // This ensures we always build from the ground truth
        const baseItems = currentMeta.original_items || orderItems.map((it: any) => ({
          product_id: it.product_id,
          variant_id: it.variant_id,
          title: it.title || it.product_title,
          quantity: it.quantity,
          unit_price: it.unit_price,
          thumbnail: it.thumbnail,
        }))

        // If there's already an items_override from a previous swap in this cycle,
        // start from that (so swapping item B->C after A->B works correctly)
        const currentItems = currentMeta.items_override || [...baseItems]
        const newItems = currentItems.map((it: any, i: number) => {
          if (i === old_item_index) {
            return {
              product_id: new_product_id,
              variant_id: new_variant_id,
              title: new_product_title,
              quantity: swapQty,
              unit_price: newItemPrice,
              thumbnail: new_product_image,
              shipping: new_product_shipping,
            }
          }
          return { ...it }
        })

        // =====================================================================
        // STEP 3: Recalculate shipping FROM SCRATCH using each item's dimensions
        // =====================================================================
        // Helper: extract per-item shipping dimensions from title (yards) or metadata
        const getItemShippingDims = (item: any): { height: number; width: number; length: number; weight: number } => {
          // If item has explicit shipping info (from swap), use it
          if (item.shipping) {
            return {
              height: Number(item.shipping.height) || 12,
              width: Number(item.shipping.width) || 12,
              length: Number(item.shipping.length) || 12,
              weight: Number(item.shipping.weight) || 0.2,
            }
          }
          // Otherwise derive from title (yards) using the same logic as frontend
          const title = item.title || ''
          if (/carretilha/i.test(title)) return { height: 25, width: 33, length: 31, weight: 1.0 }
          const yardMatch = title.match(/(\d+)\s*(j|jds|jardas)\b/i)
          const yards = yardMatch ? parseInt(yardMatch[1], 10) : null
          switch (yards) {
            case 50:   return { height: 12, width: 12, length: 12, weight: 0.2 }
            case 100:  return { height: 12, width: 12, length: 12, weight: 0.2 }
            case 200:  return { height: 12, width: 12, length: 12, weight: 0.2 }
            case 500:  return { height: 12, width: 12, length: 19, weight: 0.4 }
            case 600:  return { height: 12, width: 18, length: 18, weight: 0.3 }
            case 1000: return { height: 15, width: 15, length: 18, weight: 0.5 }
            case 2000: return { height: 18, width: 18, length: 19, weight: 1.0 }
            case 3000: return { height: 18, width: 18, length: 27, weight: 1.0 }
            case 6000: return { height: 19, width: 19, length: 25, weight: 2.0 }
            case 12000: return { height: 21, width: 21, length: 30, weight: 3.0 }
            default:   return { height: 12, width: 12, length: 12, weight: 0.2 }
          }
        }

        // Build per-item shipping products array for SuperFrete calculator
        const allProductsForShipping = newItems.map((item: any) => {
          const dims = getItemShippingDims(item)
          return {
            quantity: item.quantity || 1,
            height: dims.height,
            width: dims.width,
            length: dims.length,
            weight: dims.weight,
          }
        })

        const superfreteToken = process.env.SUPERFRETE_TOKEN
        const cepOrigem = process.env.SUPERFRETE_CEP_ORIGEM || "74450380"
        const addr = parseOrderAddress(order)
        const customerCep = addr?.cep || ""
        const shippingService = Number(currentMeta.shipping_service) || 1

        // ALWAYS start from zero for shipping — never carry over old values
        let newShippingFee = 0
        let newPackageDimensions: any = null

        if (superfreteToken && customerCep) {
          console.log(`[SWAP_ITEM] Step 3: Recalculating shipping FROM SCRATCH (CEP: ${customerCep}, service: ${shippingService}, ${allProductsForShipping.length} items)...`)
          try {
            const calcUrl = process.env.SUPERFRETE_URL || "https://api.superfrete.com/api/v0/calculator"
            const calcBody = {
              from: { postal_code: cepOrigem },
              to: { postal_code: customerCep.replace(/\D/g, "") },
              services: "1,2,17",
              options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false },
              products: allProductsForShipping,
            }

            const calcRes = await fetch(calcUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${superfreteToken}`,
                "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(calcBody),
            })

            if (calcRes.ok) {
              const calcData = await calcRes.json()
              const options = Array.isArray(calcData) ? calcData : (calcData.options || calcData)
              if (Array.isArray(options)) {
                const matchingService = options.find((opt: any) => opt.id === shippingService || opt.service_id === shippingService)
                if (matchingService) {
                  newShippingFee = Number(matchingService.price) || 0
                  if (matchingService.packages?.[0]) {
                    const pkg = matchingService.packages[0]
                    newPackageDimensions = {
                      dimensions: {
                        height: pkg.dimensions?.height || pkg.height,
                        width: pkg.dimensions?.width || pkg.width,
                        length: pkg.dimensions?.length || pkg.length,
                      },
                      weight: pkg.weight || allProductsForShipping.reduce((w: number, p: any) => w + (p.weight * p.quantity), 0),
                    }
                  }
                  console.log(`[SWAP_ITEM] New shipping fee from scratch: R$ ${newShippingFee}`)
                } else {
                  // Service not found — fall back to original shipping fee (not current)
                  newShippingFee = Number(originalState.shipping_fee || 0)
                  console.log(`[SWAP_ITEM] Service ${shippingService} not found, using original shipping: R$ ${newShippingFee}`)
                }
              }
            } else {
              // Calculator failed — fall back to original shipping fee
              newShippingFee = Number(originalState.shipping_fee || 0)
              console.error(`[SWAP_ITEM] Shipping calc failed (HTTP ${calcRes.status}), using original: R$ ${newShippingFee}`)
            }
          } catch (calcErr: any) {
            newShippingFee = Number(originalState.shipping_fee || 0)
            console.error(`[SWAP_ITEM] Shipping calc error: ${calcErr.message}, using original: R$ ${newShippingFee}`)
          }
        } else {
          // No SuperFrete config — use original shipping
          newShippingFee = Number(originalState.shipping_fee || 0)
          console.log(`[SWAP_ITEM] No SuperFrete config, using original shipping: R$ ${newShippingFee}`)
        }

        // =====================================================================
        // STEP 4: Calculate new totals FROM SCRATCH
        // =====================================================================
        const newSubtotal = newItems.reduce((s: number, it: any) => s + (Number(it.unit_price) || 0) * (it.quantity || 1), 0)
        const newTotal = newSubtotal + newShippingFee

        const currentState = {
          items: newItems.map((it: any) => ({ ...it, shipping: undefined })), // strip shipping helper
          shipping_fee: newShippingFee,
          package_dimensions: newPackageDimensions || originalState.package_dimensions,
          subtotal: newSubtotal,
          total: newTotal,
        }

        // =====================================================================
        // STEP 5: Update adjustment state (pending, overwrites each time)
        // =====================================================================
        adjustment.current_state = currentState
        adjustment.swap_count = (adjustment.swap_count || 0) + 1
        adjustment.last_swap_at = new Date().toISOString()
        adjustment.status = 'pending'
        currentMeta.swap_adjustment = adjustment

        // Update items_override (source of truth for admin display)
        currentMeta.items_override = currentState.items

        // Update order-level shipping
        currentMeta.shipping_fee = newShippingFee
        if (newPackageDimensions) {
          currentMeta.package_dimensions = newPackageDimensions
        }

        // Remove old polluted swapped_items array (legacy)
        // We no longer push individual entries per swap while pending
        // The swap_adjustment object IS the single source of truth
        // (keep swapped_items for legacy compatibility but don't add to it)

        // Try Medusa order edit (best-effort, metadata overlay is the real source)
        try {
          const removeRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}/line-items/${oldItem.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
          })
          if (!removeRes.ok) {
            console.log(`[SWAP_ITEM] Medusa order-edit not available, using metadata overlay`)
          }
        } catch { /* metadata overlay is sufficient */ }

        // =====================================================================
        // STEP 6: Save to Medusa
        // =====================================================================
        const saveRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: currentMeta }),
        })
        if (!saveRes.ok) {
          const errText = await saveRes.text().catch(() => '')
          console.error(`[SWAP_ITEM] Save failed: ${errText}`)
          return res.status(500).json({ success: false, error: 'Erro ao salvar troca no pedido' })
        }

        console.log(`[SWAP_ITEM] SUCCESS: Order #${order.display_id} | Original total: R$ ${originalState.total} -> Current total: R$ ${newTotal} | Swap #${adjustment.swap_count}`)

        logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'swap_item', previous_status: currentMeta.custom_status, new_status: currentMeta.custom_status, ...auditMeta, result: 'success', payload_summary: { old_item: oldItem.title, new_item: new_product_title, swap_count: adjustment.swap_count, diff_total: newTotal - originalState.total } })

        return res.json({
          success: true,
          order: { id: order.display_id, medusa_order_id: order.id },
          swap: {
            adjustment_status: 'pending',
            swap_count: adjustment.swap_count,
            original: originalState,
            current: currentState,
            diff: {
              subtotal: newSubtotal - originalState.subtotal,
              shipping: newShippingFee - originalState.shipping_fee,
              total: newTotal - originalState.total,
            },
            shipping_recalculated: !!superfreteToken && !!customerCep,
          },
        })
      } catch (swapError: any) {
        console.error(`[SWAP_ITEM] Error: ${swapError.message}`)
        logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'swap_item', ...auditMeta, result: 'error', error_message: swapError.message })
        return res.status(500).json({ success: false, error: `Erro na troca: ${swapError.message}` })
      }
    }

    // === ADD ITEM (Add new product to existing order) ===
    // Reuses the EXACT SAME mechanics as swap_item:
    //   - Same business rule validations (status, active label/tracking blockers)
    //   - Same swap_adjustment pending/resolved state machine
    //   - Same items_override metadata overlay (no direct line_item mutation)
    //   - Same from-scratch shipping recalculation via SuperFrete
    //   - Same delta reporting (original vs current totals)
    //
    // DIFFERENCE FROM swap_item:
    //   - Does NOT remove any existing item
    //   - APPENDS a new item to the items list
    //   - Accepts multiple adds in a single call (items: [...])
    //
    // This keeps zero duplication of critical logic (price, tax, shipping, region)
    // and every add reuses the adjustment/rollback semantics already validated in prod.
    if (action === 'add_item') {
      const body = req.body as any
      // Accept either a single product (flat fields) or an array of products (items)
      const itemsToAdd: any[] = Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : [{
            new_product_id: body.new_product_id,
            new_variant_id: body.new_variant_id,
            new_product_title: body.new_product_title,
            new_product_price: body.new_product_price,
            new_product_image: body.new_product_image,
            new_product_shipping: body.new_product_shipping,
            quantity: body.quantity,
          }]

      // VALIDATION: Status (identical to swap_item)
      const allowedStatuses = ['awaiting_payment', 'paid']
      const currentStatus = currentMeta.custom_status || 'awaiting_payment'
      if (!allowedStatuses.includes(currentStatus)) {
        return res.status(400).json({ success: false, error: `Adicao nao permitida. Status atual: ${currentStatus}. Adicao so e permitida em: aguardando pagamento ou pago.` })
      }

      // VALIDATION: No active label/tracking (identical to swap_item)
      if (currentMeta.superfrete_id) {
        return res.status(400).json({ success: false, error: 'Adicao nao permitida. Existe etiqueta SuperFrete ativa para este pedido.' })
      }
      if (currentMeta.tracking_code) {
        return res.status(400).json({ success: false, error: 'Adicao nao permitida. Existe codigo de rastreio ativo para este pedido.' })
      }
      if (currentMeta.superfrete_tracking) {
        return res.status(400).json({ success: false, error: 'Adicao nao permitida. Existe rastreio SuperFrete ativo para este pedido.' })
      }

      // VALIDATION: Required fields on each item
      for (const it of itemsToAdd) {
        if (!it.new_variant_id) {
          return res.status(400).json({ success: false, error: 'new_variant_id e obrigatorio para cada produto a adicionar' })
        }
        if (it.new_product_price === undefined || it.new_product_price === null || Number.isNaN(Number(it.new_product_price))) {
          return res.status(400).json({ success: false, error: 'new_product_price e obrigatorio para cada produto a adicionar' })
        }
        if (Number(it.new_product_price) < 0) {
          return res.status(400).json({ success: false, error: 'new_product_price deve ser >= 0' })
        }
        const qty = Number(it.quantity || 1)
        if (!Number.isFinite(qty) || qty < 1) {
          return res.status(400).json({ success: false, error: 'quantity deve ser um inteiro >= 1' })
        }
      }

      const orderItems = order.items || []
      console.log(`[ADD_ITEM] Order #${order.display_id} — Adding ${itemsToAdd.length} new product(s): ${itemsToAdd.map((i: any) => `"${i.new_product_title}" x${i.quantity || 1}`).join(', ')}`)

      try {
        // =====================================================================
        // STEP 1: Capture or retrieve ORIGINAL STATE (reuses swap_adjustment)
        // Same semantics as swap_item — original_state frozen at first change.
        // =====================================================================
        let adjustment = currentMeta.swap_adjustment || null
        let originalState: any

        if (!adjustment || adjustment.status === 'resolved') {
          const nativeItems = orderItems.map((it: any) => ({
            product_id: it.product_id,
            variant_id: it.variant_id,
            title: it.title || it.product_title,
            quantity: it.quantity,
            unit_price: it.unit_price,
            thumbnail: it.thumbnail,
          }))
          const origSubtotal = nativeItems.reduce((s: number, it: any) => s + (Number(it.unit_price) || 0) * (it.quantity || 1), 0)
          const origShippingFee = Number(currentMeta.original_shipping_fee ?? currentMeta.shipping_fee ?? 0)
          const origPkgDims = currentMeta.original_package_dimensions || currentMeta.package_dimensions || null

          originalState = {
            items: nativeItems,
            shipping_fee: origShippingFee,
            package_dimensions: origPkgDims,
            subtotal: origSubtotal,
            total: origSubtotal + origShippingFee,
          }

          if (currentMeta.original_shipping_fee === undefined) {
            currentMeta.original_shipping_fee = origShippingFee
          }
          if (!currentMeta.original_package_dimensions) {
            currentMeta.original_package_dimensions = origPkgDims
          }
          if (!currentMeta.original_items) {
            currentMeta.original_items = nativeItems
          }

          adjustment = {
            status: 'pending',
            original_state: originalState,
            current_state: null,
            swap_count: 0,
            first_swap_at: new Date().toISOString(),
            last_swap_at: new Date().toISOString(),
          }
        } else {
          originalState = adjustment.original_state
        }

        // =====================================================================
        // STEP 2: Build the NEW items list (base items + appended new items)
        // Same base-building rules as swap_item, but instead of replacing
        // the item at old_item_index, we APPEND the new products.
        // =====================================================================
        const baseItems = currentMeta.original_items || orderItems.map((it: any) => ({
          product_id: it.product_id,
          variant_id: it.variant_id,
          title: it.title || it.product_title,
          quantity: it.quantity,
          unit_price: it.unit_price,
          thumbnail: it.thumbnail,
        }))

        // Start from current items (if a previous swap/add already mutated them)
        const currentItems = currentMeta.items_override || [...baseItems]
        const appendedItems = itemsToAdd.map((it: any) => ({
          product_id: it.new_product_id,
          variant_id: it.new_variant_id,
          title: it.new_product_title,
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.new_product_price) || 0,
          thumbnail: it.new_product_image,
          shipping: it.new_product_shipping,
          added_via: 'add_item', // marker so UI/auditing can distinguish
        }))
        const newItems = [...currentItems.map((it: any) => ({ ...it })), ...appendedItems]

        // =====================================================================
        // STEP 3: Recalculate shipping FROM SCRATCH (same logic as swap_item)
        // =====================================================================
        const getItemShippingDims = (item: any): { height: number; width: number; length: number; weight: number } => {
          if (item.shipping) {
            return {
              height: Number(item.shipping.height) || 12,
              width: Number(item.shipping.width) || 12,
              length: Number(item.shipping.length) || 12,
              weight: Number(item.shipping.weight) || 0.2,
            }
          }
          const title = item.title || ''
          if (/carretilha/i.test(title)) return { height: 25, width: 33, length: 31, weight: 1.0 }
          const yardMatch = title.match(/(\d+)\s*(j|jds|jardas)\b/i)
          const yards = yardMatch ? parseInt(yardMatch[1], 10) : null
          switch (yards) {
            case 50:   return { height: 12, width: 12, length: 12, weight: 0.2 }
            case 100:  return { height: 12, width: 12, length: 12, weight: 0.2 }
            case 200:  return { height: 12, width: 12, length: 12, weight: 0.2 }
            case 500:  return { height: 12, width: 12, length: 19, weight: 0.4 }
            case 600:  return { height: 12, width: 18, length: 18, weight: 0.3 }
            case 1000: return { height: 15, width: 15, length: 18, weight: 0.5 }
            case 2000: return { height: 18, width: 18, length: 19, weight: 1.0 }
            case 3000: return { height: 18, width: 18, length: 27, weight: 1.0 }
            case 6000: return { height: 19, width: 19, length: 25, weight: 2.0 }
            case 12000: return { height: 21, width: 21, length: 30, weight: 3.0 }
            default:   return { height: 12, width: 12, length: 12, weight: 0.2 }
          }
        }

        const allProductsForShipping = newItems.map((item: any) => {
          const dims = getItemShippingDims(item)
          return {
            quantity: item.quantity || 1,
            height: dims.height,
            width: dims.width,
            length: dims.length,
            weight: dims.weight,
          }
        })

        const superfreteToken = process.env.SUPERFRETE_TOKEN
        const cepOrigem = process.env.SUPERFRETE_CEP_ORIGEM || "74450380"
        const addr = parseOrderAddress(order)
        const customerCep = addr?.cep || ""
        const shippingService = Number(currentMeta.shipping_service) || 1

        let newShippingFee = 0
        let newPackageDimensions: any = null

        if (superfreteToken && customerCep) {
          console.log(`[ADD_ITEM] Step 3: Recalculating shipping FROM SCRATCH (CEP: ${customerCep}, service: ${shippingService}, ${allProductsForShipping.length} items)...`)
          try {
            const calcUrl = process.env.SUPERFRETE_URL || "https://api.superfrete.com/api/v0/calculator"
            const calcBody = {
              from: { postal_code: cepOrigem },
              to: { postal_code: customerCep.replace(/\D/g, "") },
              services: "1,2,17",
              options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false },
              products: allProductsForShipping,
            }

            const calcRes = await fetch(calcUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${superfreteToken}`,
                "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(calcBody),
            })

            if (calcRes.ok) {
              const calcData = await calcRes.json()
              const options = Array.isArray(calcData) ? calcData : (calcData.options || calcData)
              if (Array.isArray(options)) {
                const matchingService = options.find((opt: any) => opt.id === shippingService || opt.service_id === shippingService)
                if (matchingService) {
                  newShippingFee = Number(matchingService.price) || 0
                  if (matchingService.packages?.[0]) {
                    const pkg = matchingService.packages[0]
                    newPackageDimensions = {
                      dimensions: {
                        height: pkg.dimensions?.height || pkg.height,
                        width: pkg.dimensions?.width || pkg.width,
                        length: pkg.dimensions?.length || pkg.length,
                      },
                      weight: pkg.weight || allProductsForShipping.reduce((w: number, p: any) => w + (p.weight * p.quantity), 0),
                    }
                  }
                  console.log(`[ADD_ITEM] New shipping fee from scratch: R$ ${newShippingFee}`)
                } else {
                  newShippingFee = Number(originalState.shipping_fee || 0)
                  console.log(`[ADD_ITEM] Service ${shippingService} not found, using original shipping: R$ ${newShippingFee}`)
                }
              }
            } else {
              newShippingFee = Number(originalState.shipping_fee || 0)
              console.error(`[ADD_ITEM] Shipping calc failed (HTTP ${calcRes.status}), using original: R$ ${newShippingFee}`)
            }
          } catch (calcErr: any) {
            newShippingFee = Number(originalState.shipping_fee || 0)
            console.error(`[ADD_ITEM] Shipping calc error: ${calcErr.message}, using original: R$ ${newShippingFee}`)
          }
        } else {
          newShippingFee = Number(originalState.shipping_fee || 0)
          console.log(`[ADD_ITEM] No SuperFrete config, using original shipping: R$ ${newShippingFee}`)
        }

        // =====================================================================
        // STEP 4: Calculate new totals FROM SCRATCH (same as swap_item)
        // =====================================================================
        const newSubtotal = newItems.reduce((s: number, it: any) => s + (Number(it.unit_price) || 0) * (it.quantity || 1), 0)
        const newTotal = newSubtotal + newShippingFee

        const currentState = {
          items: newItems.map((it: any) => ({ ...it, shipping: undefined })),
          shipping_fee: newShippingFee,
          package_dimensions: newPackageDimensions || originalState.package_dimensions,
          subtotal: newSubtotal,
          total: newTotal,
        }

        // =====================================================================
        // STEP 5: Update adjustment state (shared with swap_item)
        // =====================================================================
        adjustment.current_state = currentState
        adjustment.swap_count = (adjustment.swap_count || 0) + 1
        adjustment.last_swap_at = new Date().toISOString()
        adjustment.status = 'pending'
        currentMeta.swap_adjustment = adjustment

        currentMeta.items_override = currentState.items
        currentMeta.shipping_fee = newShippingFee
        if (newPackageDimensions) {
          currentMeta.package_dimensions = newPackageDimensions
        }

        // =====================================================================
        // STEP 6: Save to Medusa (metadata-only; no direct line_item mutation).
        // This is intentional — we never touch critical financial rows directly,
        // always go through Medusa's /admin/orders/:id endpoint.
        // =====================================================================
        const saveRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: currentMeta }),
        })
        if (!saveRes.ok) {
          const errText = await saveRes.text().catch(() => '')
          console.error(`[ADD_ITEM] Save failed: ${errText}`)
          // ROLLBACK: nothing to roll back locally — we never mutated anything
          // before the save. Returning 500 leaves the order untouched.
          return res.status(500).json({ success: false, error: 'Erro ao salvar adicao de produto no pedido' })
        }

        console.log(`[ADD_ITEM] SUCCESS: Order #${order.display_id} | Original total: R$ ${originalState.total} -> Current total: R$ ${newTotal} | Adjustment ops: ${adjustment.swap_count} | Added: ${appendedItems.length} product(s)`)

        logAudit({
          order_id: order.id,
          order_display_id: order.display_id,
          action_type: 'add_item',
          previous_status: currentMeta.custom_status,
          new_status: currentMeta.custom_status,
          ...auditMeta,
          result: 'success',
          payload_summary: {
            added_items: appendedItems.map((it: any) => ({ title: it.title, quantity: it.quantity, unit_price: it.unit_price })),
            added_count: appendedItems.length,
            adjustment_ops: adjustment.swap_count,
            diff_total: newTotal - originalState.total,
            new_total: newTotal,
          },
        })

        return res.json({
          success: true,
          order: { id: order.display_id, medusa_order_id: order.id },
          add: {
            adjustment_status: 'pending',
            swap_count: adjustment.swap_count,
            added_items: appendedItems.map((it: any) => ({ title: it.title, quantity: it.quantity, unit_price: it.unit_price })),
            original: originalState,
            current: currentState,
            diff: {
              subtotal: newSubtotal - originalState.subtotal,
              shipping: newShippingFee - originalState.shipping_fee,
              total: newTotal - originalState.total,
            },
            shipping_recalculated: !!superfreteToken && !!customerCep,
          },
        })
      } catch (addError: any) {
        console.error(`[ADD_ITEM] Error: ${addError.message}`)
        logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'add_item', ...auditMeta, result: 'error', error_message: addError.message })
        return res.status(500).json({ success: false, error: `Erro na adicao: ${addError.message}` })
      }
    }

    // === RESOLVE SWAP ADJUSTMENT ===
    // Marks the current pending adjustment as resolved (consolidates history)
    if (action === 'resolve_swap_adjustment') {
      const adjustment = currentMeta.swap_adjustment
      if (!adjustment || adjustment.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Nenhum ajuste de troca pendente para resolver' })
      }

      // Move to consolidated history
      const swapHistory = currentMeta.swap_history || []
      swapHistory.push({
        resolved_at: new Date().toISOString(),
        original_state: adjustment.original_state,
        final_state: adjustment.current_state,
        swap_count: adjustment.swap_count,
        first_swap_at: adjustment.first_swap_at,
        last_swap_at: adjustment.last_swap_at,
      })
      currentMeta.swap_history = swapHistory

      // Mark adjustment as resolved
      adjustment.status = 'resolved'
      adjustment.resolved_at = new Date().toISOString()
      currentMeta.swap_adjustment = adjustment

      // Save
      const saveRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: currentMeta }),
      })
      if (!saveRes.ok) {
        return res.status(500).json({ success: false, error: 'Erro ao resolver ajuste' })
      }

      console.log(`[RESOLVE_SWAP] Order #${order.display_id} — Adjustment resolved (${adjustment.swap_count} swaps)`)
      logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'resolve_swap_adjustment', ...auditMeta, result: 'success', payload_summary: { swap_count: adjustment.swap_count } })
      return res.json({ success: true, order: { id: order.display_id }, resolved: true })
    }

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
      logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'save_observation', ...auditMeta, result: 'success', payload_summary: { observation_length: (observation || "").length } })
      return res.json({ success: true, order: { id: order.display_id, admin_observation: currentMeta.admin_observation } })
    }

    // === UPDATE CUSTOMER DATA (name, CPF, address) ===
    if (action === 'update_customer_data') {
      const { customer_name, customer_cpf, address_components: newAddr } = req.body as any
      console.log(`[UPDATE_CUSTOMER] Order #${order.display_id} (${order.id}) - Updating customer data. CPF received: "${customer_cpf}"`)
      
      // Update metadata fields
      // CRITICAL: Preserve CPF as-is. Only set to null if explicitly undefined (not sent).
      // An empty string "" means "user cleared the CPF" -> store null.
      // A valid CPF string like "12345678901" -> store that string.
      if (customer_cpf !== undefined) {
        // Clean the CPF: remove non-digits, store only digits or null
        const cleanedCpf = (customer_cpf || "").replace(/\D/g, "")
        currentMeta.customer_cpf = cleanedCpf.length >= 11 ? cleanedCpf : (cleanedCpf.length > 0 ? cleanedCpf : null)
        console.log(`[UPDATE_CUSTOMER] CPF stored in metadata: "${currentMeta.customer_cpf}"`)
      }
      
      if (newAddr && typeof newAddr === 'object') {
        // Merge new address components into existing
        const existingAddr = currentMeta.address_components || {}
        currentMeta.address_components = {
          ...existingAddr,
          ...newAddr,
        }
        
        // Rebuild the full address string
        const addr = currentMeta.address_components
        const addrNumber = addr.number || 'S/N'
        const complementStr = addr.complement ? ` - ${addr.complement}` : ''
        currentMeta.customer_full_address = `${addr.street || ''}, ${addrNumber}${complementStr}, ${addr.neighborhood || ''}, ${addr.city || ''} - ${addr.state || ''}, CEP: ${addr.cep || ''}`
      }
      
      // Update shipping_address on the Medusa order itself (name + address)
      // This is the SOURCE OF TRUTH for SuperFrete label generation
      const updatePayload: any = { metadata: currentMeta }
      
      if (customer_name) {
        const nameParts = customer_name.trim().split(/\s+/)
        const firstName = nameParts[0] || 'Cliente'
        const lastName = nameParts.slice(1).join(' ') || ' '
        
        // Update shipping address with new name and address
        const addr = currentMeta.address_components || {}
        const addrNumber = addr.number || ''
        const address1 = addrNumber ? `${addr.street || ''}, ${addrNumber}` : (addr.street || '')
        
        updatePayload.shipping_address = {
          first_name: firstName,
          last_name: lastName,
          address_1: address1,
          address_2: addr.complement || addr.neighborhood || '',
          city: addr.city || '',
          province: addr.state || '',
          postal_code: (addr.cep || '').replace(/\D/g, '') || '00000000',
          country_code: 'br',
          phone: currentMeta.customer_whatsapp || '',
          company: addr.neighborhood || '',
        }
      } else if (newAddr) {
        // Only address changed, not name — still update shipping_address
        const sa = order.shipping_address || {}
        const addr = currentMeta.address_components || {}
        const addrNumber = addr.number || ''
        const address1 = addrNumber ? `${addr.street || ''}, ${addrNumber}` : (addr.street || '')
        
        updatePayload.shipping_address = {
          first_name: sa.first_name || 'Cliente',
          last_name: sa.last_name || ' ',
          address_1: address1,
          address_2: addr.complement || addr.neighborhood || '',
          city: addr.city || '',
          province: addr.state || '',
          postal_code: (addr.cep || '').replace(/\D/g, '') || '00000000',
          country_code: 'br',
          phone: currentMeta.customer_whatsapp || '',
          company: addr.neighborhood || '',
        }
      }
      
      const updateRes = await fetch(`${MEDUSA_URL}/admin/orders/${order.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workingToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      })
      
      if (!updateRes.ok) {
        const errText = await updateRes.text().catch(() => '')
        console.error(`[UPDATE_CUSTOMER] Failed: ${errText}`)
        return res.status(500).json({ success: false, error: "Erro ao salvar dados do cliente" })
      }
      
      console.log(`[UPDATE_CUSTOMER] Order #${order.display_id} - Updated successfully. CPF: "${currentMeta.customer_cpf}"`)
      
      logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'update_customer_data', ...auditMeta, result: 'success', payload_summary: { cpf_updated: customer_cpf !== undefined, name_updated: !!customer_name, address_updated: !!newAddr } })

      // Return the FULL updated customer data so frontend can use it directly
      // without needing to re-fetch (avoids stale data / race conditions)
      const sa = order.shipping_address || {}
      const updatedName = customer_name || `${sa.first_name || ""} ${sa.last_name || ""}`.trim()
      return res.json({
        success: true,
        order: {
          id: order.display_id,
          medusa_order_id: order.id,
          customer_name: updatedName,
          customer_cpf: currentMeta.customer_cpf,
          customer_email: order.email,
          customer_whatsapp: currentMeta.customer_whatsapp || sa.phone || "",
          customer_address: currentMeta.customer_full_address || "",
          address_components: currentMeta.address_components || null,
        },
      })
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
      logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: isArchive ? 'archive' : 'unarchive', ...auditMeta, result: 'success' })
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
      logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'generate_label', previous_status: previousStatus, new_status: currentMeta.custom_status, ...auditMeta, result: sfResult.success ? 'success' : 'error', error_message: sfResult.success ? undefined : sfResult.error, payload_summary: { superfrete_id: currentMeta.superfrete_id || null } })
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
      const singleFinEmailOpts: SendEmailOptions = {
        trigger_source: 'pedidos_route',
        trigger_action: 'finalize_and_label',
        is_automatic: false,
        actor_type: auditMeta.actor_type || 'admin',
        actor_label: auditMeta.actor_label || undefined,
        session_id: auditMeta.session_id || undefined,
        ip_address: auditMeta.ip_address || undefined,
      }
      if (currentMeta.tracking_code) {
        sendOrderEmail("shipped", emailOrder, currentMeta.tracking_code, singleFinEmailOpts).catch(e => console.error("[FINALIZE EMAIL]", e.message))
        console.log(`[FINALIZE] Step 5: Sent 'shipped' email with tracking: ${currentMeta.tracking_code}`)
      } else {
        sendOrderEmail("paid", emailOrder, undefined, singleFinEmailOpts).catch(e => console.error("[FINALIZE EMAIL]", e.message))
        console.log(`[FINALIZE] Step 5: Sent 'paid' email (no tracking yet)`)
      }

      console.log(`[FINALIZE] COMPLETE: Order #${order.display_id} finalized successfully`)
      logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'finalize_and_label', previous_status: previousStatus, new_status: 'preparing', ...auditMeta, result: 'success', payload_summary: { superfrete_id: currentMeta.superfrete_id, tracking: currentMeta.tracking_code || null } })
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
        // When a label is canceled, the order should also show as cancelled.
        // Admin can manually revert to 'paid' via the bulk revert feature.
        const statusMap: Record<string, string> = {
          released: "preparing",
          posted: "shipped",
          delivered: "delivered",
          canceled: "cancelled",
        }
        if (infoData.status === "canceled" || infoData.status === "cancelled") {
          currentMeta.superfrete_status = "canceled"
          currentMeta.custom_status = "cancelled"
          currentMeta.label_cancelled_at = new Date().toISOString()
          console.log(`[SYNC] Order #${order.display_id}: Label cancelled -> order marked as CANCELLED`) 
        } else {
          const mappedStatus = statusMap[infoData.status]
          if (mappedStatus) {
            const statusOrder = ["awaiting_payment", "paid", "preparing", "shipped", "delivered"]
            const prevIdx = statusOrder.indexOf(prevStatus || "awaiting_payment")
            const newIdx = statusOrder.indexOf(mappedStatus)
            if (newIdx > prevIdx) {
              currentMeta.custom_status = mappedStatus
            }
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
          const syncEmailOpts: SendEmailOptions = {
            trigger_source: 'pedidos_route',
            trigger_action: 'sync_superfrete',
            is_automatic: false,
            actor_type: auditMeta.actor_type || 'admin',
            actor_label: auditMeta.actor_label || undefined,
            session_id: auditMeta.session_id || undefined,
            ip_address: auditMeta.ip_address || undefined,
          }
          if (currentMeta.custom_status === "shipped" && currentMeta.tracking_code) {
            sendOrderEmail("shipped", eo, currentMeta.tracking_code, syncEmailOpts).catch(e => console.error("[SYNC EMAIL]", e.message))
          } else if (currentMeta.custom_status === "delivered") {
            sendOrderEmail("delivered", eo, undefined, syncEmailOpts).catch(e => console.error("[SYNC EMAIL]", e.message))
          }
        }

        if (currentMeta.custom_status !== prevStatus) {
          logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'sync_superfrete', previous_status: prevStatus, new_status: currentMeta.custom_status, ...auditMeta, result: 'success', payload_summary: { sf_status: currentMeta.superfrete_status, tracking: currentMeta.tracking_code || null } })
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
        logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'sync_superfrete', ...auditMeta, result: 'error', error_message: err.message })
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
      logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: status ? `status_change_${status}` : (action || 'update'), previous_status: previousStatus, new_status: status || previousStatus, ...auditMeta, result: 'error', error_message: 'Erro ao atualizar pedido' })
      return res.status(500).json({ success: false, error: "Erro ao atualizar pedido" })
    }

    // Audit: log the status change or tracking update
    if (status && status !== previousStatus) {
      logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: `status_change`, previous_status: previousStatus, new_status: status, ...auditMeta, result: 'success', payload_summary: { tracking_code: tracking_code || null, superfrete_id: currentMeta.superfrete_id || null, auto_label: !!superfreteResult } })
    } else if (tracking_code !== undefined) {
      logAudit({ order_id: order.id, order_display_id: order.display_id, action_type: 'tracking_update', previous_status: previousStatus, new_status: currentMeta.custom_status, ...auditMeta, result: 'success', payload_summary: { tracking_code } })
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

      const statusEmailOpts: SendEmailOptions = {
        trigger_source: 'pedidos_route',
        trigger_action: `status_change_${status}`,
        is_automatic: false,
        actor_type: auditMeta.actor_type || 'admin',
        actor_label: auditMeta.actor_label || undefined,
        session_id: auditMeta.session_id || undefined,
        ip_address: auditMeta.ip_address || undefined,
      }
      if (status === 'paid') {
        sendOrderEmail('paid', emailOrder, undefined, statusEmailOpts).catch(e => console.error("[EMAIL]", e.message))
      } else if (status === 'shipped' && tracking_code) {
        sendOrderEmail('shipped', emailOrder, tracking_code, statusEmailOpts).catch(e => console.error("[EMAIL]", e.message))
      } else if (status === 'delivered') {
        sendOrderEmail('delivered', emailOrder, undefined, statusEmailOpts).catch(e => console.error("[EMAIL]", e.message))
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
