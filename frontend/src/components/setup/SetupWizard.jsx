import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { DIME_KEYWORDS } from "../simulation/ActionTimeline";

/**
 * SetupWizard - Guided scenario configuration flow
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Steps: Payload → Environment → Personalities → Initial Action
 *
 * Personality step features:
 *  - Interactive radar chart (drag dots along axes)
 *  - Percentage-mode goal priority sliders (auto-rebalance to 100%)
 *  - Full parameter accordion with tooltips
 *  - All edits flow to backend via onActorProfileChange
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Parameter Metadata — tooltips, ranges, categories
// ═══════════════════════════════════════════════════════════════════════════════

const PARAM_META = {
  // ── Radar chart params ──
  analytical_competence: {
    label: "Analytical Competence",
    short: "Analytical Competence",
    tip: "Ability to perceive and interpret signals from observed actions",
    lo: "Poor perception, high noise", hi: "Excellent, clear signal reading",
    min: 0.1, max: 1.0, step: 0.01,
  },
  belief_update_bias: {
    label: "Belief Update Bias",
    short: "Belief Bias",
    tip: "How strongly observed signals shift beliefs about adversary",
    lo: "Conservative, slow adaptation", hi: "Aggressive, rapid belief shifts",
    min: 0.3, max: 2.0, step: 0.01,
  },
  pt_lambda: {
    label: "Loss Aversion (λ)",
    short: "Loss Aversion",
    tip: "How much losses hurt relative to equivalent gains (Kahneman & Tversky)",
    lo: "1.0 — symmetric, risk-neutral", hi: "4.0 — extreme loss aversion",
    min: 1.0, max: 4.0, step: 0.05,
  },
  pt_alpha: {
    label: "Risk Sensitivity (α)",
    short: "Risk Sensitivity",
    tip: "Diminishing sensitivity exponent — curvature of the PT value function",
    lo: "0.5 — strong diminishing returns", hi: "1.0 — linear sensitivity",
    min: 0.5, max: 1.0, step: 0.01,
  },
  temporal_discount_rate: {
    label: "Temporal Discount",
    short: "Discount",
    tip: "How much future payoffs are discounted relative to immediate ones",
    lo: "Patient — future valued equally", hi: "Impatient — future nearly worthless",
    min: 0.0, max: 1.0, step: 0.01,
  },
  clarity_preference_scalar: {
    label: "Clarity Preference",
    short: "Clarity Pref.",
    tip: "Preference for clear, unambiguous actions over uncertain ones",
    lo: "Indifferent to ambiguity", hi: "Strong preference for clarity",
    min: 0.0, max: 1.0, step: 0.01,
  },
  // ── Additional params ──
  surprise_weight: {
    label: "Surprise Weight",
    tip: "Balance: surprise-driven vs ambiguity-driven perception",
    lo: "Relies on baseline ambiguity", hi: "Highly reactive to surprises",
    min: 0.0, max: 1.0, step: 0.01,
  },
  bias_amplification_parameter: {
    label: "Bias Amplification",
    tip: "Non-linear exponent for perception distortion",
    lo: "Minimal distortion", hi: "Strong perceptual bias",
    min: 0.5, max: 3.0, step: 0.05,
  },
  learning_rate: {
    label: "Learning Rate",
    tip: "Speed of updating beliefs about adversary intentions",
    lo: "Slow — sticky prior beliefs", hi: "Fast — quickly abandons priors",
    min: 0.1, max: 1.0, step: 0.01,
  },
  relationship_update_sensitivity: {
    label: "Relationship Sensitivity",
    tip: "How much observed actions shift the relationship score",
    lo: "Stable relationships", hi: "Volatile — actions cause large shifts",
    min: 0.1, max: 1.0, step: 0.01,
  },
  base_risk_propensity: {
    label: "Base Risk Propensity",
    tip: "Intrinsic willingness to accept strategic risk and escalation",
    lo: "Extreme risk aversion", hi: "High risk appetite",
    min: 0.0, max: 2.0, step: 0.01,
  },
  base_risk_scaling_factor: {
    label: "Risk Scaling Factor",
    tip: "Multiplier on base risk propensity for scenario-specific tuning",
    lo: "Reduces risk appetite 50%", hi: "Doubles risk appetite",
    min: 0.5, max: 2.0, step: 0.05,
  },
  uncertainty_sensitivity_multiplier: {
    label: "Uncertainty Sensitivity",
    tip: "How much outcome uncertainty affects decision weight",
    lo: "Accepts uncertain outcomes", hi: "Strongly penalizes uncertainty",
    min: 0.5, max: 3.0, step: 0.05,
  },
  desperation_sensitivity: {
    label: "Desperation Sensitivity",
    tip: "How much time pressure pushes toward risky actions",
    lo: "Maintains caution under pressure", hi: "Desperation strongly escalates risk",
    min: 0.0, max: 2.0, step: 0.01,
  },
  urgency_sensitivity: {
    label: "Urgency Sensitivity",
    tip: "How much time pressure affects decision-making",
    lo: "Minimal impact from pressure", hi: "Strongly driven by urgency",
    min: 0.1, max: 1.0, step: 0.01,
  },
  urgency_blending_weight: {
    label: "Urgency Blending",
    tip: "Balance: cumulative (history) vs spike (current turn) urgency",
    lo: "Responds only to spikes", hi: "Integrates cumulative urgency",
    min: 0.0, max: 1.0, step: 0.01,
  },
  problem_focus_parameter: {
    label: "Problem Focus",
    tip: "Nonlinearity exponent for urgency scaling curve",
    lo: "Linear, weak urgency response", hi: "Steep, sharp response curve",
    min: 0.5, max: 3.0, step: 0.05,
  },
  action_discrepancy_threshold: {
    label: "Action Discrepancy Threshold",
    tip: "Minimum feasibility score for action inclusion in playbook",
    lo: "Accepts marginal actions", hi: "Only fully feasible actions",
    min: 0.1, max: 1.0, step: 0.01,
  },
  risk_reward_blender: {
    label: "Risk-Reward Blender (η)",
    tip: "Variance preference for composite scoring",
    lo: "Prefers safe strategies", hi: "Prefers high-variance strategies",
    min: -1.0, max: 1.0, step: 0.05,
  },
  severity_activation_threshold: {
    label: "Severity Activation",
    tip: "Noise gate — goal impacts below this are ignored",
    lo: "All impacts count", hi: "Only large impacts register",
    min: 0.0, max: 0.5, step: 0.01,
  },
  escalatory_severity_threshold: {
    label: "Escalatory Severity Threshold",
    tip: "Threshold triggering catastrophic conflict aversion",
    lo: "Almost no aversion", hi: "Very sensitive to severity",
    min: 0.0, max: 1.0, step: 0.01,
  },
  pt_gamma: {
    label: "Probability Weighting (γ)",
    tip: "PT probability weighting exponent (reserved — Phase 2)",
    lo: "Strong overweighting of rare events", hi: "Linear probability weighting",
    min: 0.3, max: 1.0, step: 0.01,
  },
  pt_reference_persistence: {
    label: "Reference Persistence (ρ)",
    tip: "EWMA drift rate for PT reference point; how slowly reference adapts",
    lo: "Resets each turn", hi: "Maintains historical reference",
    min: 0.0, max: 1.0, step: 0.01,
  },
  // ── Temporal layer ──
  withdrawal_reluctance_weight: {
    label: "Withdrawal Reluctance",
    tip: "Sunk-cost bias: reluctance to withdraw from sustained actions",
    lo: "Easily abandons", hi: "Maintains sunk costs",
    min: 0.0, max: 1.0, step: 0.01,
  },
  cancellation_reluctance_weight: {
    label: "Cancellation Reluctance",
    tip: "Sunk-cost bias: reluctance to cancel in-progress actions",
    lo: "Easily cancels", hi: "Absorbs sunk costs",
    min: 0.0, max: 1.0, step: 0.01,
  },
  anticipatory_weight: {
    label: "Anticipatory Weight",
    tip: "Weight for anticipated future payoffs in decisions",
    lo: "Myopic — ignores future", hi: "Forward-looking",
    min: 0.0, max: 0.3, step: 0.01,
  },
  // ── Relationships ──
  relationship_score: {
    label: "Relationship Score",
    tip: "Initial relationship toward other player",
    lo: "-1.0 — pure adversarial", hi: "+1.0 — pure ally",
    min: -1.0, max: 1.0, step: 0.05,
  },
  alliance_salience: {
    label: "Alliance Salience",
    tip: "Weight placed on ally relationships in decisions",
    lo: "Ignores allies", hi: "Heavily weights ally considerations",
    min: 0.0, max: 1.0, step: 0.01,
  },
  competitive_salience: {
    label: "Competitive Salience",
    tip: "Weight placed on adversary dynamics in decisions",
    lo: "Ignores competition", hi: "Heavily weights adversary considerations",
    min: 0.0, max: 1.0, step: 0.01,
  },
  // ── Thresholds ──
  crisis_threshold: {
    label: "Crisis Threshold",
    tip: "TPS level perceived as a crisis — triggers reactive mode",
    lo: "Easily perceives crisis", hi: "High crisis tolerance",
    min: 0.0, max: 10.0, step: 0.5,
  },
  deescalation_bonus_value: {
    label: "De-escalation Bonus",
    tip: "Incentive magnitude for choosing de-escalatory actions",
    lo: "Weak de-escalation preference", hi: "Strong preference for peace",
    min: 0.0, max: 100.0, step: 1.0,
  },
  peer_capability_ratio: {
    label: "Peer Capability Ratio",
    tip: "Threshold for considering adversary a peer-level threat",
    lo: "High bar for 'peer' status", hi: "Low bar — sees adversary as peer",
    min: 0.0, max: 1.0, step: 0.01,
  },
  aversion_factor_value: {
    label: "Aversion Factor",
    tip: "Risk dampening under catastrophic conflict aversion",
    lo: "Minimal dampening", hi: "Strongly averse to catastrophe",
    min: 0.0, max: 1.0, step: 0.01,
  },
  time_horizon_discount_factor: {
    label: "Time Horizon Discount",
    tip: "Discount on long-term objectives when in short-horizon mode",
    lo: "Heavily discounts long-term in crisis", hi: "Maintains long-term focus",
    min: 0.1, max: 1.0, step: 0.01,
  },
  effect_scaling_factor: {
    label: "Effect Scaling (Self-Efficacy)",
    tip: "Confidence in own capabilities — discount on Action-Utility-Matrix",
    lo: "Actions seem ineffective", hi: "Full confidence in action outcomes",
    min: 0.0, max: 1.0, step: 0.01,
  },
  base_decay_rate: {
    label: "Base Decay Rate",
    tip: "Per-turn exponential decay for Goal Ledger entries — institutional memory",
    lo: "Perfect memory", hi: "No memory — entries vanish",
    min: 0.0, max: 1.0, step: 0.01,
  },
  diminishing_returns_rate: {
    label: "Diminishing Returns Rate",
    tip: "How quickly repeated actions lose value",
    lo: "Slow — can repeat freely", hi: "Rapid — must diversify",
    min: 1.0, max: 20.0, step: 0.5,
  },
  priority_blending_weight: {
    label: "Priority Blending",
    tip: "Blend between raw and normalized situational priorities",
    lo: "Pure raw priorities", hi: "Pure normalized (uniform) weighting",
    min: 0.0, max: 1.0, step: 0.01,
  },
};

const RADAR_KEYS = [
  "analytical_competence", "belief_update_bias", "pt_lambda",
  "pt_alpha", "temporal_discount_rate", "clarity_preference_scalar",
];


// ═══════════════════════════════════════════════════════════════════════════════
// Interactive Radar Chart — drag dots along axes
// ═══════════════════════════════════════════════════════════════════════════════

const InteractiveRadarChart = ({ values = {}, color = "var(--blue)", chartR = 82, onParamChange, onParamClick }) => {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  // The chart polygon lives in a fixed-radius circle; the SVG is wider to fit labels
  const r = chartR;
  const padX = 80;  // horizontal padding for labels like "Loss Aversion", "Clarity Preference"
  const padTop = 42; // space above for "Analytical Competence" label
  const padBot = 42; // space below for "Risk Sensitivity" label
  const vbW = 2 * (r + padX);
  const vbH = 2 * r + padTop + padBot;
  const cx = vbW / 2;
  const cy = r + padTop;
  const n = RADAR_KEYS.length;

  const getAngle = (index) => (Math.PI * 2 * index) / n - Math.PI / 2;

  const getPoint = (index, value) => {
    const meta = PARAM_META[RADAR_KEYS[index]];
    const min = meta?.min ?? 0;
    const max = meta?.max ?? 1;
    const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const angle = getAngle(index);
    const dist = norm * r;
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
  };

  const rings = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = RADAR_KEYS.map((key, i) => getPoint(i, values[key] || 0));
  const polygon = dataPoints.map(([x, y]) => `${x},${y}`).join(" ");

  // Convert mouse position to parameter value for a given axis
  const mouseToValue = useCallback((e, axisIndex) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * vbW;
    const my = ((e.clientY - rect.top) / rect.height) * vbH;
    const dx = mx - cx;
    const dy = my - cy;
    const angle = getAngle(axisIndex);
    // Project mouse onto axis direction
    const proj = dx * Math.cos(angle) + dy * Math.sin(angle);
    const norm = Math.max(0, Math.min(1, proj / r));
    const meta = PARAM_META[RADAR_KEYS[axisIndex]];
    const min = meta?.min ?? 0;
    const max = meta?.max ?? 1;
    const step = meta?.step ?? 0.01;
    const raw = min + norm * (max - min);
    return Math.round(raw / step) * step;
  }, [cx, cy, r, vbW, vbH]);

  const handleMouseDown = useCallback((e, axisIndex) => {
    e.preventDefault();
    setDragging(axisIndex);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (dragging === null || !onParamChange) return;
    const val = mouseToValue(e, dragging);
    if (val !== null) {
      onParamChange(RADAR_KEYS[dragging], val);
    }
  }, [dragging, mouseToValue, onParamChange]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <svg
      ref={svgRef}
      width="100%"
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", cursor: dragging !== null ? "grabbing" : "default", maxHeight: "260px" }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Rings — lighter for visibility */}
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={RADAR_KEYS.map((_, i) => {
            const angle = getAngle(i);
            const dist = ring * r;
            return `${cx + dist * Math.cos(angle)},${cy + dist * Math.sin(angle)}`;
          }).join(" ")}
          fill="none"
          stroke="var(--border-focus)"
          strokeWidth="0.6"
          strokeDasharray={ring < 1 ? "2,3" : "none"}
        />
      ))}
      {/* Ring labels along top axis */}
      {rings.map((ring) => (
        <text
          key={`rl-${ring}`}
          x={cx + 3}
          y={cy - ring * r - 2}
          fontSize="7"
          fill="var(--text-dim)"
        >
          {Math.round(ring * 100)}%
        </text>
      ))}
      {/* Axes — lighter */}
      {RADAR_KEYS.map((_, i) => {
        const angle = getAngle(i);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos(angle)}
            y2={cy + r * Math.sin(angle)}
            stroke="var(--border-focus)"
            strokeWidth="0.5"
          />
        );
      })}
      {/* Data polygon */}
      <polygon points={polygon} fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.5" />
      {/* Draggable data dots */}
      {dataPoints.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={dragging === i ? 6 : 4.5}
          fill={color}
          stroke="var(--bg-deep)"
          strokeWidth="1.5"
          style={{ cursor: "grab", transition: dragging === i ? "none" : "r 0.1s" }}
          onMouseDown={(e) => handleMouseDown(e, i)}
        >
          <title>{PARAM_META[RADAR_KEYS[i]]?.label}: {(values[RADAR_KEYS[i]] ?? 0).toFixed(2)}</title>
        </circle>
      ))}
      {/* Labels — positioned with smart text-anchor to avoid clipping */}
      {RADAR_KEYS.map((key, i) => {
        const angle = getAngle(i);
        const labelR = r + 32;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);
        const meta = PARAM_META[key];
        // Determine text-anchor based on position: left side=end, right side=start, top/bottom=middle
        const cosA = Math.cos(angle);
        const anchor = Math.abs(cosA) < 0.3 ? "middle" : cosA > 0 ? "start" : "end";
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor={anchor}
            dominantBaseline="central"
            fill="var(--text-secondary)"
            fontSize="9.5"
            fontWeight="500"
            style={{ cursor: "pointer" }}
            onClick={() => onParamClick && onParamClick(key)}
          >
            {meta?.short || key}
          </text>
        );
      })}
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// Param Slider with Tooltip
// ═══════════════════════════════════════════════════════════════════════════════

