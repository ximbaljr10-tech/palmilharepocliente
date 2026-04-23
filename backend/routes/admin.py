from fastapi import APIRouter, Request, Depends
from pydantic import BaseModel

from auth_utils import get_admin_user
from services import whatsapp_client

router = APIRouter()


class SettingsUpdate(BaseModel):
    mp_access_token: str | None = None
    smtp_host: str | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_port: int | None = None
    admin_phone: str | None = None  # número do admin que recebe notificações


@router.get("/dashboard")
async def admin_dashboard(request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    pro_count = await db.users.count_documents({"role": "professional"})
    order_count = await db.orders.count_documents({})
    orders = await db.orders.find({}).sort("created_at", -1).to_list(10)
    for o in orders:
        o["_id"] = str(o["_id"])
        if "pro_id" in o:
            o["pro_id"] = str(o["pro_id"])
    return {
        "pro_count": pro_count,
        "order_count": order_count,
        "recent_orders": orders,
    }


@router.get("/professionals")
async def get_professionals(request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    pros = await db.users.find(
        {"role": "professional"}, {"password_hash": 0}
    ).sort("created_at", -1).to_list(500)
    from datetime import datetime
    for p in pros:
        p["_id"] = str(p["_id"])
        if isinstance(p.get("created_at"), datetime):
            p["created_at"] = p["created_at"].isoformat()
    return pros


@router.get("/settings")
async def get_settings(request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    settings = await db.settings.find_one({"_id": "global_config"}) or {}
    settings.pop("_id", None)
    if settings.get("smtp_password"):
        settings["smtp_password"] = "********"
    if settings.get("mp_access_token"):
        token = settings["mp_access_token"]
        settings["mp_access_token"] = (
            token[:10] + "..." if len(token) > 10 else "********"
        )
    return settings


@router.post("/settings")
async def update_settings(
    req: SettingsUpdate, request: Request, admin=Depends(get_admin_user)
):
    db = request.app.mongodb
    update_doc = {
        k: v for k, v in req.dict().items() if v is not None and v != "********"
    }
    await db.settings.update_one(
        {"_id": "global_config"}, {"$set": update_doc}, upsert=True
    )
    return {"status": "ok"}


# ---------- WhatsApp bridge (proxy até o serviço no servidor) ----------
@router.get("/whatsapp/status")
async def wa_status(admin=Depends(get_admin_user)):
    return await whatsapp_client.get_status()


@router.get("/whatsapp/qr")
async def wa_qr(admin=Depends(get_admin_user)):
    return await whatsapp_client.get_qr()


@router.post("/whatsapp/connect")
async def wa_connect(admin=Depends(get_admin_user)):
    try:
        return await whatsapp_client.connect()
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/whatsapp/disconnect")
async def wa_disconnect(admin=Depends(get_admin_user)):
    try:
        return await whatsapp_client.disconnect()
    except Exception as e:
        return {"success": False, "error": str(e)}


class TestSendPayload(BaseModel):
    phone: str
    message: str


@router.post("/whatsapp/test-send")
async def wa_test_send(
    payload: TestSendPayload, request: Request, admin=Depends(get_admin_user)
):
    """Envia uma mensagem de teste; útil para validar conexão."""
    try:
        res = await whatsapp_client.send_text(payload.phone, payload.message)
        await request.app.mongodb.whatsapp_logs.insert_one(
            {
                "type": "test",
                "phone": payload.phone,
                "message": payload.message,
                "result": "sent",
                "provider_response": res,
                "created_at": __import__("datetime").datetime.utcnow(),
            }
        )
        return {"success": True, "result": res}
    except Exception as e:
        await request.app.mongodb.whatsapp_logs.insert_one(
            {
                "type": "test",
                "phone": payload.phone,
                "message": payload.message,
                "result": "error",
                "error": str(e),
                "created_at": __import__("datetime").datetime.utcnow(),
            }
        )
        return {"success": False, "error": str(e)}
