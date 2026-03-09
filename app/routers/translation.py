"""Endpoints para traducao em tempo real com LLM."""
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.models.conversation import Conversation
from app.services import translation_service

router = APIRouter(prefix="/api/translation", tags=["translation"])


class IncomingTranslateBody(BaseModel):
    texto_original: str
    idioma_destino: str = "Português do Brasil"
    idioma_destino_iso: str = "pt"
    conversation_id: Optional[int] = None


class OutgoingTranslateBody(BaseModel):
    texto_original: str
    idioma_origem: str = "Português do Brasil"
    idioma_destino: str


@router.post("/incoming")
def translate_incoming(body: IncomingTranslateBody, db: Session = Depends(get_db)):
    """Detecta idioma da mensagem do cliente e traduz para o idioma do atendente."""
    result = translation_service.detect_and_translate_incoming(
        texto_original=body.texto_original,
        idioma_destino=body.idioma_destino,
        idioma_destino_iso=body.idioma_destino_iso,
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Não foi possível traduzir a mensagem.")

    if body.conversation_id and result.get("idioma_detectado"):
        conv = db.query(Conversation).filter(Conversation.id == body.conversation_id).first()
        if conv and conv.client_language != result["idioma_detectado"]:
            conv.client_language = result["idioma_detectado"]
            db.commit()

    return result


@router.post("/outgoing")
def translate_outgoing(body: OutgoingTranslateBody):
    """Traduz a resposta do atendente para o idioma do cliente."""
    result = translation_service.translate_outgoing(
        texto_original=body.texto_original,
        idioma_origem=body.idioma_origem,
        idioma_destino=body.idioma_destino,
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Não foi possível traduzir a mensagem.")
    return result


@router.get("/idiomas")
def list_idiomas():
    """Lista codigos e nomes de idiomas suportados."""
    return {
        "idiomas": [
            {"codigo": k, "nome": v}
            for k, v in translation_service.IDIOMA_NOMES.items()
        ]
    }