const ParamSlider = ({ paramKey, value, onChange, color = "var(--text-primary)", onParamClick }) => {
  const meta = PARAM_META[paramKey] || {};
  const min = meta.min ?? 0;
  const max = meta.max ?? 1;
  const step = meta.step ?? 0.01;
  const displayVal = typeof value === "number" ? value.toFixed(2) : "—";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "3px 0",
      }}
      title={`${meta.tip || paramKey}\n↓ ${meta.lo || "Low"}\n↑ ${meta.hi || "High"}`}
    >
      <span
        onClick={() => onParamClick && onParamClick(paramKey)}
        style={{
          fontSize: "10px",
          color: "var(--text-secondary)",
          width: "130px",
          flexShrink: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          cursor: onParamClick ? "pointer" : "help",
          borderBottom: onParamClick ? "1px dotted var(--border-light)" : "none",
        }}
      >
        {meta.label || paramKey}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? ((min + max) / 2)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          flex: 1,
          height: "3px",
          accentColor: color,
          cursor: "pointer",
        }}
      />
      <span style={{
        fontSize: "10px",
        fontFamily: "var(--font-mono)",
        color: color,
        width: "36px",
        textAlign: "right",
        flexShrink: 0,
      }}>
        {displayVal}
      </span>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// Core Objectives — Percentage-mode auto-rebalancing sliders
