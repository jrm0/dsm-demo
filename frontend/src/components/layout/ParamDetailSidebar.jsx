import React from "react";

/**
 * ParamDetailSidebar - Left sidebar panel showing parameter details
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Shows the full definition, range, and scale meaning for a selected
 * actor parameter. Displayed in the sidebar when a user clicks any
 * parameter in the SetupWizard personality step.
 */

// Full parameter documentation — imported from PARAM_META in SetupWizard
// but we keep a self-contained copy here so the sidebar is independently portable.
const PARAM_DOCS = {
  analytical_competence: {
    label: "Analytical Competence",
    stage: "Perception",
    description: "How well the actor can perceive and interpret signals from observed actions. Higher values mean clearer signal interpretation with minimal noise.",
    lo: "Poor perception — high noise in signal interpretation",
    hi: "Excellent perception — clear, accurate signal reading",
    min: 0.1, max: 1.0, default: "Required (no default)",
    source: "Stage 1 — Perception",
  },
  belief_update_bias: {
    label: "Belief Update Bias",
    stage: "Perception",
    description: "Non-linear multiplier on belief update strength. Controls how strongly observed signals shift the actor's beliefs about the adversary.",
    lo: "Conservative — slow adaptation to new information",
    hi: "Aggressive — rapid, large belief shifts",
    min: 0.3, max: 2.0, default: 1.0,
    source: "Stage 1 — Perception",
  },
  clarity_preference_scalar: {
    label: "Clarity Preference",
    stage: "Perception",
    description: "The actor's preference for clear, unambiguous actions over uncertain ones. Affects action selection in Stage 3.",
    lo: "Indifferent to ambiguity — acts on unclear signals",
    hi: "Strong preference for clarity — avoids ambiguous actions",
    min: 0.0, max: 1.0, default: 0.5,
    source: "Stage 1 — Perception",
  },
  surprise_weight: {
    label: "Surprise Weight",
    stage: "Perception",
    description: "Balance between surprise-driven and ambiguity-driven perception (w_surprise). Higher values make the actor more reactive to unexpected signals.",
    lo: "Relies on baseline ambiguity — less reactive to surprises",
    hi: "Highly reactive to surprise events — overrides prior beliefs",
    min: 0.0, max: 1.0, default: 0.5,
    source: "Stage 1 — Perception",
  },
  bias_amplification_parameter: {
    label: "Bias Amplification",
    stage: "Perception",
    description: "Non-linear exponent for perception distortion. Controls how much the actor's biases amplify or distort incoming signals.",
    lo: "Minimal distortion — relatively objective perception",
    hi: "Strong distortion — heavily biased signal interpretation",
    min: 0.5, max: 3.0, default: 1.0,
    source: "Stage 1 — Perception",
  },
  learning_rate: {
    label: "Learning Rate",
    stage: "Interpretation",
    description: "Speed at which the actor updates beliefs about the adversary's intentions and capabilities. Affects how quickly the actor adapts its model of the other player.",
    lo: "Slow learning — sticky prior beliefs, hard to change mind",
    hi: "Fast learning — quickly abandons priors, highly adaptive",
    min: 0.1, max: 1.0, default: 0.5,
    source: "Stage 2 — Interpretation",
  },
  relationship_update_sensitivity: {
    label: "Relationship Update Sensitivity",
    stage: "Interpretation",
    description: "How much observed actions shift the continuous relationship score (-1 to +1). Controls relationship volatility.",
    lo: "Stable relationships — actions have minimal effect",
    hi: "Volatile relationships — actions cause large shifts",
    min: 0.1, max: 1.0, default: 0.5,
    source: "Stage 2 — Interpretation",
  },
  relationship_score: {
    label: "Relationship Score",
    stage: "Interpretation",
    description: "Initial continuous relationship state toward the other player. Evolves during simulation based on observed actions.",
    lo: "-1.0 — pure adversarial relationship",
    hi: "+1.0 — pure ally relationship",
    min: -1.0, max: 1.0, default: 0.0,
    source: "Stage 2 — Interpretation",
  },
  alliance_salience: {
    label: "Alliance Salience",
    stage: "Interpretation",
    description: "How much weight the actor places on ally relationships when making decisions. Higher values mean ally considerations dominate.",
    lo: "Ignores ally relationships entirely",
    hi: "Heavily weights ally considerations in all decisions",
    min: 0.0, max: 1.0, default: 0.5,
    source: "Stage 2 — Interpretation",
  },
  competitive_salience: {
    label: "Competitive Salience",
    stage: "Interpretation",
    description: "How much weight the actor places on competitive/adversary dynamics when making decisions.",
    lo: "Ignores competitive dynamics",
    hi: "Heavily weights adversary considerations",
    min: 0.0, max: 1.0, default: 0.5,
    source: "Stage 2 — Interpretation",
  },
  base_risk_propensity: {
    label: "Base Risk Propensity",
    stage: "Assessment",
    description: "Intrinsic willingness to accept strategic risk and escalation exposure. The foundation of the actor's risk profile before situational modifiers.",
    lo: "Extreme risk aversion — avoids uncertain/escalatory actions",
    hi: "High risk appetite — willing to escalate and accept uncertainty",
    min: 0.0, max: 2.0, default: 1.0,
    source: "Stage 3 — Assessment",
  },
  base_risk_scaling_factor: {
    label: "Risk Scaling Factor",
    stage: "Assessment",
    description: "Multiplier applied to base risk propensity for scenario-specific scaling. Used to tune risk appetite without changing the base parameter.",
    lo: "Reduces effective risk appetite by 50%",
    hi: "Doubles effective risk appetite",
    min: 0.5, max: 2.0, default: 1.0,
    source: "Stage 3 — Assessment",
  },
  uncertainty_sensitivity_multiplier: {
    label: "Uncertainty Sensitivity",
    stage: "Assessment",
    description: "How much uncertainty in action outcomes increases or decreases decision weight. Higher values mean the actor penalizes uncertain outcomes more.",
    lo: "Accepts uncertain outcomes — treats them as viable",
    hi: "Strongly penalizes uncertainty — prefers known outcomes",
    min: 0.5, max: 3.0, default: 1.0,
    source: "Stage 3 — Assessment",
  },
  desperation_sensitivity: {
    label: "Desperation Sensitivity",
    stage: "Assessment",
    description: "How much time pressure and goal urgency push the actor toward riskier actions. Interacts with the Total Problem Score.",
    lo: "Maintains rational caution even when desperate",
    hi: "Desperation strongly escalates risk acceptance",
    min: 0.0, max: 2.0, default: 1.0,
    source: "Stage 3 — Assessment",
  },
  urgency_sensitivity: {
    label: "Urgency Sensitivity",
    stage: "Assessment",
    description: "How much time pressure affects decision-making. Modulates the urgency component of the Total Problem Score.",
    lo: "Time pressure has minimal impact on decisions",
    hi: "Time pressure strongly drives decision urgency",
    min: 0.1, max: 1.0, default: 0.5,
    source: "Stage 3 — Assessment",
  },
  urgency_blending_weight: {
    label: "Urgency Blending Weight",
    stage: "Assessment",
    description: "Balance between cumulative urgency (history-weighted across turns) and spike urgency (current turn only).",
    lo: "Responds only to current-turn spikes",
    hi: "Integrates cumulative urgency across all turns",
    min: 0.0, max: 1.0, default: 0.5,
    source: "Stage 3 — Assessment",
  },
  problem_focus_parameter: {
    label: "Problem Focus Parameter",
    stage: "Assessment",
    description: "Nonlinearity exponent for urgency scaling. Controls the shape of the urgency response curve — how sharply urgency escalates.",
    lo: "Linear, weak urgency response",
    hi: "Steep, sharp urgency response curve",
    min: 0.5, max: 3.0, default: 1.0,
    source: "Stage 3 — Assessment",
  },
  action_discrepancy_threshold: {
    label: "Action Discrepancy Threshold",
    stage: "Assessment",
    description: "Minimum acceptable feasibility score for action inclusion in the playbook. Actions below this score are excluded from consideration.",
    lo: "Accepts marginal/low-feasibility actions",
    hi: "Only accepts fully feasible, well-matched actions",
    min: 0.1, max: 1.0, default: "Required (no default)",
    source: "Stage 3 — Assessment",
  },
  risk_reward_blender: {
    label: "Risk-Reward Blender (η)",
    stage: "Assessment",
    description: "Composite scoring variance preference. Controls whether the actor prefers high-variance (risky but potentially high-reward) or low-variance (safe) strategies.",
    lo: "Strongly prefers safe, low-variance strategies",
    hi: "Strongly prefers risky, high-variance strategies",
    min: -1.0, max: 1.0, default: 0.0,
    source: "Stage 3 — Assessment",
  },
  severity_activation_threshold: {
    label: "Severity Activation Threshold",
    stage: "Assessment",
    description: "Noise gate for goal impact — impacts below this threshold are ignored entirely. Prevents minor fluctuations from driving decisions.",
    lo: "All impacts count, even tiny ones",
    hi: "Only large, significant impacts register",
    min: 0.0, max: 0.5, default: 0.0,
    source: "Stage 3 — Assessment",
  },
  escalatory_severity_threshold: {
    label: "Escalatory Severity Threshold",
    stage: "Assessment",
    description: "Severity level that triggers catastrophic conflict aversion in Stage 3A. When exceeded, the actor strongly avoids further escalation.",
    lo: "Almost no catastrophic aversion triggered",
    hi: "Very sensitive to severity — easily triggers aversion",
    min: 0.0, max: 1.0, default: "Optional",
    source: "Stage 3A — Catastrophic Aversion",
  },
  pt_alpha: {
    label: "Risk Sensitivity (α)",
    stage: "Prospect Theory",
    description: "Prospect Theory diminishing sensitivity exponent. Controls the curvature of the value function — how much large gains/losses matter relative to small ones.",
    lo: "0.5 — strong diminishing sensitivity, large gains barely matter more",
    hi: "1.0 — weak diminishing sensitivity, all gains matter equally (linear)",
    min: 0.5, max: 1.0, default: "0.88 (Kahneman & Tversky 1992)",
    source: "Stage 3 — Prospect Theory",
  },
  pt_lambda: {
    label: "Loss Aversion (λ)",
    stage: "Prospect Theory",
    description: "Prospect Theory loss aversion coefficient. Determines how much losses hurt relative to equivalent gains. The canonical empirical value is 2.25.",
    lo: "1.0 — symmetric loss-gain sensitivity (risk-neutral)",
    hi: "4.0 — extreme loss aversion, losses loom much larger than gains",
    min: 1.0, max: 4.0, default: "2.25 (Kahneman & Tversky 1992)",
    source: "Stage 3 — Prospect Theory",
  },
  pt_gamma: {
    label: "Probability Weighting (γ)",
    stage: "Prospect Theory",
    description: "Prospect Theory probability weighting exponent. Reserved for Phase 2 when uncertainty quantification is added. Currently dormant.",
    lo: "Strong overweighting of rare events",
    hi: "Linear probability weighting (no distortion)",
    min: 0.3, max: 1.0, default: 0.65,
    source: "Stage 3 — Prospect Theory (Phase 2)",
  },
  pt_reference_persistence: {
    label: "Reference Persistence (ρ)",
    stage: "Prospect Theory",
    description: "EWMA drift rate for the PT reference point. Controls how slowly the reference adapts to new TPS values. Formula: ref_t = ρ × ref_{t-1} + (1-ρ) × TPS_t",
    lo: "Reference resets each turn — no historical memory",
    hi: "Reference drifts slowly — strong historical anchoring",
    min: 0.0, max: 1.0, default: 0.95,
    source: "Stage 3 — Prospect Theory",
  },
  temporal_discount_rate: {
    label: "Temporal Discount Rate",
    stage: "Temporal Layer",
    description: "Discount rate for delayed benefits. Controls how much future payoffs are devalued relative to immediate ones in the temporal utility calculus.",
    lo: "Patient — future payoffs valued equally to immediate ones",
    hi: "Impatient — future payoffs nearly worthless",
    min: 0.0, max: 1.0, default: "System default (0.1)",
    source: "Temporal Layer",
  },
  withdrawal_reluctance_weight: {
    label: "Withdrawal Reluctance",
    stage: "Temporal Layer",
    description: "Sunk-cost bias for sustaining actions. Controls how reluctant the actor is to withdraw from actions that have been sustained over multiple turns.",
    lo: "Easily abandons sustained actions — no sunk-cost bias",
    hi: "Highly reluctant to withdraw — maintains sunk costs",
    min: 0.0, max: 1.0, default: "System default (0.3)",
    source: "Temporal Layer",
  },
  cancellation_reluctance_weight: {
    label: "Cancellation Reluctance",
    stage: "Temporal Layer",
    description: "Sunk-cost bias for in-progress actions. Controls reluctance to cancel actions that are mid-execution.",
    lo: "Easily cancels in-progress actions",
    hi: "Highly reluctant to cancel — absorbs sunk costs",
    min: 0.0, max: 1.0, default: "System default (0.4)",
    source: "Temporal Layer",
  },
  anticipatory_weight: {
    label: "Anticipatory Weight",
    stage: "Temporal Layer",
    description: "Weight for anticipated future payoffs in decision-making. Controls how forward-looking the actor is when evaluating actions.",
    lo: "Myopic — ignores future payoffs entirely",
    hi: "Forward-looking — heavily considers anticipated outcomes",
    min: 0.0, max: 0.3, default: "System default (0.2)",
    source: "Temporal Layer",
  },
  base_decay_rate: {
    label: "Base Decay Rate",
    stage: "Temporal Layer",
    description: "Per-turn exponential decay rate for Goal Ledger entries. Controls institutional memory — how quickly past impacts fade from the actor's assessment.",
    lo: "Perfect memory — ledger entries never decay",
    hi: "No memory — entries decay to zero in one turn",
    min: 0.0, max: 1.0, default: "System default (0.3)",
    source: "Temporal Layer",
  },
  time_horizon_discount_factor: {
    label: "Time Horizon Discount Factor",
    stage: "Temporal Layer",
    description: "Discount applied to long-term objectives when the actor switches to short-horizon (crisis) mode. Controls how much crisis narrows focus.",
    lo: "Heavily discounts long-term objectives during crisis",
    hi: "Maintains long-term focus even during crisis",
    min: 0.1, max: 1.0, default: "System default (0.9)",
    source: "Temporal Layer",
  },
  crisis_threshold: {
    label: "Crisis Threshold",
    stage: "Thresholds",
    description: "Per-actor perception of what Total Problem Score level constitutes a crisis. Triggers a switch to short-horizon reactive mode.",
    lo: "Easily perceives crisis — high reactivity, early switch",
    hi: "High crisis tolerance — maintains deliberative mode longer",
    min: 0.0, max: 10.0, default: "System default (5.0)",
    source: "Thresholds & Scaling",
  },
  deescalation_bonus_value: {
    label: "De-escalation Bonus",
    stage: "Thresholds",
    description: "Incentive magnitude for choosing de-escalatory actions. Added to the utility of actions that reduce severity.",
    lo: "Weak de-escalation preference — willing to escalate",
    hi: "Strong preference for peace — large bonus for de-escalation",
    min: 0.0, max: 100.0, default: "System default (10.0)",
    source: "Thresholds & Scaling",
  },
  peer_capability_ratio: {
    label: "Peer Capability Ratio",
    stage: "Thresholds",
    description: "Threshold for considering the adversary a peer-level threat. Affects catastrophic conflict aversion calculations.",
    lo: "High bar for 'peer' status — devalues adversary capability",
    hi: "Low bar — readily sees adversary as peer-level threat",
    min: 0.0, max: 1.0, default: "System default (0.75)",
    source: "Thresholds & Scaling",
  },
  aversion_factor_value: {
    label: "Aversion Factor",
    stage: "Thresholds",
    description: "Risk dampening applied when catastrophic conflict aversion triggers. Reduces the utility of escalatory actions.",
    lo: "Minimal dampening — still escalates despite risk",
    hi: "Strong dampening — highly averse to catastrophic outcomes",
    min: 0.0, max: 1.0, default: "System default (0.5)",
    source: "Thresholds & Scaling",
  },
  effect_scaling_factor: {
    label: "Effect Scaling (Self-Efficacy)",
    stage: "Thresholds",
    description: "Per-actor confidence in own capabilities. Applied as a discount on the Action-Utility-Matrix — lower values mean the actor doubts its actions will work.",
    lo: "No confidence — actions seem ineffective",
    hi: "Full confidence — actions work as scored",
    min: 0.0, max: 1.0, default: "System default (0.9)",
    source: "Thresholds & Scaling",
  },
  diminishing_returns_rate: {
    label: "Diminishing Returns Rate",
    stage: "Thresholds",
    description: "How quickly repeated actions lose value. Prevents the actor from endlessly repeating the same strategy.",
    lo: "Slow diminishing returns — can repeat freely",
    hi: "Rapid diminishing returns — must diversify actions",
    min: 1.0, max: 20.0, default: "System default (5.0)",
    source: "Thresholds & Scaling",
  },
  priority_blending_weight: {
    label: "Priority Blending Weight",
    stage: "Thresholds",
    description: "Blend between raw situational priorities and normalized (uniform) priorities. Controls how much goal weighting responds to the situation.",
    lo: "Pure raw priorities — situation-driven weighting",
    hi: "Pure normalized — uniform goal weighting regardless of situation",
    min: 0.0, max: 1.0, default: "System default (0.5)",
    source: "Thresholds & Scaling",
  },
};


