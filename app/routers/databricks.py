from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models.databricks import DatabricksConfig, DatabricksJobRun
from app.schemas.databricks import (
    DatabricksConfigCreate,
    DatabricksConfigResponse,
    DatabricksTriggerRequest,
    DatabricksValidateRequest,
    DatabricksValidateResponse,
    DatabricksJobRunResponse,
)
from app.services import databricks_service

router = APIRouter(prefix="/api/databricks", tags=["databricks"])


def _config_to_response(config: DatabricksConfig) -> DatabricksConfigResponse:
    return DatabricksConfigResponse(
        id=config.id,
        instance_id=config.instance_id,
        workspace_url=config.workspace_url,
        api_token_masked=databricks_service.mask_token(config.api_token),
        job_id=config.job_id,
        trigger_keyword=config.trigger_keyword,
        active=config.active,
        param_catalog=config.param_catalog or "nazaria_dev",
        param_schema_name=config.param_schema_name or "nazaria_gold",
        param_modo=config.param_modo or "cliente",
        param_output_path=config.param_output_path or "/dbfs/FileStore/relatorios/",
        client_code_regex=config.client_code_regex or r"\d+",
        client_code_min_length=config.client_code_min_length,
        client_code_max_length=config.client_code_max_length,
        send_error_reply=config.send_error_reply if config.send_error_reply is not None else True,
        reply_example=config.reply_example,
    )


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@router.get("/config", response_model=Optional[DatabricksConfigResponse])
def get_config(db: Session = Depends(get_db)):
    config = databricks_service.get_config(db)
    return _config_to_response(config) if config else None


@router.post("/config", response_model=DatabricksConfigResponse)
def save_config(data: DatabricksConfigCreate, db: Session = Depends(get_db)):
    config = databricks_service.save_config(db, data.model_dump())
    return _config_to_response(config)


# ---------------------------------------------------------------------------
# Validate (preview — no trigger)
# ---------------------------------------------------------------------------

@router.post("/validate", response_model=DatabricksValidateResponse)
def validate_message(body: DatabricksValidateRequest, db: Session = Depends(get_db)):
    config = databricks_service.get_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="Nenhuma configuração Databricks encontrada")
    result = databricks_service.preview_validation(body.message, config)
    return DatabricksValidateResponse(**result)


# ---------------------------------------------------------------------------
# Manual trigger (simulate WhatsApp message)
# ---------------------------------------------------------------------------

@router.post("/trigger", response_model=DatabricksJobRunResponse)
def manual_trigger(body: DatabricksTriggerRequest, db: Session = Depends(get_db)):
    config = databricks_service.get_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="Nenhuma configuração Databricks encontrada")

    result = databricks_service.preview_validation(body.message, config)

    if not result["keyword_found"]:
        raise HTTPException(
            status_code=422,
            detail=f"A mensagem não contém a keyword '{config.trigger_keyword}'",
        )

    if not result["is_valid"]:
        raise HTTPException(
            status_code=422,
            detail=result["error_reason"] or "Dados inválidos na mensagem",
        )

    try:
        run = databricks_service.trigger_job_sync(
            db=db,
            config_id=config.id,
            triggered_by_phone=body.phone or "manual",
            triggered_by_message=body.message,
            source="manual",
            notebook_params=result["notebook_params"],
            extracted_codigo_cliente=result["codigo_cliente"],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao acionar job: {e}")

    return run


# ---------------------------------------------------------------------------
# Runs history
# ---------------------------------------------------------------------------

@router.get("/runs", response_model=List[DatabricksJobRunResponse])
def list_runs(limit: int = 50, db: Session = Depends(get_db)):
    runs = (
        db.query(DatabricksJobRun)
        .order_by(DatabricksJobRun.started_at.desc())
        .limit(limit)
        .all()
    )
    return runs


@router.post("/runs/{run_id}/refresh", response_model=DatabricksJobRunResponse)
def refresh_run(run_id: int, db: Session = Depends(get_db)):
    run = databricks_service.refresh_run_status(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Execução não encontrada")
    return run
