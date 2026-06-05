import React, { useState } from "react";

/**
 * Stage4Learning - Learning & Updating Stage Inspector
 *
 * UI Stage 4 (Model Stage 5)
 *
 * Narrative View: Plain language explanation of belief updates and resource changes
 * Analytical View: Detailed comparison of APV tensor and profile vectors
 */

// InfoIcon component for tooltips
const InfoIcon = ({ tooltip, align = "right" }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipLeft = align === "left" ? "0px" : "-110px";
  const arrowLeft = align === "left" ? "12px" : "50%";
  const arrowTransform = align === "left" ? "rotate(45deg)" : "translateX(-50%) rotate(45deg)";
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: "4px", cursor: "help" }}
      onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <svg style={{ width: "14px", height: "14px", color: "var(--text-dim)", display: "inline", verticalAlign: "middle" }}
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeWidth="2" />
        <path strokeWidth="2" d="M12 16v-4m0-4h.01" />
      </svg>
      {showTooltip && (
        <div style={{ position: "absolute", zIndex: 50, width: "260px", padding: "8px 10px", fontSize: "10px", background: "var(--bg-main)", color: "var(--text-primary)", borderRadius: "6px", border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,0.4)", left: tooltipLeft, bottom: "22px", lineHeight: 1.4 }}>
          {tooltip}
          <div style={{ position: "absolute", left: arrowLeft, bottom: "-4px", width: "8px", height: "8px", background: "var(--bg-main)", border: "1px solid var(--border)", borderTop: "none", borderLeft: "none", transform: arrowTransform }} />
        </div>
      )}
    </span>
  );
};

// Tooltip definitions
const tooltips = {
  beliefs: "The actor's mental model of the other actor - their severity, clarity, resolve, capability, etc. Updated based on observed actions using a learning rate.",
  tangibleImpacts: "Changes to the actor's own profile from taking actions. Actions cost resources (capability, resolve) and may affect credibility and positional advantage.",
  relationshipScore: "A value from -1 (adversary) to +1 (ally) representing how the actor views the other. Updated based on whether observed actions helped or hurt.",
  timeHorizon: "The actor's planning horizon - Short (crisis mode), Medium (normal), or Long (strategic). Driven by the current problem score."
};

// Characteristic labels - order matches the Char enum in enums.py
// Raw enum values for reference
const CHAR_ENUM = [
  "Severity", "Clarity", "Irreversibility", "Resolve",
  "Credibility", "Capability", "Risk_Propensity", "Positional_Advantage"
];

// Human-readable labels for beliefs about another actor (APV Tensor)
const BELIEF_LABELS = [
  "Tendency toward severe actions",
  "Clarity of intentions",
  "Willingness to take irreversible actions",
  "Resolve and determination",
  "Credibility of commitments",
  "Capability to act",
  "Tolerance for risk",
  "Positional advantage",
];

// Human-readable labels for self-profile characteristics
const SELF_PROFILE_LABELS = [
  "Capacity for severe actions",
  "Clarity of signaling",
  "Ability to commit irreversibly",
  "Resolve",
  "Credibility",
  "Capability",
  "Risk tolerance",
  "Positional advantage",
];

// Helper to safely extract scalar from nested arrays
const getScalar = (val, defaultVal = 0) => {
  if (typeof val === 'number') return val;
  if (Array.isArray(val)) {
    if (Array.isArray(val[0])) return val[0][0] ?? defaultVal;
    return val[0] ?? defaultVal;
  }
  return defaultVal;
};

// Helper to extract a vector from various nested formats
const extractVector = (data) => {
  if (!data || !Array.isArray(data)) return [];

  // Handle 3D tensor - get first actor's values
  if (data[0] && Array.isArray(data[0]) && Array.isArray(data[0][0])) {
    // Format: [[[v1], [v2], ...], ...] - take first actor
    return data[0].map(v => Array.isArray(v) ? v[0] : v);
  }

  // Format: [[v1], [v2], ...]
  if (data[0] && Array.isArray(data[0])) {
    return data.map(v => Array.isArray(v) ? v[0] : v);
  }

  return data;
};

// Helper to get action name
const getActionName = (actionId, ontology) => {
  if (!ontology?.actions || actionId === undefined) return `Action ${actionId}`;
  return ontology.actions[actionId] || `Action ${actionId}`;
};