// ─── Stage color/badge helpers ───
const STAGE_COLORS = {
  "Perception": "var(--purple)",
  "Interpretation": "var(--blue)",
  "Assessment": "var(--accent)",
  "Prospect Theory": "var(--gold)",
  "Temporal Layer": "var(--green)",
  "Thresholds": "var(--red)",
};

const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "var(--text-dim)",
    marginBottom: "8px",
    fontWeight: 600,
  }}>
    {children}
  </div>
);


const ParamDetailSidebar = ({ paramKey, actorName, actorColor }) => {
  const doc = PARAM_DOCS[paramKey];

  if (!paramKey || !doc) {
    return (
      <div style={{ padding: "16px", color: "var(--text-dim)", fontSize: "11px" }}>
        <SectionLabel>Parameter Detail</SectionLabel>
        <p style={{ lineHeight: "1.6", marginTop: "12px" }}>
          Click any parameter name in the personality panel to see its full definition,
          valid range, and what the scale endpoints mean.
        </p>
      </div>
    );
  }

  const stageColor = STAGE_COLORS[doc.stage] || "var(--text-secondary)";

  return (
    <div style={{ padding: "16px", fontSize: "11px" }}>
      <SectionLabel>Parameter Detail</SectionLabel>

      {/* Actor badge */}
      {actorName && (
        <div style={{
          fontSize: "9px",
          color: actorColor || "var(--text-secondary)",
          marginBottom: "6px",
          fontWeight: 600,
        }}>
          {actorName}
        </div>
      )}

      {/* Parameter name */}
      <div style={{
        fontSize: "14px",
        fontWeight: 700,
        color: "var(--text-primary)",
        marginBottom: "4px",
        lineHeight: "1.3",
      }}>
        {doc.label}
      </div>

      {/* Stage badge */}
      <div style={{
        display: "inline-block",
        fontSize: "8px",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: stageColor,
        background: `${stageColor}18`,
        border: `1px solid ${stageColor}40`,
        padding: "2px 8px",
        borderRadius: "3px",
        marginBottom: "12px",
      }}>
        {doc.source || doc.stage}
      </div>

      {/* Description */}
      <p style={{
        color: "var(--text-primary)",
        lineHeight: "1.7",
        marginBottom: "14px",
      }}>
        {doc.description}
      </p>

      {/* Range */}
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "10px 12px",
        marginBottom: "10px",
      }}>
        <div style={{
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: "var(--text-dim)",
          marginBottom: "8px",
          fontWeight: 600,
        }}>
          Valid Range
        </div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--text-primary)",
          fontWeight: 600,
        }}>
          <span>{doc.min}</span>
          <div style={{
            flex: 1,
            height: "2px",
            background: "var(--border-light)",
            margin: "0 12px",
            borderRadius: "1px",
          }} />
          <span>{doc.max}</span>
        </div>
        {doc.default && (
          <div style={{
            fontSize: "10px",
            color: "var(--text-dim)",
            marginTop: "6px",
          }}>
            Default: <span style={{ color: "var(--text-primary)" }}>{String(doc.default)}</span>
          </div>
        )}
      </div>

      {/* Scale endpoints */}
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "10px 12px",
      }}>
        <div style={{
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: "var(--text-dim)",
          marginBottom: "8px",
          fontWeight: 600,
        }}>
          Scale Meaning
        </div>

        {/* Low end */}
        <div style={{ marginBottom: "8px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "3px",
          }}>
            <span style={{
              fontSize: "8px",
              color: "var(--text-dim)",
              fontWeight: 700,
              textTransform: "uppercase",
            }}>
              Low
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--text-dim)",
            }}>
              ({doc.min})
            </span>
          </div>
          <div style={{
            fontSize: "10px",
            color: "var(--text-primary)",
            lineHeight: "1.5",
            paddingLeft: "2px",
          }}>
            {doc.lo}
          </div>
        </div>

        {/* High end */}
        <div>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "3px",
          }}>
            <span style={{
              fontSize: "8px",
              color: "var(--text-dim)",
              fontWeight: 700,
              textTransform: "uppercase",
            }}>
              High
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--text-dim)",
            }}>
              ({doc.max})
            </span>
          </div>
          <div style={{
            fontSize: "10px",
            color: "var(--text-primary)",
            lineHeight: "1.5",
            paddingLeft: "2px",
          }}>
            {doc.hi}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParamDetailSidebar;
