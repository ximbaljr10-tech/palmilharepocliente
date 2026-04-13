from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from auth_utils import get_admin_user
from bson import ObjectId

router = APIRouter()

class SettingsUpdate(BaseModel):
    mp_access_token: str = None
    smtp_host: str = None
    smtp_user: str = None
    smtp_password: str = None
    smtp_port: int = None
    wa_service_url: str = None

@router.get("/dashboard")
async def admin_dashboard(request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    pro_count = await db.users.count_documents({"role": "professional"})
    order_count = await db.orders.count_documents({})
    orders = await db.orders.find({}).sort("created_at", -1).to_list(10)
    for o in orders:
        o["_id"] = str(o["_id"])
        if "pro_id" in o: o["pro_id"] = str(o["pro_id"])
    return {
        "pro_count": pro_count,
        "order_count": order_count,
        "recent_orders": orders
    }

@router.get("/professionals")
async def get_professionals(request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    pros = await db.users.find({"role": "professional"}, {"password_hash": 0}).to_list(100)
    for p in pros:
        p["_id"] = str(p["_id"])
    return pros

@router.get("/settings")
async def get_settings(request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    settings = await db.settings.find_one({"_id": "global_config"})
    if not settings:
        return {}
    settings.pop("_id", None)
    # Mask passwords
    if settings.get("smtp_password"):
        settings["smtp_password"] = "********"
    if settings.get("mp_access_token"):
        token = settings["mp_access_token"]
        settings["mp_access_token"] = token[:10] + "..." if len(token) > 10 else "********"
    return settings

@router.post("/settings")
async def update_settings(req: SettingsUpdate, request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    update_doc = {k: v for k, v in req.dict().items() if v is not None and v != "********"}
    await db.settings.update_one({"_id": "global_config"}, {"$set": update_doc}, upsert=True)
    return {"status": "ok"}
