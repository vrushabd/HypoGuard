#!/usr/bin/env python3
"""Train CGMHypoLSTM on synthetic trajectories; writes hypoguard/weights/cgm_lstm.pt"""

from __future__ import annotations

import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from hypoguard.cgm_lstm import CGMHypoLSTM, INTERVAL_MIN, NORM, SEQ_LEN, WEIGHTS_PATH

torch.manual_seed(42)
random.seed(42)


def synth_batch(n: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    xs = []
    y_g = []
    y_h = []
    for _ in range(n):
        g_end = random.uniform(55, 320)
        roc = random.uniform(-2.8, 1.8)
        if random.random() < 0.15:
            roc -= random.uniform(0.5, 1.5)
        seq = []
        for k in range(SEQ_LEN):
            minutes_ago = (SEQ_LEN - 1 - k) * INTERVAL_MIN
            v = g_end - roc * minutes_ago + random.gauss(0, 4.0)
            v = max(25.0, min(450.0, v))
            seq.append(v / NORM)
        g30 = g_end + roc * 30.0 + random.gauss(0, 5.0)
        g30 = max(25.0, min(450.0, g30))
        xs.append(seq)
        y_g.append(g30 / NORM)
        y_h.append(1.0 if g30 < 70.0 else 0.0)
    x = torch.tensor(xs, dtype=torch.float32).unsqueeze(-1)
    return x, torch.tensor(y_g, dtype=torch.float32), torch.tensor(y_h, dtype=torch.float32)


def main() -> None:
    device = torch.device("cpu")
    model = CGMHypoLSTM().to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    bce = nn.BCEWithLogitsLoss()
    mse = nn.MSELoss()

    WEIGHTS_PATH.parent.mkdir(parents=True, exist_ok=True)

    batch = 256
    steps = 400
    print(f"Training {steps} steps on device {device}...")
    for step in range(steps):
        x, tg, th = synth_batch(batch)
        x, tg, th = x.to(device), tg.to(device), th.to(device)
        opt.zero_grad()
        g_pred, h_logit = model(x)
        loss = mse(g_pred, tg) + 0.35 * bce(h_logit, th)
        loss.backward()
        opt.step()
        if (step + 1) % 100 == 0:
            print(f"  step {step + 1} loss={loss.item():.4f}")

    torch.save(model.state_dict(), WEIGHTS_PATH)
    print(f"Saved {WEIGHTS_PATH}")


if __name__ == "__main__":
    main()
