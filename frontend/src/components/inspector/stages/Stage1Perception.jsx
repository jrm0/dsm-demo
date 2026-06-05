import React, { useState } from "react";

/**
 * Stage1Perception - Perception Stage Inspector
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Displays how the actor perceived the observed action:
 * - True vs Perceived distribution
 * - Uncertainty vectors
 * - Signal strength
 * - Base Input Vector
 */

// Info icon component with tooltip
const InfoIcon = ({ tooltip }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-block", marginLeft: "4px", cursor: "help" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg
        style={{ width: "14px", height: "14px", color: "var(--text-dim)", display: "inline", verticalAlign: "middle" }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="10" strokeWidth="2" />
        <path strokeWidth="2" d="M12 16v-4m0-4h.01" />
      </svg>
      {showTooltip && (
        <div style={{
          position: "absolute",
          zIndex: 50,
          width: "260px",
          padding: "8px 10px",
          fontSize: "10px",
          background: "var(--bg-main)",
          color: "var(--text-primary)",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          left: "-110px",
          bottom: "22px",
          lineHeight: 1.4,
        }}>
          {tooltip}
          <div style={{
            position: "absolute",
            left: "50%",
            bottom: "-4px",
            width: "8px",
            height: "8px",
            background: "var(--bg-main)",
            border: "1px solid var(--border)",
            borderTop: "none",
            borderLeft: "none",
            transform: "translateX(-50%) rotate(45deg)",
          }} />
        </div>
      )}
    </span>
  );
};

const getLevel = (val) => {
  if (val >= 0.7) return "high";
  if (val >= 0.4) return "medium";
  return "low";
};

const getCompetenceLabel = (val) => {
  if (val >= 0.7) return "High";
  if (val >= 0.4) return "Medium";
  return "Low";
};

const getBiasLabel = (val) => {
  // Belief update bias > 1 = pessimistic, < 1 = optimistic
  if (val > 1.2) return "pessimism";
  if (val < 0.8) return "optimism";
  return "neutrality";
};

const getThreatLabel = (relationshipScore) => {
  // Higher relationship score = more friendly, lower = more threatening
  if (relationshipScore <= -0.5) return "extremely threatening";
  if (relationshipScore <= -0.2) return "relatively threatening";
  if (relationshipScore >= 0.5) return "relatively benign";
  if (relationshipScore >= 0.2) return "somewhat benign";
  return "neutral";
};

