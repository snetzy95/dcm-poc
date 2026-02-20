from fastapi import APIRouter
from .studies import router as studies_router
from .webhook import router as webhook_router

router = APIRouter()
router.include_router(studies_router)
router.include_router(webhook_router)
