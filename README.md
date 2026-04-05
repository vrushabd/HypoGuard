# HypoGuard

Hypoglycaemia risk snapshot: rule-based **HypoGuard** engine, optional **PyTorch LSTM** (synthetic-trained), React + Vite + Tailwind UI, and FastAPI.

## Quick start

**API** (from repo root):

```bash
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/train_cgm_lstm.py   # optional: creates hypoguard/weights/cgm_lstm.pt
uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

**Web** (separate terminal):

```bash
cd web && npm install && npm run dev
```

Open `http://localhost:5173` (Vite proxies `/api` to port 8000).

## Disclaimer

Educational / decision-support demo — not medical advice. Do not use for treatment decisions without a clinician.