// ═══════════════════════════════════════════════════════════════════════════════

const CoreObjectivesPanel = ({ priorities = [], goalNames = [], color, onPrioritiesChange }) => {
  const [showAll, setShowAll] = useState(false);
  const [showBPVTip, setShowBPVTip] = useState(false);

  const total = useMemo(() => priorities.reduce((s, v) => s + v, 0) || 1, [priorities]);

  // Sort by percentage descending
  const sortedGoals = useMemo(() => {
    return priorities.map((val, i) => ({
      index: i,
      name: typeof goalNames[i] === "string"
        ? goalNames[i].replace(/_/g, " ")
        : `Objective ${i + 1}`,
      pct: (val / total) * 100,
      raw: val,
    })).sort((a, b) => b.pct - a.pct);
  }, [priorities, goalNames, total]);

  const visibleGoals = showAll ? sortedGoals : sortedGoals.slice(0, 5);

  // Percentage-mode rebalancing: when one goal changes, redistribute proportionally
  const handlePctChange = useCallback((goalIndex, newPct) => {
    const clampedPct = Math.max(0, Math.min(100, newPct));
    const oldPct = (priorities[goalIndex] / total) * 100;
    const delta = clampedPct - oldPct;

    // Build new percentage array
    const pcts = priorities.map((v) => (v / total) * 100);
    pcts[goalIndex] = clampedPct;

    // Redistribute -delta among other goals proportionally
    const otherTotal = pcts.reduce((s, v, i) => i === goalIndex ? s : s + v, 0);
    if (otherTotal > 0 && delta !== 0) {
      for (let i = 0; i < pcts.length; i++) {
        if (i === goalIndex) continue;
        const share = pcts[i] / otherTotal;
        pcts[i] = Math.max(0, pcts[i] - delta * share);
      }
    }

    // Normalize to ensure sum is exactly 100, then convert back to raw weights
    const pctSum = pcts.reduce((s, v) => s + v, 0) || 1;
    const newPriorities = pcts.map((p) => (p / pctSum) * total);
    onPrioritiesChange(newPriorities);
  }, [priorities, total, onPrioritiesChange]);

  if (priorities.length === 0) return null;

  return (
    <div style={{ marginTop: "14px" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "6px",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", position: "relative" }}>
          <span style={{
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "var(--text-secondary)",
            fontWeight: 600,
          }}>
            Core Objectives ({priorities.length} Goals)
          </span>
          <span
            onMouseEnter={() => setShowBPVTip(true)}
            onMouseLeave={() => setShowBPVTip(false)}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: "13px", height: "13px", borderRadius: "50%",
              border: "1px solid var(--border)", fontSize: "8px",
              color: "var(--text-dim)", cursor: "help", lineHeight: 1,
            }}
          >?</span>
          {showBPVTip && (
            <span style={{
              position: "absolute", top: "100%", left: 0, marginTop: "4px",
              padding: "8px 10px", background: "#1e1e22",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px",
              fontSize: "11px", lineHeight: "1.45", color: "var(--text-secondary)",
              width: "240px", zIndex: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              pointerEvents: "none", textTransform: "none", letterSpacing: "normal", fontWeight: "normal",
            }}>
              How the actor prioritizes its strategic objectives. Weights sum to 100%. Higher-weighted objectives have more influence on the actor's decision-making and problem assessment.
            </span>
          )}
        </span>
        {sortedGoals.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              background: "none",
              border: "none",
              color: color,
              fontSize: "9px",
              cursor: "pointer",
            }}
          >
            {showAll ? "Show Top 5" : `Show All ${sortedGoals.length}`}
          </button>
        )}
      </div>
      <div style={{
        background: "var(--bg-deep)",
        borderRadius: "4px",
        padding: "6px 8px",
        maxHeight: showAll ? "300px" : "auto",
        overflowY: showAll ? "auto" : "visible",
      }}>
        {visibleGoals.map((goal, rank) => (
          <div
            key={goal.index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 0",
              borderBottom: "1px solid var(--border)",
            }}
            title={goal.name}
          >
            <span style={{
              fontSize: "9px",
              color: "var(--text-dim)",
              width: "14px",
              textAlign: "right",
              flexShrink: 0,
            }}>
              {rank + 1}
            </span>
            <span style={{
              fontSize: "10px",
              color: "var(--text-primary)",
              flex: "1 1 0",
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {goal.name}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={goal.pct}
              onChange={(e) => handlePctChange(goal.index, parseFloat(e.target.value))}
              style={{
                width: "80px",
                flexShrink: 0,
                height: "3px",
                accentColor: color,
                cursor: "pointer",
              }}
            />
            <span style={{
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: color,
              width: "40px",
              textAlign: "right",
              flexShrink: 0,
            }}>
              {goal.pct.toFixed(1)}%
            </span>
          </div>
        ))}
        {/* Running total */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "4px 0 0",
          fontSize: "9px",
          color: "var(--text-dim)",
        }}>
          Total: 100.0%
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// All-Params Expandable Accordion (categorized, with tooltips)
// ═══════════════════════════════════════════════════════════════════════════════

