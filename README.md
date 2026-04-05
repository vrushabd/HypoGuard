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

## Deploy on Render

Use two services from this repo (or import **`render.yaml`** as a [Blueprint](https://render.com/docs/blueprint-spec)).

### 1. Web service — API

- **Runtime:** Python 3 (uses `runtime.txt`)
- **Root directory:** leave empty (repo root)
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`

**Environment variables**

| Key | Value |
|-----|--------|
| `CORS_ORIGINS` | After step 2, set to your static site URL, e.g. `https://hypoguard-web.onrender.com` (comma-separated for multiple origins). Must include `http://localhost:5173` if you still use local dev against production API. |

Deploy and copy the API URL (e.g. `https://hypoguard-api.onrender.com`).

### 2. Static site — frontend

- **Root directory:** `web`
- **Build command:** `npm install && npm run build`
- **Publish directory:** `dist`

**Environment variables**

| Key | Value |
|-----|--------|
| `VITE_API_BASE_URL` | Your API origin **only**, no path or trailing slash, e.g. `https://hypoguard-api.onrender.com` |

Redeploy the static site after setting `VITE_API_BASE_URL` so the bundle points at the API.

**Notes:** First `pip install` with PyTorch can be slow on the free tier. If the service sleeps, the first request after idle may take longer (cold start).

## Disclaimer

Educational / decision-support demo — not medical advice. Do not use for treatment decisions without a clinician.
