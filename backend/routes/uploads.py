"""
Upload endpoints.

Estratégia:
- O frontend envia arquivos via multipart/form-data.
- O backend armazena metadados em `uploads` e o conteúdo binário no próprio
  documento (limite conservador de 8 MB/arquivo) ou poderia ser movido para
  um bucket externo (S3) no futuro sem mudar a API pública.
- Cada upload é vinculado ao usuário logado e, opcionalmente, a um paciente/pedido.
- A leitura é feita pelo endpoint /api/uploads/{id}/raw (protegido).

Isto é compatível com o frontend hospedado no Vercel: o browser faz upload
diretamente para o backend (FastAPI, em outro host) e recebe o ID. O backend
é quem serve os binários em leitura.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import (
    APIRouter,
    Request,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
)
from fastapi.responses import Response

from auth_utils import get_current_user

router = APIRouter()

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 8 * 1024 * 1024))  # 8 MB
ALLOWED_CT = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
}


@router.post("")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    patient_id: Optional[str] = Form(default=None),
    order_id: Optional[str] = Form(default=None),
    kind: Optional[str] = Form(default="photo"),
    user=Depends(get_current_user),
):
    db = request.app.mongodb

    # Validação de content-type
    if file.content_type not in ALLOWED_CT:
        raise HTTPException(
            status_code=415,
            detail=f"Tipo de arquivo não permitido: {file.content_type}",
        )

    # Leitura com limite de tamanho
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo excede o limite de {MAX_UPLOAD_BYTES // 1024 // 1024}MB",
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    # Valida patient/order
    if patient_id:
        try:
            pat = await db.patients.find_one(
                {"_id": ObjectId(patient_id), "pro_id": user["_id"]}
            )
        except Exception:
            pat = None
        if not pat:
            raise HTTPException(status_code=404, detail="Paciente não encontrado.")

    doc = {
        "owner_id": user["_id"],
        "filename": file.filename[:200] if file.filename else "upload",
        "content_type": file.content_type,
        "size": len(content),
        "kind": kind or "photo",
        "patient_id": patient_id,
        "order_id": order_id,
        "data": content,  # binário armazenado direto (simples, robusto, <8MB)
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.uploads.insert_one(doc)
    upload_id = str(res.inserted_id)

    # Se vinculado a paciente, guarda referência em patients.uploads
    if patient_id:
        await db.patients.update_one(
            {"_id": ObjectId(patient_id)},
            {"$addToSet": {"uploads": upload_id}},
        )

    return {
        "_id": upload_id,
        "filename": doc["filename"],
        "content_type": doc["content_type"],
        "size": doc["size"],
        "kind": doc["kind"],
    }


@router.get("/{upload_id}/raw")
async def get_raw(upload_id: str, request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    try:
        oid = ObjectId(upload_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido.")

    doc = await db.uploads.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    # Admins podem ler qualquer upload; profissionais só o próprio.
    if user.get("role") != "admin" and doc.get("owner_id") != user["_id"]:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    return Response(
        content=doc["data"],
        media_type=doc.get("content_type", "application/octet-stream"),
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": f'inline; filename="{doc.get("filename","file")}"',
        },
    )


@router.get("/{upload_id}")
async def get_meta(upload_id: str, request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    try:
        oid = ObjectId(upload_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido.")
    doc = await db.uploads.find_one({"_id": oid}, {"data": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    if user.get("role") != "admin" and doc.get("owner_id") != user["_id"]:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    doc["_id"] = str(doc["_id"])
    return doc


@router.delete("/{upload_id}")
async def delete_upload(
    upload_id: str, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    try:
        oid = ObjectId(upload_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido.")
    doc = await db.uploads.find_one({"_id": oid}, {"owner_id": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    if user.get("role") != "admin" and doc.get("owner_id") != user["_id"]:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    await db.uploads.delete_one({"_id": oid})
    return {"status": "deleted"}
