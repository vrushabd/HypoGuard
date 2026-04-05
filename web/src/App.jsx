import { useCallback, useMemo, useRef, useState } from "react";

/** Empty in dev (Vite proxy → :8000). On Render, set VITE_API_BASE_URL to your API origin, no trailing slash. */
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

const LEVEL_STYLES = {
  low: {
    label: "Low",
    ring: "stroke-cyan-400",
    glow: "shadow-cyan-500/20",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  },
  moderate: {
    label: "Moderate",
    ring: "stroke-amber-400",
    glow: "shadow-amber-500/20",
    badge: "bg-amber-500/15 text-amber-200 border-amber-500/35",
  },
  high: {
    label: "High",
    ring: "stroke-orange-400",
    glow: "shadow-orange-500/25",
    badge: "bg-orange-500/15 text-orange-200 border-orange-500/35",
  },
  critical: {
    label: "Critical",
    ring: "stroke-rose-500",
    glow: "shadow-rose-500/30",
    badge: "bg-rose-500/20 text-rose-200 border-rose-500/40",
  },
};

function linearGlucose(glucose, rocMgDlPerMin, minutes) {
  return glucose + rocMgDlPerMin * minutes;
}

function RiskRing({ score, level }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.low;
  const urgent = level === "high" || level === "critical";

  return (
    <div
      className={`relative mx-auto flex h-44 w-44 animate-scale-in items-center justify-center rounded-full ${style.glow} shadow-glow transition-shadow duration-500`}
    >
      <svg
        className="h-full w-full -rotate-90 transform transition-transform duration-700 ease-smooth"
        viewBox="0 0 120 120"
      >
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-surface-600"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={`transition-all duration-1000 ease-smooth ${style.ring} ${urgent ? "animate-pulse" : ""}`}
          style={{ filter: "drop-shadow(0 0 8px currentColor)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          key={score}
          className="font-display text-4xl font-bold tracking-tight text-white transition-all duration-500 ease-smooth"
        >
          {score}
        </span>
        <span className="text-xs font-medium uppercase tracking-widest text-slate-500">risk</span>
      </div>
    </div>
  );
}

/** Linear extrapolation from current CGM + ROC; hypo bands at 70 / 54 mg/dL */
function TrajectoryLens({ glucose, roc, enginePred30 }) {
  const [carbG, setCarbG] = useState(0);
  const minutes = [0, 15, 30, 45];
  const basePts = useMemo(
    () => minutes.map((t) => ({ t, g: linearGlucose(glucose, roc, t) })),
    [glucose, roc]
  );
  const carbLiftPerGram = 3.5;
  const whatIf30 =
    carbG > 0 ? linearGlucose(glucose, roc, 30) + carbG * carbLiftPerGram : null;

  const allG = [
    ...basePts.map((p) => p.g),
    54,
    70,
    whatIf30 ?? glucose,
  ];
  let ymin = Math.min(...allG) - 8;
  let ymax = Math.max(...allG) + 12;
  ymin = Math.max(35, ymin);
  ymax = Math.min(320, Math.max(ymax, 140));

  const W = 380;
  const H = 112;
  const padL = 36;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xAt = (t) => padL + (t / 45) * innerW;
  const yAt = (g) => padT + innerH - ((g - ymin) / (ymax - ymin)) * innerH;

  const pathD = basePts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(p.t).toFixed(1)} ${yAt(p.g).toFixed(1)}`)
    .join(" ");

  const y70 = yAt(70);
  const y54 = yAt(54);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-900/40 p-4 transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-300/90">
            Trajectory lens
          </p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
            Straight-line continuation of your uploaded ROC (not a full CGM forecast). Bands show
            alert (&lt;70) and serious (&lt;54) thresholds.
          </p>
        </div>
        {enginePred30 != null && (
          <span className="rounded-lg bg-surface-800 px-2 py-1 font-mono text-[10px] text-slate-400">
            Engine 30m: {enginePred30}
          </span>
        )}
      </div>

      <svg
        className="mt-3 w-full max-w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect x={0} y={0} width={W} height={H} fill="transparent" />
        {/* hypo fill bands */}
        <rect
          x={padL}
          y={y54}
          width={innerW}
          height={H - padB - y54}
          fill="rgba(251,113,133,0.08)"
        />
        <rect
          x={padL}
          y={y70}
          width={innerW}
          height={y54 - y70}
          fill="rgba(251,191,36,0.06)"
        />
        <line
          x1={padL}
          x2={W - padR}
          y1={y70}
          y2={y70}
          stroke="rgba(251,191,36,0.45)"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <line
          x1={padL}
          x2={W - padR}
          y1={y54}
          y2={y54}
          stroke="rgba(251,113,133,0.55)"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <path
          d={pathD}
          fill="none"
          stroke="url(#trajGrad)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {whatIf30 != null && carbG > 0 && (
          <line
            x1={xAt(30)}
            y1={yAt(basePts[2].g)}
            x2={xAt(30)}
            y2={yAt(whatIf30)}
            stroke="rgba(52,211,153,0.9)"
            strokeWidth={2}
          />
        )}
        {whatIf30 != null && carbG > 0 && (
          <circle cx={xAt(30)} cy={yAt(whatIf30)} r={4} fill="#34d399" />
        )}
        {basePts.map((p) => (
          <circle key={p.t} cx={xAt(p.t)} cy={yAt(p.g)} r={3.5} fill="#e2e8f0" />
        ))}
        <defs>
          <linearGradient id="trajGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <text x={padL} y={H - 4} className="fill-slate-500" style={{ fontSize: 9 }}>
          0m
        </text>
        <text x={xAt(15) - 8} y={H - 4} className="fill-slate-500" style={{ fontSize: 9 }}>
          15m
        </text>
        <text x={xAt(30) - 8} y={H - 4} className="fill-slate-500" style={{ fontSize: 9 }}>
          30m
        </text>
        <text x={xAt(45) - 8} y={H - 4} className="fill-slate-500" style={{ fontSize: 9 }}>
          45m
        </text>
        <text x={4} y={y70 + 3} className="fill-amber-400/80" style={{ fontSize: 8 }}>
          70
        </text>
        <text x={4} y={y54 + 3} className="fill-rose-400/80" style={{ fontSize: 8 }}>
          54
        </text>
      </svg>

      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
        <label className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-wide text-emerald-400/90">
            What-if fast carbs (now)
          </span>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={carbG}
            onChange={(e) => setCarbG(Number(e.target.value))}
            className="h-1.5 flex-1 min-w-[120px] max-w-[200px] cursor-pointer appearance-none rounded-full bg-surface-600 accent-emerald-400"
          />
          <span className="font-mono text-slate-200">{carbG} g</span>
        </label>
        {carbG > 0 && (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Rough bump (~{carbLiftPerGram} mg/dL per g) added only at the 30-minute mark for
            illustration—absorption varies; treat per your plan.
          </p>
        )}
      </div>
    </div>
  );
}

/** Rapid-acting doses plotted on a “minutes ago” strip with 60–90 peak band */
function IOBPeakStrip({ doses }) {
  const rapid = (doses || []).filter((d) => d && (d.type === "rapid" || d.type === "unknown"));
  if (rapid.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-surface-900/30 p-4 transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-white/[0.12]">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          IOB peak strip
        </p>
        <p className="mt-2 text-sm text-slate-500">No rapid or unknown boluses in this file.</p>
      </div>
    );
  }

  const windowMin = 150;
  const W = 360;
  const pad = 24;
  const inner = W - pad * 2;
  const xAt = (minsAgo) => pad + (minsAgo / windowMin) * inner;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-900/40 p-4 transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/15">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
        IOB peak strip
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Shaded band ≈ 60–90 min after rapid insulin (typical peak window).
      </p>
      <svg className="mt-3 w-full" viewBox={`0 0 ${W} 56`} preserveAspectRatio="xMidYMid meet">
        <rect x={pad} y={18} width={inner} height={8} rx={4} fill="rgba(51,65,85,0.6)" />
        <rect
          x={xAt(60)}
          y={18}
          width={xAt(90) - xAt(60)}
          height={8}
          rx={4}
          fill="rgba(251,191,36,0.35)"
        />
        <line x1={pad} x2={pad} y1={12} y2={34} stroke="rgba(148,163,184,0.5)" strokeWidth={1} />
        <text x={pad - 2} y={44} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8 }}>
          now
        </text>
        <text
          x={xAt(60)}
          y={44}
          textAnchor="middle"
          className="fill-slate-500"
          style={{ fontSize: 8 }}
        >
          60m
        </text>
        <text
          x={xAt(90)}
          y={44}
          textAnchor="middle"
          className="fill-slate-500"
          style={{ fontSize: 8 }}
        >
          90m
        </text>
        <text
          x={pad + inner}
          y={44}
          textAnchor="end"
          className="fill-slate-500"
          style={{ fontSize: 8 }}
        >
          {windowMin}m ago
        </text>
        {rapid.map((d, i) => {
          const m = Number(d.minutes_since) || 0;
          if (m < 0 || m > windowMin) return null;
          const cx = xAt(m);
          const inPeak = d.type !== "regular" && d.type !== "long" && m >= 60 && m <= 90;
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={10} y2={34} stroke="rgba(34,211,238,0.5)" strokeWidth={1} />
              <circle cx={cx} cy={14} r={5} fill={inPeak ? "#fbbf24" : "#22d3ee"} />
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 space-y-1 text-xs text-slate-400">
        {rapid.map((d, i) => {
          const m = Number(d.minutes_since) || 0;
          const inPeak = m >= 60 && m <= 90;
          return (
            <li key={i}>
              Dose {i + 1}: {d.units}u @ {m}m ago
              {inPeak ? (
                <span className="ml-2 text-amber-300">· likely near peak activity</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const PREVENTION_CATEGORY_STYLES = {
  nutrition: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  activity: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  monitoring: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  safety: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  insulin: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  support: "border-slate-500/35 bg-slate-500/15 text-slate-200",
};

/** Ranked prevention steps with heuristic impact on the rule-engine risk score */
function PreventionPlan({ suggestions, note }) {
  if (!suggestions?.length) return null;
  return (
    <div className="glass glass-interactive rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-6 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-300/90">
        Prevention & decision support
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Ranked actions — impact % is an estimate of how much each could lower this snapshot&apos;s
        risk score (heuristic, not measured care outcomes).
      </p>
      <ol className="mt-5 list-none space-y-4 p-0">
        {suggestions.map((s) => (
          <li
            key={s.id}
            className="flex gap-4 rounded-xl border border-white/[0.06] bg-surface-900/55 p-4"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/50 to-cyan-600/35 font-display text-lg font-bold text-white shadow-inner">
              {s.rank}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-100">{s.title}</span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    PREVENTION_CATEGORY_STYLES[s.category] || PREVENTION_CATEGORY_STYLES.support
                  }`}
                >
                  {s.category}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.detail}</p>
              <p className="mt-2 text-sm text-emerald-300/95">
                <span className="font-mono font-semibold text-emerald-200">
                  ~{s.risk_reduction_percent}%
                </span>{" "}
                <span className="text-slate-500">estimated risk score reduction</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
      {note ? <p className="mt-4 text-xs leading-relaxed text-slate-600">{note}</p> : null}
    </div>
  );
}

