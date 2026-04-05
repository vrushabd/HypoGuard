"""
Lightweight LSTM for 30-minute glucose and hypo probability from a synthetic CGM window.

Trained on simulated CGM (see scripts/train_cgm_lstm.py) — a research-style demo model, not
a clinically validated GluFormer/GluPred replacement. For product use you would train on real
CGM with proper validation.
"""

from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn

SEQ_LEN = 24
INTERVAL_MIN = 5
NORM = 400.0

_WEIGHTS_DIR = Path(__file__).resolve().parent / "weights"
WEIGHTS_PATH = _WEIGHTS_DIR / "cgm_lstm.pt"


class CGMHypoLSTM(nn.Module):
    def __init__(self, hidden: int = 48, num_layers: int = 1) -> None:
        super().__init__()
        self.lstm = nn.LSTM(1, hidden, num_layers, batch_first=True)
        self.head = nn.Sequential(
            nn.Linear(hidden, 32),
            nn.ReLU(),
            nn.Linear(32, 2),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        out, _ = self.lstm(x)
        last = out[:, -1, :]
        y = self.head(last)
        return y[:, 0], y[:, 1]


def build_sequence(glucose_mg_dl: float, roc_mg_dl_per_min: float) -> torch.Tensor:
    """Reconstruct a plausible 2-hour CGM window from current value + ROC (mg/dL per min)."""
    g_now = float(glucose_mg_dl)
    roc = float(roc_mg_dl_per_min)
    vals = []
    for k in range(SEQ_LEN):
        minutes_ago = (SEQ_LEN - 1 - k) * INTERVAL_MIN
        v = g_now - roc * minutes_ago
        v = max(25.0, min(450.0, v))
        vals.append(v)
    t = torch.tensor(vals, dtype=torch.float32).view(1, SEQ_LEN, 1) / NORM
    return t


_model_cache: CGMHypoLSTM | None = None


def _get_model(device: str = "cpu") -> CGMHypoLSTM | None:
    global _model_cache
    if _model_cache is not None:
        return _model_cache
    if not WEIGHTS_PATH.is_file():
        return None
    try:
        m = CGMHypoLSTM()
        w = torch.load(WEIGHTS_PATH, map_location=device)
        m.load_state_dict(w)
        m.eval()
        _model_cache = m
        return m
    except Exception:
        return None


@torch.no_grad()
def infer_ml(glucose_mg_dl: float, roc_mg_dl_per_min: float) -> dict | None:
    """Returns ML sidecar dict for API, or None if weights missing / torch error."""
    m = _get_model()
    if m is None:
        return None
    try:
        x = build_sequence(glucose_mg_dl, roc_mg_dl_per_min)
        g_raw, hypo_logit = m(x)
        pred = float(torch.clamp(g_raw * NORM, 30.0, 450.0).item())
        hypo_p = float(torch.sigmoid(hypo_logit).item())
        return {
            "id": "cgm_lstm_synthetic_v1",
            "predicted_glucose_30min": int(round(pred)),
            "hypo_probability": round(hypo_p, 4),
            "sequence_minutes": (SEQ_LEN - 1) * INTERVAL_MIN,
            "note": (
                "Small LSTM on a 24-point window inferred from your glucose + ROC; "
                "trained on synthetic CGM only — compare with rule-based engine, do not use for treatment."
            ),
        }
    except Exception:
        return None


def reset_model_cache() -> None:
    global _model_cache
    _model_cache = None
