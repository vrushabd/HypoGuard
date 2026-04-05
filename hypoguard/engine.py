from __future__ import annotations

import json
from typing import Literal

from hypoguard.models import (
    ActivityInfo,
    FactorOut,
    HypoGuardInput,
    HypoGuardOutput,
    InsulinDose,
    MealInfo,
    PreventionCategory,
    PreventionSuggestion,
    Symptoms,
)

PREVENTION_ENGINE_NOTE = (
    "Impact percentages estimate how much each step could lower this snapshot's risk score "
    "(heuristic decision support, not a measured clinical outcome — follow your care team)."
)


def _heuristic_risk_reduction_pct(current_score: int, score_delta: float) -> int:
    """Map an expected drop on the 0–100 risk scale to a user-facing percentage (capped)."""
    if current_score <= 0 or score_delta <= 0:
        return 0
    eff = min(float(score_delta), float(current_score))
    pct = round(100.0 * eff / max(float(current_score), 14.0))
    return int(max(6, min(90, pct)))


def build_prevention_suggestions(
    inp: HypoGuardInput,
    *,
    score: int,
    pred30: float,
    follow: int,
    safe_to_drive: bool,
    safe_to_exercise: bool,
    alert_caregiver: bool,
    iob_imp: int,
    meal_imp: int,
    act_imp: int,
    roc_imp: int,
    traj_imp: int,
    hist_imp: int,
    g: float,
    roc: float,
) -> list[PreventionSuggestion]:
    has_rapid = any(
        d.type in ("rapid", "unknown") and d.minutes_since < 240 for d in inp.insulin_doses
    )
    confusion = bool(inp.symptoms and inp.symptoms.confusion)
    raw: list[tuple[str, PreventionCategory, str, str, float]] = []

    if g < 70 or pred30 < 88 or score >= 28:
        delta = 16.0
        if pred30 < 70:
            delta += 14.0
        elif pred30 < 85:
            delta += 8.0
        if g < 54:
            delta += 10.0
        elif g < 70:
            delta += 6.0
        if roc < -1.0:
            delta += 5.0
        grams = "12–15 g"
        if g < 54 or pred30 < 60:
            grams = "15–20 g"
        raw.append(
            (
                "fast_carbs",
                "nutrition",
                "Take fast-acting carbohydrate",
                f"About {grams} now (for example glucose tablets or 4 oz juice). "
                "Follow your care plan for repeat dosing and timing.",
                delta,
            )
        )

    if not safe_to_drive:
        raw.append(
            (
                "avoid_driving",
                "safety",
                "Do not drive",
                "Operate no vehicles until glucose is clearly safe and stable and any neuro "
                "symptoms have resolved.",
                12.0 + min(18.0, score * 0.22),
            )
        )

    if not safe_to_exercise and (act_imp >= 18 or score >= 35 or pred30 < 90):
        raw.append(
            (
                "delay_exercise",
                "activity",
                "Delay or lighten exercise",
                "Strenuous activity can drop glucose faster; resume when trend and symptoms support it.",
                10.0 + act_imp * 0.16 + (4.0 if roc < -0.8 else 0.0),
            )
        )

    if score >= 20:
        raw.append(
            (
                "monitor_timed",
                "monitoring",
                f"Recheck in about {follow} minutes",
                "Confirm trend with CGM or fingerstick so corrections stay proportional.",
                9.0 + min(12.0, roc_imp * 0.11) + (3.0 if traj_imp >= 50 else 0.0),
            )
        )

    if iob_imp >= 32:
        raw.append(
            (
                "avoid_stacking",
                "insulin",
                "Avoid stacking insulin",
                "Extra correction bolus while active insulin is peaking increases hypo risk; "
                "prefer food or glucose per protocol.",
                8.0 + iob_imp * 0.17,
            )
        )

    if meal_imp >= 38 or (
        inp.meal is not None and inp.meal.skipped_or_light and has_rapid
    ):
        raw.append(
            (
                "meal_coverage",
                "nutrition",
                "Cover insulin with carbs",
                "Eat planned carbs or a matched snack if rapid insulin is on board; coordinate "
                "dose changes with your clinician.",
                7.0 + meal_imp * 0.18,
            )
        )

    if alert_caregiver:
        d_bonus = 14.0 if confusion else 10.0
        raw.append(
            (
                "caregiver_awareness",
                "support",
                "Loop in a caregiver",
                "Have someone available if you feel confused, cannot treat yourself, or glucose "
                "is falling quickly.",
                d_bonus + (6.0 if score >= 78 else 0.0),
            )
        )

    if inp.stress_or_illness and score >= 22:
        raw.append(
            (
                "illness_monitoring",
                "monitoring",
                "Tighter checks during illness or stress",
                "Sick days shift sensitivity; add structured checks until readings stabilize.",
                7.0 + min(6.0, score * 0.05),
            )
        )

    if hist_imp >= 38:
        raw.append(
            (
                "pattern_hypos",
                "support",
                "Use your hypo history",
                "Your pattern index suggests preventive timing or portions — review trends with "
                "your diabetes team.",
                6.0 + hist_imp * 0.08,
            )
        )

    seen: set[str] = set()
    deduped: list[tuple[str, PreventionCategory, str, str, float]] = []
    for row in raw:
        rid = row[0]
        if rid in seen:
            continue
        seen.add(rid)
        deduped.append(row)

    if not deduped:
        deduped.append(
            (
                "routine_ok",
                "monitoring",
                "Keep your usual monitoring rhythm",
                "No immediate rescue steps from this snapshot; continue scheduled checks and watch "
                "for rapid trend changes.",
                5.0,
            )
        )

    deduped.sort(key=lambda x: x[4], reverse=True)

    out: list[PreventionSuggestion] = []
    for i, (sid, cat, title, detail, sdelta) in enumerate(deduped, start=1):
        pct = _heuristic_risk_reduction_pct(score, sdelta)
        out.append(
            PreventionSuggestion(
                id=sid,
                rank=i,
                category=cat,
                title=title,
                detail=detail,
                risk_reduction_percent=pct,
            )
        )
    return out


