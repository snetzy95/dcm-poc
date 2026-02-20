from fastapi import APIRouter
from .cohorts import router as cohorts_router, members_router
from .jobs import router as jobs_router

router = APIRouter()
router.include_router(cohorts_router)
router.include_router(members_router)
router.include_router(jobs_router)
