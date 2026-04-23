from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel, Field
from auth_utils import get_current_user
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter()


class PatientCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    email: str | None = None
    phone: str | None = None
    cpf: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None


class PatientUpdate(BaseModel):
    cpf: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    email: str | None = None
    phone: str | None = None


@router.get("/dashboard")
async def pro_dashboard(request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    patients = await db.patients.count_documents({"pro_id": user["_id"]})
    orders = await db.orders.count_documents({"pro_id": user["_id"]})
    recent = (
        await db.orders.find({"pro_id": user["_id"]})
        .sort("created_at", -1)
        .to_list(10)
    )

    for r in recent:
        r["_id"] = str(r["_id"])
        try:
            pat = await db.patients.find_one({"_id": ObjectId(r["patient_id"])})
        except Exception:
            pat = None
        r["patient_name"] = pat.get("name") if pat else "Desconhecido"
        r["can_bill"] = bool(pat and pat.get("cpf"))

    return {
        "patients_count": patients,
        "orders_count": orders,
        "recent_orders": recent,
    }


@router.get("/patients")
async def get_patients(request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    patients = await db.patients.find({"pro_id": user["_id"]}).to_list(500)
    for p in patients:
        p["_id"] = str(p["_id"])
    return patients


@router.post("/patients")
async def create_patient(
    req: PatientCreate, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    doc = req.dict()
    doc["pro_id"] = user["_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    doc["uploads"] = []
    res = await db.patients.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    return doc


@router.put("/patients/{patient_id}")
async def update_patient(
    patient_id: str,
    req: PatientUpdate,
    request: Request,
    user=Depends(get_current_user),
):
    db = request.app.mongodb
    update_doc = {k: v for k, v in req.dict().items() if v is not None}
    if not update_doc:
        return {"status": "ok"}
    try:
        oid = ObjectId(patient_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")

    res = await db.patients.update_one(
        {"_id": oid, "pro_id": user["_id"]}, {"$set": update_doc}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return {"status": "ok"}


@router.get("/patients/{patient_id}")
async def get_patient(
    patient_id: str, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    try:
        oid = ObjectId(patient_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    pat = await db.patients.find_one({"_id": oid, "pro_id": user["_id"]})
    if not pat:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    pat["_id"] = str(pat["_id"])
    return pat
