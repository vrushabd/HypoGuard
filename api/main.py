"""HypoGuard REST API for local development."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hypoguard.cgm_lstm import infer_ml  # noqa: E402
from hypoguard.engine import assess  # noqa: E402
from hypoguard.models import HypoGuardInput  # noqa: E402

app = FastAPI(title="HypoGuard API", version="1.0.0")

_default_cors = "http://localhost:5173,http://127.0.0.1:5173"
_cors_raw = os.environ.get("CORS_ORIGINS", _default_cors)
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AssessBody(BaseModel):
    payload: dict = Field(..., description="HypoGuardInput as JSON object")


@app.get("/api/health")
def health() -> dict:
    ml = infer_ml(120.0, -0.5)
    return {"status": "ok", "ml_model_loaded": ml is not None}


@app.post("/api/assess")
def assess_endpoint(body: AssessBody) -> dict:
    try:
        inp = HypoGuardInput.model_validate(body.payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    out = assess(inp).model_dump()
    ml = infer_ml(inp.glucose_mg_dl, inp.roc_mg_dl_per_min)
    if ml is not None:
        out["ml_model"] = ml
    return out
