from dotenv import load_dotenv
load_dotenv()

import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
import sys
from routes import auth, admin, pro, orders

app = FastAPI(title="Axiom Biomechanics")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "axiom_db")
    app.mongodb_client = AsyncIOMotorClient(mongo_url)
    app.mongodb = app.mongodb_client[db_name]
    
    # Indexes
    await app.mongodb.users.create_index("email", unique=True)
    await app.mongodb.login_attempts.create_index("identifier")
    
    # Seed admin
    from auth_utils import seed_admin
    await seed_admin(app.mongodb)

@app.on_event("shutdown")
async def shutdown_db_client():
    app.mongodb_client.close()

# Include Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(pro.router, prefix="/api/pro", tags=["Professional"])
app.include_router(orders.router, prefix="/api/orders", tags=["Orders"])

@app.get("/api/health")
async def health():
    return {"status": "ok"}
