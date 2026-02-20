"""Thin async httpx wrapper for the Orthanc REST API."""
import httpx
from ..config import settings


def _make_client() -> httpx.AsyncClient:
    auth = None
    if settings.orthanc_user:
        auth = (settings.orthanc_user, settings.orthanc_pass)
    return httpx.AsyncClient(base_url=settings.orthanc_url, auth=auth, timeout=30.0)


async def get(path: str) -> dict:
    async with _make_client() as client:
        r = await client.get(path)
        r.raise_for_status()
        return r.json()


async def post(path: str, **kwargs) -> dict:
    async with _make_client() as client:
        r = await client.post(path, **kwargs)
        r.raise_for_status()
        return r.json()


async def delete(path: str) -> None:
    async with _make_client() as client:
        r = await client.delete(path)
        r.raise_for_status()