/** Radar of top factor impacts — “constellation” view */
function FactorConstellation({ factors }) {
  const top = useMemo(() => {
    return [...(factors || [])]
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 6);
  }, [factors]);

  if (top.length < 3) return null;

  const n = top.length;
  const cx = 90;
  const cy = 88;
  const R = 62;
  const pts = top.map((f, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = R * (0.15 + (f.impact / 100) * 0.85);
    return {
      x: cx + r * Math.cos(ang),
      y: cy + r * Math.sin(ang),
      name: f.name,
      impact: f.impact,
    };
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const dClose = `${d} Z`;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-900/40 p-4 transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/15">
      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200/80">
        Factor constellation
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Top drivers by impact — shape shows where risk pressure clusters.
      </p>
      <div className="mt-2 flex justify-center">
        <svg width={200} height={190} viewBox="0 0 180 176">
          {[0.35, 0.6, 0.85, 1].map((s, j) => (
            <circle
              key={j}
              cx={cx}
              cy={cy}
              r={R * s}
              fill="none"
              stroke="rgba(148,163,184,0.12)"
              strokeWidth={1}
            />
          ))}
          <path
            d={dClose}
            fill="rgba(34,211,238,0.12)"
            stroke="url(#orbitGrad)"
            strokeWidth={1.5}
          />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill="#a78bfa" />
            </g>
          ))}
          {top.map((f, i) => {
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const lx = cx + (R + 14) * Math.cos(ang);
            const ly = cy + (R + 14) * Math.sin(ang);
            const short = f.name.length > 12 ? `${f.name.slice(0, 11)}…` : f.name;
            return (
              <text
                key={i}
                x={lx}
                y={ly}
                textAnchor="middle"
                className="fill-slate-500"
                style={{ fontSize: 7 }}
              >
                {short}
              </text>
            );
          })}
          <defs>
            <linearGradient id="orbitGrad" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function speakBriefing(summary, recommendation, preventionSuggestions) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  let prev = "";
  if (preventionSuggestions?.length) {
    prev = ` Top prevention steps: ${preventionSuggestions
      .slice(0, 3)
      .map((s) => `${s.title}, about ${s.risk_reduction_percent} percent estimated impact`)
      .join(". ")}.`;
  }
  const text = `HypoGuard briefing. ${summary} Recommendation: ${recommendation}.${prev}`;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.96;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

