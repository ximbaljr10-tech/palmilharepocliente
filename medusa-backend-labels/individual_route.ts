/**
 * GET /admin/remessas/labels/individual?order_id=<id>  OR  ?display_id=<n>
 *
 * Devolve o PDF SOMENTE de um pedido (já gerado e cacheado quando uma
 * remessa contendo esse pedido foi processada).
 *
 * Se o arquivo ainda não existe, chama a SuperFrete 1x para criar e salva.
 *
 * Preparado para automação de WhatsApp: cada pedido tem seu arquivo
 * individual em disco, nomeado de forma previsível.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

const SUPERFRETE_BASE = process.env.SUPERFRETE_API_BASE || "https://api.superfrete.com/api/v0"
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:665a19359d272dc4007a533fa4e2b9e6@localhost:5432/medusa_db"

const LABELS_PEDIDOS_DIR = path.resolve(process.cwd(), "static", "labels", "pedidos")

function parseDbUrl(url: string) {
  const m = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/)
  if (!m) return null
  return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4]), database: m[5] }
}

let pgPool: any = null
function getPool() {
  if (pgPool) return pgPool
  const pg = require("pg")
  const cfg = parseDbUrl(DATABASE_URL)
  if (!cfg) throw new Error("Invalid DATABASE_URL")
  pgPool = new pg.Pool({ ...cfg, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })
  return pgPool
}

function getTokenFromRequest(req: MedusaRequest): string | null {
  const h = req.headers.authorization || ""
  return h.startsWith("Bearer ") ? h.slice(7) : null
}
function getSuperfreteToken(): string | null {
  return process.env.SUPERFRETE_TOKEN || null
}
function sha256Short(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16)
}
function safeFileName(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
}

async function sfPrint(sfId: string): Promise<string | null> {
  const token = getSuperfreteToken()
  if (!token) return null
  try {
    const r = await fetch(`${SUPERFRETE_BASE}/tag/print`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ orders: [sfId] }),
      signal: AbortSignal.timeout(20000),
    })
    const data = await r.json().catch(() => ({}))
    return data?.url || null
  } catch {
    return null
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const token = getTokenFromRequest(req)
  if (!token) return res.status(401).json({ error: "Token obrigatorio" })

  const orderId = (req.query?.order_id || "") as string
  const displayId = Number(req.query?.display_id || 0)
  if (!orderId && !displayId) return res.status(400).json({ error: "order_id ou display_id obrigatório" })

  try {
    const pool = getPool()
    let q
    if (orderId) {
      q = await pool.query(
        `SELECT o.id, o.display_id, o.metadata, oa.first_name, oa.last_name, oa.postal_code
           FROM "order" o
           LEFT JOIN order_address oa ON oa.id = o.shipping_address_id
          WHERE o.id = $1`,
        [orderId]
      )
    } else {
      q = await pool.query(
        `SELECT o.id, o.display_id, o.metadata, oa.first_name, oa.last_name, oa.postal_code
           FROM "order" o
           LEFT JOIN order_address oa ON oa.id = o.shipping_address_id
          WHERE o.display_id = $1
          LIMIT 1`,
        [displayId]
      )
    }
    if (q.rows.length === 0) return res.status(404).json({ error: "Pedido não encontrado" })
    const o = q.rows[0]
    const meta = o.metadata || {}
    const sfId = meta.superfrete_id || meta.sf_id || meta.shipping?.superfrete_id
    if (!sfId) return res.status(409).json({ error: "Pedido não tem etiqueta SuperFrete paga." })

    const custName = [o.first_name, o.last_name].filter(Boolean).join(" ") || meta.customer_name || ""
    const cepRaw = (o.postal_code || meta.shipping_cep || meta.cep || "").replace(/\D/g, "")
    const cep = cepRaw ? `${cepRaw.slice(0, 5)}-${cepRaw.slice(5, 8)}` : ""

    const ordHash = sha256Short(String(sfId))
    const nameSafe = safeFileName(custName)
    const tagDisp = o.display_id ? `pedido_${o.display_id}` : `pedido_${o.id.slice(-8)}`
    const fname = `${tagDisp}${nameSafe ? "_" + nameSafe : ""}_${ordHash}.pdf`
    const fpath = path.join(LABELS_PEDIDOS_DIR, fname)

    // Cache
    if (fs.existsSync(fpath)) {
      const stat = fs.statSync(fpath)
      console.log(`[LABELS INDIVIDUAL] cache HIT pedido #${o.display_id || o.id} (${Math.round(stat.size / 1024)} KB)`)
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Length", String(stat.size))
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`)
      res.setHeader("Cache-Control", "private, no-store")
      fs.createReadStream(fpath).pipe(res as any)
      return
    }

    console.log(`[LABELS INDIVIDUAL] cache MISS pedido #${o.display_id || o.id} → pedindo SF /tag/print`)
    const url = await sfPrint(String(sfId))
    if (!url) return res.status(502).json({ error: "Não foi possível obter o PDF da SuperFrete." })

    const dl = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!dl.ok) return res.status(502).json({ error: `Falha download SF (${dl.status})` })
    const bytes = await dl.arrayBuffer()

    // Carimba cabeçalho
    const src = await PDFDocument.load(bytes)
    const out = await PDFDocument.create()
    const helv = await out.embedFont(StandardFonts.Helvetica)
    const helvB = await out.embedFont(StandardFonts.HelveticaBold)
    const pages = await out.copyPages(src, src.getPageIndices())
    const prefix = o.display_id ? `Pedido #${o.display_id}` : `Pedido ${o.id.slice(-8)}`
    const rest = ` | ${custName || "—"}${cep ? " | CEP " + cep : ""}`
    for (const p of pages) {
      const { width, height } = p.getSize()
      const barH = 14
      const fs1 = 7.5
      p.drawRectangle({ x: 0, y: height - barH, width, height: barH, color: rgb(0.96, 0.96, 0.97), opacity: 0.92 })
      p.drawRectangle({ x: 0, y: height - barH, width, height: 0.5, color: rgb(0.85, 0.85, 0.87) })
      const wPref = helvB.widthOfTextAtSize(prefix, fs1)
      const wRest = helv.widthOfTextAtSize(rest, fs1)
      const startX = (width - (wPref + wRest)) / 2
      const ty = height - barH + 4
      p.drawText(prefix, { x: startX, y: ty, size: fs1, font: helvB, color: rgb(0.15, 0.15, 0.17) })
      p.drawText(rest, { x: startX + wPref, y: ty, size: fs1, font: helv, color: rgb(0.35, 0.35, 0.4) })
      out.addPage(p)
    }
    const outBytes = await out.save()

    if (!fs.existsSync(LABELS_PEDIDOS_DIR)) fs.mkdirSync(LABELS_PEDIDOS_DIR, { recursive: true })
    fs.writeFileSync(fpath, Buffer.from(outBytes))

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Length", String(outBytes.length))
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`)
    res.setHeader("Cache-Control", "private, no-store")
    res.end(Buffer.from(outBytes))
  } catch (err: any) {
    console.error("[LABELS INDIVIDUAL] erro:", err)
    return res.status(500).json({ error: err.message || "erro interno" })
  }
}
