# Mega Millions Fluid Dynamics Forecast Engine

A React visualization applying fluid dynamics mathematics to 30 years of Mega Millions draw history.

## Data Source
- **Source:** LottoAmerica.com (All-Time Statistics)
- **Coverage:** 3,019 draws · Sep 6, 1996 → Apr 24, 2026
- **Pool:** 1–70 main balls · Mega Ball 1–24 (current v7 matrix)
- **Eras covered:** All 7 game versions

## Fluid Dynamics Models Applied

| Formula | Equation | Purpose |
|---------|----------|---------|
| Pressure | P = fᵢ / f̄ | Normalized frequency weight |
| Velocity | v = (L/b) / (Δt+1) | Recency — cycling rate |
| Reynolds Number | Re = ρvL/μ | Turbulence indicator |
| Bernoulli Energy | B = P + ½ρv² | Total mechanical energy |
| Vorticity | ω = \|P − 1\| | Deviation from equilibrium |
| NS-Forecast | F = 0.38v + 0.30P + 0.18/ω + 0.09f̂ + Δoverdue | Ensemble prediction score |

## Data Integrity Checks (All Pass ✓)
- Ball 31 = 288 draws (all-time most common) ✓
- Ball 17 = 285 draws ✓
- Ball 10 = 281 draws ✓
- MB 1 & MB 3 = 117 draws (tied top MB all-time) ✓
- MB 23 = 61 draws (least common active MB) ✓

## Usage
```bash
# Drop into any React project
import FluidLotteryAnalyzer from './mega-millions-fluid'
```

## ⚠️ Disclaimer
For entertainment only. Each lottery draw is a statistically independent random event.
Odds of winning the Mega Millions jackpot: 1 in 302,575,350.
No mathematical model can predict a truly random draw.

## Tabs
- **✦ NS Forecast** — Final prediction with per-ball physics breakdown
- **⬡ Pressure Field** — 70-ball heat map with hover-detail cards
- **▶ Score Analysis** — Ranked bar charts, Reynolds turbulence, Bernoulli histogram
- **◈ Era Breakdown** — All 7 game versions and pool change history