const PARAM_CATEGORIES = [
  {
    label: "Perception",
    params: ["analytical_competence", "belief_update_bias", "clarity_preference_scalar",
             "surprise_weight", "bias_amplification_parameter"],
  },
  {
    label: "Interpretation & Relationships",
    params: ["learning_rate", "relationship_update_sensitivity", "relationship_score",
             "alliance_salience", "competitive_salience"],
  },
  {
    label: "Prospect Theory",
    params: ["pt_alpha", "pt_lambda", "pt_gamma", "pt_reference_persistence", "risk_reward_blender"],
  },
  {
    label: "Risk & Decision",
    params: ["base_risk_propensity", "base_risk_scaling_factor", "uncertainty_sensitivity_multiplier",
             "desperation_sensitivity", "urgency_sensitivity", "urgency_blending_weight",
             "problem_focus_parameter", "action_discrepancy_threshold"],
  },
  {
    label: "Temporal Layer",
    params: ["temporal_discount_rate", "withdrawal_reluctance_weight", "cancellation_reluctance_weight",
             "anticipatory_weight", "base_decay_rate", "time_horizon_discount_factor"],
  },
  {
    label: "Thresholds & Scaling",
    params: ["severity_activation_threshold", "escalatory_severity_threshold",
             "crisis_threshold", "deescalation_bonus_value", "peer_capability_ratio",
             "aversion_factor_value", "effect_scaling_factor", "diminishing_returns_rate",
             "priority_blending_weight"],
  },
];