// Narrative View Component
const SMEView = ({ eventData, actorName, otherActorName, ontology }) => {
  // Get the chosen actions
  const chosenSequence = eventData?.["Chosen-Action-Sequence"] || [];

  // APV changes (beliefs about the other actor)
  const apvOld = eventData?.["APV-Tensor"];
  const apvNew = eventData?.["APV-Tensor-New"];

  // Self-profile changes
  const selfProfileOld = extractVector(eventData?.["Self-Profile-Vector"]);
  const tangibleImpacts = eventData?.["Tangible-Impacts"];

  // Relationship changes
  const relMatrixOld = eventData?.["Relationship-Score-Matrix"];
  const relMatrixNew = eventData?.["Relationship-Score-Matrix-New"];

  // Time horizon
  const timeHorizonOld = eventData?.["Actor-Time-Horizon"];
  const timeHorizonNew = eventData?.["Actor-Time-Horizon-New"];

  // Calculate belief changes (APV diff for the observed actor)
  // APV is indexed by [observed_actor, characteristic, 1]
  const beliefChanges = [];
  if (apvOld && apvNew) {
    // Try to get the other actor's index (usually 1 if we're actor 0)
    const otherActorIdx = 1; // Simplified - in practice would need actor mapping

    BELIEF_LABELS.forEach((label, idx) => {
      const oldVal = getScalar(apvOld?.[otherActorIdx]?.[idx], 0);
      const newVal = getScalar(apvNew?.[otherActorIdx]?.[idx], 0);
      const diff = newVal - oldVal;

      if (Math.abs(diff) > 0.001) {
        beliefChanges.push({
          characteristic: label,
          direction: diff > 0 ? "raised" : "lowered",
          oldVal,
          newVal,
          diff
        });
      }
    });
  }

  // Calculate self-profile changes from tangible impacts
  const selfChanges = [];
  if (tangibleImpacts) {
    const selfIdx = 0; // Actor processing this event
    const impacts = extractVector(tangibleImpacts?.[selfIdx]);

    SELF_PROFILE_LABELS.forEach((label, idx) => {
      const impact = impacts[idx] || 0;
      if (Math.abs(impact) > 0.001) {
        selfChanges.push({
          dimension: label,
          direction: impact > 0 ? "raising" : "lowering",
          impact
        });
      }
    });
  }

  // Relationship change
  const observerIdx = 0;
  const otherIdx = 1;
  const relOld = relMatrixOld?.[observerIdx]?.[otherIdx] ?? 0;
  const relNew = relMatrixNew?.[observerIdx]?.[otherIdx] ?? relOld;
  const relChange = relNew - relOld;

  // Time horizon labels
  const horizonLabels = { 0: "Short", 1: "Medium", 2: "Long" };
  const timeOldLabel = horizonLabels[timeHorizonOld] || timeHorizonOld || "Medium";
  const timeNewLabel = horizonLabels[timeHorizonNew] || timeHorizonNew || timeOldLabel;

  return (
    <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" }}>
      <h5 style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px", fontSize: "12px", margin: "0 0 10px 0" }}>Learning & Updates</h5>

      <div style={{ maxWidth: "none", color: "var(--text-primary)", display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" }}>

        {/* Commitment Assessment */}
        <CommitmentEstimateSME
          eventData={eventData}
          actorName={actorName}
          otherActorName={otherActorName}
        />

        {/* Belief Updates */}
        <div>
          <p style={{ marginBottom: "6px" }}>
            Given <strong>{actorName}</strong>'s perception of <strong>{otherActorName}</strong>'s
            last turn, {actorName} adjusted their beliefs about {otherActorName} accordingly:
            <InfoIcon tooltip={tooltips.beliefs} align="left" />
          </p>

          {beliefChanges.length > 0 ? (
            <ul style={{ listStyleType: "disc", listStylePosition: "inside", marginLeft: "8px" }}>
              {beliefChanges.map((change, idx) => (
                <li key={idx}>
                  <strong>{change.direction}</strong> their estimate of {otherActorName}'s{" "}
                  <strong>{change.characteristic.toLowerCase()}</strong>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "4px" }}>
                    ({change.oldVal.toFixed(2)} → {change.newVal.toFixed(2)})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--text-secondary)", marginLeft: "8px", fontStyle: "italic" }}>No significant belief changes this turn.</p>
          )}
        </div>

        {/* Self-Profile Changes */}
        <div>
          <p style={{ marginBottom: "6px" }}>
            The actions {actorName} just took
            {chosenSequence.length > 0 && (
              <span style={{ color: "var(--purple, #c084fc)" }}>
                {" "}({chosenSequence.map(id => getActionName(id, ontology)).join(", ")})
              </span>
            )}
            {" "}cost {actorName} resources:
            <InfoIcon tooltip={tooltips.tangibleImpacts} align="left" />
          </p>

          {selfChanges.length > 0 ? (
            <ul style={{ listStyleType: "disc", listStylePosition: "inside", marginLeft: "8px" }}>
              {selfChanges.map((change, idx) => (
                <li key={idx}>
                  <strong>{change.direction}</strong> their own{" "}
                  <strong>{change.dimension.toLowerCase()}</strong>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "4px" }}>
                    ({change.impact > 0 ? "+" : ""}{change.impact.toFixed(3)})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--text-secondary)", marginLeft: "8px", fontStyle: "italic" }}>No significant resource changes this turn.</p>
          )}
        </div>

        {/* Relationship & Time Horizon Summary */}
        <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px 10px", marginTop: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "12px" }}>
            <div>
              <span style={{ color: "var(--text-dim)" }}>Relationship Score:</span>
              <InfoIcon tooltip={tooltips.relationshipScore} />
              <div style={{ fontFamily: "var(--font-mono)" }}>
                {relOld.toFixed(2)} →
                <span style={{ fontWeight: 700, marginLeft: "4px", color: relChange < 0 ? "var(--red)" : relChange > 0 ? "var(--green)" : "inherit" }}>
                  {relNew.toFixed(2)}
                </span>
                {Math.abs(relChange) > 0.01 && (
                  <span style={{ fontSize: "10px", marginLeft: "4px", color: relChange < 0 ? "var(--red)" : "var(--green)" }}>
                    ({relChange > 0 ? "+" : ""}{relChange.toFixed(2)})
                  </span>
                )}
              </div>
            </div>
            <div>
              <span style={{ color: "var(--text-dim)" }}>Time Horizon:</span>
              <InfoIcon tooltip={tooltips.timeHorizon} />
              <div style={{ fontWeight: 500 }}>
                {timeOldLabel === timeNewLabel
                  ? timeNewLabel
                  : <span>{timeOldLabel} → <strong>{timeNewLabel}</strong></span>
                }
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

/**
 * CommitmentEstimateSME — Narrative view of commitment estimates.
 * Shows a synthesized assessment of how committed each observed actor appears.
 */
const CommitmentEstimateSME = ({ eventData, actorName, otherActorName }) => {
  const commitmentEstimates = eventData?.["Commitment-Estimates"];
  if (!commitmentEstimates || typeof commitmentEstimates !== "object") return null;

  // Get the commitment estimate for the other actor (usually key "1" if we are actor 0)
  const entries = Object.entries(commitmentEstimates);
  if (entries.length === 0) return null;

  const getCommitmentLevel = (val) => {
    if (val >= 0.75) return { label: "very high", color: "var(--red)" };
    if (val >= 0.55) return { label: "high", color: "var(--gold)" };
    if (val >= 0.35) return { label: "moderate", color: "var(--gold)" };
    if (val >= 0.15) return { label: "low", color: "var(--green)" };
    return { label: "very low", color: "var(--green)" };
  };

  return (
    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
      <p style={{ fontSize: "12px", color: "var(--text-primary)", marginBottom: "6px" }}>
        <strong>Commitment Assessment</strong>{" "}
        <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>(Phase 2)</span>
      </p>
      <div style={{ fontSize: "12px", color: "var(--text-primary)" }}>
        {entries.map(([actorIdx, estimate]) => {
          const val = typeof estimate === "number" ? estimate : 0;
          const level = getCommitmentLevel(val);
          const name = parseInt(actorIdx) === 1 ? otherActorName : `Actor ${actorIdx}`;
          return (
            <div key={actorIdx} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span>{actorName}'s assessment of <strong>{name}</strong>'s commitment:</span>
              <span style={{ fontWeight: 700, color: level.color }}>{level.label}</span>
              <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>({val.toFixed(2)})</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Analytical View Sub-tab Component
const SubStageTab = ({ id, name, isActive, onClick }) => (
  <button
    onClick={() => onClick(id)}
    style={{
      padding: "4px 10px", fontSize: "10px", borderRadius: "4px", cursor: "pointer",
      border: isActive ? "1px solid var(--purple, #c084fc)" : "1px solid var(--border)",
      background: isActive ? "var(--purple, #c084fc)" : "var(--bg-card)",
      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
      fontWeight: isActive ? 500 : 400,
    }}
  >
    {name}
  </button>
);

// Connected dots visualization for showing before/after changes
const ChangeRow = ({ label, oldVal, newVal, precision = 2, minScale = 0, maxScale = 1 }) => {
  if (oldVal === undefined && newVal === undefined) return null;
  const old = oldVal ?? 0;
  const newer = newVal ?? old;
  const diff = newer - old;

  // Determine color based on direction
  const isIncrease = diff > 0.001;
  const isDecrease = diff < -0.001;
  const lineColor = isIncrease ? "var(--green)" : isDecrease ? "var(--red)" : "var(--border)";
  const dotBorderColor = isIncrease ? "var(--green)" : isDecrease ? "var(--red)" : "var(--text-dim)";
  const dotFillColor = isIncrease ? "var(--green)" : isDecrease ? "var(--red)" : "var(--text-dim)";
  const textColor = isIncrease ? "var(--green)" : isDecrease ? "var(--red)" : "var(--text-secondary)";

  // Calculate positions on scale (0-100%)
  const range = maxScale - minScale || 1;
  const oldPos = ((old - minScale) / range) * 100;
  const newPos = ((newer - minScale) / range) * 100;
  const leftPos = Math.min(oldPos, newPos);
  const rightPos = Math.max(oldPos, newPos);
  const barWidth = rightPos - leftPos;

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "8px", borderBottom: "1px solid var(--border)" }}>
      {/* Label row - full width */}
      <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginBottom: "5px", fontWeight: 500 }}>{label}</div>

      {/* Dot plot row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Old value */}
        <span style={{ width: "48px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-dim)", textAlign: "right" }}>{old.toFixed(precision)}</span>

        {/* Dot plot visualization */}
        <div style={{ flex: 1, position: "relative", height: "16px", minWidth: "120px" }}>
          {/* Background track */}
          <div style={{ position: "absolute", top: "6px", left: 0, right: 0, background: "var(--border)", borderRadius: "9999px", height: "4px" }} />

          {/* Connecting line between dots */}
          {barWidth > 0.5 && (
            <div
              style={{
                position: "absolute",
                top: "6px",
                height: "4px",
                background: lineColor,
                borderRadius: "9999px",
                left: `${leftPos}%`,
                width: `${barWidth}%`
              }}
            />
          )}

          {/* Old value dot (hollow) */}
          <div
            style={{
              position: "absolute",
              top: "2px",
              width: "12px",
              height: "12px",
              borderRadius: "9999px",
              background: "var(--bg-card)",
              border: `2px solid ${dotBorderColor}`,
              transform: "translateX(-50%)",
              left: `${oldPos}%`
            }}
            title={`Old: ${old.toFixed(precision)}`}
          />

          {/* New value dot (solid) */}
          <div
            style={{
              position: "absolute",
              top: "2px",
              width: "12px",
              height: "12px",
              borderRadius: "9999px",
              background: dotFillColor,
              transform: "translateX(-50%)",
              left: `${newPos}%`
            }}
            title={`New: ${newer.toFixed(precision)}`}
          />
        </div>

        {/* New value */}
        <span style={{ width: "48px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 500, color: textColor }}>{newer.toFixed(precision)}</span>

        {/* Change indicator */}
        <span style={{ width: "64px", fontFamily: "var(--font-mono)", fontSize: "10px", textAlign: "right", color: textColor }}>
          {Math.abs(diff) > 0.001 ? (diff > 0 ? "+" : "") + diff.toFixed(precision) : "—"}
        </span>
      </div>
    </div>
  );
};

// Legend component for dot plot
const DotPlotLegend = () => (
  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "10px", color: "var(--text-dim)", marginBottom: "10px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <div style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "var(--bg-card)", border: "2px solid var(--text-dim)" }} />
      <span>Old</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <div style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "var(--text-dim)" }} />
      <span>New</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <div style={{ width: "16px", height: "2px", background: "var(--green)", borderRadius: "2px" }} />
      <span>Increase</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <div style={{ width: "16px", height: "2px", background: "var(--red)", borderRadius: "2px" }} />
      <span>Decrease</span>
    </div>
  </div>
);

// Beliefs Sub-view (APV Tensor comparison)
const BeliefsSubView = ({ eventData, otherActorName }) => {
  const apvOld = eventData?.["APV-Tensor"];
  const apvNew = eventData?.["APV-Tensor-New"];
  const learningRate = getScalar(eventData?.["Learning-Rate"], 0.3);

  // Get the other actor's belief vector (index 1)
  const otherIdx = 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" }}>
        <h5 style={{ fontWeight: 500, marginBottom: "6px", fontSize: "12px", color: "var(--text-primary)", margin: "0 0 6px 0" }}>
          Beliefs about {otherActorName}
          <InfoIcon tooltip={tooltips.beliefs} align="left" />
        </h5>
        <p style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "6px" }}>
          Learning Rate: {learningRate.toFixed(2)} | New = (LR × Observed) + ((1-LR) × Old)
        </p>

        <DotPlotLegend />

        <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px 10px" }}>
          {BELIEF_LABELS.map((label, idx) => {
            const oldVal = getScalar(apvOld?.[otherIdx]?.[idx], 0);
            const newVal = getScalar(apvNew?.[otherIdx]?.[idx], oldVal);
            return (
              <ChangeRow
                key={label}
                label={label}
                oldVal={oldVal}
                newVal={newVal}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Self Profile Sub-view
const SelfProfileSubView = ({ eventData, actorName }) => {
  const selfProfileOld = extractVector(eventData?.["Self-Profile-Vector"]);
  const tangibleImpacts = eventData?.["Tangible-Impacts"];

  // Get self impacts (actor index 0)
  const selfIdx = 0;
  const impacts = tangibleImpacts ? extractVector(tangibleImpacts[selfIdx]) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" }}>
        <h5 style={{ fontWeight: 500, marginBottom: "6px", fontSize: "12px", color: "var(--text-primary)", margin: "0 0 6px 0" }}>
          {actorName}'s Profile Changes
          <InfoIcon tooltip={tooltips.tangibleImpacts} align="left" />
        </h5>
        <p style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "6px" }}>
          Tangible impacts from actions taken this turn
        </p>

        <DotPlotLegend />

        <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px 10px" }}>
          {SELF_PROFILE_LABELS.map((label, idx) => {
            const oldVal = selfProfileOld[idx] ?? 0;
            const impact = impacts[idx] ?? 0;
            const newVal = oldVal + impact;
            return (
              <ChangeRow
                key={label}
                label={label}
                oldVal={oldVal}
                newVal={newVal}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Relationship Sub-view
const RelationshipSubView = ({ eventData, actorName, otherActorName }) => {
  const relMatrixOld = eventData?.["Relationship-Score-Matrix"];
  const relMatrixNew = eventData?.["Relationship-Score-Matrix-New"];
  const relStateOld = eventData?.["Relationship-State-Matrix"];
  const relStateNew = eventData?.["Relationship-State-Matrix-New"];
  const updateSensitivity = getScalar(eventData?.["Relationship-Update-Sensitivity"], 0.1);

  const observerIdx = 0;
  const otherIdx = 1;

  const scoreOld = relMatrixOld?.[observerIdx]?.[otherIdx] ?? 0;
  const scoreNew = relMatrixNew?.[observerIdx]?.[otherIdx] ?? scoreOld;

  // Relationship state mapping from enums.py: Ally=1, Neutral=2, Adversary=-1
  const stateLabels = { "-1": "Adversary", "1": "Ally", "2": "Neutral" };
  const oldStateVal = relStateOld?.[observerIdx]?.[otherIdx];
  const newStateVal = relStateNew?.[observerIdx]?.[otherIdx];
  const stateOld = stateLabels[String(oldStateVal)] || "Unknown";
  const stateNew = stateLabels[String(newStateVal)] || stateOld;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" }}>
        <h5 style={{ fontWeight: 500, marginBottom: "6px", fontSize: "12px", color: "var(--text-primary)", margin: "0 0 6px 0" }}>
          Relationship: {actorName} → {otherActorName}
          <InfoIcon tooltip={tooltips.relationshipScore} align="left" />
        </h5>
        <p style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "10px" }}>
          Update Sensitivity: {updateSensitivity.toFixed(2)} | Score = Old + (Net Impact × Sensitivity)
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px 10px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "4px" }}>Score</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px" }}>{scoreOld.toFixed(3)}</span>
              <span style={{ color: "var(--text-dim)" }}>→</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700,
                color: scoreNew < scoreOld ? "var(--red)" : scoreNew > scoreOld ? "var(--green)" : "inherit"
              }}>
                {scoreNew.toFixed(3)}
              </span>
            </div>
          </div>
          <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px 10px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "4px" }}>State</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "16px" }}>{stateOld}</span>
              {stateOld !== stateNew && (
                <>
                  <span style={{ color: "var(--text-dim)" }}>→</span>
                  <span style={{ fontSize: "16px", fontWeight: 700 }}>{stateNew}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Score visualization */}
        <div style={{ marginTop: "12px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "4px" }}>Score Range (-1 to +1)</div>
          <div style={{ position: "relative", height: "24px", background: "linear-gradient(to right, var(--red), var(--border), var(--green))", borderRadius: "4px", opacity: 0.6 }}>
            {/* Old marker */}
            <div
              style={{ position: "absolute", top: 0, height: "24px", width: "4px", background: "var(--text-dim)", opacity: 0.5, left: `${((scoreOld + 1) / 2) * 100}%` }}
              title={`Old: ${scoreOld.toFixed(3)}`}
            />
            {/* New marker */}
            <div
              style={{ position: "absolute", top: 0, height: "24px", width: "8px", background: "var(--purple, #c084fc)", borderRadius: "4px", left: `${((scoreNew + 1) / 2) * 100}%`, transform: "translateX(-50%)" }}
              title={`New: ${scoreNew.toFixed(3)}`}
            />
            {/* Labels */}
            <div style={{ position: "absolute", bottom: "-16px", left: 0, fontSize: "10px", color: "var(--red)" }}>-1</div>
            <div style={{ position: "absolute", bottom: "-16px", left: "50%", transform: "translateX(-50%)", fontSize: "10px", color: "var(--text-dim)" }}>0</div>
            <div style={{ position: "absolute", bottom: "-16px", right: 0, fontSize: "10px", color: "var(--green)" }}>+1</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Analytical View Component
const DevView = ({ eventData, actorName, otherActorName, ontology }) => {
  const [activeSubView, setActiveSubView] = useState("beliefs");

  const hasCommitment = eventData?.["Commitment-Estimates"] &&
    Object.keys(eventData["Commitment-Estimates"]).length > 0;

  const subViews = [
    { id: "beliefs", name: `Beliefs about ${otherActorName || "Other"}` },
    { id: "self", name: "Self Profile" },
    { id: "relationship", name: "Relationship" },
    ...(hasCommitment ? [{ id: "commitment", name: "Commitment" }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {subViews.map(view => (
          <SubStageTab
            key={view.id}
            id={view.id}
            name={view.name}
            isActive={activeSubView === view.id}
            onClick={setActiveSubView}
          />
        ))}
      </div>

      {activeSubView === "beliefs" && (
        <BeliefsSubView eventData={eventData} otherActorName={otherActorName} />
      )}
      {activeSubView === "self" && (
        <SelfProfileSubView eventData={eventData} actorName={actorName} />
      )}
      {activeSubView === "relationship" && (
        <RelationshipSubView eventData={eventData} actorName={actorName} otherActorName={otherActorName} />
      )}
      {activeSubView === "commitment" && (
        <CommitmentSubView eventData={eventData} actorName={actorName} otherActorName={otherActorName} />
      )}
    </div>
  );
};

/**
 * CommitmentSubView — Analytical view of the Commitment Model.
 * Shows the weighted synthesis of 5 signaling characteristics into a composite score.
 */
const COMMITMENT_COMPONENTS = [
  { key: "Resolve", label: "Resolve", description: "Determination to persist with chosen course" },
  { key: "Irreversibility", label: "Irreversibility", description: "Degree to which actions cannot be undone" },
  { key: "Credibility", label: "Credibility", description: "Believability of commitments and threats" },
  { key: "Capability", label: "Capability", description: "Ability to follow through on commitments" },
  { key: "Risk_Propensity", label: "Risk Propensity", description: "Willingness to accept risk" },
];

const CommitmentSubView = ({ eventData, actorName, otherActorName }) => {
  const commitmentEstimates = eventData?.["Commitment-Estimates"];
  const apvNew = eventData?.["APV-Tensor-New"] || eventData?.["APV-Tensor"];
  const commitmentWeights = eventData?.["Commitment-Weights"];

  if (!commitmentEstimates) return null;

  // Default weights if not provided
  const weights = commitmentWeights || [0.20, 0.20, 0.20, 0.20, 0.20];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {Object.entries(commitmentEstimates).map(([actorIdx, estimate]) => {
        const val = typeof estimate === "number" ? estimate : 0;
        const name = parseInt(actorIdx) === 1 ? (otherActorName || "Other Actor") : `Actor ${actorIdx}`;

        // Extract component values from APV tensor
        const charEnum = CHAR_ENUM;
        const componentValues = COMMITMENT_COMPONENTS.map((comp, cIdx) => {
          const charIdx = charEnum.indexOf(comp.key);
          let believed = 0;
          if (apvNew && charIdx >= 0) {
            const raw = apvNew?.[parseInt(actorIdx)]?.[charIdx];
            believed = getScalar(raw, 0);
          }
          return {
            ...comp,
            believed,
            weight: typeof weights === "object" && Array.isArray(weights)
              ? weights[cIdx] ?? 0.20
              : 0.20,
            contribution: believed * (Array.isArray(weights) ? (weights[cIdx] ?? 0.20) : 0.20),
          };
        });

        return (
          <div key={actorIdx} style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h5 style={{ fontWeight: 500, fontSize: "12px", color: "var(--text-primary)", margin: 0 }}>
                {actorName}'s assessment of {name}'s commitment
              </h5>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>Composite:</span>
                <span style={{
                  fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-mono)",
                  color: val >= 0.6 ? "var(--red)" : val >= 0.35 ? "var(--gold)" : "var(--green)"
                }}>
                  {val.toFixed(3)}
                </span>
              </div>
            </div>

            {/* Composite bar */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ width: "100%", background: "var(--border)", borderRadius: "9999px", height: "12px", position: "relative" }}>
                <div
                  style={{
                    height: "12px", borderRadius: "9999px",
                    background: val >= 0.6 ? "var(--red)" : val >= 0.35 ? "var(--gold)" : "var(--green)",
                    width: `${Math.min(val * 100, 100)}%`
                  }}
                />
                {/* Tick marks */}
                <div style={{ position: "absolute", top: 0, left: "25%", width: "1px", height: "12px", background: "var(--text-dim)", opacity: 0.5 }} />
                <div style={{ position: "absolute", top: 0, left: "50%", width: "1px", height: "12px", background: "var(--text-dim)", opacity: 0.5 }} />
                <div style={{ position: "absolute", top: 0, left: "75%", width: "1px", height: "12px", background: "var(--text-dim)", opacity: 0.5 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                <span>0.0</span>
                <span>0.25</span>
                <span>0.50</span>
                <span>0.75</span>
                <span>1.0</span>
              </div>
            </div>

            {/* Component breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "10px", color: "var(--text-dim)", fontWeight: 500, marginBottom: "4px" }}>Component Breakdown</div>
              {componentValues.map((comp) => (
                <div key={comp.key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
                  <span style={{ width: "112px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={comp.description}>
                    {comp.label}
                  </span>
                  <span style={{ width: "40px", textAlign: "right", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    w={comp.weight.toFixed(2)}
                  </span>
                  <div style={{ flex: 1, background: "var(--border)", borderRadius: "4px", height: "8px" }}>
                    <div
                      style={{ height: "8px", borderRadius: "4px", background: "var(--purple, #c084fc)", width: `${Math.min(comp.believed * 100, 100)}%` }}
                    />
                  </div>
                  <span style={{ width: "40px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                    {comp.believed.toFixed(2)}
                  </span>
                  <span style={{ width: "64px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--purple, #c084fc)" }}>
                    → {comp.contribution.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Main Component
const Stage4Learning = ({ eventData, actorName, otherActorName, isDevMode, ontology }) => {
  if (!isDevMode) {
    return <SMEView eventData={eventData} actorName={actorName} otherActorName={otherActorName} ontology={ontology} />;
  }

  return <DevView eventData={eventData} actorName={actorName} otherActorName={otherActorName} ontology={ontology} />;
};

export default Stage4Learning;
