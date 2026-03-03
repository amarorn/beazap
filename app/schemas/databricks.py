from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DatabricksConfigCreate(BaseModel):
    workspace_url: str
    api_token: str
    job_id: str
    trigger_keyword: str
    instance_id: Optional[int] = None
    # Notebook widget params
    param_catalog: str = "nazaria_dev"
    param_schema_name: str = "nazaria_gold"
    param_modo: str = "cliente"
    param_output_path: str = "/dbfs/FileStore/relatorios/"
    # Extraction
    client_code_regex: str = r"\d+"
    # Validation rules
    client_code_min_length: Optional[int] = None
    client_code_max_length: Optional[int] = None
    # Error reply
    send_error_reply: bool = True
    reply_example: Optional[str] = None


class DatabricksConfigResponse(BaseModel):
    id: int
    instance_id: Optional[int]
    workspace_url: str
    api_token_masked: str
    job_id: str
    trigger_keyword: str
    active: bool
    param_catalog: str
    param_schema_name: str
    param_modo: str
    param_output_path: str
    client_code_regex: str
    client_code_min_length: Optional[int]
    client_code_max_length: Optional[int]
    send_error_reply: bool
    reply_example: Optional[str]

    model_config = {"from_attributes": True}


class DatabricksTriggerRequest(BaseModel):
    message: str
    phone: Optional[str] = "teste_manual"


class DatabricksValidateRequest(BaseModel):
    message: str


class DatabricksValidateResponse(BaseModel):
    keyword_found: bool
    codigo_cliente: Optional[str]
    is_valid: bool
    error_reason: Optional[str]
    error_reply: Optional[str]   # WhatsApp message that would be sent on error
    notebook_params: Optional[dict]


class DatabricksJobRunResponse(BaseModel):
    id: int
    config_id: Optional[int]
    databricks_run_id: Optional[str]
    triggered_by_phone: Optional[str]
    triggered_by_message: Optional[str]
    trigger_source: str
    status: str
    error_message: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]
    extracted_codigo_cliente: Optional[str]
    notebook_params_json: Optional[str]

    model_config = {"from_attributes": True}
