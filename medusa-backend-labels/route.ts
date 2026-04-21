/**
 * ============================================================
 *  ADMIN LABELS ROUTE — sistema desacoplado de etiquetas
 * ============================================================
 *
 *  POST /admin/remessas/labels  body: { action, remessa_id }
 *    action = 'build'       → dispara geração em background (202 Accepted)
 *    action = 'status'      → retorna status/progresso do job
 *    action = 'invalidate'  → marca job como pending (força regeneração no próximo build)
 *
 *  GARANTIAS ABSOLUTAS:
 *   - NUNCA altera nada em "order", "payment" ou "remessa_orders".
 *   - Só lê remessas/remessa_orders e escreve em remessa_label_jobs.
 *   - Falhas de SuperFrete são registradas, o job vai para 'error', e
 *     o pedido continua exatamente como está.
 *   - Processamento assíncrono: a resposta HTTP volta em <100ms, o PDF
 *     é gerado em background no mesmo processo Medusa.
 *
 *  Escolhas de design:
 *   - Zero dependência externa de queue. Volume atual (dezenas/remessa)
 *     cabe perfeitamente num setImmediate + advisory lock do Postgres.
 *   - Para cada pedido chamamos /tag/print com 1 ID → garante 1-para-1
 *     entre pedido e arquivo da SuperFrete, eliminando o bug de páginas
 *     trocadas no carimbo.
 *   - Cache: hash ordenado dos superfrete_ids. Se a remessa não mudou,
 *     reuso o PDF existente em disco.
 *
 *  Logs: sempre prefixados com "[LABELS]" e escritos em linguagem humana.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"

// ---------------------------------------------------------------
// Config
// ---------------------------------------------------------------
const SUPERFRETE_BASE = process.env.SUPERFRETE_API_BASE || "https://api.superfrete.com/api/v0"
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:665a19359d272dc4007a533fa4e2b9e6@localhost:5432/medusa_db"

// Diretório de armazenamento dos PDFs gerados. Existe pelo menos desde Mar/29.
const LABELS_DIR = path.resolve(process.cwd(), "static", "labels")
const LABELS_PEDIDOS_DIR = path.join(LABELS_DIR, "pedidos")

// Delay entre chamadas à SuperFrete (mesma política da frente atual)
const SUPERFRETE_THROTTLE_MS = 1500

// ---------------------------------------------------------------
// pg Pool (compartilhado)
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// Util
// ---------------------------------------------------------------
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

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Sanitiza nome de arquivo (usado nos PDFs individuais p/ WhatsApp)
function safeFileName(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
}

async function superfretePost(p: string, body: any, timeoutMs = 20000): Promise<{ ok: boolean; status: number; data: any }> {
  const token = getSuperfreteToken()
  if (!token) return { ok: false, status: 500, data: { error: "SUPERFRETE_TOKEN nao configurado" } }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const r = await fetch(`${SUPERFRETE_BASE}${p}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "DenteDeTubarao (kaykep7@gmail.com)",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })
    clearTimeout(t)
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, data }
  } catch (err: any) {
    return { ok: false, status: 500, data: { error: err.message } }
  }
}

function humanLog(remessaCode: string, msg: string) {
  console.log(`[LABELS] ${remessaCode} :: ${msg}`)
}

// ---------------------------------------------------------------
// Coleta dos dados necessários da remessa.
// SOMENTE LEITURA em "order" / "remessa_orders".
// ---------------------------------------------------------------
type OrderSnapshot = {
  order_id: string
  display_id: number | null
  superfrete_id: string
  customer_name: string
  cep: string
}

async function loadRemessaSnapshot(remessaId: number): Promise<{
  remessa: { id: number; code: string; status: string } | null
  orders: OrderSnapshot[]
}> {
  const pool = getPool()
  const rq = await pool.query(`SELECT id, code, status FROM remessas WHERE id = $1`, [remessaId])
  if (rq.rows.length === 0) return { remessa: null, orders: [] }
  const remessa = rq.rows[0]

  // Buscar os order_ids associados à remessa
  const roQ = await pool.query(
    `SELECT order_id, order_display_id FROM remessa_orders WHERE remessa_id = $1 ORDER BY added_at ASC`,
    [remessaId]
  )
  if (roQ.rows.length === 0) return { remessa, orders: [] }

  // Para cada pedido pegar os metadados da SuperFrete
  // Medusa 2.x: a tabela "order" pode ter colunas extras em metadata JSON.
  // Usamos um SELECT com JOIN em "order" e "customer" / "order_address" para
  // extrair customer_name + cep. Se a coluna não existir no schema, tratamos
  // como null — o carimbo vira só "Pedido #xxx".
  const orderIds = roQ.rows.map((r: any) => r.order_id)
  let orderRows: any[] = []
  try {
    const q = await pool.query(
      `SELECT o.id, o.display_id, o.metadata, oa.first_name, oa.last_name, oa.postal_code
         FROM "order" o
         LEFT JOIN order_shipping os ON os.order_id = o.id AND os.deleted_at IS NULL
         LEFT JOIN order_address oa ON oa.id = o.shipping_address_id
        WHERE o.id = ANY($1)`,
      [orderIds]
    )
    orderRows = q.rows
  } catch (err: any) {
    // Se o JOIN falhar por diferença de schema, faz fallback mais simples
    console.warn(`[LABELS] Fallback SELECT em "order" (join falhou): ${err.message}`)
    const q = await pool.query(`SELECT id, display_id, metadata FROM "order" WHERE id = ANY($1)`, [orderIds])
    orderRows = q.rows
  }

  const byId = new Map<string, any>()
  for (const r of orderRows) byId.set(r.id, r)

  const orders: OrderSnapshot[] = []
  for (const ro of roQ.rows) {
    const o = byId.get(ro.order_id)
    if (!o) continue
    const meta = o.metadata || {}
    const superfrete_id =
      meta.superfrete_id ||
      meta.sf_id ||
      meta.shipping?.superfrete_id ||
      null
    if (!superfrete_id) continue
    const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || meta.customer_name || ""
    const cep = (o.postal_code || meta.shipping_cep || meta.cep || "").replace(/\D/g, "")
    orders.push({
      order_id: o.id,
      display_id: o.display_id ?? ro.order_display_id ?? null,
      superfrete_id: String(superfrete_id),
      customer_name: String(name || "—"),
      cep: cep ? `${cep.slice(0, 5)}-${cep.slice(5, 8)}` : "",
    })
  }
  return { remessa, orders }
}

// ---------------------------------------------------------------
// Upsert do job
// ---------------------------------------------------------------
async function upsertJob(remessaId: number, patch: Record<string, any>): Promise<void> {
  const pool = getPool()
  const cols = Object.keys(patch)
  if (cols.length === 0) return
  // INSERT primeiro (ON CONFLICT DO UPDATE)
  const setClauses = cols.map((c, i) => `${c} = $${i + 2}`).join(", ")
  const values = cols.map((c) => patch[c])
  await pool.query(
    `INSERT INTO remessa_label_jobs (remessa_id, ${cols.join(", ")}, updated_at)
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, NOW())
     ON CONFLICT (remessa_id) DO UPDATE SET ${setClauses}, updated_at = NOW()`,
    [remessaId, ...values]
  )
}

async function getJob(remessaId: number) {
  const pool = getPool()
  const r = await pool.query(`SELECT * FROM remessa_label_jobs WHERE remessa_id = $1`, [remessaId])
  return r.rows[0] || null
}

// ---------------------------------------------------------------
// Processador (fire-and-forget)
// ---------------------------------------------------------------
// Guarda em memória quais remessas já estão sendo processadas neste worker,
// evitando duplicar trabalho enquanto o lock do Postgres não é pego.
const inFlight = new Set<number>()

async function processLabelJob(remessaId: number): Promise<void> {
  if (inFlight.has(remessaId)) {
    console.log(`[LABELS] Remessa ${remessaId} já está em processamento — ignorando duplicata.`)
    return
  }
  inFlight.add(remessaId)

  const pool = getPool()
  // Advisory lock nonblocking — garante 1 processamento por vez por remessa
  // (proteção contra race mesmo em múltiplas instâncias).
  const lockKey = 0x4c41_0000 | remessaId // "LA" prefix + remessa_id
  const gotLockQ = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey])
  if (!gotLockQ.rows[0].got) {
    console.log(`[LABELS] Remessa ${remessaId} já bloqueada por outro worker — saindo.`)
    inFlight.delete(remessaId)
    return
  }

  try {
    const { remessa, orders } = await loadRemessaSnapshot(remessaId)
    if (!remessa) {
      humanLog(`R-?(${remessaId})`, `Remessa não existe mais. Abortando.`)
      await upsertJob(remessaId, { status: "error", error_message: "Remessa não encontrada", finished_at: new Date() })
      return
    }
    if (orders.length === 0) {
      humanLog(remessa.code, `Nenhum pedido com superfrete_id nesta remessa. Nada a gerar.`)
      await upsertJob(remessaId, {
        status: "error",
        error_message: "Nenhum pedido com etiqueta paga encontrado.",
        progress_total: 0, progress_current: 0,
        finished_at: new Date(),
      })
      return
    }

    const sfIdsSorted = orders.map((o) => o.superfrete_id).sort()
    const ordersHash = sha256Short(sfIdsSorted.join("|"))
    const outPath = path.join(LABELS_DIR, `remessa_${remessaId}_${ordersHash}.pdf`)

    // Cache: se já existe ready + hash igual + arquivo presente, reusa.
    const existing = await getJob(remessaId)
    if (
      existing &&
      existing.status === "ready" &&
      existing.order_ids_hash === ordersHash &&
      existing.pdf_path &&
      fs.existsSync(existing.pdf_path)
    ) {
      humanLog(remessa.code, `Cache HIT — PDF já existe em ${existing.pdf_path}. Nada a fazer.`)
      return
    }

    ensureDir(LABELS_DIR)
    ensureDir(LABELS_PEDIDOS_DIR)

    humanLog(remessa.code, `Iniciando geração: ${orders.length} pedidos. Arquivo destino: ${path.basename(outPath)}`)
    await upsertJob(remessaId, {
      status: "building",
      order_ids_hash: ordersHash,
      progress_total: orders.length,
      progress_current: 0,
      pdf_path: null,
      pdf_size_bytes: null,
      page_count: null,
      error_message: null,
      started_at: new Date(),
      finished_at: null,
    })

    // Monta PDF final consolidando um pedido por vez.
    const finalDoc = await PDFDocument.create()
    const helv = await finalDoc.embedFont(StandardFonts.Helvetica)
    const helvB = await finalDoc.embedFont(StandardFonts.HelveticaBold)

    let processed = 0
    let errors: { order_id: string; sf_id: string; reason: string }[] = []
    let totalPages = 0

    for (const ord of orders) {
      humanLog(
        remessa.code,
        `Baixando etiqueta do pedido #${ord.display_id ?? ord.order_id} (SF: ${ord.superfrete_id}) — ${processed + 1}/${orders.length}`
      )
      // 1 pedido por chamada → garante 1-para-1
      const r = await superfretePost("/tag/print", { orders: [ord.superfrete_id] })
      if (!r.ok || !r.data?.url) {
        const reason = r.data?.message || r.data?.error || `HTTP ${r.status}`
        humanLog(remessa.code, `FALHA no pedido #${ord.display_id ?? ord.order_id}: ${reason}. Pedido NÃO foi alterado.`)
        errors.push({ order_id: ord.order_id, sf_id: ord.superfrete_id, reason })
        processed++
        await upsertJob(remessaId, { progress_current: processed })
        await new Promise((res) => setTimeout(res, SUPERFRETE_THROTTLE_MS))
        continue
      }
      try {
        const dl = await fetch(r.data.url, { signal: AbortSignal.timeout(30000) })
        if (!dl.ok) throw new Error(`download HTTP ${dl.status}`)
        const bytes = await dl.arrayBuffer()
        const sub = await PDFDocument.load(bytes)
        const pages = await finalDoc.copyPages(sub, sub.getPageIndices())

        // Carimba o cabeçalho em cada página do pedido
        const header = ord.display_id
          ? `Pedido #${ord.display_id} | ${ord.customer_name}${ord.cep ? " | CEP " + ord.cep : ""}`
          : `Pedido ${ord.order_id.slice(-8)} | ${ord.customer_name}${ord.cep ? " | CEP " + ord.cep : ""}`

        const prefix = ord.display_id ? `Pedido #${ord.display_id}` : `Pedido ${ord.order_id.slice(-8)}`
        const rest = ` | ${ord.customer_name}${ord.cep ? " | CEP " + ord.cep : ""}`

        for (const p of pages) {
          const { width, height } = p.getSize()
          const barH = 14
          const fs1 = 7.5
          p.drawRectangle({
            x: 0, y: height - barH, width, height: barH,
            color: rgb(0.96, 0.96, 0.97), opacity: 0.92,
          })
          p.drawRectangle({
            x: 0, y: height - barH, width, height: 0.5,
            color: rgb(0.85, 0.85, 0.87),
          })
          const wPref = helvB.widthOfTextAtSize(prefix, fs1)
          const wRest = helv.widthOfTextAtSize(rest, fs1)
          const startX = (width - (wPref + wRest)) / 2
          const ty = height - barH + 4
          p.drawText(prefix, { x: startX, y: ty, size: fs1, font: helvB, color: rgb(0.15, 0.15, 0.17) })
          p.drawText(rest, { x: startX + wPref, y: ty, size: fs1, font: helv, color: rgb(0.35, 0.35, 0.4) })
          finalDoc.addPage(p)
        }
        totalPages += pages.length

        // Salvar também uma cópia individual por pedido (prep p/ WhatsApp)
        try {
          const perOrder = await PDFDocument.create()
          const ppg = await perOrder.copyPages(sub, sub.getPageIndices())
          ppg.forEach((pg) => perOrder.addPage(pg))
          const perBytes = await perOrder.save()
          const ordHash = sha256Short(ord.superfrete_id)
          const nameSafe = safeFileName(ord.customer_name)
          const tagDisp = ord.display_id ? `pedido_${ord.display_id}` : `pedido_${ord.order_id.slice(-8)}`
          const perName = `${tagDisp}${nameSafe ? "_" + nameSafe : ""}_${ordHash}.pdf`
          fs.writeFileSync(path.join(LABELS_PEDIDOS_DIR, perName), Buffer.from(perBytes))
        } catch (perErr: any) {
          // Não é fatal — só loga
          humanLog(remessa.code, `Aviso: não salvou cópia individual do pedido ${ord.order_id}: ${perErr.message}`)
        }

        humanLog(remessa.code, `Pedido ${processed + 1}/${orders.length} OK (${pages.length} páginas).`)
      } catch (dlErr: any) {
        humanLog(remessa.code, `FALHA ao baixar/ler PDF do pedido ${ord.order_id}: ${dlErr.message}`)
        errors.push({ order_id: ord.order_id, sf_id: ord.superfrete_id, reason: dlErr.message })
      }
      processed++
      await upsertJob(remessaId, { progress_current: processed })
      // Throttle entre chamadas
      if (processed < orders.length) {
        await new Promise((res) => setTimeout(res, SUPERFRETE_THROTTLE_MS))
      }
    }

    if (finalDoc.getPageCount() === 0) {
      const msg = `Nenhuma etiqueta pôde ser obtida. Erros: ${errors.map(e => `${e.order_id}:${e.reason}`).join(" | ")}`
      humanLog(remessa.code, msg)
      await upsertJob(remessaId, {
        status: "error",
        error_message: msg.slice(0, 2000),
        finished_at: new Date(),
      })
      return
    }

    const finalBytes = await finalDoc.save()
    fs.writeFileSync(outPath, Buffer.from(finalBytes))
    const sizeKB = Math.round(finalBytes.length / 1024)

    humanLog(
      remessa.code,
      `Geração concluída. ${orders.length - errors.length}/${orders.length} pedidos, ${totalPages} páginas, ${sizeKB} KB, salvo em ${outPath}`
    )

    await upsertJob(remessaId, {
      status: "ready",
      pdf_path: outPath,
      pdf_size_bytes: finalBytes.length,
      page_count: totalPages,
      error_message: errors.length
        ? `Parcial: ${errors.length} de ${orders.length} pedidos falharam. Primeiros erros: ${errors.slice(0, 3).map(e => e.reason).join("; ")}`
        : null,
      finished_at: new Date(),
    })
  } catch (fatal: any) {
    console.error(`[LABELS] FATAL ao processar remessa ${remessaId}:`, fatal)
    try {
      await upsertJob(remessaId, {
        status: "error",
        error_message: String(fatal.message || fatal).slice(0, 2000),
        finished_at: new Date(),
      })
    } catch (_) {}
  } finally {
    try {
      await pool.query("SELECT pg_advisory_unlock($1)", [lockKey])
    } catch (_) {}
    inFlight.delete(remessaId)
  }
}

// ---------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const token = getTokenFromRequest(req)
    if (!token) return res.status(401).json({ error: "Token obrigatorio" })

    const { action, remessa_id } = req.body as any
    const remessaId = Number(remessa_id)
    if (!action) return res.status(400).json({ error: "action obrigatório" })
    if (!remessaId || isNaN(remessaId)) return res.status(400).json({ error: "remessa_id inválido" })

    // -------- STATUS --------
    if (action === "status") {
      const job = await getJob(remessaId)
      if (!job) {
        return res.json({
          success: true,
          status: "pending",
          progress_current: 0,
          progress_total: 0,
          ready: false,
          error: null,
          message: "Ainda não iniciado",
        })
      }
      return res.json({
        success: true,
        status: job.status,
        progress_current: job.progress_current || 0,
        progress_total: job.progress_total || 0,
        ready: job.status === "ready",
        error: job.error_message || null,
        page_count: job.page_count,
        size_bytes: job.pdf_size_bytes,
        started_at: job.started_at,
        finished_at: job.finished_at,
        updated_at: job.updated_at,
        message: humanMessage(job),
      })
    }

    // -------- INVALIDATE --------
    if (action === "invalidate") {
      const job = await getJob(remessaId)
      if (!job) return res.json({ success: true, invalidated: false, message: "Nenhum PDF para invalidar." })
      await upsertJob(remessaId, {
        status: "pending",
        error_message: null,
        progress_current: 0,
      })
      humanLog(`R?(${remessaId})`, `Cache invalidado manualmente.`)
      return res.json({ success: true, invalidated: true, message: "Cache invalidado. Próximo build regenerará o PDF." })
    }

    // -------- BUILD --------
    if (action === "build") {
      const { remessa } = await loadRemessaSnapshot(remessaId)
      if (!remessa) return res.status(404).json({ error: "Remessa não encontrada" })

      // Marcar como pending/building, responder rápido, processar depois
      const existing = await getJob(remessaId)
      if (existing && existing.status === "building") {
        return res.status(202).json({
          success: true,
          accepted: true,
          already_running: true,
          status: existing.status,
          progress_current: existing.progress_current,
          progress_total: existing.progress_total,
          message: `Já está gerando (${existing.progress_current}/${existing.progress_total}).`,
        })
      }
      humanLog(remessa.code, `Requisição de build recebida. Despachando para background…`)
      // fire-and-forget
      setImmediate(() => {
        processLabelJob(remessaId).catch((e) => {
          console.error(`[LABELS] processLabelJob crashou para remessa ${remessaId}:`, e)
        })
      })
      return res.status(202).json({
        success: true,
        accepted: true,
        already_running: false,
        message: "Geração iniciada em background. Consulte action='status' para progresso.",
      })
    }

    return res.status(400).json({ error: `Ação desconhecida: ${action}` })
  } catch (err: any) {
    console.error("[LABELS POST] Erro:", err)
    return res.status(500).json({ error: err.message || "erro interno" })
  }
}

function humanMessage(job: any): string {
  if (!job) return "Ainda não iniciado"
  if (job.status === "pending") return "Aguardando iniciar"
  if (job.status === "building") {
    const cur = job.progress_current || 0
    const tot = job.progress_total || 0
    return tot > 0 ? `Gerando etiqueta ${cur} de ${tot}…` : "Iniciando geração…"
  }
  if (job.status === "ready") {
    const kb = job.pdf_size_bytes ? Math.round(job.pdf_size_bytes / 1024) : null
    const parts: string[] = [`Pronto para baixar`]
    if (job.page_count) parts.push(`${job.page_count} páginas`)
    if (kb) parts.push(`${kb} KB`)
    const extra = job.error_message ? ` — ATENÇÃO: ${job.error_message}` : ""
    return parts.join(" · ") + extra
  }
  if (job.status === "error") return `Erro: ${job.error_message || "desconhecido"}`
  return `status: ${job.status}`
}