function snapshotId(result) {
  return `HG-${Date.now().toString(36)}-${result.score}`;
}

function downloadSnapshot({ sourceFile, payload, result }) {
  const id = snapshotId(result);
  const doc = {
    snapshot_id: id,
    generated_at: new Date().toISOString(),
    source_file: sourceFile,
    input: payload,
    prediction: result,
  };
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Flatten nested objects for Excel key/value columns; arrays → JSON string */
function flattenInputRows(obj, prefix = "") {
  const rows = [];
  if (obj == null) {
    rows.push([prefix || "field", ""]);
    return rows;
  }
  if (typeof obj !== "object") {
    rows.push([prefix, obj]);
    return rows;
  }
  if (Array.isArray(obj)) {
    rows.push([prefix || "value", JSON.stringify(obj)]);
    return rows;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      rows.push(...flattenInputRows(v, key));
    } else if (Array.isArray(v)) {
      rows.push([key, JSON.stringify(v)]);
    } else {
      rows.push([key, v === undefined || v === null ? "" : v]);
    }
  }
  return rows;
}

async function downloadSnapshotExcel({ sourceFile, payload, result }) {
  const ExcelJS = (await import("exceljs")).default;
  const id = snapshotId(result);
  const generatedAt = new Date().toISOString();
  const wb = new ExcelJS.Workbook();

  const summary = wb.addWorksheet("Summary", { properties: { defaultColWidth: 36 } });
  summary.addRows([
    ["HypoGuard snapshot"],
    [],
    ["snapshot_id", id],
    ["generated_at", generatedAt],
    ["source_file", sourceFile ?? ""],
    [],
    ["Prediction"],
    ["score", result.score],
    ["level", result.level],
    ["window_minutes", result.window_minutes],
    ["predicted_glucose_30min", result.predicted_glucose_30min],
    ["follow_up_minutes", result.follow_up_minutes],
    ["alert_caregiver", result.alert_caregiver],
    ["safe_to_drive", result.safe_to_drive],
    ["safe_to_exercise", result.safe_to_exercise],
    [],
    ["summary", result.summary],
    [],
    ["recommendation", result.recommendation],
    [],
    ["prevention_engine_note", result.prevention_engine_note ?? ""],
  ]);
  if (result.ml_model) {
    summary.addRows([
      [],
      ["ML_model (PyTorch LSTM)"],
      ["ml_id", result.ml_model.id],
      ["ml_predicted_glucose_30min", result.ml_model.predicted_glucose_30min],
      ["ml_hypo_probability", result.ml_model.hypo_probability],
    ]);
  }

  const factorHeader = ["name", "impact", "direction", "note"];
  const factorBody = (result.factors || []).map((f) => [
    f.name,
    f.impact,
    f.direction,
    f.note,
  ]);
  const factorsWs = wb.addWorksheet("Factors");
  factorsWs.addRow(factorHeader);
  factorBody.forEach((r) => factorsWs.addRow(r));

  const prevHeader = ["rank", "id", "category", "title", "detail", "risk_reduction_percent"];
  const prevBody = (result.prevention_suggestions || []).map((s) => [
    s.rank,
    s.id,
    s.category,
    s.title,
    s.detail,
    s.risk_reduction_percent,
  ]);
  const prevWs = wb.addWorksheet("Prevention");
  prevWs.addRow(prevHeader);
  prevBody.forEach((row) => prevWs.addRow(row));

  const inputHeader = ["field", "value"];
  const inputBody = flattenInputRows(payload);
  const inputWs = wb.addWorksheet("Input");
  inputWs.addRow(inputHeader);
  inputBody.forEach((r) => inputWs.addRow(r));

  const predictionJson = { ...result };
  delete predictionJson.factors;
  const pj = wb.addWorksheet("Prediction_JSON", { properties: { defaultColWidth: 80 } });
  pj.addRow(["prediction_json_excl_factors"]);
  pj.addRow([JSON.stringify(predictionJson)]);
  pj.addRow([]);
  pj.addRow(["full_prediction_json"]);
  pj.addRow([JSON.stringify(result)]);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${id}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeCsvCell(v) {
  if (v == null || v === "") return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadSnapshotCsv({ sourceFile, payload, result }) {
  const id = snapshotId(result);
  const lines = [];
  const r = (cells) => lines.push(cells.map(escapeCsvCell).join(","));
  r(["meta_key", "meta_value"]);
  r(["snapshot_id", id]);
  r(["generated_at", new Date().toISOString()]);
  r(["source", sourceFile ?? ""]);
  r([]);
  r(["prediction_field", "prediction_value"]);
  r(["score", result.score]);
  r(["level", result.level]);
  r(["window_minutes", result.window_minutes]);
  r(["predicted_glucose_30min", result.predicted_glucose_30min]);
  r(["follow_up_minutes", result.follow_up_minutes]);
  r(["alert_caregiver", result.alert_caregiver]);
  r(["safe_to_drive", result.safe_to_drive]);
  r(["safe_to_exercise", result.safe_to_exercise]);
  r(["summary", result.summary]);
  r(["recommendation", result.recommendation]);
  r(["prevention_engine_note", result.prevention_engine_note ?? ""]);
  r([]);
  r(["prevention_rank", "prevention_id", "category", "title", "detail", "risk_reduction_percent"]);
  for (const s of result.prevention_suggestions || []) {
    r([s.rank, s.id, s.category, s.title, s.detail, s.risk_reduction_percent]);
  }
  if (result.ml_model) {
    r(["ml_model_id", result.ml_model.id]);
    r(["ml_predicted_glucose_30min", result.ml_model.predicted_glucose_30min]);
    r(["ml_hypo_probability", result.ml_model.hypo_probability]);
  }
  r([]);
  r(["factor_name", "impact", "direction", "note"]);
  for (const f of result.factors || []) {
    r([f.name, f.impact, f.direction, f.note]);
  }
  r([]);
  r(["input_field", "input_value"]);
  for (const pair of flattenInputRows(payload)) {
    r(pair);
  }
  const bom = "\ufeff";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${id}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-surface-900/50 p-3 transition hover:border-cyan-500/20">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-500 bg-surface-900 text-cyan-500 focus:ring-cyan-500/40"
      />
      <span>
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

const emptyDose = () => ({ type: "rapid", units: 5, minutes_since: 60 });

/** Accepts raw HypoGuardInput or { "payload": { ... } } */
function payloadFromParsedJson(data) {
  if (data == null || typeof data !== "object") {
    throw new Error("JSON root must be an object.");
  }
  if ("payload" in data && data.payload != null && typeof data.payload === "object") {
    return data.payload;
  }
  return data;
}

function parsePayloadFile(text, fileName) {
  const lower = (fileName || "").toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".txt")) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON. Save your case as UTF-8 .json.");
    }
    return payloadFromParsedJson(data);
  }
  if (lower.endsWith(".csv")) {
    return csvRowToPayload(text);
  }
  throw new Error("Use a .json (recommended) or .csv file.");
}

