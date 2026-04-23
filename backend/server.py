"""
Axiom Biomechanics — FastAPI backend.

Responsabilidades:
- Autenticação (cookies httpOnly, JWT).
- CRUD de profissionais (pros), pacientes, pedidos (orders) e faturas.
- Ponte HTTP segura (com token compartilhado) até o whatsapp-service rodando no servidor.
- Upload de imagens/fotos dos pacientes (armazenado no MongoDB via bucket binário).

Este backend NÃO deve ser hospedado no Vercel (usa conexão persistente com MongoDB
e se comunica com o whatsapp-service que é um processo de longa duração).
Recomendado: Railway, Render, Fly.io, ou próprio servidor (systemd/PM2/Docker).
"""
from dotenv import load_dotenv
load_dotenv()

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from routes import auth, admin, pro, orders, uploads

app = FastAPI(title="Axiom Biomechanics API", version="1.1.0")

# --- CORS ---
# Em produção, FRONTEND_URL deve ser a URL pública do Vercel (ex: https://palmilha.vercel.app).
# Vários origins podem ser passados separados por vírgula.
_raw_frontend = os.environ.get("FRONTEND_URL", "http://localhost:3000")
allowed_origins = [o.strip() for o in _raw_frontend.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)


@app.on_event("startup")
async def startup_db_client():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "axiom_db")
    if not mongo_url:
        raise RuntimeError("MONGO_URL não configurado.")
    app.mongodb_client = AsyncIOMotorClient(mongo_url)
    app.mongodb = app.mongodb_client[db_name]

    # Índices / Schema
    await app.mongodb.users.create_index("email", unique=True)
    await app.mongodb.login_attempts.create_index("identifier")
    await app.mongodb.patients.create_index([("pro_id", 1), ("name", 1)])
    await app.mongodb.orders.create_index([("pro_id", 1), ("created_at", -1)])
    await app.mongodb.orders.create_index("status")
    await app.mongodb.uploads.create_index([("owner_id", 1), ("created_at", -1)])
    await app.mongodb.whatsapp_logs.create_index([("created_at", -1)])
    await app.mongodb.whatsapp_logs.create_index("order_id")

    # Seed admin
    from auth_utils import seed_admin
    await seed_admin(app.mongodb)


@app.on_event("shutdown")
async def shutdown_db_client():
    app.mongodb_client.close()


# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(pro.router, prefix="/api/pro", tags=["Professional"])
app.include_router(orders.router, prefix="/api/orders", tags=["Orders"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["Uploads"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "axiom-backend", "version": app.version}


@app.get("/api/health/deep")
async def deep_health():
    """Check mongo + optional WhatsApp service status."""
    result = {"status": "ok", "mongo": False, "whatsapp_service": False}
    try:
        await app.mongodb.command("ping")
        result["mongo"] = True
    except Exception:
        result["status"] = "degraded"

    try:
        from services import whatsapp_client
        s = await whatsapp_client.get_status(timeout=2)
        if "error" not in s:
            result["whatsapp_service"] = True
        result["whatsapp_detail"] = s
    except Exception:
        pass
    return result
