/**
 * GET /admin/remessas/labels/download?remessa_id=<id>
 *
 * Faz streaming do PDF consolidado da remessa. Autenticado (Bearer).
 *
 * GARANTIAS:
 *  - Não altera nenhum estado. É um simples read + stream.
 *  - Se o PDF ainda não está pronto, devolve 409 com mensagem clara.
 *  - Não expõe a URL assinada da SuperFrete em momento algum.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:665a19359d272dc4007a533fa4e2b9e6@localhost:5432/medusa_db"

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

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const token = getTokenFromRequest(req)
  if (!token) return res.status(401).json({ error: "Token obrigatorio" })

  const remessaIdRaw = (req.query?.remessa_id || "") as string
  const remessaId = Number(remessaIdRaw)
  if (!remessaId) return res.status(400).json({ error: "remessa_id obrigatório" })

  try {
    const pool = getPool()
    const jr = await pool.query(
      `SELECT j.status, j.pdf_path, j.pdf_size_bytes, j.page_count, j.error_message, r.code AS remessa_code
         FROM remessa_label_jobs j
         JOIN remessas r ON r.id = j.remessa_id
        WHERE j.remessa_id = $1`,
      [remessaId]
    )
    if (jr.rows.length === 0) {
      return res.status(404).json({ error: "Nenhum PDF foi gerado para esta remessa. Rode action='build' antes." })
    }
    const job = jr.rows[0]
    if (job.status !== "ready") {
      return res.status(409).json({
        error: `PDF ainda não está pronto. Status atual: ${job.status}.`,
        status: job.status,
        message: job.error_message || null,
      })
    }
    if (!job.pdf_path || !fs.existsSync(job.pdf_path)) {
      return res.status(410).json({
        error: "O arquivo foi gerado mas não está mais disponível em disco. Rode action='build' novamente.",
      })
    }

    const stat = fs.statSync(job.pdf_path)
    const fileName = `etiquetas_${job.remessa_code}.pdf`
    console.log(`[LABELS DOWNLOAD] ${job.remessa_code} :: servindo ${job.pdf_path} (${Math.round(stat.size / 1024)} KB)`)

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Length", String(stat.size))
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)
    res.setHeader("Cache-Control", "private, no-store")
    const stream = fs.createReadStream(job.pdf_path)
    stream.on("error", (err) => {
      console.error(`[LABELS DOWNLOAD] erro de stream:`, err)
      try {
        res.status(500).end()
      } catch {}
    })
    stream.pipe(res as any)
  } catch (err: any) {
    console.error("[LABELS DOWNLOAD] erro:", err)
    return res.status(500).json({ error: err.message || "erro interno" })
  }
}
