from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.instance import Instance
from app.services import metrics_service

router = APIRouter(tags=["dashboard"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
def dashboard(
    request: Request,
    instance_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    instances = db.query(Instance).filter(Instance.active == True).all()
    overview = metrics_service.get_overview_metrics(db, instance_id)
    attendants = metrics_service.get_attendant_metrics(db, instance_id)
    daily = metrics_service.get_daily_volume(db, 7, instance_id)
    conversations = metrics_service.get_recent_conversations(db, 10, instance_id)

    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "instances": instances,
            "selected_instance_id": instance_id,
            "overview": overview,
            "attendants": attendants,
            "daily_volume": daily,
            "conversations": conversations,
            "format_time": metrics_service.format_response_time,
        },
    )


@router.get("/conversations", response_class=HTMLResponse)
def conversations_page(
    request: Request,
    instance_id: Optional[int] = None,
    status: Optional[str] = None,
    attendant_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    from app.models.attendant import Attendant
    instances = db.query(Instance).filter(Instance.active == True).all()
    attendants_list = db.query(Attendant).filter(Attendant.active == True).all()
    conversations = metrics_service.get_recent_conversations(db, 50, instance_id, status, attendant_id)

    return templates.TemplateResponse(
        "conversations.html",
        {
            "request": request,
            "instances": instances,
            "attendants_list": attendants_list,
            "selected_instance_id": instance_id,
            "selected_status": status,
            "selected_attendant_id": attendant_id,
            "conversations": conversations,
            "format_time": metrics_service.format_response_time,
        },
    )


@router.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request, db: Session = Depends(get_db)):
    from app.models.attendant import Attendant
    instances = db.query(Instance).filter(Instance.active == True).all()
    attendants_list = db.query(Attendant).filter(Attendant.active == True).all()

    return templates.TemplateResponse(
        "settings.html",
        {
            "request": request,
            "instances": instances,
            "attendants_list": attendants_list,
        },
    )