def _predict_linear(mg_dl: float, roc: float, minutes: float) -> float:
    return mg_dl + roc * minutes


def _minutes_to_threshold(
    current: float, roc: float, threshold: float = 70.0
) -> int | None:
    if roc >= 0 or current <= threshold:
        return None
    mins = (current - threshold) / abs(roc)
    if mins < 0 or mins > 240:
        return None
    return int(round(mins))


def _rapid_peak_window(dose: InsulinDose) -> bool:
    if dose.type not in ("rapid", "unknown"):
        return False
    return 60 <= dose.minutes_since <= 90


def _iob_stack_score(doses: list[InsulinDose]) -> tuple[int, str]:
    if not doses:
        return 0, "No recent insulin logged."
    rapid = [d for d in doses if d.type in ("rapid", "unknown")]
    units = sum(d.units for d in rapid)
    in_peak = sum(1 for d in rapid if _rapid_peak_window(d))
    score = min(100, int(units * 6 + in_peak * 22 + len(rapid) * 12))
    note = "Rapid insulin near peak." if in_peak else "Active insulin on board."
    return score, note


def _meal_score(meal: MealInfo | None, has_active_rapid: bool) -> tuple[int, str]:
    if meal is None:
        return 15 if has_active_rapid else 5, "Meal data not provided."
    if meal.skipped_or_light:
        return 75 if has_active_rapid else 45, "Light or skipped meal."
    if meal.carbs_g is not None and meal.carbs_g < 20 and has_active_rapid:
        return 55, "Low carbs vs insulin."
    if meal.carbs_g is not None and meal.carbs_g >= 40:
        return 10, "Adequate carbs reported."
    return 20, "Meal timing/carbs unclear."


def _activity_score(act: ActivityInfo | None) -> tuple[int, str]:
    if act is None or act.intensity == "none":
        return 5, "No recent exercise flagged."
    if act.minutes_since is None or act.minutes_since > 24 * 60:
        return 8, "Distant activity."
    hours_ago = act.minutes_since / 60.0
    mult = 1.0
    if act.intensity == "intense":
        mult = 1.35
    elif act.intensity == "moderate":
        mult = 1.0
    else:
        mult = 0.65
    if hours_ago <= 24:
        base = 35 * mult
        if hours_ago < 3:
            base += 25
        elif hours_ago < 8:
            base += 15
        return min(100, int(base)), "Recent activity raises sensitivity."
    return 10, "Activity noted."


