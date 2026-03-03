from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from datetime import datetime
from app.core.database import Base


class DatabricksConfig(Base):
    __tablename__ = "databricks_configs"

    id = Column(Integer, primary_key=True)
    instance_id = Column(Integer, ForeignKey("instances.id"), nullable=True)
    workspace_url = Column(String(500), nullable=False)
    api_token = Column(String(500), nullable=False)
    job_id = Column(String(50), nullable=False)
    trigger_keyword = Column(String(200), nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Notebook widget parameters (fixed values)
    param_catalog = Column(String(100), default="nazaria_dev")
    param_schema_name = Column(String(100), default="nazaria_gold")
    param_modo = Column(String(50), default="cliente")
    param_output_path = Column(String(500), default="/dbfs/FileStore/relatorios/")

    # Regex to extract codigo_cliente from the WhatsApp message
    client_code_regex = Column(String(100), default=r"\d+")

    # Validation rules for codigo_cliente
    client_code_min_length = Column(Integer, nullable=True)   # e.g. 4 → must have ≥4 digits
    client_code_max_length = Column(Integer, nullable=True)   # e.g. 8 → must have ≤8 digits

    # WhatsApp error reply settings
    send_error_reply = Column(Boolean, default=True)   # reply user when validation fails
    reply_example = Column(String(300), nullable=True)  # e.g. "gerar relatorio 448427"


class DatabricksJobRun(Base):
    __tablename__ = "databricks_job_runs"

    id = Column(Integer, primary_key=True)
    config_id = Column(Integer, ForeignKey("databricks_configs.id"), nullable=True)
    databricks_run_id = Column(String(50), nullable=True)
    triggered_by_phone = Column(String(50), nullable=True)
    triggered_by_message = Column(Text, nullable=True)
    trigger_source = Column(String(20), default="whatsapp")  # "whatsapp" or "manual"
    status = Column(String(30), default="pending")  # pending, running, success, failed, cancelled, validation_error
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Extracted + sent parameters
    extracted_codigo_cliente = Column(String(50), nullable=True)
    notebook_params_json = Column(Text, nullable=True)  # JSON snapshot of params sent to Databricks
