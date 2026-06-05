import React, { useState } from "react";

/**
 * ActorConfigPanel - Display and edit individual actor configuration
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Displays actor parameters with SME-friendly descriptions and allows editing.
 */

// SME-friendly descriptions for each parameter
const PARAM_DESCRIPTIONS = {
  analytical_competence: "How good is their intelligence?",
  belief_update_bias: "Do they trust new info or stick to beliefs?",
  base_risk_propensity: "Are they risk-takers or cautious?",
  desperation_sensitivity: "How much does crisis increase risk-taking?",
  learning_rate: "How fast do they update beliefs?",
  alliance_salience: "How much do they value helping allies?",
  competitive_salience: "How much do they value hurting adversaries?",
  action_discrepancy_threshold: "How big must the problem be to act?",
};

const SliderInput = ({ label, value, onChange, min = 0, max = 1, step = 0.01, description }) => (
  <div style={{ marginBottom: "8px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
      <label style={{ fontSize: "12px", fontWeight: 500 }}>{label}</label>
      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: "4px" }}>
        {typeof value === 'number' ? value.toFixed(2) : value}
      </span>
    </div>
    {description && <p style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "4px" }}>{description}</p>}
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ width: "100%", height: "6px", background: "var(--border)", borderRadius: "6px", appearance: "none", cursor: "pointer" }}
    />
  </div>
);

const VectorDisplay = ({ label, vector, dimensions }) => {
  if (!vector || !Array.isArray(vector)) return null;

  return (
    <div style={{ marginBottom: "8px" }}>
      <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "6px" }}>{label}</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px", fontSize: "10px" }}>
        {vector.map((val, idx) => (
          <div key={idx} style={{ background: "var(--bg-elevated)", borderRadius: "4px", padding: "4px", textAlign: "center" }}>
            <div style={{ color: "var(--text-dim)" }}>{dimensions?.[idx] || `D${idx}`}</div>
            <div style={{ fontFamily: "var(--font-mono)" }}>{typeof val === 'number' ? val.toFixed(2) : val}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ActorConfigPanel = ({ actor, actorId, onUpdate, editable = true }) => {
  const [expanded, setExpanded] = useState(false);

  if (!actor) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px", background: "var(--bg-elevated)" }}>
        <p style={{ color: "var(--text-dim)" }}>No actor data available</p>
      </div>
    );
  }

  // Extract key parameters from actor config
  // Parameters might be at root level of actor or in actor_parameters
  const params = actor.actor_parameters || actor || {};
  const selfProfile = actor.self_profile_vector;
  const priorityVector = actor.baseline_priority_vector;

  const handleParamChange = (paramPath, value) => {
    if (onUpdate) {
      onUpdate(actorId, paramPath, value);
    }
  };

  // Profile dimension labels (from DSM spec)
  const profileDimensions = [
    "Capability", "Resolve", "Interests", "Credibility",
    "Legitimacy", "Risk", "Urgency", "Uncertainty"
  ];

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px", background: "var(--bg-card)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 600 }}>
            {actor.actor_name || `Actor ${actorId}`}
          </h3>
          {actor.actor_role && (
            <p style={{ fontSize: "10px", color: "var(--text-dim)" }}>{actor.actor_role}</p>
          )}
        </div>
        <span style={{
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "10px",
          fontWeight: 500,
          background: actorId === 0 ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "color-mix(in srgb, var(--orange, #f97316) 15%, transparent)",
          color: actorId === 0 ? "var(--accent)" : "var(--orange, #f97316)"
        }}>
          {actorId === 0 ? 'Actor A' : 'Actor B'}
        </span>
      </div>

      {/* Core Parameters */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {Object.entries(PARAM_DESCRIPTIONS).map(([key, desc]) => {
          const value = params[key];
          if (value === undefined) return null;

          return (
            <SliderInput
              key={key}
              label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              value={value}
              onChange={(v) => handleParamChange(`actor_parameters.${key}`, v)}
              description={desc}
              max={key === 'belief_update_bias' ? 2 : 1}
            />
          );
        })}
      </div>

      {/* Expandable Advanced Section */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ marginTop: "12px", fontSize: "12px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", padding: 0 }}
      >
        {expanded ? "▼" : "►"} {expanded ? "Hide" : "Show"} Vectors
      </button>

      {expanded && (
        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
          <VectorDisplay
            label="Self-Profile Vector"
            vector={selfProfile}
            dimensions={profileDimensions}
          />

          {priorityVector && (
            <VectorDisplay
              label="Baseline Priority Vector"
              vector={priorityVector}
              dimensions={null} // Objectives - will need ontology
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ActorConfigPanel;
