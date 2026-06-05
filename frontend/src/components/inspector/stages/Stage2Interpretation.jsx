import React, { useState } from "react";

/**
 * Stage2Interpretation - Combined Evaluation & Discrepancy Stage Inspector
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Combines the model's Stage 2 (Evaluation) and Stage 3 (Discrepancy) into
 * a single "Interpretation" stage that answers: "What do I care about, and
 * how does this affect me?"
 *
 * Displays:
 * - Baseline priorities (what the actor cares about in peacetime)
 * - Impact on objectives (which priorities are threatened)
 * - Total Problem Score and action threshold
 */

// Info icon component with tooltip
const InfoIcon = ({ tooltip, align = "right" }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const tooltipLeft = align === "left" ? "0px" : "-110px";
  const arrowLeft = align === "left" ? "12px" : "50%";
  const arrowTransform = align === "left" ? "rotate(45deg)" : "translateX(-50%) rotate(45deg)";

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
          position: "absolute", zIndex: 50, width: "260px", padding: "8px 10px",
          fontSize: "10px", background: "var(--bg-main)", color: "var(--text-primary)",
          borderRadius: "6px", border: "1px solid var(--border)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)", left: tooltipLeft, bottom: "22px", lineHeight: 1.4,
        }}>
          {tooltip}
          <div style={{
            position: "absolute", left: arrowLeft, bottom: "-4px", width: "8px", height: "8px",
            background: "var(--bg-main)", border: "1px solid var(--border)",
            borderTop: "none", borderLeft: "none", transform: arrowTransform,
          }} />
        </div>
      )}
    </span>
  );
};

const getLevel = (val) => {
  if (val >= 0.7) return "high";
  if (val >= 0.4) return "moderate";
  return "low";
};

