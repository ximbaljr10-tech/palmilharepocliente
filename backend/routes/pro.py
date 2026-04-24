from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from auth_utils import get_current_user
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter()


class PatientCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    age: Optional[int] = Field(None, ge=0, le=130)
    email: Optional[str] = None
    phone: Optional[str] = None
    cpf: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    weight: Optional[str] = None
    height: Optional[str] = None
    pathology: Optional[str] = None
    activity_level: Optional[str] = None
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    cpf: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    weight: Optional[str] = None
    height: Optional[str] = None
    pathology: Optional[str] = None
    activity_level: Optional[str] = None
    notes: Optional[str] = None


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
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        try:
            pat = await db.patients.find_one({"_id": ObjectId(r["patient_id"])})
        except Exception:
            pat = None
        r["patient_name"] = pat.get("name") if pat else "Desconhecido"
        r["can_bill"] = bool(pat and pat.get("cpf"))

    # pacientes recentes (últimos 5)
    recent_patients = (
        await db.patients.find({"pro_id": user["_id"]})
        .sort("created_at", -1)
        .to_list(5)
    )
    for p in recent_patients:
        p["_id"] = str(p["_id"])
        if isinstance(p.get("created_at"), datetime):
            p["created_at"] = p["created_at"].isoformat()

    return {
        "patients_count": patients,
        "orders_count": orders,
        "recent_orders": recent,
        "recent_patients": recent_patients,
    }


@router.get("/patients")
async def get_patients(request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    patients = await db.patients.find({"pro_id": user["_id"]}).sort("created_at", -1).to_list(500)
    for p in patients:
        p["_id"] = str(p["_id"])
        if isinstance(p.get("created_at"), datetime):
            p["created_at"] = p["created_at"].isoformat()
    return patients


@router.post("/patients")
async def create_patient(
    req: PatientCreate, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    doc = req.model_dump()
    doc["pro_id"] = user["_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    doc["uploads"] = []
    res = await db.patients.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


@router.put("/patients/{patient_id}")
async def update_patient(
    patient_id: str,
    req: PatientUpdate,
    request: Request,
    user=Depends(get_current_user),
):
    db = request.app.mongodb
    update_doc = {k: v for k, v in req.model_dump().items() if v is not None}
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
    if isinstance(pat.get("created_at"), datetime):
        pat["created_at"] = pat["created_at"].isoformat()

    # orders vinculados
    orders = await db.orders.find({"pro_id": user["_id"], "patient_id": patient_id}).sort(
        "created_at", -1
    ).to_list(200)
    for o in orders:
        o["_id"] = str(o["_id"])
        if isinstance(o.get("created_at"), datetime):
            o["created_at"] = o["created_at"].isoformat()
    pat["orders"] = orders
    return pat


@router.delete("/patients/{patient_id}")
async def delete_patient(
    patient_id: str, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    try:
        oid = ObjectId(patient_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    res = await db.patients.delete_one({"_id": oid, "pro_id": user["_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return {"status": "ok"}