def _symptom_score(
    sx: Symptoms | None, glucose: float, pred30: float
) -> tuple[int, str]:
    if sx is None:
        return 0, "No symptoms reported."
    any_sx = sx.shakiness or sx.sweating or sx.confusion or sx.hunger
    if not any_sx:
        return 0, "No symptoms reported."
    borderline = glucose < 95 or pred30 < 90
    confusion = sx.confusion
    base = 40 if borderline else 22
    if confusion:
        base += 25
    if sx.sweating or sx.shakiness:
        base += 10
    return min(100, base), "Symptoms match possible low."


def _sleep_score(
    quality: int | None, hours: float | None
) -> tuple[int, str]:
    if quality is None and hours is None:
        return 5, "Sleep not reported."
    s = 10
    if quality is not None and quality < 40:
        s += 35
    if hours is not None and hours < 5:
        s += 25
    return min(100, s), "Poor sleep adds variability."


def _circadian_adjustment(hour: int) -> tuple[int, str]:
    if 2 <= hour <= 4:
        return 13, "Nocturnal hypo-prone window."
    if hour == 14 or hour == 15:
        return 6, "Post-lunch dip window."
    return 0, "Typical daytime window."


def _trajectory_scores(
    g: float, roc: float, pred30: float
) -> tuple[int, int, str, str]:
    """Returns (trajectory_impact, roc_impact, traj_note, roc_note)."""
    traj = 0
    if g < 54:
        traj = 100
    elif g < 70:
        traj = 82
    elif pred30 < 54:
        traj = 92
    elif pred30 < 70:
        traj = 68
    elif pred30 < 85 and roc < 0:
        traj = 42
    elif pred30 < 100 and roc < -0.8:
        traj = 28
    else:
        traj = 12

    roc_imp = 0
    if roc <= -2.5:
        roc_imp = 95
    elif roc < -1.5:
        roc_imp = 78
    elif roc < -1.0:
        roc_imp = 52
    elif roc < -0.5:
        roc_imp = 30
    elif roc > 0.5:
        roc_imp = 8
    else:
        roc_imp = 15

    traj_note = (
        "Glucose already in hypo range."
        if g < 70
        else "Projected approach to 70 mg/dL."
        if pred30 < 85
        else "Trajectory relatively safe."
    )
    roc_note = (
        "Fast fall on CGM."
        if roc < -1.5
        else "Gentle rise or flat trend."
        if roc >= -0.3
        else "Modest downward trend."
    )
    return traj, roc_imp, traj_note, roc_note


def _level_from_score(score: int) -> Literal["low", "moderate", "high", "critical"]:
    if score >= 85:
        return "critical"
    if score >= 65:
        return "high"
    if score >= 35:
        return "moderate"
    return "low"


def _compose_recommendation(
    out: HypoGuardOutput, inp: HypoGuardInput, pred30: float
) -> str:
    g = inp.glucose_mg_dl
    if out.level == "critical" or g < 54:
        return (
            "Eat 15–20 g fast carbs now (for example 4 glucose tablets or 4 oz juice), "
            "recheck in 15 minutes, and do not drive. If you remain confused, very drowsy, "
            "or below 54 mg/dL after treatment, have someone stay with you and use your emergency glucagon plan."
        )
    if out.level == "high" or g < 70:
        return (
            "Take 15 g fast-acting carbohydrate now, wait 15 minutes, recheck your glucose, "
            "and avoid driving until you are clearly above 70 mg/dL and feeling steady."
        )
    if out.level == "moderate":
        tail = (
            f"Eat about 10–15 g carbs now if you have active insulin or a continuing downward trend "
            f"(your ~30 min projection is near {int(pred30)} mg/dL), and recheck on schedule."
        )
        if not out.safe_to_drive:
            tail += " Do not drive until you are clearly in range and feeling steady."
        else:
            tail += " If you feel off, treat first and delay driving."
        return tail
    return (
        "Keep your usual monitoring pattern; no immediate hypo rescue is indicated from this snapshot. "
        "If your trend accelerates downward or you develop symptoms, treat with 15 g fast carbs and recheck."
    )


