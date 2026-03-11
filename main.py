import asyncio
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import create_tables, run_migrations
from app.routers.webhook import router as webhook_router
from app.routers import metrics, instances, dashboard, sse, teams, quick_replies, reports, databricks, translation
from app.routers.v2 import connections as v2_connections, messages as v2_messages
from app.services.wppconnect_service import warm_all_instances_sessions


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    run_migrations()
    asyncio.create_task(warm_all_instances_sessions())
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

_cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
if settings.CORS_ORIGINS:
    _cors_origins.extend(o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip())
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https?://[\w.-]+(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if Path("static").exists():
    app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(dashboard.router)
app.include_router(webhook_router)
app.include_router(metrics.router)
app.include_router(instances.router)
app.include_router(sse.router)
app.include_router(teams.router)
app.include_router(quick_replies.router)
app.include_router(reports.router)
app.include_router(databricks.router)
app.include_router(translation.router)
app.include_router(v2_connections.router)
app.include_router(v2_messages.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
