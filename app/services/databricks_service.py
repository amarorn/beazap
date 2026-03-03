import logging
import re
import threading
from datetime import datetime
from typing import Optional, Tuple
import urllib.request
import urllib.error
import json

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.databricks import DatabricksConfig, DatabricksJobRun
from app.models.instance import Instance

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def get_config(db: Session) -> Optional[DatabricksConfig]:
    return db.query(DatabricksConfig).filter(DatabricksConfig.active == True).first()


def save_config(db: Session, data: dict) -> DatabricksConfig:
    existing = db.query(DatabricksConfig).first()
    if existing:
        for key, value in data.items():
            if key == "api_token" and not value:
                continue  # empty token = keep existing
            setattr(existing, key, value)
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    config = DatabricksConfig(**data)
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def mask_token(token: str) -> str:
    if not token or len(token) < 8:
        return "****"
    return token[:4] + "****" + token[-4:]


# ---------------------------------------------------------------------------
# Keyword + client code extraction
# ---------------------------------------------------------------------------

def matches_keyword(text: Optional[str], keyword: str) -> bool:
    if not text or not keyword:
        return False
    return keyword.strip().lower() in text.strip().lower()


def extract_codigo_cliente(text: str, pattern: str = r"\d+") -> Optional[str]:
    """Return the first regex match in text, used for codigo_cliente."""
    try:
        match = re.search(pattern, text)
        return match.group(0) if match else None
    except re.error:
        match = re.search(r"\d+", text)
        return match.group(0) if match else None


def build_notebook_params(config: DatabricksConfig, codigo_cliente: Optional[str]) -> dict:
    return {
        "catalog": config.param_catalog or "nazaria_dev",
        "schema": config.param_schema_name or "nazaria_gold",
        "codigo_cliente": codigo_cliente or "",
        "modo": config.param_modo or "cliente",
        "codigo_rede": "",
        "output_path": config.param_output_path or "/dbfs/FileStore/relatorios/relatorio.pdf",
    }


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_params(codigo_cliente: Optional[str], config: DatabricksConfig) -> Tuple[bool, Optional[str]]:
    """
    Returns (is_valid, error_reason).
    error_reason is None when valid.
    """
    if not codigo_cliente:
        return False, "código do cliente não encontrado na mensagem"

    if config.client_code_min_length and len(codigo_cliente) < config.client_code_min_length:
        return False, (
            f"código do cliente inválido: *{codigo_cliente}* tem {len(codigo_cliente)} dígito(s), "
            f"mínimo esperado é {config.client_code_min_length}"
        )

    if config.client_code_max_length and len(codigo_cliente) > config.client_code_max_length:
        return False, (
            f"código do cliente inválido: *{codigo_cliente}* tem {len(codigo_cliente)} dígito(s), "
            f"máximo permitido é {config.client_code_max_length}"
        )

    return True, None


def build_error_reply(config: DatabricksConfig, error_reason: str) -> str:
    keyword = config.trigger_keyword or "gerar relatorio"
    example = config.reply_example or f"{keyword} 448427"
    return (
        f"❌ Não foi possível processar seu pedido.\n\n"
        f"*Problema:* {error_reason}.\n\n"
        f"*Como enviar corretamente:*\n"
        f"{keyword} [CÓDIGO DO CLIENTE]\n\n"
        f"*Exemplo:*\n"
        f"_{example}_"
    )


def preview_validation(message: str, config: DatabricksConfig) -> dict:
    """
    Used by the API to give the frontend a live validation preview.
    Returns a dict with keys: keyword_found, codigo_cliente, is_valid, error_reason, error_reply, notebook_params.
    """
    keyword_found = matches_keyword(message, config.trigger_keyword)
    codigo_cliente = extract_codigo_cliente(message, config.client_code_regex or r"\d+") if keyword_found else None
    is_valid, error_reason = validate_params(codigo_cliente, config) if keyword_found else (False, "keyword não encontrada")
    error_reply = build_error_reply(config, error_reason) if not is_valid and keyword_found else None
    notebook_params = build_notebook_params(config, codigo_cliente) if is_valid else None
    return {
        "keyword_found": keyword_found,
        "codigo_cliente": codigo_cliente,
        "is_valid": is_valid,
        "error_reason": error_reason,
        "error_reply": error_reply,
        "notebook_params": notebook_params,
    }


# ---------------------------------------------------------------------------
# Evolution API — send WhatsApp reply
# ---------------------------------------------------------------------------