const AllParamsPanel = ({ profile = {}, actorIndex, color, onChange, onParamClick }) => {
  const [openCat, setOpenCat] = useState(null);

  return (
    <div style={{ marginTop: "8px" }}>
      {PARAM_CATEGORIES.map((cat) => {
        const isOpen = openCat === cat.label;
        const availableParams = cat.params.filter((p) => profile[p] !== undefined);
        if (availableParams.length === 0) return null;

        return (
          <div key={cat.label} style={{ marginBottom: "2px" }}>
            <button
              onClick={() => setOpenCat(isOpen ? null : cat.label)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "5px 8px",
                background: "var(--bg-deep)",
                border: "1px solid var(--border)",
                borderRadius: "3px",
                color: "var(--text-secondary)",
                fontSize: "10px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <span>{cat.label}</span>
              <span style={{ fontSize: "8px", color: "var(--text-dim)" }}>
                {availableParams.length} params {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: "4px 8px 8px" }}>
                {availableParams.map((paramKey) => (
                  <ParamSlider
                    key={paramKey}
                    paramKey={paramKey}
                    value={profile[paramKey]}
                    onChange={(val) => onChange(actorIndex, paramKey, val)}
                    color={color}
                    onParamClick={onParamClick}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// Actor Personality Panel (one per actor)
// ═══════════════════════════════════════════════════════════════════════════════

const ActorPersonalityPanel = ({
  actorIndex,
  actorName,
  teamLabel,
  teamColor,
  borderColor,
  bgColor,
  profile = {},
  radarValues,
  personalityKey,
  presets = {},
  onPresetSelect,
  goalNames = [],
  onActorProfileChange,
  onParamSelect,
}) => {
  const [showAllParams, setShowAllParams] = useState(false);

  const priorities = profile.baseline_priority_vector || [];

  const handleRadarParamChange = useCallback((paramKey, value) => {
    onActorProfileChange(actorIndex, paramKey, value);
    onPresetSelect(null); // editing breaks preset
  }, [actorIndex, onActorProfileChange, onPresetSelect]);

  const handlePrioritiesChange = useCallback((newVec) => {
    onActorProfileChange(actorIndex, "baseline_priority_vector", newVec);
  }, [actorIndex, onActorProfileChange]);

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: "6px",
      padding: "14px",
      background: bgColor,
    }}>
      {/* Header */}
      <div style={{
        fontSize: "12px",
        fontWeight: 600,
        color: teamColor,
        marginBottom: "10px",
      }}>
        {actorName} ({teamLabel})
      </div>

      {/* Preset buttons */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
        {Object.entries(presets).map(([key, preset]) => (
          <PersonalityButton
            key={key}
            label={preset.label}
            description={preset.description}
            isSelected={personalityKey === key}
            onClick={() => onPresetSelect(key)}
            color={teamColor}
          />
        ))}
      </div>

      {/* Interactive radar chart — centered */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "4px" }}>
        <InteractiveRadarChart
          values={radarValues}
          color={teamColor}
          chartR={82}
          /* label prop removed — preset name no longer shown on chart */
          onParamChange={handleRadarParamChange}
          onParamClick={(key) => onParamSelect && onParamSelect(key, actorIndex)}
        />
      </div>

      {/* Sliders below chart for fine-tuning */}
      <div style={{ padding: "0 4px" }}>
        <div style={{
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: "var(--text-secondary)",
          marginBottom: "4px",
          fontWeight: 600,
        }}>
          Key Parameters — <span style={{ fontWeight: 400, fontStyle: "italic", textTransform: "none" }}>click name for details</span>
        </div>
        {RADAR_KEYS.map((key) => (
          <ParamSlider
            key={key}
            paramKey={key}
            value={radarValues[key]}
            onChange={(val) => handleRadarParamChange(key, val)}
            color={teamColor}
            onParamClick={(k) => onParamSelect && onParamSelect(k, actorIndex)}
          />
        ))}
      </div>

      {/* Core Objectives */}
      <CoreObjectivesPanel
        priorities={priorities}
        goalNames={goalNames}
        color={teamColor}
        onPrioritiesChange={handlePrioritiesChange}
      />

      {/* All Parameters expandable */}
      <div style={{ marginTop: "12px" }}>
        <button
          onClick={() => setShowAllParams(!showAllParams)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 10px",
            background: "var(--bg-deep)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            color: "var(--text-secondary)",
            fontSize: "10px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span>All Actor Parameters</span>
          <span style={{ fontSize: "8px", color: "var(--text-dim)" }}>
            {showAllParams ? "Collapse ▾" : "Expand ▸"}
          </span>
        </button>
        {showAllParams && (
          <AllParamsPanel
            profile={profile}
            actorIndex={actorIndex}
            color={teamColor}
            onChange={onActorProfileChange}
            onParamClick={(k) => onParamSelect && onParamSelect(k, actorIndex)}
          />
        )}
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// Common UI Primitives
// ═══════════════════════════════════════════════════════════════════════════════

const StepIndicator = ({ steps, currentStep }) => (
  <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
    {steps.map((step, i) => (
      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
        <div style={{
          height: "3px", width: "100%", borderRadius: "2px",
          background: i <= currentStep ? "var(--accent)" : "var(--border)",
          transition: "background 0.3s",
        }} />
        <span style={{
          fontSize: "9px",
          color: i <= currentStep ? "var(--accent)" : "var(--text-dim)",
          fontWeight: i === currentStep ? 600 : 400,
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          {step}
        </span>
      </div>
    ))}
  </div>
);

const SectionCard = ({ children, style = {} }) => (
  <div style={{
    background: "var(--bg-card)", border: "1px solid var(--border)",
    borderRadius: "6px", padding: "16px", ...style,
  }}>
    {children}
  </div>
);

const StepTitle = ({ children }) => (
  <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
    {children}
  </h3>
);

const StepDescription = ({ children }) => (
  <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "12px", lineHeight: "1.5" }}>
    {children}
  </p>
);

const DarkSelect = ({ value, onChange, children, ...props }) => (
  <select
    value={value} onChange={onChange}
    style={{
      width: "100%", padding: "8px 10px",
      background: "var(--bg-deep)", border: "1px solid var(--border)",
      borderRadius: "4px", color: "var(--text-primary)", fontSize: "12px", cursor: "pointer",
    }}
    {...props}
  >
    {children}
  </select>
);

const PersonalityButton = ({ label, description, isSelected, onClick, color }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1, padding: "10px 12px",
      background: isSelected ? `${color}18` : "var(--bg-deep)",
      border: `1px solid ${isSelected ? color : "var(--border)"}`,
      borderRadius: "6px", cursor: "pointer", textAlign: "left", transition: "all 0.15s",
    }}
  >
    <div style={{ fontSize: "12px", fontWeight: 600, color: isSelected ? color : "var(--text-primary)", marginBottom: "2px" }}>
      {label}
    </div>
    <div style={{ fontSize: "9px", color: "var(--text-secondary)" }}>{description}</div>
  </button>
);


// ═══════════════════════════════════════════════════════════════════════════════
// DIME Classification for Action Selector
// ═══════════════════════════════════════════════════════════════════════════════

const DIME_LABELS = {
  D: { label: "Diplomatic", color: "#c084fc" },   // purple
  I: { label: "Information", color: "#38bdf8" },   // sky blue
  M: { label: "Military", color: "#f87171" },      // red
  E: { label: "Economic", color: "#fbbf24" },      // amber
};

const ESCALATION_LABELS = {
  deescalatory: { label: "De-escalatory", icon: "▽", color: "var(--green)" },
  signaling:    { label: "Moderate Severity", icon: "◇", color: "var(--gold)" },
  escalatory:   { label: "High Severity", icon: "△", color: "var(--red)" },
};

/**
 * Infer DIME domain from action name using keyword matching.
 * Reuses the same keyword sets as ActionTimeline.
 */
const classifyActionDIME = (actionName) => {
  const name = (actionName || "").toLowerCase();
  if (name === "do nothing") return "D";
  let best = "M";
  let bestScore = 0;
  for (const [domain, keywords] of Object.entries(DIME_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (name.includes(kw)) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = domain; }
  }
  return best;
};

/**
 * Classify escalation level using deescalation flag + severity.
 * deescFlag: 1.0 = de-escalatory, 0.0 = not
 * severity: 0.0–1.0 from coa_characteristics_matrix first column
 */
const classifyEscalation = (deescFlag, severity) => {
  if (deescFlag >= 0.5) return "deescalatory";
  if (severity > 0.5) return "escalatory";
  return "signaling";
};

/**
 * DIMEActionSelector — Grouped action picker organized by DIME domain and escalation sub-label
 */
const DIMEActionSelector = ({ actions, selectedActionId, onActionSelect, deescFlags, severities }) => {
  const [expandedDomain, setExpandedDomain] = useState(null);
  const [searchFilter, setSearchFilter] = useState("");

  // Classify all actions into DIME → escalation groups
  const groupedActions = useMemo(() => {
    const groups = { D: { deescalatory: [], signaling: [], escalatory: [] },
                     I: { deescalatory: [], signaling: [], escalatory: [] },
                     M: { deescalatory: [], signaling: [], escalatory: [] },
                     E: { deescalatory: [], signaling: [], escalatory: [] } };

    actions.forEach((action) => {
      const domain = classifyActionDIME(action.name);
      const deescFlag = deescFlags?.[action.id] ?? 0;
      const severity = severities?.[action.id] ?? 0;
      const escalation = classifyEscalation(deescFlag, severity);
      groups[domain][escalation].push(action);
    });

    return groups;
  }, [actions, deescFlags, severities]);

  // Filter by search
  const filterMatch = useCallback((name) => {
    if (!searchFilter) return true;
    return name.toLowerCase().includes(searchFilter.toLowerCase());
  }, [searchFilter]);

  // Count actions per domain
  const domainCounts = useMemo(() => {
    const counts = {};
    for (const [domain, subGroups] of Object.entries(groupedActions)) {
      counts[domain] = Object.values(subGroups).reduce((sum, arr) => sum + arr.length, 0);
    }
    return counts;
  }, [groupedActions]);

  // Auto-expand the domain containing the selected action
  useEffect(() => {
    if (selectedActionId !== null && selectedActionId !== undefined && expandedDomain === null) {
      const selAction = actions.find(a => a.id === selectedActionId);
      if (selAction) {
        setExpandedDomain(classifyActionDIME(selAction.name));
      }
    }
  }, [selectedActionId, actions, expandedDomain]);

  return (
    <div>
      {/* Search filter */}
      <div style={{ marginBottom: "10px" }}>
        <input
          type="text"
          placeholder="Filter actions..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 10px",
            background: "var(--bg-deep)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            color: "var(--text-primary)",
            fontSize: "11px",
            outline: "none",
          }}
        />
      </div>

      {/* DIME domain accordion */}
      {["D", "I", "M", "E"].map((domain) => {
        const meta = DIME_LABELS[domain];
        const isExpanded = expandedDomain === domain;
        const subGroups = groupedActions[domain];
        const count = domainCounts[domain];
        if (count === 0) return null;

        // Check if selected action is in this domain
        const hasSelected = Object.values(subGroups).some(arr =>
          arr.some(a => a.id === selectedActionId)
        );

        return (
          <div key={domain} style={{ marginBottom: "4px" }}>
            {/* Domain header */}
            <button
              onClick={() => setExpandedDomain(isExpanded ? null : domain)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: isExpanded ? `${meta.color}15` : "var(--bg-deep)",
                border: `1px solid ${hasSelected ? meta.color : "var(--border)"}`,
                borderRadius: "5px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: meta.color,
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: isExpanded ? meta.color : "var(--text-primary)",
                }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>
                  {count} action{count !== 1 ? "s" : ""}
                </span>
              </div>
              <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>
                {isExpanded ? "▾" : "▸"}
              </span>
            </button>

            {/* Expanded sub-groups */}
            {isExpanded && (
              <div style={{
                padding: "6px 0 6px 14px",
                borderLeft: `2px solid ${meta.color}40`,
                marginLeft: "8px",
              }}>
                {["deescalatory", "signaling", "escalatory"].map((escLevel) => {
                  const escMeta = ESCALATION_LABELS[escLevel];
                  const actionsInGroup = subGroups[escLevel].filter(a => filterMatch(a.name));
                  if (actionsInGroup.length === 0) return null;

                  return (
                    <div key={escLevel} style={{ marginBottom: "8px" }}>
                      {/* Sub-label header */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "3px 0",
                        marginBottom: "4px",
                      }}>
                        <span style={{ fontSize: "10px", color: escMeta.color, opacity: 0.8 }}>
                          {escMeta.icon}
                        </span>
                        <span style={{
                          fontSize: "9px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          color: "var(--text-dim)",
                          fontWeight: 600,
                        }}>
                          {escMeta.label}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        {actionsInGroup.map((action) => {
                          const isSelected = action.id === selectedActionId;
                          return (
                            <button
                              key={action.id}
                              onClick={() => onActionSelect(action.id)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                width: "100%",
                                padding: "6px 10px",
                                background: isSelected ? `${meta.color}20` : "transparent",
                                border: `1px solid ${isSelected ? meta.color : "transparent"}`,
                                borderRadius: "4px",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 0.1s",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.background = "var(--bg-card)";
                                  e.currentTarget.style.borderColor = "var(--border)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.background = "transparent";
                                  e.currentTarget.style.borderColor = "transparent";
                                }
                              }}
                            >
                              <span style={{
                                fontSize: "9px",
                                fontFamily: "var(--font-mono)",
                                color: "var(--text-dim)",
                                width: "22px",
                                textAlign: "right",
                                flexShrink: 0,
                              }}>
                                {action.id}
                              </span>
                              <span style={{
                                fontSize: "11px",
                                color: isSelected ? meta.color : "var(--text-primary)",
                                fontWeight: isSelected ? 500 : 400,
                              }}>
                                {action.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// Personality Presets — scenario-driven from motivational_profiles in payload
// ═══════════════════════════════════════════════════════════════════════════════

// Fallback presets — used when payload lacks motivational_profiles
const FALLBACK_PRESETS = {
  Baseline: {
    key: "Baseline",
    label: "Baseline",
    description: "Default estimates — no overrides",
    cognitive_overrides: {},
    bpv_overrides: {},
    goal_ledger_overrides: {},
  },
};

/**
 * Derive preset map from scenario's motivational_profiles.
 * Returns { key: { label, description, cognitive_overrides, bpv_overrides, goal_ledger_overrides } }
 */
const getPresetsForScenario = (scenario) => {
  const mp = scenario?.motivational_profiles;
  if (!mp?.profiles?.length) return FALLBACK_PRESETS;
  const result = {};
  for (const p of mp.profiles) {
    result[p.key] = p;
  }
  return result;
};

/**
 * Get which actor index the motivational profiles target (default: 1 = Red/adversary).
 */
const getProfileTargetActor = (scenario) => {
  return scenario?.motivational_profiles?.target_actor_index ?? 1;
};


// ═══════════════════════════════════════════════════════════════════════════════
// Main Wizard Component
// ═══════════════════════════════════════════════════════════════════════════════

const STEPS = ["Payload", "Environment", "Personalities", "Initial Action"];

const TURN_DURATION_OPTIONS = [
  { value: 1,  label: "1 day",   description: "Tactical — hour-by-hour decisions" },
  { value: 3,  label: "3 days",  description: "Operational — short-term maneuvering" },
  { value: 7,  label: "1 week",  description: "Strategic — weekly decision cycles" },
  { value: 14, label: "2 weeks", description: "Extended — bi-weekly assessment" },
  { value: 30, label: "1 month", description: "Campaign — monthly planning horizon" },
];

const SetupWizard = ({
  scenarios = [], selectedScenarioId, scenario, onSelectScenario,
  selectedRegime, onSelectRegime,
  daysPerTurn, onDaysPerTurnChange,
  calibratedDefaults,
  actors = [], actorProfiles = [], goalNames = [], onActorProfileChange, onParamSelect,
  actions = [], initialActorId, initialActionId, onInitialActorChange, onInitialActionChange,
  deescFlags = [], severities = [],
  onRunAll, onRunEvent, loading, canRun, isRunning, simulationComplete, currentTurn, maxTurns, onReset,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [bluePersonality, setBluePersonality] = useState(null);
  const [redPersonality, setRedPersonality] = useState(null);

  const stepComplete = useMemo(() => [
    !!selectedScenarioId,
    true,
    true,
    initialActionId !== null,
  ], [selectedScenarioId, initialActionId]);

  const allComplete = stepComplete.every(Boolean);

  // Radar values read from live profiles
  const getRadarValues = useCallback((idx) => {
    const p = actorProfiles[idx] || {};
    return {
      analytical_competence: p.analytical_competence ?? 0.5,
      belief_update_bias: p.belief_update_bias ?? 1.0,
      pt_lambda: p.pt_lambda ?? 2.25,
      pt_alpha: p.pt_alpha ?? 0.88,
      temporal_discount_rate: p.temporal_discount_rate ?? 0.3,
      clarity_preference_scalar: p.clarity_preference_scalar ?? 0.5,
    };
  }, [actorProfiles]);

  const blueRadar = useMemo(() => getRadarValues(0), [getRadarValues]);
  const redRadar = useMemo(() => getRadarValues(1), [getRadarValues]);

  // Derive scenario-aware presets
  const scenarioPresets = useMemo(() => getPresetsForScenario(scenario), [scenario]);
  const profileTargetActor = useMemo(() => getProfileTargetActor(scenario), [scenario]);

  // Snapshot the original actor profile when a scenario loads, so Baseline can restore it.
  // Uses a ref to avoid re-capturing when profiles are edited.
  const originalProfileRef = useRef(null);
  useEffect(() => {
    const idx = profileTargetActor;
    const profile = actorProfiles[idx];
    if (profile && !originalProfileRef.current) {
      originalProfileRef.current = JSON.parse(JSON.stringify(profile));
    }
  }, [actorProfiles, profileTargetActor]);

  // Reset snapshot when scenario changes
  useEffect(() => {
    originalProfileRef.current = null;
  }, [selectedScenarioId]);

  const applyPreset = useCallback((actorIdx, key) => {
    if (!key || !onActorProfileChange) return;

    const preset = scenarioPresets[key];
    if (!preset) return;

    const original = originalProfileRef.current || {};

    // Step 1: Reset all cognitive params that ANY profile might override back to baseline
    const allCognitiveKeys = new Set();
    for (const p of Object.values(scenarioPresets)) {
      for (const k of Object.keys(p.cognitive_overrides || {})) {
        allCognitiveKeys.add(k);
      }
    }
    if (allCognitiveKeys.size > 0) {
      const resetBatch = {};
      for (const k of allCognitiveKeys) {
        resetBatch[k] = original[k] ?? actorProfiles[actorIdx]?.[k];
      }
      // Then apply this preset's overrides on top
      const overrides = preset.cognitive_overrides || {};
      Object.assign(resetBatch, overrides);
      onActorProfileChange(actorIdx, resetBatch);
    }

    // Step 2: Reset BPV to original, then apply this preset's overrides
    const originalBPV = original.baseline_priority_vector;
    if (originalBPV) {
      const newBPV = [...originalBPV];
      const bpvOverrides = preset.bpv_overrides || {};
      for (const [idxStr, value] of Object.entries(bpvOverrides)) {
        const idx = parseInt(idxStr);
        if (idx < newBPV.length) {
          newBPV[idx] = value;
        }
      }
      onActorProfileChange(actorIdx, "baseline_priority_vector", newBPV);
    }

    // Step 3: Goal Ledger seeding
    const numGoals = original.baseline_priority_vector?.length || actorProfiles[actorIdx]?.baseline_priority_vector?.length || 23;
    const gl = new Array(numGoals).fill(0);
    const glOverrides = preset.goal_ledger_overrides || {};
    for (const [idxStr, value] of Object.entries(glOverrides)) {
      const idx = parseInt(idxStr);
      if (idx < gl.length) {
        gl[idx] = value;
      }
    }
    onActorProfileChange(actorIdx, "initial_goal_ledger", gl);
  }, [onActorProfileChange, scenarioPresets, actorProfiles]);

  const handleBluePreset = useCallback((key) => {
    setBluePersonality(key);
    if (key) applyPreset(0, key);
  }, [applyPreset]);

  const handleRedPreset = useCallback((key) => {
    setRedPersonality(key);
    if (key) applyPreset(1, key);
  }, [applyPreset]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "85vh" }}>
      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 0 20px" }}>
      <StepIndicator steps={STEPS} currentStep={currentStep} />

      {/* Step 0: Payload */}
      {currentStep === 0 && (
        <SectionCard>
          <StepTitle>Select Scenario Payload</StepTitle>
          <StepDescription>
            Choose a pre-generated scenario. Each payload contains actor profiles, action definitions,
            goal structures, and temporal/commitment configurations produced by MAGIC.
          </StepDescription>
          <DarkSelect value={selectedScenarioId || ""} onChange={(e) => onSelectScenario(e.target.value)}>
            <option value="">Select a scenario...</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
          </DarkSelect>
          {scenario && (
            <div style={{ marginTop: "12px", fontSize: "11px", color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{actions.length} actions</span>
              {" / "}
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{maxTurns} turns</span>
              {scenario.scenario_config?.scenario_description && (
                <p style={{ marginTop: "6px", lineHeight: "1.5" }}>{scenario.scenario_config.scenario_description}</p>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* Step 1: Environment */}
      {currentStep === 1 && (() => {
        const envRegimes = calibratedDefaults?.environment_regimes || {};
        const regimeNames = Object.keys(envRegimes).length > 0
          ? Object.keys(envRegimes).filter(k => !k.startsWith('_'))
          : ["Stable", "Competitive", "Chaotic"];
        const hasCalibrated = regimeNames.length > 0 && Object.keys(envRegimes).length > 0;
        const fallbackDescs = {
          Stable: "Low uncertainty, predictable responses",
          Competitive: "Moderate tension, strategic maneuvering",
          Chaotic: "High uncertainty, rapid escalation risk",
        };

        return (
        <SectionCard>
          <StepTitle>
            Select Environment
            {hasCalibrated && (
              <span style={{
                fontSize: "9px", fontWeight: 500, marginLeft: "8px",
                padding: "2px 6px", borderRadius: "3px",
                background: "var(--green-dim, rgba(90,176,106,0.12))",
                color: "var(--green)",
              }}>Sweep-calibrated</span>
            )}
          </StepTitle>
          <StepDescription>
            The environment regime shapes scenario-level dynamics — impact scaling,
            severity thresholds, and decay rates.
            {hasCalibrated
              ? " Values derived from Sweep D analysis (800 simulations)."
              : " These will be calibrated via parameter sweeps in future iterations."
            }
          </StepDescription>
          <div style={{ display: "flex", gap: "8px" }}>
            {regimeNames.map((env) => {
              const regime = envRegimes[env];
              const desc = regime?.description || fallbackDescs[env] || "";
              const paramCount = regime?.parameters ? Object.keys(regime.parameters).length : 0;
              return (
                <button key={env} onClick={() => onSelectRegime(env)} style={{
                  flex: 1, padding: "12px",
                  background: selectedRegime === env ? "var(--accent-dim)" : "var(--bg-deep)",
                  border: `1px solid ${selectedRegime === env ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "6px", cursor: "pointer", textAlign: "center", transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: selectedRegime === env ? "var(--accent)" : "var(--text-primary)" }}>
                    {env}
                  </div>
                  <div style={{ fontSize: "9px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {desc}
                  </div>
                  {paramCount > 0 && (
                    <div style={{ fontSize: "8px", color: "var(--text-dim)", marginTop: "4px" }}>
                      {paramCount} parameters
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {selectedRegime && envRegimes[selectedRegime]?.parameters && (
            <div style={{
              marginTop: "10px", padding: "8px 12px", background: "var(--bg-deep)",
              borderRadius: "4px", fontSize: "9px", color: "var(--text-dim)",
              maxHeight: "100px", overflowY: "auto",
            }}>
              <div style={{ fontWeight: 600, marginBottom: "4px", color: "var(--text-secondary)" }}>
                {selectedRegime} regime parameters:
              </div>
              {Object.entries(envRegimes[selectedRegime].parameters).map(([key, val]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                  <span>{key.replace(/_/g, " ")}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                    {typeof val === "number" ? val.toFixed(4) : val}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Turn Duration / Time Horizon */}
          <div style={{ marginTop: "20px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
              Turn Duration
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginBottom: "10px" }}>
              How much real-world time does each simulation turn represent?
              This converts MAGIC's day-based temporal profiles into turn counts.
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {TURN_DURATION_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => onDaysPerTurnChange?.(opt.value)} style={{
                  flex: "1 1 0",
                  minWidth: "90px",
                  padding: "8px 6px",
                  background: daysPerTurn === opt.value ? "var(--accent-dim)" : "var(--bg-deep)",
                  border: `1px solid ${daysPerTurn === opt.value ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "all 0.15s",
                }}>
                  <div style={{
                    fontSize: "12px", fontWeight: 600,
                    color: daysPerTurn === opt.value ? "var(--accent)" : "var(--text-primary)",
                  }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: "8px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {opt.description}
                  </div>
                </button>
              ))}
            </div>
            {!daysPerTurn && (
              <div style={{
                marginTop: "8px", padding: "6px 10px", background: "var(--gold-dim, rgba(234,179,8,0.1))",
                border: "1px solid var(--accent-border)",
                borderRadius: "4px", fontSize: "9px", color: "var(--gold)",
              }}>
                No turn duration set. Temporal profiles will use raw turn counts from the payload.
              </div>
            )}
          </div>
        </SectionCard>
        );
      })()}

      {/* Step 2: Personalities */}
      {currentStep === 2 && (
        <SectionCard>
          <StepTitle>Configure Actor Personalities</StepTitle>
          <StepDescription>
            Drag the radar chart dots to adjust key cognitive parameters, or use the sliders.
            Review and tune goal priorities and the full parameter set.
            All changes are applied directly to the simulation payload.
          </StepDescription>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <ActorPersonalityPanel
              actorIndex={0}
              actorName={actors[0]?.actor_name || "Actor A"}
              teamLabel="Blue"
              teamColor="var(--blue)"
              borderColor="var(--blue-border)"
              bgColor="var(--blue-dim)"
              profile={actorProfiles[0] || {}}
              radarValues={blueRadar}
              personalityKey={bluePersonality}
              presets={profileTargetActor === 0 ? scenarioPresets : {}}
              onPresetSelect={handleBluePreset}
              goalNames={goalNames}
              onActorProfileChange={onActorProfileChange}
              onParamSelect={onParamSelect}
            />
            <ActorPersonalityPanel
              actorIndex={1}
              actorName={actors[1]?.actor_name || "Actor B"}
              teamLabel="Red"
              teamColor="var(--red)"
              borderColor="var(--red-border)"
              bgColor="var(--red-dim)"
              profile={actorProfiles[1] || {}}
              radarValues={redRadar}
              personalityKey={redPersonality}
              presets={profileTargetActor === 1 ? scenarioPresets : {}}
              onPresetSelect={handleRedPreset}
              goalNames={goalNames}
              onActorProfileChange={onActorProfileChange}
              onParamSelect={onParamSelect}
            />
          </div>
        </SectionCard>
      )}

      {/* Step 3: Initial Action */}
      {currentStep === 3 && (
        <SectionCard>
          <StepTitle>Select Initial Action</StepTitle>
          <StepDescription>
            Choose which actor initiates and what action kicks off the simulation.
            Actions are organized by DIME domain and escalation level.
          </StepDescription>

          {/* Initiating Actor selector */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--text-dim)", fontWeight: 600, marginBottom: "6px" }}>Initiating Actor</div>
            <DarkSelect value={initialActorId} onChange={(e) => onInitialActorChange(Number(e.target.value))}>
              {actors.map((a, i) => (
                <option key={i} value={i}>{a?.actor_name || `Actor ${String.fromCharCode(65 + i)}`}</option>
              ))}
            </DarkSelect>
          </div>

          {/* DIME-categorized action selector */}
          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--text-dim)", fontWeight: 600, marginBottom: "4px" }}>Initial Action</div>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "8px", lineHeight: "1.4" }}>
            Actions are organized by DIME domain (Diplomatic, Informational, Military, Economic) and ranked by severity within each domain.
          </div>
          {initialActionId !== null && initialActionId !== undefined && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px",
              marginBottom: "10px",
              background: "var(--accent-dim)",
              border: "1px solid var(--accent)",
              borderRadius: "4px",
              fontSize: "11px",
            }}>
              <span style={{ color: "var(--text-dim)" }}>Selected:</span>
              <span style={{ color: "var(--accent)", fontWeight: 500 }}>
                {actions.find(a => a.id === initialActionId)?.name || `Action ${initialActionId}`}
              </span>
              <button
                onClick={() => onInitialActionChange(null)}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: "10px",
                }}
              >
                Clear
              </button>
            </div>
          )}
          <DIMEActionSelector
            actions={actions}
            selectedActionId={initialActionId}
            onActionSelect={(id) => onInitialActionChange(id)}
            deescFlags={deescFlags}
            severities={severities}
          />
        </SectionCard>
      )}

      </div>{/* end scrollable content area */}

      {/* Navigation + Run — pinned at bottom */}
      <div style={{
        flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 20px", borderTop: "1px solid var(--border)", background: "var(--bg-main)",
      }}>
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          style={{
            padding: "8px 16px", background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "4px", color: currentStep === 0 ? "var(--text-dim)" : "var(--text-secondary)",
            fontSize: "11px", cursor: currentStep === 0 ? "default" : "pointer",
          }}
        >
          Back
        </button>
        <div style={{ display: "flex", gap: "8px" }}>
          {currentStep < STEPS.length - 1 ? (
            <button
              onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
              disabled={!stepComplete[currentStep]}
              style={{
                padding: "8px 20px",
                background: stepComplete[currentStep] ? "var(--accent)" : "var(--bg-card)",
                border: `1px solid ${stepComplete[currentStep] ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "4px",
                color: stepComplete[currentStep] ? "var(--bg-deep)" : "var(--text-dim)",
                fontSize: "11px", fontWeight: 600,
                cursor: stepComplete[currentStep] ? "pointer" : "default",
              }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={onRunAll}
              disabled={!allComplete || loading || simulationComplete}
              style={{
                padding: "8px 24px",
                background: allComplete && !loading ? "var(--green)" : "var(--bg-card)",
                border: `1px solid ${allComplete && !loading ? "var(--green)" : "var(--border)"}`,
                borderRadius: "4px",
                color: allComplete && !loading ? "#fff" : "var(--text-dim)",
                fontSize: "12px", fontWeight: 700,
                cursor: allComplete && !loading ? "pointer" : "default",
              }}
            >
              {loading ? "Running..." : "Run Simulation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