/** One header row + one data row; booleans as true/false or 0/1 */
function csvRowToPayload(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error("CSV needs a header row and one data row.");
  }
  const splitRow = (line) => {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        q = !q;
      } else if (!q && ch === ",") {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out.map((c) => c.replace(/^"|"$/g, ""));
  };

  const headers = splitRow(lines[0]).map((h) => h.trim().replace(/^\ufeff/, ""));
  const values = splitRow(lines[1]);
  if (headers.length !== values.length) {
    throw new Error("CSV header and data column counts do not match.");
  }

  const raw = {};
  headers.forEach((h, i) => {
    raw[h] = values[i];
  });

  const num = (k, def = null) => {
    if (!(k in raw) || raw[k] === "") return def;
    const n = Number(raw[k]);
    if (Number.isNaN(n)) throw new Error(`Column "${k}" must be a number.`);
    return n;
  };
  const bool = (k, def = false) => {
    if (!(k in raw) || raw[k] === "") return def;
    const v = String(raw[k]).toLowerCase();
    if (v === "1" || v === "true" || v === "yes") return true;
    if (v === "0" || v === "false" || v === "no") return false;
    throw new Error(`Column "${k}" must be 0/1 or true/false.`);
  };

  const payload = {
    glucose_mg_dl: num("glucose_mg_dl"),
    roc_mg_dl_per_min: num("roc_mg_dl_per_min"),
    local_hour: num("local_hour"),
    local_minute: num("local_minute", 0),
    insulin_doses: [],
    meal: null,
    activity: { intensity: "none" },
    symptoms: {
      shakiness: bool("symptom_shakiness", false),
      sweating: bool("symptom_sweating", false),
      confusion: bool("symptom_confusion", false),
      hunger: bool("symptom_hunger", false),
    },
    stress_or_illness: bool("stress_or_illness", false),
    sleep_quality_0_100: num("sleep_quality_0_100", null),
    sleep_hours: num("sleep_hours", null),
    historical_hypo_bias_0_100: num("historical_hypo_bias_0_100", null),
  };

  if (payload.glucose_mg_dl == null || payload.roc_mg_dl_per_min == null || payload.local_hour == null) {
    throw new Error("CSV requires glucose_mg_dl, roc_mg_dl_per_min, and local_hour.");
  }

  const u = num("insulin_units", null);
  const ms = num("insulin_minutes_since", null);
  if (u != null && u > 0 && ms != null) {
    payload.insulin_doses = [
      {
        type: raw.insulin_type || "rapid",
        units: u,
        minutes_since: ms,
      },
    ];
  }

  const mealCarbs = num("meal_carbs_g", null);
  const mealMins = num("meal_minutes_since", null);
  if (mealCarbs != null || mealMins != null || bool("meal_skipped_or_light", false)) {
    payload.meal = {
      skipped_or_light: bool("meal_skipped_or_light", false),
      minutes_since: mealMins,
      carbs_g: mealCarbs,
    };
  }

  const actI = (raw.activity_intensity || "none").toLowerCase();
  const actM = num("activity_minutes_since", null);
  const actD = num("activity_duration_minutes", null);
  if (actI !== "none" || actM != null || actD != null) {
    payload.activity = {
      intensity: ["none", "light", "moderate", "intense"].includes(actI) ? actI : "moderate",
      minutes_since: actM,
      duration_minutes: actD,
    };
  }

  const anySym =
    payload.symptoms.shakiness ||
    payload.symptoms.sweating ||
    payload.symptoms.confusion ||
    payload.symptoms.hunger;
  if (!anySym) payload.symptoms = null;

  return payload;
}