def _send_evolution_message(api_url: str, api_key: str, instance_name: str, phone: str, text: str):
    """Send a text message via Evolution API."""
    url = f"{api_url.rstrip('/')}/message/sendText/{instance_name}"
    payload = json.dumps({
        "number": phone,
        "text": text,
        "delay": 500,
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"apikey": api_key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _do_send_error_reply(instance_id: int, phone: str, text: str):
    db = SessionLocal()
    try:
        instance = db.query(Instance).filter(Instance.id == instance_id).first()
        if not instance:
            logger.warning(f"Instance {instance_id} not found for error reply")
            return
        _send_evolution_message(instance.api_url, instance.api_key, instance.instance_name, phone, text)
        logger.info(f"Error reply sent to {phone}")
    except Exception as e:
        logger.error(f"Failed to send WhatsApp error reply to {phone}: {e}")
    finally:
        db.close()


def send_error_reply_async(instance_id: int, phone: str, text: str):
    """Send WhatsApp error reply in a background thread (non-blocking)."""
    t = threading.Thread(target=_do_send_error_reply, args=(instance_id, phone, text), daemon=True)
    t.start()


# ---------------------------------------------------------------------------
# Databricks REST API
# ---------------------------------------------------------------------------

def _call_databricks_run_now(
    workspace_url: str,
    api_token: str,
    job_id: str,
    notebook_params: Optional[dict] = None,
) -> dict:
    url = workspace_url.rstrip("/") + "/api/2.1/jobs/run-now"
    body: dict = {"job_id": int(job_id)}
    if notebook_params:
        body["notebook_params"] = notebook_params
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _get_databricks_run_status(workspace_url: str, api_token: str, run_id: str) -> dict:
    url = workspace_url.rstrip("/") + f"/api/2.1/jobs/runs/get?run_id={run_id}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {api_token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _databricks_state_to_status(state: dict) -> str:
    life = state.get("life_cycle_state", "")
    result = state.get("result_state", "")
    if life in ("PENDING", "WAITING_FOR_RETRY"):
        return "pending"
    if life == "RUNNING":
        return "running"
    if life == "TERMINATED":
        return "success" if result == "SUCCESS" else "failed"
    if life in ("SKIPPED", "INTERNAL_ERROR"):
        return "failed"
    return "running"


# ---------------------------------------------------------------------------
# Job trigger — sync (used by API endpoint) + async (used by webhook)
# ---------------------------------------------------------------------------

def _create_run_record(
    db: Session,
    config_id: int,
    triggered_by_phone: str,
    triggered_by_message: str,
    source: str,
    notebook_params: Optional[dict],
    extracted_codigo_cliente: Optional[str],
) -> DatabricksJobRun:
    run = DatabricksJobRun(
        config_id=config_id,
        triggered_by_phone=triggered_by_phone,
        triggered_by_message=triggered_by_message[:500] if triggered_by_message else None,
        trigger_source=source,
        status="pending",
        started_at=datetime.utcnow(),
        extracted_codigo_cliente=extracted_codigo_cliente,
        notebook_params_json=json.dumps(notebook_params) if notebook_params else None,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def trigger_job_sync(
    db: Session,
    config_id: int,
    triggered_by_phone: str,
    triggered_by_message: str,
    source: str = "manual",
    notebook_params: Optional[dict] = None,
    extracted_codigo_cliente: Optional[str] = None,
) -> DatabricksJobRun:
    """
    Synchronous trigger — blocks until Databricks responds.
    Raises exceptions so the API endpoint can return proper HTTP errors.
    """
    config = db.query(DatabricksConfig).filter(DatabricksConfig.id == config_id).first()
    if not config:
        raise ValueError(f"Config {config_id} não encontrada")

    run = _create_run_record(db, config_id, triggered_by_phone, triggered_by_message,
                             source, notebook_params, extracted_codigo_cliente)

    try:
        result = _call_databricks_run_now(
            config.workspace_url, config.api_token, config.job_id, notebook_params
        )
        run.databricks_run_id = str(result.get("run_id", ""))
        run.status = "running"
        logger.info(
            f"Databricks job triggered: run_id={run.databricks_run_id} "
            f"codigo_cliente={extracted_codigo_cliente}"
        )
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        run.status = "failed"
        run.error_message = f"HTTP {e.code}: {body[:300]}"
        run.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(run)
        raise RuntimeError(f"Databricks API error — HTTP {e.code}: {body[:300]}")
    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)[:300]
        run.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(run)
        raise

    db.commit()
    db.refresh(run)
    return run


def _do_trigger_async(
    config_id: int,
    triggered_by_phone: str,
    triggered_by_message: str,
    source: str,
    notebook_params: Optional[dict],
    extracted_codigo_cliente: Optional[str],
):
    """Background thread version — used by the WhatsApp webhook (fire-and-forget)."""
    db = SessionLocal()
    try:
        config = db.query(DatabricksConfig).filter(DatabricksConfig.id == config_id).first()
        if not config:
            logger.error(f"DatabricksConfig {config_id} not found")
            return

        run = _create_run_record(db, config_id, triggered_by_phone, triggered_by_message,
                                 source, notebook_params, extracted_codigo_cliente)

        try:
            result = _call_databricks_run_now(
                config.workspace_url, config.api_token, config.job_id, notebook_params
            )
            run.databricks_run_id = str(result.get("run_id", ""))
            run.status = "running"
            logger.info(
                f"Databricks job triggered (async): run_id={run.databricks_run_id} "
                f"codigo_cliente={extracted_codigo_cliente}"
            )
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            run.status = "failed"
            run.error_message = f"HTTP {e.code}: {body[:300]}"
            run.completed_at = datetime.utcnow()
            logger.error(f"Databricks API error: {run.error_message}")
        except Exception as e:
            run.status = "failed"
            run.error_message = str(e)[:300]
            run.completed_at = datetime.utcnow()
            logger.error(f"Databricks trigger error: {e}")

        db.commit()
    finally:
        db.close()


def trigger_job(
    config_id: int,
    triggered_by_phone: str,
    triggered_by_message: str,
    source: str = "whatsapp",
    notebook_params: Optional[dict] = None,
    extracted_codigo_cliente: Optional[str] = None,
):
    """Async trigger (fire-and-forget) — used by WhatsApp webhook."""
    t = threading.Thread(
        target=_do_trigger_async,
        args=(config_id, triggered_by_phone, triggered_by_message, source, notebook_params, extracted_codigo_cliente),
        daemon=True,
    )
    t.start()


# ---------------------------------------------------------------------------
# Refresh run status from Databricks
# ---------------------------------------------------------------------------

def refresh_run_status(db: Session, run_id: int) -> Optional[DatabricksJobRun]:
    run = db.query(DatabricksJobRun).filter(DatabricksJobRun.id == run_id).first()
    if not run or not run.databricks_run_id or not run.config_id:
        return run

    config = db.query(DatabricksConfig).filter(DatabricksConfig.id == run.config_id).first()
    if not config:
        return run

    try:
        data = _get_databricks_run_status(config.workspace_url, config.api_token, run.databricks_run_id)
        state = data.get("state", {})
        run.status = _databricks_state_to_status(state)
        if run.status in ("success", "failed") and not run.completed_at:
            run.completed_at = datetime.utcnow()
        if run.status == "failed":
            run.error_message = state.get("state_message", "")[:300] or run.error_message
        db.commit()
        db.refresh(run)
    except Exception as e:
        logger.warning(f"Could not refresh Databricks run {run.databricks_run_id}: {e}")

    return run


# ---------------------------------------------------------------------------
# Main webhook entry point: validate → reply or trigger
# ---------------------------------------------------------------------------

def check_and_trigger(db: Session, instance_id: int, phone: str, message_text: str):
    """
    Called from the webhook handler.
    1. Find active config for this instance.
    2. Check if the message contains the trigger keyword.
    3. Validate extracted parameters.
    4. On validation error: send WhatsApp error reply (async).
    5. On success: trigger Databricks job (async).
    """
    config = (
        db.query(DatabricksConfig)
        .filter(
            DatabricksConfig.active == True,
            (DatabricksConfig.instance_id == instance_id) | (DatabricksConfig.instance_id == None),
        )
        .first()
    )
    if not config:
        return

    if not matches_keyword(message_text, config.trigger_keyword):
        return

    # --- Extract ---
    codigo_cliente = extract_codigo_cliente(message_text, config.client_code_regex or r"\d+")

    # --- Validate ---
    is_valid, error_reason = validate_params(codigo_cliente, config)

    if not is_valid:
        logger.info(f"Databricks validation failed from {phone}: {error_reason}")
        if config.send_error_reply:
            reply_text = build_error_reply(config, error_reason)
            send_error_reply_async(instance_id, phone, reply_text)
        return

    # --- Trigger ---
    notebook_params = build_notebook_params(config, codigo_cliente)
    logger.info(
        f"Databricks keyword '{config.trigger_keyword}' matched from {phone}. "
        f"codigo_cliente={codigo_cliente}. Triggering job {config.job_id}."
    )
    trigger_job(
        config_id=config.id,
        triggered_by_phone=phone,
        triggered_by_message=message_text,
        source="whatsapp",
        notebook_params=notebook_params,
        extracted_codigo_cliente=codigo_cliente,
    )