const VectorBar = ({ label, value, max = 1 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
    <span style={{ width: "90px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    <div style={{ flex: 1, background: "var(--border)", borderRadius: "3px", height: "6px", overflow: "hidden" }}>
      <div
        style={{
          height: "6px",
          borderRadius: "3px",
          width: `${(value / max) * 100}%`,
          background: value > 0.7 ? "var(--red)" : value > 0.4 ? "var(--gold)" : "var(--accent)",
        }}
      />
    </div>
    <span style={{ width: "36px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-primary)" }}>{value?.toFixed(2) ?? "N/A"}</span>
  </div>
);

// Helper to extract vector from format: [[actionId, [[v1], [v2], ...]]] or [[v1], [v2], ...]
const extractVector = (data) => {
  if (!data || !Array.isArray(data)) return [];

  // Format: [[actionId, [[v1], [v2], ...]]]
  if (data[0] && Array.isArray(data[0]) && data[0].length === 2 && typeof data[0][0] === 'number') {
    const innerVector = data[0][1]; // Get the vector part after action ID
    if (Array.isArray(innerVector)) {
      return innerVector.map(v => Array.isArray(v) ? v[0] : v);
    }
  }

  // Format: [[[v1]], [[v2]], ...] (doubly nested)
  if (data[0] && Array.isArray(data[0]) && Array.isArray(data[0][0])) {
    return data.map(v => v?.[0]?.[0] ?? v?.[0] ?? v);
  }

  // Format: [[v1], [v2], ...] (singly nested)
  if (data[0] && Array.isArray(data[0])) {
    return data.map(v => Array.isArray(v) ? v[0] : v);
  }

  return data;
};

// Helper to extract signal strength from format: [[actionId, value]]
const extractSignalStrength = (data) => {
  if (!data || !Array.isArray(data)) return undefined;
  if (data[0] && Array.isArray(data[0]) && data[0].length === 2) {
    return data[0][1]; // Get the value part
  }
  if (typeof data[0] === 'number') return data[0];
  return undefined;
};

const SMEView = ({ eventData, actorName, observedAction, otherActorName, relationshipState }) => {
  // Extract key metrics from event data
  // Base Input Vector = perceived characteristics (after distortion)
  // Chosen-Action-Vectors = objective characteristics (Point Observation)
  const flatBaseInput = extractVector(eventData?.["Base-Input-Vectors"]);
  const flatUncertainty = extractVector(eventData?.["Uncertainty-Vectors"]);

  // Extract Point Observation (objective action characteristics)
  // Format: [[[v1], [v2], ...]] - the objective characteristics of the observed action
  const chosenActionVectors = eventData?.["Chosen-Action-Vectors"] || [];
  const flatPointObservation = chosenActionVectors[0]
    ? chosenActionVectors[0].map(v => Array.isArray(v) ? v[0] : v)
    : [];

  // Action Characteristic indices (from backend Char enum):
  // 0: Severity, 1: Clarity, 2: Irreversibility, 3: Resolve, 4: Credibility, 5: Capability, 6: Risk Propensity, 7: Positional Advantage
  const objectiveSeverity = flatPointObservation[0] ?? 0;
  const objectiveResolve = flatPointObservation[3] ?? 0;
  const objectiveCapability = flatPointObservation[5] ?? 0;

  // Perceived characteristics (after distortion by beliefs/competence)
  // Same indices apply to Base Input Vector
  const perceivedSeverityRaw = flatBaseInput[0] ?? 0;
  const perceivedResolve = flatBaseInput[3] ?? 0;
  const perceivedCapability = flatBaseInput[5] ?? 0;

  // Perceived severity is index 0 in the Base Input Vector
  const perceivedSeverity = perceivedSeverityRaw;

  // Calculate aggregate uncertainty
  const avgUncertainty = flatUncertainty.length > 0
    ? flatUncertainty.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) / flatUncertainty.length
    : 0;

  // Get actor parameters for competence and bias
  const analyticalCompetence = eventData?.["Analytical-Competence"] ?? 0.5;
  const beliefUpdateBias = eventData?.["Belief-Update-Bias"] ?? 1.0;

  // Get relationship score from matrix (if available)
  const relMatrix = eventData?.["Relationship-Score-Matrix"];
  const relationshipScore = relMatrix?.[0]?.[1] ?? 0;

  // Count number of actions in the observed action string
  const actionCount = observedAction ? observedAction.split(',').length : 1;
  const actionDescriptor = actionCount > 1 ? `This set of ${actionCount} actions` : "This action";

  return (
    <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" }}>
      <h4 style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px", fontSize: "13px", margin: "0 0 10px 0" }}>Perception Summary</h4>

      <div style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "8px" }}>
        {/* Objective signal */}
        <p style={{ margin: 0 }}>
          To an outside observer, <strong style={{ color: "var(--text-primary)" }}>{otherActorName}</strong>'s actions would have shown{" "}
          <strong>{getLevel(objectiveSeverity)}</strong> severity,{" "}
          <strong>{getLevel(objectiveResolve)}</strong> resolve, and{" "}
          <strong>{getLevel(objectiveCapability)}</strong> capability.
        </p>

        {/* Prior beliefs distortion */}
        <p style={{ margin: 0 }}>
          {actionDescriptor} was distorted by prior beliefs that saw <strong style={{ color: "var(--text-primary)" }}>{otherActorName}</strong> as a{" "}
          <strong>{getThreatLabel(relationshipScore)}</strong> actor.
        </p>

        {/* Competence and bias effects */}
        <p style={{ margin: 0 }}>
          <strong>{getCompetenceLabel(analyticalCompetence)}</strong> intelligence competence and{" "}
          <strong>{getLevel(Math.abs(beliefUpdateBias - 1))}</strong> {getBiasLabel(beliefUpdateBias)} led{" "}
          <strong style={{ color: "var(--text-primary)" }}>{actorName}</strong> to perceive this as signaling{" "}
          <strong>{getLevel(perceivedResolve)}</strong> resolve and{" "}
          <strong>{getLevel(perceivedCapability)}</strong> capability.
        </p>

        {/* Uncertainty */}
        <p style={{ margin: 0 }}>
          The uncertainty surrounding this perception was <strong>{getLevel(avgUncertainty)}</strong>.
        </p>
      </div>

      {/* Key Metrics Visualization */}
      <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
        <h5 style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "8px", margin: "0 0 8px 0" }}>Key Metrics</h5>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          {[
            { label: "Perceived Resolve", value: perceivedResolve },
            { label: "Perceived Capability", value: perceivedCapability },
            { label: "Perceived Severity", value: perceivedSeverity },
            { label: "Uncertainty", value: avgUncertainty },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: "9px", color: "var(--text-dim)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
              <div style={{ fontSize: "16px", fontWeight: 700, textTransform: "capitalize", color: "var(--text-primary)" }}>{getLevel(value)}</div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{(value * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const DevView = ({ eventData, ontology }) => {
  // Extract vectors using the helper
  const flatBaseInput = extractVector(eventData?.["Base-Input-Vectors"]);
  const flatUncertainty = extractVector(eventData?.["Uncertainty-Vectors"]);

  // Point observation from chosen action vectors - format: [[[v1], [v2], ...]]
  const chosenActionVectors = eventData?.["Chosen-Action-Vectors"] || [];
  const flatPointObservation = chosenActionVectors[0]
    ? chosenActionVectors[0].map(v => Array.isArray(v) ? v[0] : v)
    : [];

  const signalStrength = extractSignalStrength(eventData?.["Perceived-Signal-Strengths"]) ??
                         eventData?.["Perceived-Signal-Strength"];

  const ambiguityScore = eventData?.["Ambiguity-Score"] ?? eventData?.["Total-Uncertainty-Score"];

  // Extract Surprise Score - backend exposes as "Surprise-Scores" array of [actor_index, score_vector] tuples
  // The score can be a vector (one per dimension) so we need to aggregate it
  const extractSurpriseScore = () => {
    // Helper to get scalar from potentially nested/array value
    const toScalar = (val) => {
      if (typeof val === 'number') return val;
      if (Array.isArray(val)) {
        // If it's a vector, compute mean as aggregate surprise
        const nums = val.flat(10).filter(v => typeof v === 'number');
        if (nums.length > 0) return nums.reduce((a, b) => a + b, 0) / nums.length;
      }
      return undefined;
    };

    // Try direct score field first
    const directScore = eventData?.["Surprise-Score"];
    if (directScore !== undefined) return toScalar(directScore);

    // Try "Surprise-Scores" array format: [[actor_index, score_vector], ...]
    const surpriseScores = eventData?.["Surprise-Scores"];
    if (Array.isArray(surpriseScores) && surpriseScores.length > 0) {
      // Get the first actor's surprise score, or find specific actor
      const firstScore = surpriseScores[0];
      if (Array.isArray(firstScore) && firstScore.length >= 2) {
        return toScalar(firstScore[1]); // [actor_index, score] -> score
      }
      // Could also be just a number
      return toScalar(firstScore);
    }

    // Fallback to other possible key formats
    return toScalar(eventData?.["SurpriseScore"]) ??
           toScalar(eventData?.["surprise_score"]) ??
           toScalar(eventData?.["Surprise_Score"]);
  };
  const surpriseScore = extractSurpriseScore();

  // Actor parameters
  const analyticalCompetence = eventData?.["Analytical-Competence"];
  const beliefUpdateBias = eventData?.["Belief-Update-Bias"];

  // Get threat perception bias from relationship score
  const relMatrix = eventData?.["Relationship-Score-Matrix"];
  const threatPerceptionBias = relMatrix?.[0]?.[1]; // Relationship score indicates threat perception

  // Action Characteristic dimension labels (from backend Char enum)
  // These are the 8 characteristics that define how an action is perceived
  const dimensions = [
    "Severity",           // 0: Objective magnitude and physical impact
    "Clarity",            // 1: Degree to which intent is unambiguous
    "Irreversibility",    // 2: Difficulty of undoing the action
    "Resolve",            // 3: Level of political will demonstrated
    "Credibility",        // 4: Degree action puts reputation on the line
    "Capability",         // 5: Resources required to execute
    "Risk Propensity",    // 6: Level of strategic risk accepted
    "Positional Adv.",    // 7: Degree action alters strategic environment
  ];

  // Tooltip definitions from DSM Elements doc
  const tooltips = {
    signalStrength: "Composite measure of how 'loud' the signal is, weighted by Clarity, Severity, and Irreversibility.",
    ambiguityScore: "The 'fog' level - how unclear the action's characteristics are to the perceiving actor.",
    surpriseScore: "The 'shock' level - how much the action violated the actor's prior expectations.",
    analyticalCompetence: "Quality and objectivity of the actor's intelligence apparatus (α). Lower values increase 'fog of war'. 0 = blinded by institutional failure, 1 = perfect objectivity.",
    beliefUpdateBias: "Cognitive bias when processing new information (β). β>1 = under-updating (stubbornness), β<1 = over-updating (motivated reasoning). 1.0 = balanced.",
    threatPerceptionBias: "Prior belief about the other actor based on relationship score. Negative = threatening, positive = benign. Distorts perception of action characteristics.",
  };

  const sectionBox = { background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" };
  const sectionTitle = { fontWeight: 500, marginBottom: "6px", fontSize: "12px", color: "var(--text-primary)", margin: "0 0 6px 0" };
  const sectionDesc = { fontSize: "10px", color: "var(--text-dim)", marginBottom: "10px", margin: "0 0 10px 0" };
  const vectorGap = { display: "flex", flexDirection: "column", gap: "5px" };
  const scalarCard = { background: "var(--bg-elevated)", borderRadius: "6px", padding: "8px", textAlign: "center", border: "1px solid var(--border)" };
  const scalarLabel = { fontSize: "10px", color: "var(--text-dim)" };
  const scalarValue = { fontSize: "16px", fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "2px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Point Observation */}
      <div style={sectionBox}>
        <h5 style={sectionTitle}>
          Point Observation Vector
          <InfoIcon tooltip="How an outside observer might characterize the action(s) just taken. When multiple actions occur, this reflects the salience-weighted aggregate." />
        </h5>
        <p style={sectionDesc}>
          Objective characterization of the observed action(s)
        </p>
        <div style={vectorGap}>
          {dimensions.map((dim, idx) => (
            <VectorBar key={dim} label={dim} value={flatPointObservation[idx]} />
          ))}
        </div>
      </div>

      {/* Base Input Vector */}
      <div style={sectionBox}>
        <h5 style={sectionTitle}>
          Base Input Vector
          <InfoIcon tooltip="What the actor 'saw' after perceptual biases. Includes distortions from prior beliefs about the other actor, intelligence competence, and cognitive biases (overconfidence/pessimism)." />
        </h5>
        <p style={sectionDesc}>
          Perceived characteristics after bias distortion (input to Stage 2)
        </p>
        <div style={vectorGap}>
          {dimensions.map((dim, idx) => (
            <VectorBar key={dim} label={dim} value={flatBaseInput[idx]} />
          ))}
        </div>
      </div>

      {/* Uncertainty Vector */}
      <div style={sectionBox}>
        <h5 style={sectionTitle}>
          Uncertainty Vector
          <InfoIcon tooltip="Per-dimension uncertainty. Combines ambiguity (fog from unclear action) and surprise (shock from unexpected behavior)." />
        </h5>
        <p style={sectionDesc}>
          Per-dimension uncertainty
        </p>
        <div style={vectorGap}>
          {dimensions.map((dim, idx) => (
            <VectorBar key={dim} label={dim} value={flatUncertainty[idx]} />
          ))}
        </div>
      </div>

      {/* Scalar Metrics - Row 1: Signal metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        {[
          { label: "Signal Strength", value: signalStrength, tip: tooltips.signalStrength },
          { label: "Ambiguity Score", value: ambiguityScore, tip: tooltips.ambiguityScore },
          { label: "Surprise Score", value: surpriseScore, tip: tooltips.surpriseScore },
        ].map(({ label, value, tip }) => (
          <div key={label} style={scalarCard}>
            <div style={scalarLabel}>{label}<InfoIcon tooltip={tip} /></div>
            <div style={scalarValue}>{value?.toFixed(3) ?? "N/A"}</div>
          </div>
        ))}
      </div>

      {/* Scalar Metrics - Row 2: Actor parameters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        {[
          { label: "Analytical Competence", value: analyticalCompetence, tip: tooltips.analyticalCompetence },
          { label: "Belief Update Bias", value: beliefUpdateBias, tip: tooltips.beliefUpdateBias },
          { label: "Threat Perception Bias", value: threatPerceptionBias, tip: tooltips.threatPerceptionBias },
        ].map(({ label, value, tip }) => (
          <div key={label} style={scalarCard}>
            <div style={scalarLabel}>{label}<InfoIcon tooltip={tip} /></div>
            <div style={scalarValue}>{value?.toFixed(3) ?? "N/A"}</div>
          </div>
        ))}
      </div>

      {/* Raw Data Table */}
      <details style={{ ...sectionBox, cursor: "pointer" }}>
        <summary style={{ fontWeight: 500, fontSize: "12px", color: "var(--text-primary)" }}>
          View Raw Event Data
        </summary>
        <pre style={{
          marginTop: "8px",
          fontSize: "10px",
          overflow: "auto",
          maxHeight: "240px",
          background: "var(--bg-main)",
          color: "var(--green)",
          padding: "10px",
          borderRadius: "4px",
          border: "1px solid var(--border)",
          fontFamily: "var(--font-mono)",
        }}>
          {JSON.stringify(eventData, null, 2)}
        </pre>
      </details>
    </div>
  );
};

const Stage1Perception = (props) => {
  const { isDevMode } = props;

  return isDevMode ? <DevView {...props} /> : <SMEView {...props} />;
};

export default Stage1Perception;