const ImpactBar = ({ label, value, maxAbs = 1 }) => {
  const isPositive = value >= 0;
  const absValue = Math.abs(value);
  const pct = (absValue / maxAbs) * 50;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
      <span style={{ width: "110px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", height: "10px" }}>
        <div style={{ width: "50%", display: "flex", justifyContent: "flex-end" }}>
          {!isPositive && (
            <div style={{ height: "6px", background: "var(--red)", borderRadius: "3px 0 0 3px", width: `${pct}%` }} />
          )}
        </div>
        <div style={{ width: "1px", height: "10px", background: "var(--text-dim)" }} />
        <div style={{ width: "50%" }}>
          {isPositive && (
            <div style={{ height: "6px", background: "var(--green)", borderRadius: "0 3px 3px 0", width: `${pct}%` }} />
          )}
        </div>
      </div>
      <span style={{ width: "42px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "10px", color: isPositive ? "var(--green)" : "var(--red)" }}>
        {value?.toFixed(2) ?? "N/A"}
      </span>
    </div>
  );
};

const PriorityBar = ({ label, baseline, situational }) => {
  const shift = situational - baseline;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", marginBottom: "5px" }}>
      <span style={{ width: "90px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, background: "var(--border)", borderRadius: "3px", height: "8px", position: "relative", overflow: "hidden" }}>
        <div
          style={{ position: "absolute", top: 0, bottom: 0, width: "1px", background: "var(--text-secondary)", left: `${baseline * 100}%`, zIndex: 1 }}
          title={`Baseline: ${baseline.toFixed(2)}`}
        />
        <div
          style={{ height: "8px", borderRadius: "3px", width: `${situational * 100}%`, background: shift > 0 ? "var(--gold)" : "var(--accent)" }}
        />
      </div>
      <span style={{ width: "70px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "10px", color: shift > 0 ? "var(--gold)" : "var(--accent)" }}>
        {baseline.toFixed(2)} → {situational.toFixed(2)}
      </span>
    </div>
  );
};

// Helper to extract vector from various nested formats
const extractVector = (data) => {
  if (!data || !Array.isArray(data)) return [];

  // Format: [[actionId, [[v1], [v2], ...]]]
  if (data[0] && Array.isArray(data[0]) && data[0].length === 2 && typeof data[0][0] === 'number') {
    const innerVector = data[0][1];
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

// Helper to convert time horizon numeric value to label
const getTimeHorizonLabel = (value) => {
  if (value === undefined || value === null) return "N/A";
  if (value === "Short" || value <= 1) return "Short";
  if (value === "Long" || value >= 3) return "Long";
  return "Medium";
};

const SMEView = ({ eventData, allEvents, actorName, observedAction, otherActorName, ontology }) => {
  // Extract baseline priorities
  const baselinePriority = extractVector(eventData?.["Baseline-Priority-Vector"]);

  // Extract discrepancy vector (negative = problem/threat)
  const discrepancyVector = extractVector(
    eventData?.["Final-Discrepancy-Vector"] ||
    eventData?.["Discrepancy-Vector"] ||
    eventData?.["Total-Discrepancy-Vector"]
  );

  // Get Total Problem Score
  const rawProblemScore = eventData?.["Total-Problem-Score"];
  const totalProblemScore = typeof rawProblemScore === 'number'
    ? rawProblemScore
    : (Array.isArray(rawProblemScore) ? rawProblemScore[0] : 0);

  // Calculate max Total Problem Score from all events in the simulation
  const maxProblemScore = (allEvents || []).reduce((max, event) => {
    const raw = event?.["Total-Problem-Score"];
    const score = typeof raw === 'number' ? raw : (Array.isArray(raw) ? raw[0] : 0);
    return Math.max(max, score);
  }, totalProblemScore);

  // Get action threshold
  const actionThreshold = eventData?.["Action-Discrepancy-Threshold"] ?? 0.3;

  // Get time horizon
  const timeHorizon = eventData?.["Actor-Time-Horizon"] || eventData?.["Time-Horizon"];

  // Get objective names from ontology
  const objectiveNames = ontology?.objectives || [];

  // Get top 5 baseline priorities (highest values)
  const topPriorities = baselinePriority
    .map((val, idx) => ({
      index: idx,
      value: typeof val === 'number' ? val : 0,
      name: objectiveNames[idx] || `Objective ${idx + 1}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Get top 5 most negatively impacted objectives (most negative discrepancy values)
  const mostImpacted = discrepancyVector
    .map((val, idx) => ({
      index: idx,
      value: typeof val === 'number' ? val : 0,
      name: objectiveNames[idx] || `Objective ${idx + 1}`,
    }))
    .filter(obj => obj.value < 0) // Only negative impacts
    .sort((a, b) => a.value - b.value) // Most negative first
    .slice(0, 5);

  // Determine if threshold exceeded
  const thresholdExceeded = totalProblemScore > actionThreshold;

  // Tooltip definitions from DSM Elements doc
  const tooltips = {
    totalProblemScore: `Aggregate measure of how problematic the situation is for this actor. Calculated as the salience-weighted norm of the Discrepancy Vector. Range in this simulation: 0 to ${maxProblemScore.toFixed(2)}.`,
    actionThreshold: "The actor's tolerance for strategic imbalance. If the Total Problem Score is below this threshold, the actor takes no action. Lower values = more reactive; higher values = more patient.",
    timeHorizon: "The actor's current planning horizon. Crisis situations shift focus to short-term survival. Short = immediate crisis response, Medium = balanced planning, Long = strategic/generational goals.",
  };

  return (
    <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" }}>
      <h4 style={{ fontWeight: 600, color: "var(--text-primary)", margin: "0 0 10px 0", fontSize: "13px" }}>Interpretation Summary</h4>

      <div style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "8px" }}>
        {/* Baseline priorities */}
        <div>
          <p style={{ margin: "0 0 4px 0" }}>
            In times of peace, <strong style={{ color: "var(--text-primary)" }}>{actorName}</strong>'s top priorities are:
          </p>
          <ul style={{ listStyleType: "disc", listStylePosition: "inside", marginLeft: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {topPriorities.map((item, idx) => (
              <li key={idx}><strong>{item.name}</strong></li>
            ))}
          </ul>
        </div>

        {/* Impact from observed actions */}
        {mostImpacted.length > 0 ? (
          <div>
            <p style={{ margin: "0 0 4px 0" }}>
              Given the actions just taken by <strong style={{ color: "var(--text-primary)" }}>{otherActorName}</strong>, however,
              these priorities have shifted to focus on those most negatively impacted:
            </p>
            <ul style={{ listStyleType: "disc", listStylePosition: "inside", marginLeft: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
              {mostImpacted.map((item, idx) => (
                <li key={idx}><strong>{item.name}</strong></li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ margin: 0 }}>
            The actions taken by <strong style={{ color: "var(--text-primary)" }}>{otherActorName}</strong> did not significantly
            threaten any of <strong style={{ color: "var(--text-primary)" }}>{actorName}</strong>'s core priorities.
          </p>
        )}

        {/* Problem score and threshold */}
        <p style={{ margin: 0 }}>
          This collective impact represented a <strong>{getLevel(totalProblemScore)}</strong> set
          of problems for <strong style={{ color: "var(--text-primary)" }}>{actorName}</strong>,{" "}
          {thresholdExceeded ? (
            <span style={{ color: "var(--red)", fontWeight: 500 }}>
              exceeding their threshold for action
            </span>
          ) : (
            <span style={{ color: "var(--green)", fontWeight: 500 }}>
              falling below their threshold for action
            </span>
          )}.
        </p>
      </div>

      {/* Key Metrics */}
      <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
        <h5 style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", margin: "0 0 8px 0" }}>Key Metrics</h5>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "9px", color: "var(--text-dim)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Problem Score
              <InfoIcon tooltip={tooltips.totalProblemScore} />
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: totalProblemScore > 0.7 ? "var(--red)" : totalProblemScore > 0.4 ? "var(--gold)" : "var(--green)" }}>
              {totalProblemScore.toFixed(2)}
            </div>
          </div>
          <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "9px", color: "var(--text-dim)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Action Threshold
              <InfoIcon tooltip={tooltips.actionThreshold} />
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              {actionThreshold.toFixed(2)}
            </div>
          </div>
          <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "9px", color: "var(--text-dim)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Time Horizon
              <InfoIcon tooltip={tooltips.timeHorizon} />
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              {getTimeHorizonLabel(timeHorizon)}
            </div>
          </div>
        </div>
      </div>

      {/* Goal Ledger Summary */}
      <GoalLedgerLayersSME eventData={eventData} actorName={actorName} ontology={ontology} />
    </div>
  );
};

/**
 * GoalLedgerLayersSME — Narrative view of Goal Ledger layer state for this event.
 * Shows the cumulative strategic position and which past impacts are still active.
 */
const GoalLedgerLayersSME = ({ eventData, actorName, ontology }) => {
  const goalLedger = extractVector(eventData?.["Goal-Ledger"]);
  const layers = eventData?.["Goal-Ledger-Layers"];
  const objectiveNames = ontology?.objectives || [];

  if (!goalLedger || goalLedger.length === 0) return null;

  // Find the 3 most impacted goals (largest absolute ledger value)
  const rankedGoals = goalLedger
    .map((val, idx) => ({ name: objectiveNames[idx] || `Goal ${idx}`, value: typeof val === "number" ? val : 0, idx }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const topImpacted = rankedGoals.filter(g => Math.abs(g.value) > 0.01).slice(0, 3);
  const numActiveLayers = Array.isArray(layers) ? layers.length : 0;

  return (
    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
      <h5 style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", margin: "0 0 8px 0" }}>
        Goal Ledger
        <InfoIcon
          tooltip="The Goal Ledger tracks cumulative strategic position across turns. Unlike single-turn discrepancy, impacts persist and decay based on their irreversibility. Negative values indicate accumulated deterioration."
          align="left"
        />
      </h5>
      <div style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "6px" }}>
        {topImpacted.length > 0 ? (
          <>
            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--text-primary)" }}>{actorName}</strong>'s cumulative strategic position shows the greatest
              pressure on:
            </p>
            <ul style={{ listStyleType: "disc", listStylePosition: "inside", marginLeft: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
              {topImpacted.map((g, i) => (
                <li key={i}>
                  <strong>{g.name}</strong>:{" "}
                  <span style={{ fontFamily: "var(--font-mono)", color: g.value < 0 ? "var(--red)" : "var(--green)" }}>
                    {g.value.toFixed(3)}
                  </span>
                </li>
              ))}
            </ul>
            {numActiveLayers > 0 && (
              <p style={{ fontSize: "10px", color: "var(--text-dim)", margin: "4px 0 0 0" }}>
                {numActiveLayers} active impact layer{numActiveLayers !== 1 ? "s" : ""} contributing
                to the current ledger position.
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0 }}>The Goal Ledger shows no significant cumulative pressure at this point.</p>
        )}
      </div>
    </div>
  );
};

// Combined row component showing Priority and Discrepancy side-by-side
const PriorityDiscrepancyRow = ({ name, priority, discrepancy, maxPriority, maxDiscrepancy }) => {
  const priorityPct = (priority / maxPriority) * 100;
  const discrepancyPct = Math.abs(discrepancy) / maxDiscrepancy * 100;
  const isNegative = discrepancy < 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "10px", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
      {/* Objective name */}
      <span style={{ width: "200px", flexShrink: 0, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>

      {/* Priority bar */}
      <div style={{ flex: 1, background: "var(--border)", borderRadius: "3px", height: "8px", position: "relative", minWidth: "60px", overflow: "hidden" }} title={`Priority: ${priority.toFixed(3)}`}>
        <div style={{ height: "8px", background: "var(--accent)", borderRadius: "3px", width: `${priorityPct}%` }} />
      </div>
      <span style={{ width: "36px", flexShrink: 0, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{priority.toFixed(2)}</span>

      {/* Discrepancy bar */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", height: "8px", minWidth: "70px" }} title={`Discrepancy: ${discrepancy.toFixed(3)}`}>
        <div style={{ width: "50%", display: "flex", justifyContent: "flex-end" }}>
          {isNegative && (
            <div style={{ height: "6px", background: "var(--red)", borderRadius: "3px 0 0 3px", width: `${discrepancyPct}%` }} />
          )}
        </div>
        <div style={{ width: "1px", height: "8px", background: "var(--text-dim)" }} />
        <div style={{ width: "50%" }}>
          {!isNegative && (
            <div style={{ height: "6px", background: "var(--green)", borderRadius: "0 3px 3px 0", width: `${discrepancyPct}%` }} />
          )}
        </div>
      </div>
      <span style={{ width: "42px", flexShrink: 0, textAlign: "right", fontFamily: "var(--font-mono)", color: isNegative ? "var(--red)" : "var(--green)" }}>
        {discrepancy.toFixed(2)}
      </span>
    </div>
  );
};

const DevView = ({ eventData, ontology, allEvents, selectedEventIndex }) => {
  // Extract all relevant vectors
  const baselinePriority = extractVector(eventData?.["Baseline-Priority-Vector"]);
  const situationalPriority = extractVector(eventData?.["Situational-Priority-Vector"]);
  const urgencyMultiplier = extractVector(eventData?.["Urgency-Multiplier-Vector"]);
  const discrepancyVector = extractVector(
    eventData?.["Final-Discrepancy-Vector"] ||
    eventData?.["Discrepancy-Vector"] ||
    eventData?.["Total-Discrepancy-Vector"]
  );
  const strategicImpactVector = extractVector(eventData?.["Strategic-Impact-Vectors"]) ||
                                extractVector(eventData?.["Provisional-Utility-Vector"]) || [];
  const timeHorizonDiscountVector = extractVector(eventData?.["Time-Horizon-Discount-Vector"]);

  // Scalars
  const rawProblemScore = eventData?.["Total-Problem-Score"];
  const totalProblemScore = typeof rawProblemScore === 'number'
    ? rawProblemScore
    : (Array.isArray(rawProblemScore) ? rawProblemScore[0] : 0);
  const actionThreshold = eventData?.["Action-Discrepancy-Threshold"];
  const timeHorizon = eventData?.["Actor-Time-Horizon"] || eventData?.["Time-Horizon"];
  const relevanceSlice = eventData?.["Selected-Relevance-Slice"];

  const objectiveNames = ontology?.objectives ||
    discrepancyVector.map((_, idx) => `Objective ${idx + 1}`);

  // Calculate max values for scaling bars
  const maxPriority = Math.max(...baselinePriority.filter(v => typeof v === 'number'), 0.1);
  const maxDiscrepancy = Math.max(...discrepancyVector.filter(v => typeof v === 'number').map(Math.abs), 0.1);

  // Tooltip definitions
  const tooltips = {
    baselinePriority: "The actor's 'peacetime' priorities across national objectives. Defines what they care about most when not in crisis.",
    discrepancyVector: "Per-objective problem score. Negative values indicate threats or gaps between current state and desired state. Positive values indicate benefits.",
    totalProblemScore: "Aggregate measure of how problematic the situation is. Higher = more urgent need to respond.",
    actionThreshold: "The Total Problem Score must exceed this threshold for the actor to take action.",
    timeHorizon: "Actor's current planning horizon. Short = immediate crisis response, Medium = balanced planning, Long = strategic/generational goals.",
    relevanceSlice: "Which slice of the Relevance Tensor was used (Adversary/Ally/Neutral) based on relationship.",
  };

  const sectionBox = { background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" };
  const sectionTitle = { fontWeight: 500, marginBottom: "6px", fontSize: "12px", color: "var(--text-primary)", margin: "0 0 6px 0" };
  const scalarCard = { background: "var(--bg-elevated)", borderRadius: "6px", padding: "8px", textAlign: "center", border: "1px solid var(--border)" };
  const scalarLabel = { fontSize: "10px", color: "var(--text-dim)" };
  const scalarValue = { fontSize: "16px", fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "2px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Combined Priority + Discrepancy View */}
      <div style={sectionBox}>
        <h5 style={sectionTitle}>
          Priority
          <InfoIcon tooltip={tooltips.baselinePriority} align="left" />
          {" & "}
          Discrepancy
          <InfoIcon tooltip={tooltips.discrepancyVector} />
        </h5>
        <p style={{ fontSize: "10px", color: "var(--text-dim)", margin: "0 0 10px 0" }}>
          Blue = Baseline Priority | Red/Green = Discrepancy (threat/benefit)
        </p>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "9px", color: "var(--text-dim)", fontWeight: 500, marginBottom: "6px", paddingBottom: "4px", borderBottom: "1px solid var(--border)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          <span style={{ width: "200px", flexShrink: 0 }}>Objective</span>
          <span style={{ flex: 1, textAlign: "center", minWidth: "60px" }}>Priority</span>
          <span style={{ width: "36px", flexShrink: 0 }}></span>
          <span style={{ flex: 1, textAlign: "center", minWidth: "70px" }}>Discrepancy</span>
          <span style={{ width: "42px", flexShrink: 0 }}></span>
        </div>

        <div style={{ maxHeight: "280px", overflowY: "auto" }}>
          {objectiveNames.slice(0, Math.max(baselinePriority.length, discrepancyVector.length)).map((name, idx) => (
            <PriorityDiscrepancyRow
              key={idx}
              name={name}
              priority={baselinePriority[idx] || 0}
              discrepancy={discrepancyVector[idx] || 0}
              maxPriority={maxPriority}
              maxDiscrepancy={maxDiscrepancy}
            />
          ))}
        </div>
      </div>

      {/* Scalar Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        {[
          { label: "Total Problem Score", value: totalProblemScore?.toFixed(2) ?? "N/A", tip: tooltips.totalProblemScore },
          { label: "Action Threshold", value: actionThreshold?.toFixed(2) ?? "N/A", tip: tooltips.actionThreshold },
          { label: "Time Horizon", value: getTimeHorizonLabel(timeHorizon), tip: tooltips.timeHorizon },
        ].map(({ label, value, tip }) => (
          <div key={label} style={scalarCard}>
            <div style={scalarLabel}>{label}<InfoIcon tooltip={tip} /></div>
            <div style={scalarValue}>{value}</div>
          </div>
        ))}
      </div>

      {/* Goal Ledger Layer Decomposition */}
      <GoalLedgerLayersAnalytical eventData={eventData} ontology={ontology} allEvents={allEvents} selectedEventIndex={selectedEventIndex} />

      {/* Raw Data */}
      <details style={{ ...sectionBox, cursor: "pointer" }}>
        <summary style={{ fontWeight: 500, fontSize: "12px", color: "var(--text-primary)" }}>
          View Raw Interpretation Data
        </summary>
        <pre style={{
          marginTop: "8px", fontSize: "10px", overflow: "auto", maxHeight: "240px",
          background: "var(--bg-main)", color: "var(--green)", padding: "10px",
          borderRadius: "4px", border: "1px solid var(--border)", fontFamily: "var(--font-mono)",
        }}>
          {JSON.stringify({
            "Baseline-Priority-Vector": baselinePriority,
            "Situational-Priority-Vector": situationalPriority,
            "Urgency-Multiplier-Vector": urgencyMultiplier,
            "Final-Discrepancy-Vector": discrepancyVector,
            "Strategic-Impact-Vector": strategicImpactVector,
            "Total-Problem-Score": totalProblemScore,
            "Action-Discrepancy-Threshold": actionThreshold,
            "Time-Horizon": timeHorizon,
            "Time-Horizon-Discount-Vector": timeHorizonDiscountVector,
            "Selected-Relevance-Slice": relevanceSlice,
            "Goal-Ledger": eventData?.["Goal-Ledger"],
            "Goal-Ledger-Layers": eventData?.["Goal-Ledger-Layers"],
          }, null, 2)}
        </pre>
      </details>
    </div>
  );
};

/**
 * GoalLedgerLayersAnalytical — Detailed layer decomposition for the Dev/Analytical view.
 *
 * Shows:
 * 1. Goal Ledger Position bars with change-from-previous-turn delta indicators
 * 2. Active impact layers — each layer is a full vector across ALL goals (one per observed action),
 *    displayed as a mini bar chart showing the impact distribution
 */
const GoalLedgerLayersAnalytical = ({ eventData, ontology, allEvents, selectedEventIndex }) => {
  const goalLedger = extractVector(eventData?.["Goal-Ledger"]);
  const layers = eventData?.["Goal-Ledger-Layers"];
  const objectiveNames = ontology?.objectives || [];

  if (!goalLedger || goalLedger.length === 0) return null;

  const numGoals = goalLedger.length;

  // --- Compute previous-turn Goal Ledger for delta display ---
  let prevLedger = null;
  if (allEvents && selectedEventIndex !== undefined && selectedEventIndex > 0) {
    // Walk backwards to find the previous event that has Goal-Ledger data
    for (let i = selectedEventIndex - 1; i >= 0; i--) {
      const prevGL = allEvents[i]?.["Goal-Ledger"];
      if (prevGL) {
        prevLedger = extractVector(prevGL);
        break;
      }
    }
  }

  // Calculate total ledger magnitude for each goal, with delta
  const goalData = goalLedger.map((val, idx) => {
    const current = typeof val === "number" ? val : 0;
    const prev = prevLedger ? (typeof prevLedger[idx] === "number" ? prevLedger[idx] : 0) : null;
    const delta = prev !== null ? current - prev : null;
    return {
      name: objectiveNames[idx] || `Goal ${idx}`,
      value: current,
      delta,
      idx,
    };
  });

  // Max absolute for scaling bars
  const maxAbs = Math.max(...goalData.map((g) => Math.abs(g.value)), 0.01);

  // --- Helper to extract a layer's magnitude as a flat array ---
  const extractLayerMag = (mag) => {
    if (!mag) return [];
    return Array.from({ length: numGoals }, (_, g) => {
      if (Array.isArray(mag[g])) return mag[g][0] || 0;
      return typeof mag[g] === "number" ? mag[g] : 0;
    });
  };

  // Compute max magnitude across all layers for consistent scaling
  let layerMaxAbs = 0.01;
  if (Array.isArray(layers)) {
    for (const layer of layers) {
      const magVec = extractLayerMag(layer.magnitude);
      for (const v of magVec) {
        if (Math.abs(v) > layerMaxAbs) layerMaxAbs = Math.abs(v);
      }
    }
  }

  return (
    <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" }}>
      <h5 style={{ fontWeight: 500, fontSize: "12px", color: "var(--text-primary)", margin: "0 0 6px 0" }}>
        Goal Ledger Position
        <span style={{ fontSize: "10px", fontWeight: 400, color: "var(--text-dim)", marginLeft: "8px" }}>
          Cumulative strategic position (persistent across turns)
        </span>
      </h5>

      {/* Goal bars with delta indicators */}
      <div style={{ display: "flex", flexDirection: "column", gap: "3px", maxHeight: "240px", overflowY: "auto" }}>
        {goalData.map((goal) => {
          const pct = (Math.abs(goal.value) / maxAbs) * 50;
          const isNeg = goal.value < 0;
          const hasDelta = goal.delta !== null && Math.abs(goal.delta) > 0.001;
          const deltaPositive = goal.delta > 0;
          return (
            <div key={goal.idx} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
              <span style={{ width: "130px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }} title={goal.name}>
                {goal.name}
              </span>
              <div style={{ flex: 1, display: "flex", alignItems: "center", height: "8px" }}>
                <div style={{ width: "50%", display: "flex", justifyContent: "flex-end" }}>
                  {isNeg && (
                    <div style={{ height: "5px", background: "var(--red)", borderRadius: "2px 0 0 2px", width: `${pct}%` }} />
                  )}
                </div>
                <div style={{ width: "1px", height: "8px", background: "var(--text-dim)" }} />
                <div style={{ width: "50%" }}>
                  {!isNeg && goal.value > 0 && (
                    <div style={{ height: "5px", background: "var(--green)", borderRadius: "0 2px 2px 0", width: `${pct}%` }} />
                  )}
                </div>
              </div>
              <span style={{
                width: "48px", textAlign: "right", fontFamily: "var(--font-mono)",
                color: isNeg ? "var(--red)" : goal.value > 0 ? "var(--green)" : "var(--text-dim)",
              }}>
                {goal.value.toFixed(3)}
              </span>
              <span style={{
                width: "48px", textAlign: "right", fontFamily: "var(--font-mono)",
                color: !hasDelta ? "var(--text-dim)" : deltaPositive ? "var(--green)" : "var(--red)",
                opacity: !hasDelta ? 0.4 : 1,
              }}
                title={hasDelta ? `Change from previous turn: ${goal.delta > 0 ? "+" : ""}${goal.delta.toFixed(3)}` : "No change"}
              >
                {hasDelta ? `${deltaPositive ? "+" : ""}${goal.delta.toFixed(3)}` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend for delta column */}
      {prevLedger && (
        <p style={{ fontSize: "9px", color: "var(--text-dim)", marginTop: "4px", textAlign: "right", paddingRight: "4px" }}>
          Right column shows change from previous turn
        </p>
      )}

      {/* Layer details */}
      {Array.isArray(layers) && layers.length > 0 && (
        <details style={{ marginTop: "10px", cursor: "pointer" }}>
          <summary style={{ fontSize: "10px", color: "var(--text-dim)", fontWeight: 500 }}>
            {layers.length} Active Impact Layer{layers.length !== 1 ? "s" : ""} — each layer represents one observed action's impact across all goals
          </summary>
          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "340px", overflowY: "auto" }}>
            {layers.map((layer, lIdx) => {
              const irrev = layer.irreversibility ?? 0;
              const decayFactor = layer.decay_factor ?? 0;
              const magVec = extractLayerMag(layer.magnitude);

              const actionId = layer.action_id;
              const actionName = actionId !== null && actionId !== undefined && ontology?.actions
                ? (ontology.actions[actionId] || `Action ${actionId}`)
                : null;
              const layerTurn = layer.turn;

              const goalImpacts = magVec
                .map((v, g) => ({ idx: g, value: v, name: objectiveNames[g] || `Goal ${g}` }))
                .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
              const significantImpacts = goalImpacts.filter(g => Math.abs(g.value) > 0.001);

              return (
                <div key={lIdx} style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px 10px", border: "1px solid var(--border)", fontSize: "10px" }}>
                  {/* Layer header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                        {actionName
                          ? <span style={{ color: "var(--purple, #c084fc)" }}>{actionName}</span>
                          : `Layer ${lIdx + 1}`
                        }
                      </span>
                      {layerTurn && (
                        <span style={{ fontSize: "9px", background: "var(--bg-elevated)", color: "var(--text-dim)", padding: "1px 5px", borderRadius: "3px" }}>
                          Turn {layerTurn}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "10px", color: "var(--text-dim)" }}>
                      <span>Irreversibility: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{irrev.toFixed(2)}</span></span>
                      <span>Decay: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{decayFactor.toFixed(3)}</span></span>
                    </div>
                  </div>

                  {/* Mini bar chart */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {significantImpacts.length > 0 ? (
                      significantImpacts.slice(0, 6).map((g) => {
                        const barPct = (Math.abs(g.value) / layerMaxAbs) * 100;
                        const isNeg = g.value < 0;
                        return (
                          <div key={g.idx} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                            <span style={{ width: "120px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", fontSize: "9px" }} title={g.name}>
                              {g.name}
                            </span>
                            <div style={{ flex: 1, display: "flex", alignItems: "center", height: "6px" }}>
                              <div style={{ width: "50%", display: "flex", justifyContent: "flex-end" }}>
                                {isNeg && (
                                  <div style={{ height: "4px", background: "var(--red)", borderRadius: "2px 0 0 2px", width: `${barPct}%`, opacity: 0.8 }} />
                                )}
                              </div>
                              <div style={{ width: "1px", height: "6px", background: "var(--border)" }} />
                              <div style={{ width: "50%" }}>
                                {!isNeg && g.value > 0 && (
                                  <div style={{ height: "4px", background: "var(--green)", borderRadius: "0 2px 2px 0", width: `${barPct}%`, opacity: 0.8 }} />
                                )}
                              </div>
                            </div>
                            <span style={{ width: "42px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "9px", color: isNeg ? "var(--red)" : "var(--green)" }}>
                              {g.value.toFixed(3)}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <span style={{ color: "var(--text-dim)", fontSize: "9px" }}>All impacts below threshold (fully decayed)</span>
                    )}
                    {significantImpacts.length > 6 && (
                      <span style={{ color: "var(--text-dim)", fontSize: "9px", marginLeft: "120px" }}>
                        +{significantImpacts.length - 6} more goals with minor impacts
                      </span>
                    )}
                  </div>

                  {/* Retention bar */}
                  <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "var(--text-dim)", width: "52px", fontSize: "9px" }}>Retention</span>
                    <div style={{ flex: 1, background: "var(--border)", borderRadius: "3px", height: "4px", overflow: "hidden" }}>
                      <div style={{ height: "4px", borderRadius: "3px", background: "var(--purple, #c084fc)", width: `${Math.min(decayFactor * 100, 100)}%` }} />
                    </div>
                    <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", width: "36px", textAlign: "right", fontSize: "9px" }}>{(decayFactor * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
};

const Stage2Interpretation = (props) => {
  const { isDevMode } = props;
  return isDevMode ? <DevView {...props} /> : <SMEView {...props} />;
};

export default Stage2Interpretation;