def _compose_summary(
    out: HypoGuardOutput, inp: HypoGuardInput, pred30: float, window: int
) -> str:
    g = inp.glucose_mg_dl
    roc = inp.roc_mg_dl_per_min
    parts = [
        f"Your glucose is about {g:.0f} mg/dL with a trend of roughly {roc:+.1f} mg/dL per minute, "
        f"so in 30 minutes you may be near {pred30:.0f} mg/dL."
    ]
    if window > 0 and roc < 0:
        parts.append(
            f"If that drop continues, you could approach 70 mg/dL in roughly {window} minutes."
        )
    if out.level in ("high", "critical"):
        parts.append(
            "That combination pushes your hypo risk up, so quick carbs and a timely recheck matter right now."
        )
    elif out.level == "moderate":
        parts.append(
            "Risk is elevated enough that a small preventive snack or glucose check soon is reasonable."
        )
    else:
        parts.append("From this bundle, imminent severe hypo looks unlikely, but keep watching the trend.")
    return " ".join(parts)


def assess(inp: HypoGuardInput) -> HypoGuardOutput:
    g = inp.glucose_mg_dl
    roc = inp.roc_mg_dl_per_min
    pred30 = _predict_linear(g, roc, 30.0)

    window_raw = _minutes_to_threshold(g, roc, 70.0)
    window_minutes = 0
    if g < 70:
        window_minutes = 0
    elif window_raw is not None and pred30 < 85:
        window_minutes = max(0, window_raw)
    elif window_raw is not None and roc < -0.3:
        window_minutes = max(0, window_raw)

    has_rapid = any(
        d.type in ("rapid", "unknown") and d.minutes_since < 240 for d in inp.insulin_doses
    )
    iob_imp, iob_note = _iob_stack_score(inp.insulin_doses)
    meal_imp, meal_note = _meal_score(inp.meal, has_rapid)
    act_imp, act_note = _activity_score(inp.activity)
    sx_imp, sx_note = _symptom_score(inp.symptoms, g, pred30)
    sleep_imp, sleep_note = _sleep_score(inp.sleep_quality_0_100, inp.sleep_hours)

    traj_imp, roc_imp, traj_note, roc_note = _trajectory_scores(g, roc, pred30)
    circ_add, circ_note = _circadian_adjustment(inp.local_hour)

    hist_imp = 0
    hist_note = "No personal pattern index."
    if inp.historical_hypo_bias_0_100 is not None:
        hist_imp = min(100, inp.historical_hypo_bias_0_100)
        hist_note = "Your history suggests hypo tendency."

    stress_imp = 55 if inp.stress_or_illness else 8
    stress_note = "Illness or stress increases variability." if inp.stress_or_illness else "No illness flag."

    weighted = (
        traj_imp * 0.28
        + roc_imp * 0.22
        + iob_imp * 0.14
        + meal_imp * 0.10
        + act_imp * 0.08
        + sx_imp * 0.08
        + sleep_imp * 0.04
        + stress_imp * 0.04
        + hist_imp * 0.06
    )
    score = int(round(weighted + circ_add))
    score = max(0, min(100, score))

    if inp.symptoms and inp.symptoms.confusion and g < 90:
        score = max(score, 72)
    if g < 54:
        score = max(score, 88)
    elif g < 70:
        score = max(score, 68)

    level = _level_from_score(score)
    pred_int = int(round(pred30))

    alert_caregiver = score >= 85 or pred_int < 60
    safe_to_drive = not (score >= 65 or g < 70 or pred_int < 70)
    if inp.symptoms and inp.symptoms.confusion:
        safe_to_drive = False

    safe_to_exercise = (
        score < 40 and pred_int >= 90 and roc > -0.8 and g >= 90
    )
    if g < 80 or pred_int < 85:
        safe_to_exercise = False
    if roc <= -1.0:
        safe_to_exercise = False

    follow = 20 if level == "low" else 15 if level == "moderate" else 10

    traj_risk_up = g < 90 or pred30 < 85
    factors: list[FactorOut] = [
        FactorOut(
            name="Glucose trajectory",
            impact=min(100, traj_imp),
            direction="increasing" if traj_risk_up else "decreasing" if pred30 > g + 15 else "neutral",
            note=traj_note,
        ),
        FactorOut(
            name="Rate of change",
            impact=min(100, roc_imp),
            direction="increasing" if roc < -0.3 else "decreasing" if roc > 0.5 else "neutral",
            note=roc_note,
        ),
        FactorOut(
            name="Insulin on board",
            impact=min(100, iob_imp),
            direction="increasing" if iob_imp >= 40 else "neutral",
            note=iob_note,
        ),
        FactorOut(
            name="Meals & carbs",
            impact=min(100, meal_imp),
            direction="increasing" if meal_imp >= 45 else "neutral",
            note=meal_note,
        ),
        FactorOut(
            name="Activity & sensitivity",
            impact=min(100, act_imp),
            direction="increasing" if act_imp >= 35 else "neutral",
            note=act_note,
        ),
        FactorOut(
            name="Time-of-day pattern",
            impact=min(100, circ_add + 15),
            direction="increasing" if circ_add > 0 else "neutral",
            note=circ_note,
        ),
        FactorOut(
            name="Reported symptoms",
            impact=min(100, sx_imp),
            direction="increasing" if sx_imp >= 30 else "neutral",
            note=sx_note,
        ),
        FactorOut(
            name="Sleep & recovery",
            impact=min(100, sleep_imp),
            direction="increasing" if sleep_imp >= 30 else "neutral",
            note=sleep_note,
        ),
        FactorOut(
            name="Stress / illness",
            impact=min(100, stress_imp),
            direction="increasing" if inp.stress_or_illness else "neutral",
            note=stress_note,
        ),
        FactorOut(
            name="Your hypo patterns",
            impact=min(100, hist_imp),
            direction="increasing" if hist_imp >= 40 else "neutral",
            note=hist_note,
        ),
    ]

    prev = build_prevention_suggestions(
        inp,
        score=score,
        pred30=pred30,
        follow=follow,
        safe_to_drive=safe_to_drive,
        safe_to_exercise=safe_to_exercise,
        alert_caregiver=alert_caregiver,
        iob_imp=iob_imp,
        meal_imp=meal_imp,
        act_imp=act_imp,
        roc_imp=roc_imp,
        traj_imp=traj_imp,
        hist_imp=hist_imp,
        g=g,
        roc=roc,
    )

    out = HypoGuardOutput(
        score=score,
        level=level,
        window_minutes=window_minutes,
        predicted_glucose_30min=pred_int,
        factors=factors,
        recommendation="",
        summary="",
        alert_caregiver=alert_caregiver,
        safe_to_exercise=safe_to_exercise,
        safe_to_drive=safe_to_drive,
        follow_up_minutes=follow,
        prevention_suggestions=prev,
        prevention_engine_note=PREVENTION_ENGINE_NOTE,
    )
    out.recommendation = _compose_recommendation(out, inp, pred30)
    out.summary = _compose_summary(out, inp, pred30, window_minutes)
    low = out.recommendation.lower()
    if not out.safe_to_drive and "driv" not in low:
        out.recommendation += " Do not drive until you are safe and back in range."
    return out


def assess_to_json(inp: HypoGuardInput, *, indent: int | None = None) -> str:
    out = assess(inp)
    return out.model_dump_json(indent=indent)


def assess_dict(inp_dict: dict) -> dict:
    return assess(HypoGuardInput.model_validate(inp_dict)).model_dump()


def main_cli() -> None:
    import sys

    raw = sys.stdin.read()
    if not raw.strip():
        print(
            json.dumps({"error": "Provide JSON on stdin matching HypoGuardInput"}),
            file=sys.stderr,
        )
        sys.exit(1)
    data = json.loads(raw)
    print(assess_to_json(HypoGuardInput.model_validate(data)))


if __name__ == "__main__":
    main_cli()
