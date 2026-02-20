import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from .api.router import router
from .config import settings
from .database import create_tables
from .services.orthanc_poller import start_poller

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    poller_task = asyncio.create_task(start_poller(settings.poll_interval_seconds))
    yield
    poller_task.cancel()
    try:
        await poller_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="DCM Core Service", version="0.1.0", lifespan=lifespan)

Instrumentator().instrument(app).expose(app)

app.include_router(router)


@app.get("/health", tags=["ops"])
async def health():
    return {"status": "ok", "service": "dcm-core-service"}
