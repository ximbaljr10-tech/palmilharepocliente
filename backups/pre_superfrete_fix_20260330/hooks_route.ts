import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendOrderEmail } from "../../services/email"

/**
 * Webhook endpoint for SuperFrete status updates.
 * POST /store/webhook-superfrete
 * 
 * SuperFrete sends POST with JSON body containing order status updates.
 * Events: order.created, order.released, order.generated, order.posted, order.delivered, order.cancelled
 * 
 * This endpoint:
 * 1. Receives the webhook event
 * 2. Finds the corresponding Medusa order by superfrete_id in metadata
 * 3. Updates the order status accordingly
 * 4. Sends email notifications when appropriate
 */

const MEDUSA_URL = "http://localhost:9000"

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

// Map SuperFrete status to our internal status
function mapSuperfreteStatus(sfStatus: string, event: string): string | null {
  // Based on event type
  switch (event) {
    case "order.released":
      return "preparing" // Label paid, ready for shipping
    case "order.posted":
      return "shipped"
    case "order.delivered":
      return "delivered"
    case "order.cancelled":
      return "cancelled"
    default:
      return null // Don't change status for other events
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = req.body as any
    console.log("[WEBHOOK SUPERFRETE] Received:", JSON.stringify(body).substring(0, 500))

    // SuperFrete webhook payload structure varies, but generally has:
    // - event: string (e.g., "order.posted")
    // - id or order.id: the SuperFrete order ID
    // - tracking: tracking code
    // - status: current status
    const event = body.event || ""
    const sfOrderId = body.id || body.order?.id || ""
    const sfStatus = body.status || body.order?.status || ""
    const tracking = body.tracking || body.order?.tracking || ""

    if (!sfOrderId) {
      console.log("[WEBHOOK SUPERFRETE] No order ID in payload, ignoring")
      return res.json({ received: true, ignored: true })
    }

    console.log(`[WEBHOOK SUPERFRETE] Event: ${event}, SF Order: ${sfOrderId}, Status: ${sfStatus}, Tracking: ${tracking}`)

    // Get admin token
    const token = await getInternalAdminToken()
    if (!token) {
      console.error("[WEBHOOK SUPERFRETE] Could not get admin token")
      return res.status(500).json({ error: "Internal auth failed" })
    }

    // Find the Medusa order that has this superfrete_id in metadata
    // We need to search through orders
    const PAGE_SIZE = 100
    let offset = 0
    let medusaOrder: any = null

    while (!medusaOrder) {
      const ordersRes = await fetch(
        `${MEDUSA_URL}/admin/orders?fields=id,display_id,email,metadata,*items,*shipping_address,*summary&limit=${PAGE_SIZE}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      )

      if (!ordersRes.ok) {
        console.error("[WEBHOOK SUPERFRETE] Failed to fetch orders:", ordersRes.status)
        break
      }

      const data = await ordersRes.json()
      const pageOrders = data.orders || []

      medusaOrder = pageOrders.find((o: any) => o.metadata?.superfrete_id === sfOrderId)

      if (medusaOrder || pageOrders.length < PAGE_SIZE) break
      offset += PAGE_SIZE
      if (offset >= 5000) break
    }

    if (!medusaOrder) {
      console.log(`[WEBHOOK SUPERFRETE] No Medusa order found for SF ID: ${sfOrderId}`)
      return res.json({ received: true, order_found: false })
    }

    console.log(`[WEBHOOK SUPERFRETE] Found Medusa order #${medusaOrder.display_id} (${medusaOrder.id}) for SF ID: ${sfOrderId}`)

    // Determine the new status
    const newStatus = mapSuperfreteStatus(sfStatus, event)
    const currentMeta = { ...(medusaOrder.metadata || {}) }
    const previousStatus = currentMeta.custom_status || "awaiting_payment"
    let statusChanged = false

    // Update superfrete-related metadata
    currentMeta.superfrete_status = sfStatus || currentMeta.superfrete_status
    if (tracking) {
      currentMeta.superfrete_tracking = tracking
      currentMeta.tracking_code = tracking
    }

    // Update custom_status if we have a mapped status and it's a progression
    if (newStatus && newStatus !== previousStatus) {
      // Only progress forward, don't go backwards
      const statusOrder = ["awaiting_payment", "paid", "preparing", "shipped", "delivered"]
      const prevIdx = statusOrder.indexOf(previousStatus)
      const newIdx = statusOrder.indexOf(newStatus)

      // Allow: forward progression OR cancellation from any state
      if (newStatus === "cancelled" || newIdx > prevIdx) {
        currentMeta.custom_status = newStatus
        statusChanged = true
        console.log(`[WEBHOOK SUPERFRETE] Status updated: ${previousStatus} -> ${newStatus}`)
      } else {
        console.log(`[WEBHOOK SUPERFRETE] Skipping status regression: ${previousStatus} -> ${newStatus}`)
      }
    }

    // Save updated metadata
    const updateRes = await fetch(`${MEDUSA_URL}/admin/orders/${medusaOrder.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: currentMeta }),
    })

    if (!updateRes.ok) {
      console.error("[WEBHOOK SUPERFRETE] Failed to update order:", await updateRes.text())
      return res.status(500).json({ error: "Failed to update order" })
    }

    // Send email if status changed
    if (statusChanged) {
      const sa = medusaOrder.shipping_address || {}
      const customerName = `${sa.first_name || ""} ${sa.last_name || ""}`.trim()
      const emailOrder = {
        display_id: medusaOrder.display_id,
        id: medusaOrder.display_id,
        customer_name: customerName,
        customer_email: medusaOrder.email,
        items: (medusaOrder.items || []).map((i: any) => ({
          title: i.title || i.product_title,
          quantity: i.quantity,
          price: i.unit_price || 0,
        })),
        total_amount: Number(medusaOrder.summary?.raw_current_order_total?.value || medusaOrder.summary?.current_order_total || 0) + Number(currentMeta.shipping_fee || 0),
        shipping_fee: Number(currentMeta.shipping_fee || 0),
      }

      if (newStatus === "shipped" && tracking) {
        sendOrderEmail("shipped", emailOrder, tracking).catch(e => console.error("[WEBHOOK EMAIL]", e.message))
      } else if (newStatus === "delivered") {
        sendOrderEmail("delivered", emailOrder).catch(e => console.error("[WEBHOOK EMAIL]", e.message))
      }
    }

    return res.json({
      received: true,
      order_found: true,
      medusa_order_id: medusaOrder.id,
      display_id: medusaOrder.display_id,
      status_changed: statusChanged,
      new_status: currentMeta.custom_status,
    })
  } catch (err: any) {
    console.error("[WEBHOOK SUPERFRETE] Error:", err.message)
    return res.status(500).json({ error: "Webhook processing failed" })
  }
}