export default function App() {
  const inputRef = useRef(null);
  const now = useMemo(() => new Date(), []);
  const [inputMode, setInputMode] = useState("upload");
  const [fileName, setFileName] = useState(null);
  const [lastPayload, setLastPayload] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const [glucose, setGlucose] = useState(110);
  const [roc, setRoc] = useState(-0.6);
  const [localHour, setLocalHour] = useState(now.getHours());
  const [localMinute, setLocalMinute] = useState(now.getMinutes());
  const [doses, setDoses] = useState([]);
  const [mealSkipped, setMealSkipped] = useState(false);
  const [mealMins, setMealMins] = useState("");
  const [mealCarbs, setMealCarbs] = useState("");
  const [actMins, setActMins] = useState("");
  const [actDur, setActDur] = useState("");
  const [actIntensity, setActIntensity] = useState("none");
  const [symptoms, setSymptoms] = useState({
    shakiness: false,
    sweating: false,
    confusion: false,
    hunger: false,
  });
  const [sleepQ, setSleepQ] = useState("");
  const [sleepH, setSleepH] = useState("");
  const [stress, setStress] = useState(false);
  const [histBias, setHistBias] = useState("");

  const updateSymptom = (key, v) => setSymptoms((s) => ({ ...s, [key]: v }));

  const buildManualPayload = useCallback(() => {
    const meal =
      mealSkipped || mealMins !== "" || mealCarbs !== ""
        ? {
            skipped_or_light: mealSkipped,
            minutes_since: mealMins === "" ? null : Number(mealMins),
            carbs_g: mealCarbs === "" ? null : Number(mealCarbs),
          }
        : null;
    const activity =
      actIntensity !== "none" || actMins !== "" || actDur !== ""
        ? {
            intensity: actIntensity,
            minutes_since: actMins === "" ? null : Number(actMins),
            duration_minutes: actDur === "" ? null : Number(actDur),
          }
        : { intensity: "none" };

    return {
      glucose_mg_dl: Number(glucose),
      roc_mg_dl_per_min: Number(roc),
      insulin_doses: doses.map((d) => ({
        type: d.type,
        units: Math.max(0, Number(d.units) || 0),
        minutes_since: Math.max(0, Number(d.minutes_since) || 0),
      })),
      meal,
      activity,
      local_hour: Number(localHour),
      local_minute: Number(localMinute),
      symptoms,
      sleep_quality_0_100: sleepQ === "" ? null : Number(sleepQ),
      sleep_hours: sleepH === "" ? null : Number(sleepH),
      stress_or_illness: stress,
      historical_hypo_bias_0_100: histBias === "" ? null : Number(histBias),
    };
  }, [
    glucose,
    roc,
    doses,
    mealSkipped,
    mealMins,
    mealCarbs,
    actIntensity,
    actMins,
    actDur,
    localHour,
    localMinute,
    symptoms,
    sleepQ,
    sleepH,
    stress,
    histBias,
  ]);

  const runAssess = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/assess"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail.map((x) => x.msg || JSON.stringify(x)).join("; ")
              : data.message;
        throw new Error(detail || `Request failed (${res.status})`);
      }
      setLastPayload(payload);
      setResult(data);
    } catch (e) {
      setResult(null);
      setLastPayload(null);
      setError(e.message || "Could not reach API. Is the Python server running on port 8000?");
    } finally {
      setLoading(false);
    }
  }, []);

  const processFile = useCallback(
    async (file) => {
      if (!file) return;
      setFileName(file.name);
      setResult(null);
      setLastPayload(null);
      setError(null);
      const text = await file.text();
      try {
        const payload = parsePayloadFile(text, file.name);
        await runAssess(payload);
      } catch (e) {
        setError(e.message || "Could not read file.");
      }
    },
    [runAssess]
  );

  const onInputChange = (e) => {
    const f = e.target.files?.[0];
    if (f) void processFile(f);
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void processFile(f);
  };

  const levelStyle = result ? LEVEL_STYLES[result.level] || LEVEL_STYLES.low : null;
  const g0 = lastPayload ? Number(lastPayload.glucose_mg_dl) : null;
  const rocPayload = lastPayload ? Number(lastPayload.roc_mg_dl_per_min) : null;

  return (
    <div
      className={`mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 lg:px-8 ${
        result?.level === "critical" ? "hypo-pulse-critical rounded-3xl" : ""
      }`}
    >
      <header className="mb-6 text-center animate-fade-in">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400/90">
          HypoGuard
        </p>
        <h1 className="animate-blur-in font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Hypoglycaemia risk assessment
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
          Choose <strong className="font-medium text-slate-300">upload</strong> (
          <span className="text-cyan-400/90">.json</span> or{" "}
          <span className="text-cyan-400/90">.csv</span>) or{" "}
          <strong className="font-medium text-slate-300">manual entry</strong>. The API runs the
          rule-based HypoGuard engine plus a small <strong className="text-fuchsia-300/90">PyTorch LSTM</strong>{" "}
          when weights are installed (<code className="text-slate-400">scripts/train_cgm_lstm.py</code>
          ).
        </p>
      </header>

      <div className="mx-auto mb-8 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2 sm:rounded-xl sm:border sm:border-white/10 sm:bg-surface-800/60 sm:p-1">
        <button
          type="button"
          onClick={() => {
            setInputMode("upload");
            setError(null);
          }}
          className={`rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ease-smooth active:scale-[0.98] ${
            inputMode === "upload"
              ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-500/40 shadow-[0_0_24px_-4px_rgba(34,211,238,0.35)]"
              : "text-slate-400 hover:bg-surface-700/50 hover:text-slate-200"
          }`}
        >
          Upload JSON / CSV
        </button>
        <button
          type="button"
          onClick={() => {
            setInputMode("manual");
            setError(null);
          }}
          className={`rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ease-smooth active:scale-[0.98] ${
            inputMode === "manual"
              ? "bg-violet-500/20 text-violet-100 ring-1 ring-violet-500/40 shadow-[0_0_24px_-4px_rgba(167,139,250,0.35)]"
              : "text-slate-400 hover:bg-surface-700/50 hover:text-slate-200"
          }`}
        >
          Enter manually
        </button>
      </div>

      {inputMode === "upload" && (
        <div key="mode-upload" className="animate-mode-switch">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`glass cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center shadow-card transition-all duration-300 ease-smooth hover:scale-[1.015] active:scale-[0.99] ${
              dragOver
                ? "border-cyan-400/60 bg-cyan-500/5 shadow-[0_0_40px_-8px_rgba(34,211,238,0.35)]"
                : "border-white/[0.12] hover:border-cyan-500/30"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".json,.csv,.txt,application/json,text/csv"
              className="hidden"
              onChange={onInputChange}
            />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-700 text-2xl">
              📄
            </div>
            <p className="font-medium text-slate-200">Click or drop JSON / CSV here</p>
            <p className="mt-2 text-sm text-slate-500">
              {loading
                ? "Running assessment…"
                : fileName
                  ? `Last file: ${fileName}`
                  : "Header + one row for CSV"}
            </p>
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">
            Templates:{" "}
            <a
              href="/sample-hypoguard-input.json"
              download
              className="text-cyan-400 underline decoration-cyan-500/30 underline-offset-2 hover:text-cyan-300"
            >
              sample.json
            </a>
            {" · "}
            <a
              href="/sample-hypoguard-input.csv"
              download
              className="text-cyan-400 underline decoration-cyan-500/30 underline-offset-2 hover:text-cyan-300"
            >
              sample.csv
            </a>
          </p>
        </div>
      )}

      {inputMode === "manual" && (
        <div key="mode-manual" className="animate-mode-switch space-y-6">
          <section className="glass glass-interactive rounded-2xl p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold text-white">Glucose &amp; time</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <Field label="Glucose" hint="mg/dL">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="range"
                    min="40"
                    max="300"
                    value={glucose}
                    onChange={(e) => setGlucose(Number(e.target.value))}
                    className="h-2 min-w-[140px] flex-1 cursor-pointer appearance-none rounded-full bg-surface-600 accent-cyan-400"
                  />
                  <input
                    type="number"
                    min="0"
                    max="600"
                    value={glucose}
                    onChange={(e) => setGlucose(Number(e.target.value) || 0)}
                    className="w-24 rounded-xl border border-white/[0.08] bg-surface-900 px-3 py-2 text-right font-mono text-sm text-white outline-none focus:ring-2 focus:ring-cyan-400/40"
                  />
                </div>
              </Field>
              <Field label="Rate of change" hint="mg/dL per min (− = falling)">
                <input
                  type="number"
                  step="0.1"
                  value={roc}
                  onChange={(e) => setRoc(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 font-mono text-sm text-white outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
              </Field>
              <Field label="Local hour" hint="0–23">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={localHour}
                  onChange={(e) => setLocalHour(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
              </Field>
              <Field label="Local minute" hint="0–59">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={localMinute}
                  onChange={(e) => setLocalMinute(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
              </Field>
            </div>
          </section>

          <section className="glass glass-interactive rounded-2xl p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-white">Insulin</h2>
              <button
                type="button"
                onClick={() => setDoses((d) => [...d, emptyDose()])}
                className="rounded-full bg-surface-600 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-surface-600/80"
              >
                + Add dose
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {doses.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 bg-surface-900/40 py-6 text-center text-sm text-slate-500">
                  No boluses — leave empty if none.
                </p>
              )}
              {doses.map((d, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.06] bg-surface-900/40 p-4"
                >
                  <div className="min-w-[120px] flex-1">
                    <label className="text-xs text-slate-500">Type</label>
                    <select
                      value={d.type}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDoses((all) => all.map((x, j) => (j === i ? { ...x, type: v } : x)));
                      }}
                      className="mt-1 w-full rounded-lg border border-white/[0.08] bg-surface-900 px-3 py-2 text-sm text-white"
                    >
                      <option value="rapid">Rapid</option>
                      <option value="regular">Regular</option>
                      <option value="long">Long</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-slate-500">Units</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={d.units}
                      onChange={(e) =>
                        setDoses((all) => all.map((x, j) => (j === i ? { ...x, units: e.target.value } : x)))
                      }
                      className="mt-1 w-full rounded-lg border border-white/[0.08] bg-surface-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="w-28">
                    <label className="text-xs text-slate-500">Min ago</label>
                    <input
                      type="number"
                      min="0"
                      value={d.minutes_since}
                      onChange={(e) =>
                        setDoses((all) =>
                          all.map((x, j) => (j === i ? { ...x, minutes_since: e.target.value } : x))
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-white/[0.08] bg-surface-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDoses((all) => all.filter((_, j) => j !== i))}
                    className="rounded-lg px-3 py-2 text-sm text-rose-400/90 hover:bg-rose-500/10"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="glass glass-interactive rounded-2xl p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold text-white">Meal &amp; activity</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                <Toggle
                  checked={mealSkipped}
                  onChange={setMealSkipped}
                  label="Skipped or light meal"
                />
                <Field label="Minutes since meal" hint="optional">
                  <input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={mealMins}
                    onChange={(e) => setMealMins(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white placeholder:text-slate-600"
                  />
                </Field>
                <Field label="Carbs (g)" hint="optional">
                  <input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={mealCarbs}
                    onChange={(e) => setMealCarbs(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white placeholder:text-slate-600"
                  />
                </Field>
              </div>
              <div className="space-y-4">
                <Field label="Activity intensity">
                  <select
                    value={actIntensity}
                    onChange={(e) => setActIntensity(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white"
                  >
                    <option value="none">None</option>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="intense">Intense</option>
                  </select>
                </Field>
                <Field label="Minutes since activity" hint="optional">
                  <input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={actMins}
                    onChange={(e) => setActMins(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white"
                  />
                </Field>
                <Field label="Duration (min)" hint="optional">
                  <input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={actDur}
                    onChange={(e) => setActDur(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white"
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="glass glass-interactive rounded-2xl p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold text-white">Symptoms &amp; context</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Toggle
                checked={symptoms.shakiness}
                onChange={(v) => updateSymptom("shakiness", v)}
                label="Shakiness"
              />
              <Toggle
                checked={symptoms.sweating}
                onChange={(v) => updateSymptom("sweating", v)}
                label="Sweating"
              />
              <Toggle
                checked={symptoms.confusion}
                onChange={(v) => updateSymptom("confusion", v)}
                label="Confusion"
              />
              <Toggle
                checked={symptoms.hunger}
                onChange={(v) => updateSymptom("hunger", v)}
                label="Hunger"
              />
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Field label="Sleep quality" hint="0–100">
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="—"
                  value={sleepQ}
                  onChange={(e) => setSleepQ(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white"
                />
              </Field>
              <Field label="Sleep hours">
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  placeholder="—"
                  value={sleepH}
                  onChange={(e) => setSleepH(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white"
                />
              </Field>
              <Field label="Hypo history bias" hint="0–100">
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="—"
                  value={histBias}
                  onChange={(e) => setHistBias(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-surface-900 px-4 py-3 text-sm text-white"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Toggle
                checked={stress}
                onChange={setStress}
                label="Stress or illness"
                description="Higher variability"
              />
            </div>
          </section>

          <button
            type="button"
            onClick={() => {
              setFileName("Manual entry (form)");
              void runAssess(buildManualPayload());
            }}
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-500 py-4 font-display text-base font-semibold text-white shadow-lg shadow-violet-500/20 transition-all duration-300 ease-smooth hover:brightness-110 hover:shadow-[0_0_36px_-6px_rgba(167,139,250,0.45)] active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100"
          >
            {loading ? "Running…" : "Run assessment"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-6 animate-slide-up rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 shadow-[0_0_24px_-8px_rgba(251,113,133,0.35)]">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-10 flex animate-fade-in flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 animate-ping rounded-full border border-cyan-400/30 opacity-40" />
            <div className="relative h-12 w-12 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
          </div>
          <p className="animate-pulse text-sm text-slate-400">Computing risk…</p>
        </div>
      )}

      {result && levelStyle && !loading && lastPayload && g0 != null && rocPayload != null && (
        <div className="hg-stagger mt-10 space-y-8">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                speakBriefing(
                  result.summary,
                  result.recommendation,
                  result.prevention_suggestions
                )
              }
              className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200 transition-all duration-200 ease-smooth hover:bg-violet-500/20 hover:shadow-[0_0_20px_-6px_rgba(167,139,250,0.4)] active:scale-95"
            >
              Voice briefing
            </button>
            <button
              type="button"
              onClick={() =>
                downloadSnapshot({ sourceFile: fileName, payload: lastPayload, result })
              }
              className="rounded-xl border border-slate-500/40 bg-surface-800 px-4 py-2 text-sm font-medium text-slate-200 transition-all duration-200 ease-smooth hover:border-slate-400/50 hover:bg-surface-700 active:scale-95"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={() =>
                downloadSnapshotCsv({ sourceFile: fileName, payload: lastPayload, result })
              }
              className="rounded-xl border border-sky-500/35 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-200 transition-all duration-200 ease-smooth hover:bg-sky-500/20 hover:shadow-[0_0_20px_-6px_rgba(56,189,248,0.35)] active:scale-95"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                void downloadSnapshotExcel({
                  sourceFile: fileName,
                  payload: lastPayload,
                  result,
                }).catch((err) => {
                  console.error(err);
                  window.alert(
                    err?.message
                      ? `Excel export failed: ${err.message}`
                      : "Excel export failed. Try npm install in the web folder."
                  );
                });
              }}
              className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition-all duration-200 ease-smooth hover:bg-emerald-500/20 hover:shadow-[0_0_20px_-6px_rgba(52,211,153,0.35)] active:scale-95"
            >
              Export Excel
            </button>
          </div>

          <div
            className={`glass glass-interactive rounded-2xl p-8 shadow-card ${result.level === "critical" ? "border-rose-500/30" : ""}`}
          >
            <RiskRing score={result.score} level={result.level} />
            <div className="mt-4 text-center">
              <span
                className={`inline-flex rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-wider ${levelStyle.badge}`}
              >
                {levelStyle.label} risk
              </span>
            </div>
            <dl className="mt-8 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl bg-surface-900/60 px-3 py-2">
                <dt className="text-slate-500">~30 min glucose</dt>
                <dd className="font-mono text-lg text-white">{result.predicted_glucose_30min} mg/dL</dd>
              </div>
              <div className="rounded-xl bg-surface-900/60 px-3 py-2">
                <dt className="text-slate-500">Window to ~70</dt>
                <dd className="font-mono text-lg text-white">
                  {result.window_minutes ? `${result.window_minutes} min` : "—"}
                </dd>
              </div>
              <div className="rounded-xl bg-surface-900/60 px-3 py-2">
                <dt className="text-slate-500">Recheck in</dt>
                <dd className="font-mono text-lg text-cyan-300">{result.follow_up_minutes} min</dd>
              </div>
              <div className="rounded-xl bg-surface-900/60 px-3 py-2">
                <dt className="text-slate-500">Alert caregiver</dt>
                <dd className="text-lg text-white">{result.alert_caregiver ? "Yes" : "No"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  result.safe_to_drive
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-rose-500/15 text-rose-200"
                }`}
              >
                Drive: {result.safe_to_drive ? "OK" : "Avoid"}
              </span>
              <span
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  result.safe_to_exercise
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-200"
                }`}
              >
                Exercise: {result.safe_to_exercise ? "OK" : "Pause"}
              </span>
            </div>
          </div>

          <PreventionPlan
            suggestions={result.prevention_suggestions}
            note={result.prevention_engine_note}
          />

          {result.ml_model && (
            <div className="glass glass-interactive rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/5 p-6 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-300/90">
                PyTorch LSTM (trained on synthetic CGM)
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-slate-500">{result.ml_model.id}</p>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-surface-900/60 px-3 py-2">
                  <dt className="text-slate-500">ML ~30 min glucose</dt>
                  <dd className="font-mono text-lg text-fuchsia-200">
                    {result.ml_model.predicted_glucose_30min} mg/dL
                  </dd>
                </div>
                <div className="rounded-xl bg-surface-900/60 px-3 py-2">
                  <dt className="text-slate-500">P(glucose &lt; 70)</dt>
                  <dd className="font-mono text-lg text-white">
                    {(result.ml_model.hypo_probability * 100).toFixed(1)}%
                  </dd>
                </div>
                <div className="rounded-xl bg-surface-900/60 px-3 py-2 sm:col-span-1">
                  <dt className="text-slate-500">vs rule engine</dt>
                  <dd className="text-sm text-slate-400">
                    Δ{" "}
                    {result.ml_model.predicted_glucose_30min - result.predicted_glucose_30min > 0
                      ? "+"
                      : ""}
                    {result.ml_model.predicted_glucose_30min - result.predicted_glucose_30min} mg/dL
                  </dd>
                </div>
              </dl>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-400 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, result.ml_model.hypo_probability * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">{result.ml_model.note}</p>
            </div>
          )}

          <TrajectoryLens
            glucose={g0}
            roc={rocPayload}
            enginePred30={result.predicted_glucose_30min}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <IOBPeakStrip doses={lastPayload.insulin_doses} />
            <FactorConstellation factors={result.factors} />
          </div>

          <div className="glass glass-interactive rounded-2xl p-6 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{result.summary}</p>
          </div>

          <div className="glass glass-interactive rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400/80">
              Do this now
            </p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-100">
              {result.recommendation}
            </p>
          </div>

          <div className="glass glass-interactive rounded-2xl p-6 shadow-card">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Factors
            </p>
            <ul className="space-y-2 text-sm">
              {result.factors.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-lg bg-surface-900/40 px-3 py-2"
                >
                  <span className="text-slate-300">{f.name}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-500">{f.impact}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
