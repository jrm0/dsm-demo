import React, { useState, useMemo } from "react";
import { ScatterChart, Scatter, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, ResponsiveContainer, Legend } from "recharts";

/**
 * Stage3DecisionMaking - Decision-Making Stage Inspector
 *
 * UI Stage 3 (Model Stages 4A-4D combined)
 *
 * Narrative View: Plain language explanation of why the actor chose their actions
 * Analytical View: Detailed breakdowns of risk, benefit, cost, and utility calculations
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
  totalProblemScore: "The weighted magnitude of all objective-level problems. Combines priority weights with discrepancy values using L2 norm.",
  actionThreshold: "The minimum problem score required before the actor will take action. Below this, 'Do Nothing' is chosen.",
  effectiveRiskPropensity: "The actor's willingness to bear costs, adjusted by desperation (high problem → more risk-tolerant) and uncertainty (high uncertainty → more cautious).",
  benefit: "Expected positive outcome from taking the action, based on how well it addresses the actor's problems across objectives.",
  cost: "Expected resource expenditure, adjusted for the actor's capability to execute the action (feasibility).",
  utility: "Final decision score = Benefit - (Cost / Risk Propensity). Higher risk propensity reduces the effective cost burden."
};

// Helper to safely get scalar values
const getScalar = (val, defaultVal = 0) => {
  if (typeof val === 'number') return val;
  if (Array.isArray(val)) {
    if (Array.isArray(val[0])) return val[0][0] ?? defaultVal;
    return val[0] ?? defaultVal;
  }
  return defaultVal;
};

// Helper to get action name from ontology
const getActionName = (actionId, ontology) => {
  if (!ontology?.actions || actionId === undefined || actionId === null) return `Action ${actionId}`;
  return ontology.actions[actionId] || `Action ${actionId}`;
};

// Visualization Components for Utility Breakdown

// Horizontal bar for goal discrepancy (matching OverridePanel size)
const DiscrepancyBar = ({ value, maxValue }) => {
  const absValue = Math.abs(value);
  const percentage = maxValue > 0 ? (absValue / maxValue) * 100 : 0;
  const isNegative = value < 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", height: "32px" }}>
      <div style={{ width: "48px", height: "20px", background: "var(--bg-elevated)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
        <div
          style={{ height: "100%", borderRadius: "4px", transition: "all 0.2s", width: `${Math.min(percentage, 100)}%`, background: isNegative ? "var(--red)" : "var(--gold)" }}
        />
      </div>
      <span style={{ width: "40px", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)", textAlign: "right" }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
};

// Heatmap cell for goal-improvement matrix (matching OverridePanel size)
const HeatmapCell = ({ value }) => {
  const getColor = (v) => {
    if (v === null || v === undefined) return "var(--bg-elevated)";
    const normalized = Math.max(-1, Math.min(1, v * 10));
    if (normalized > 0) {
      const intensity = Math.min(normalized, 1);
      return `rgba(34, 197, 94, ${intensity * 0.8})`;
    } else {
      const intensity = Math.min(-normalized, 1);
      return `rgba(239, 68, 68, ${intensity * 0.8})`;
    }
  };

  return (
    <div
      style={{ width: "36px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontFamily: "var(--font-mono)", border: "1px solid var(--border)", flexShrink: 0, backgroundColor: getColor(value) }}
      title={value?.toFixed(3) ?? "N/A"}
    >
      {value !== null && Math.abs(value) > 0.01 ? (value > 0 ? "+" : "−") : ""}
    </div>
  );
};

// Custom tooltip for scatter plot
const ScatterTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{ background: "var(--bg-main)", padding: "8px", borderRadius: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.4)", border: "1px solid var(--border)", fontSize: "10px", color: "var(--text-primary)" }}>
        <div style={{ fontWeight: 500, marginBottom: "4px" }}>{data.name}</div>
        <div>Benefit: <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}>{data.benefit?.toFixed(3)}</span></div>
        <div>Cost: <span style={{ color: "var(--red)", fontFamily: "var(--font-mono)" }}>{data.cost?.toFixed(3)}</span></div>
        <div>Utility: <span style={{ color: "var(--purple, #c084fc)", fontFamily: "var(--font-mono)" }}>{data.utility?.toFixed(3)}</span></div>
      </div>
    );
  }
  return null;
};

// Narrative View Component
const SMEView = ({ eventData, actorName, ontology, allEvents }) => {
  // Extract key data
  const totalProblemScore = getScalar(eventData?.["Total-Problem-Score"], 0);
  const actionThreshold = getScalar(eventData?.["Action-Discrepancy-Threshold"], 0);
  const effectiveRisk = getScalar(eventData?.["Effective-Risk-Propensity"], 0.5);
  const baseRisk = getScalar(eventData?.["Base-Risk-Propensity"], 0.5);
  const totalUncertainty = getScalar(eventData?.["Total-Uncertainty-Score"], 0);

  const chosenSequence = eventData?.["Chosen-Action-Sequence"] || [];
  const rankedList = eventData?.["Ranked-Response-List"] || [];
  const candidateSequences = eventData?.["Candidate-Action-Sequences"] || [];

  // Get benefits and costs vectors
  const coaBenefits = eventData?.["COA-Benefits"] || [];
  const finalCosts = eventData?.["Final-Cost-Vector"] || [];

  // Get the winning candidate's details
  const winningCandidate = rankedList[0] || candidateSequences[0];

  // Determine risk propensity change narrative
  const riskIncreased = effectiveRisk > baseRisk;
  const desperationLevel = totalProblemScore > 1 ? "high" : totalProblemScore > 0.5 ? "moderate" : "low";
  const certaintyLevel = totalUncertainty < 0.3 ? "high" : totalUncertainty < 0.6 ? "moderate" : "low";

  // Calculate max TPS across all events for context
  const maxTPS = allEvents?.reduce((max, event) => {
    const tps = getScalar(event?.event_data?.["Total-Problem-Score"], 0);
    return Math.max(max, tps);
  }, 0) || totalProblemScore;

  // Check if action was taken (chosen sequence contains non-Do-Nothing actions)
  const actionTaken = chosenSequence.length > 0 && chosenSequence[0] !== 0;
  // Check if actor was motivated to act but Do Nothing still won on utility
  const motivatedButDoNothing = !actionTaken && totalProblemScore >= actionThreshold;

  // Get top 5 actions (or fewer if less available)
  const topActions = chosenSequence.slice(0, 5);

  return (
    <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px", border: "1px solid var(--border)" }}>
      <h5 style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px" }}>Decision-Making</h5>

      <div style={{ color: "var(--text-primary)", fontSize: "12px", maxWidth: "none" }}>
        {actionTaken ? (
          <>
            <p style={{ marginBottom: "10px" }}>
              In order to solve the problems identified, <strong>{actorName}</strong> selected
              {topActions.length === 1 ? " this action" : " these actions"} as having the highest utility:
            </p>

            <ul style={{ listStyleType: "disc", listStylePosition: "inside", marginBottom: "12px", marginLeft: "8px" }}>
              {topActions.map((actionId, idx) => (
                <li key={idx} style={{ fontWeight: 500 }}>
                  {getActionName(actionId, ontology)}
                </li>
              ))}
            </ul>

            <p style={{ marginBottom: "6px" }}>
              {eventData?.["PT-Enabled"]
                ? "Using Prospect Theory evaluation (outcomes framed relative to reference point, with loss aversion and diminishing sensitivity):"
                : "Following a simple expected utility calculation:"}
            </p>

            <ul style={{ listStyleType: "disc", listStylePosition: "inside", marginBottom: "12px", marginLeft: "8px" }}>
              <li>
                <strong>Perceived benefit</strong> of each action:
                <ul style={{ listStyleType: "none", marginLeft: "16px", marginTop: "4px", fontSize: "12px" }}>
                  {topActions.map((actionId, idx) => {
                    const benefit = Array.isArray(coaBenefits) && coaBenefits[actionId]
                      ? getScalar(coaBenefits[actionId], 0)
                      : 0;
                    return (
                      <li key={idx}>
                        {getActionName(actionId, ontology)}: <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{benefit.toFixed(3)}</span>
                      </li>
                    );
                  })}
                </ul>
              </li>

              <li style={{ marginTop: "8px" }}>
                <strong>Perceived cost</strong> of each action:
                <ul style={{ listStyleType: "none", marginLeft: "16px", marginTop: "4px", fontSize: "12px" }}>
                  {topActions.map((actionId, idx) => {
                    const cost = Array.isArray(finalCosts) && finalCosts[actionId]
                      ? getScalar(finalCosts[actionId], 0)
                      : 0;
                    return (
                      <li key={idx}>
                        {getActionName(actionId, ontology)}: <span style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}>{cost.toFixed(3)}</span>
                      </li>
                    );
                  })}
                </ul>
              </li>

              <li style={{ marginTop: "8px" }}>
                <strong>{actorName}</strong> was <strong>{riskIncreased ? "more" : "less"}</strong> willing
                to bear those costs since their risk propensity had {riskIncreased ? "risen" : "dropped"} due
                to their <strong>{desperationLevel}</strong> level of desperation and
                their <strong>{certaintyLevel}</strong> level of certainty.
                <InfoIcon tooltip={tooltips.effectiveRiskPropensity} />
              </li>
            </ul>

            <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px 10px", fontSize: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  Total Problem Score: <strong style={{ fontFamily: "var(--font-mono)" }}>{totalProblemScore.toFixed(3)}</strong>
                  <InfoIcon tooltip={`${tooltips.totalProblemScore} Max TPS in this simulation: ${maxTPS.toFixed(3)}`} />
                </span>
                <span style={{ color: "var(--green)" }}>
                  Exceeded threshold of {actionThreshold.toFixed(3)} ✓
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginBottom: "10px" }}>
              <strong>{actorName}</strong> chose to <strong>Do Nothing</strong>.
            </p>

            <div style={{ background: "var(--bg-card)", borderRadius: "4px", padding: "8px 10px", fontSize: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  Total Problem Score: <strong style={{ fontFamily: "var(--font-mono)" }}>{totalProblemScore.toFixed(3)}</strong>
                  <InfoIcon tooltip={tooltips.totalProblemScore} />
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {motivatedButDoNothing
                    ? `Above threshold of ${actionThreshold.toFixed(3)}`
                    : `Below threshold of ${actionThreshold.toFixed(3)}`}
                </span>
              </div>
              <p style={{ marginTop: "6px", color: "var(--purple, #c084fc)" }}>
                {motivatedButDoNothing
                  ? "The actor recognized problems requiring action, but the expected costs of all available responses exceeded their expected benefits — making inaction the least costly option."
                  : "The situation did not warrant action — problems were not severe enough to justify the costs of responding."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Analytical View Sub-Components
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

// Risk Propensity Sub-view
const RiskSubView = ({ eventData, actorName }) => {
  const baseRisk = getScalar(eventData?.["Base-Risk-Propensity"], 0.5);
  const effectiveRisk = getScalar(eventData?.["Effective-Risk-Propensity"], baseRisk);
  const totalUncertainty = getScalar(eventData?.["Total-Uncertainty-Score"], 0);
  const totalProblem = getScalar(eventData?.["Total-Problem-Score"], 0);
  const desperationSensitivity = getScalar(eventData?.["Desperation-Sensitivity"], 0.35);
  const uncertaintySensitivity = getScalar(eventData?.["Uncertainty-Sensitivity-Multiplier"], 0.3);

  // Calculate factors
  const uncertaintyFactor = 1 - (uncertaintySensitivity * totalUncertainty);
  const desperationFactor = 1 + (desperationSensitivity * totalProblem);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px" }}>
        <h5 style={{ fontWeight: 500, marginBottom: "10px", fontSize: "12px", color: "var(--text-primary)" }}>
          Risk Propensity Calculation
          <InfoIcon tooltip={tooltips.effectiveRiskPropensity} align="left" />
        </h5>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "176px", fontSize: "12px", color: "var(--text-primary)" }}>Base Risk Propensity (λ)</span>
            <div style={{ flex: 1, background: "var(--border)", height: "20px", borderRadius: "4px", position: "relative" }}>
              <div style={{ height: "20px", background: "var(--accent)", borderRadius: "4px", width: `${Math.min(baseRisk * 100, 100)}%` }} />
            </div>
            <span style={{ width: "64px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-primary)" }}>{baseRisk.toFixed(3)}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)" }}>
            <span style={{ width: "176px", fontSize: "10px" }}>× Uncertainty Factor</span>
            <span style={{ flex: 1, fontSize: "10px", fontFamily: "var(--font-mono)" }}>
              1 - ({uncertaintySensitivity.toFixed(2)} × {totalUncertainty.toFixed(3)}) = {uncertaintyFactor.toFixed(3)}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)" }}>
            <span style={{ width: "176px", fontSize: "10px" }}>× Desperation Factor</span>
            <span style={{ flex: 1, fontSize: "10px", fontFamily: "var(--font-mono)" }}>
              1 + ({desperationSensitivity.toFixed(2)} × {totalProblem.toFixed(3)}) = {desperationFactor.toFixed(3)}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
            <span style={{ width: "176px", fontSize: "12px", fontWeight: 500, color: "var(--text-primary)" }}>Effective λ</span>
            <div style={{ flex: 1, background: "var(--border)", height: "20px", borderRadius: "4px", position: "relative" }}>
              <div
                style={{ height: "20px", borderRadius: "4px", width: `${Math.min(effectiveRisk * 100, 100)}%`, background: effectiveRisk > baseRisk ? "var(--gold)" : "var(--accent)" }}
              />
            </div>
            <span style={{ width: "64px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{effectiveRisk.toFixed(3)}</span>
          </div>
        </div>

        <div style={{ marginTop: "10px", fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)", background: "var(--bg-card)", padding: "8px", borderRadius: "4px" }}>
          λ_eff = λ_base × (1 - m×U) × (1 + γ×TPS)
        </div>
      </div>
    </div>
  );
};

// Compact action row showing Utility, Benefit, Cost (matching OverridePanel style)
const ActionRow = ({ action, rank, isChosen }) => {
  return (
    <div
      style={{
        padding: "8px", borderRadius: "4px", transition: "all 0.2s",
        border: isChosen ? "1px solid var(--purple, #c084fc)" : "1px solid var(--border)",
        borderLeft: isChosen ? "4px solid var(--purple, #c084fc)" : undefined,
        background: isChosen ? "var(--bg-elevated)" : "var(--bg-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
        <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "10px", flexShrink: 0 }}>#{rank}</span>
        <span style={{ fontWeight: 500, fontSize: "12px", flex: 1, color: "var(--text-primary)" }} title={action.name}>{action.name}</span>
        {isChosen && (
          <span style={{ fontSize: "9px", background: "var(--purple, #c084fc)", color: "var(--text-primary)", padding: "2px 6px", borderRadius: "4px", flexShrink: 0, fontWeight: 500 }}>
            CHOSEN
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", fontSize: "11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={{ color: "var(--text-dim)" }}>U:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--purple, #c084fc)" }}>
            {action.utility?.toFixed(3) ?? "N/A"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={{ color: "var(--text-dim)" }}>B:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--green)" }}>
            {action.benefit?.toFixed(3) ?? "N/A"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={{ color: "var(--text-dim)" }}>C:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--red)" }}>
            {action.cost?.toFixed(3) ?? "N/A"}
          </span>
        </div>
      </div>
    </div>
  );
};

// Utility Breakdown Sub-view - OverridePanel-style layout
const UtilitySubView = ({ eventData, ontology }) => {
  const coaBenefits = eventData?.["COA-Benefits"] || [];
  const finalCosts = eventData?.["Final-Cost-Vector"] || [];
  const provisionalUtility = eventData?.["Provisional-Utility-Vector"] || [];
  const effectiveRisk = getScalar(eventData?.["Effective-Risk-Propensity"], 0.5);
  const availablePlaybook = eventData?.["Current-Available-Playbook"] || [];
  const chosenSequence = eventData?.["Chosen-Action-Sequence"] || [];

  // Build action data with utility calculations
  const actionData = useMemo(() => {
    const data = [];
    const numActions = Math.max(coaBenefits.length, finalCosts.length, provisionalUtility.length);

    for (let i = 0; i < numActions; i++) {
      const benefit = getScalar(coaBenefits[i], 0);
      const cost = getScalar(finalCosts[i], 0);
      const utility = getScalar(provisionalUtility[i], -999999);
      const available = getScalar(availablePlaybook[i], 1);

      if (utility > -999999 && available === 1) {
        data.push({
          id: i,
          name: getActionName(i, ontology),
          benefit,
          cost,
          adjustedCost: effectiveRisk > 0 ? cost / effectiveRisk : cost,
          utility,
          isChosen: chosenSequence.includes(i),
        });
      }
    }

    data.sort((a, b) => b.utility - a.utility);
    return data;
  }, [coaBenefits, finalCosts, provisionalUtility, availablePlaybook, effectiveRisk, ontology, chosenSequence]);

  const topActions = actionData.slice(0, 15);

  // Extract goal discrepancy data
  const objectiveData = useMemo(() => {
    let discrepancyVector = eventData?.["Final-Discrepancy-Vector"];
    const objectiveNames = ontology?.objectives || [];

    if (!discrepancyVector) return [];

    if (typeof discrepancyVector === 'object' && !Array.isArray(discrepancyVector)) {
      discrepancyVector = Object.values(discrepancyVector);
    }

    if (!Array.isArray(discrepancyVector) || discrepancyVector.length === 0) return [];

    return discrepancyVector.map((val, idx) => {
      let value = val;
      while (Array.isArray(value)) value = value[0];
      return {
        id: idx,
        name: objectiveNames[idx] || `Goal ${idx + 1}`,
        value: typeof value === 'number' ? value : 0,
      };
    });
  }, [eventData, ontology]);

  // Extract goal-improvement matrix
  const goalImprovementData = useMemo(() => {
    let matrix = eventData?.["Goal-Improvement-Matrix"];
    const objectiveNames = ontology?.objectives || [];

    if (!matrix) return { objectives: [], matrix: [] };

    if (typeof matrix === 'object' && !Array.isArray(matrix)) {
      matrix = Object.values(matrix);
    }

    if (!Array.isArray(matrix) || matrix.length === 0) return { objectives: [], matrix: [] };

    const objectives = objectiveNames.length > 0
      ? objectiveNames.map((name, idx) => ({ id: idx, name: name || `Goal ${idx + 1}` }))
      : matrix.map((_, idx) => ({ id: idx, name: `Goal ${idx + 1}` }));

    return { objectives, matrix };
  }, [eventData, ontology]);

  // Scatter plot data
  const scatterData = useMemo(() => {
    return topActions.map(action => ({
      id: action.id,
      name: action.name,
      benefit: action.benefit ?? 0,
      cost: action.cost ?? 0,
      adjustedCost: action.adjustedCost ?? 0,
      utility: action.utility ?? 0,
      isChosen: action.isChosen,
    }));
  }, [topActions]);

  const maxDiscrepancy = Math.max(...objectiveData.map(o => Math.abs(o.value)), 0.1);
  const displayObjectives = goalImprovementData.objectives.length > 0
    ? goalImprovementData.objectives
    : objectiveData;

  return (
    <div style={{ display: "flex", gap: "12px", minHeight: "500px" }}>
      {/* Left Column: Ranked Action List (1/3 width) */}
      <div style={{ width: "33.333%", flexShrink: 0, display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-elevated)", overflow: "hidden" }}>
        <div style={{ padding: "8px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>
            Actions by Utility
            <InfoIcon tooltip={tooltips.utility} align="left" />
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
            λ_eff: <span style={{ fontFamily: "var(--font-mono)" }}>{effectiveRisk.toFixed(3)}</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {topActions.map((action, idx) => (
            <ActionRow
              key={action.id}
              action={action}
              rank={idx + 1}
              isChosen={action.isChosen}
            />
          ))}
        </div>
      </div>

      {/* Right Column: Visualizations (2/3 width) */}
      <div style={{ width: "66.666%", display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Upper Right: Goal Discrepancy + Heatmap */}
        {displayObjectives.length > 0 && (
          <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-elevated)", padding: "10px", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px", flexShrink: 0 }}>
              Goal Discrepancy & Improvement by Action
              <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "8px", fontWeight: 400 }}>(green = helps, red = hurts)</span>
            </div>

            <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
              {/* Sticky header row with action names */}
              <div
                style={{
                  display: "flex", alignItems: "flex-end", position: "sticky", top: 0, zIndex: 20, paddingBottom: "4px",
                  minHeight: '130px',
                  background: 'linear-gradient(to bottom, var(--bg-elevated) 90%, transparent)',
                  minWidth: `${24 * 4 + 200 + topActions.length * 36 + 50}px`
                }}
              >
                {/* Discrepancy column header */}
                <div style={{ width: "96px", flexShrink: 0, fontSize: "10px", color: "var(--text-dim)", textAlign: "center", alignSelf: "flex-end", paddingBottom: "4px" }}>
                  Discrepancy
                </div>
                {/* Goal name column header */}
                <div style={{ width: "208px", flexShrink: 0, fontSize: "10px", color: "var(--text-dim)", textAlign: "center", alignSelf: "flex-end", paddingBottom: "4px" }}>
                  Goal
                </div>
                {/* Action headers - 45 degree angle */}
                <div style={{ display: "flex", flex: 1, background: "var(--bg-elevated)" }}>
                  {topActions.map((action) => (
                    <div
                      key={action.id}
                      style={{ width: "36px", flexShrink: 0, position: "relative", height: "120px" }}
                    >
                      <div
                        style={{
                          position: "absolute", bottom: 0, left: 0, transformOrigin: "bottom left", whiteSpace: "nowrap", fontSize: "11px",
                          fontWeight: action.isChosen ? 700 : 400,
                          color: action.isChosen ? "var(--purple, #c084fc)" : "var(--text-secondary)",
                          transform: 'rotate(-45deg)',
                          width: '160px',
                          paddingLeft: '4px'
                        }}
                        title={action.name}
                      >
                        {action.name}
                      </div>
                    </div>
                  ))}
                  {/* Extra padding to ensure background covers */}
                  <div style={{ width: "64px", flexShrink: 0, background: "var(--bg-elevated)" }} />
                </div>
              </div>

              {/* Data rows: Discrepancy bar | Goal name | Heatmap cells */}
              {displayObjectives.map((obj) => {
                const discrepancy = objectiveData.find(o => o.id === obj.id)?.value ?? 0;
                return (
                  <div key={obj.id} style={{ display: "flex", alignItems: "center" }}>
                    {/* Discrepancy bar */}
                    <div style={{ width: "96px", flexShrink: 0 }}>
                      <DiscrepancyBar value={discrepancy} maxValue={maxDiscrepancy} />
                    </div>
                    {/* Goal name (centered, linking discrepancy to heatmap) */}
                    <div
                      style={{ width: "208px", flexShrink: 0, fontSize: "10px", color: "var(--text-secondary)", padding: "0 8px", height: "32px", display: "flex", alignItems: "center" }}
                      title={obj.name}
                    >
                      {obj.name}
                    </div>
                    {/* Heatmap cells */}
                    <div style={{ display: "flex" }}>
                      {topActions.map(action => {
                        const row = goalImprovementData.matrix[obj.id];
                        let value = row ? row[action.id] : null;
                        while (Array.isArray(value)) value = value[0];
                        return (
                          <HeatmapCell
                            key={action.id}
                            value={typeof value === 'number' ? value : null}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lower Right: Scatter Plot */}
        <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-elevated)", padding: "10px", minHeight: "250px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px", flexShrink: 0 }}>
            Benefit vs Risk-Adjusted Cost
            <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "8px", fontWeight: 400 }}>(upper-left = optimal)</span>
          </div>
          <div style={{ flex: 1, background: "var(--bg-card)", borderRadius: "4px", border: "1px solid var(--border)", minHeight: "180px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 15, right: 20, bottom: 30, left: 45 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="adjustedCost"
                  name="Adjusted Cost"
                  type="number"
                  tick={{ fill: "var(--text-dim)", fontSize: 10 }}
                  stroke="var(--border)"
                  label={{ value: "Cost / Risk Propensity", position: "bottom", fontSize: 11, offset: 10, fill: "var(--text-dim)" }}
                />
                <YAxis
                  dataKey="benefit"
                  name="Benefit"
                  type="number"
                  tick={{ fill: "var(--text-dim)", fontSize: 10 }}
                  stroke="var(--border)"
                  label={{ value: "Benefit", angle: -90, position: "left", fontSize: 11, offset: 10, fill: "var(--text-dim)" }}
                />
                <Tooltip content={<ScatterTooltip />} />
                <ReferenceLine y={0} stroke="var(--text-dim)" strokeDasharray="3 3" />
                <ReferenceLine x={0} stroke="var(--text-dim)" strokeDasharray="3 3" />
                <Scatter data={scatterData} fill="var(--accent)">
                  {scatterData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isChosen ? "var(--purple, #c084fc)" : "var(--text-dim)"}
                      stroke={entry.isChosen ? "var(--purple, #c084fc)" : "none"}
                      strokeWidth={entry.isChosen ? 2 : 0}
                      r={entry.isChosen ? 7 : 5}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "6px", fontSize: "10px", color: "var(--text-dim)", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "var(--purple, #c084fc)" }} /> Chosen Action
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "var(--text-dim)" }} /> Available Actions
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Ranked Sequences Sub-view
const RankedSubView = ({ eventData, ontology }) => {
  const rankedList = eventData?.["Ranked-Response-List"] || [];
  const chosenSequence = eventData?.["Chosen-Action-Sequence"] || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px" }}>
        <h5 style={{ fontWeight: 500, marginBottom: "6px", fontSize: "12px", color: "var(--text-primary)" }}>Ranked Response Sequences</h5>
        <p style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "10px" }}>
          Action sequences ranked by composite score (mean utility + risk adjustment)
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "256px", overflowY: "auto" }}>
          {rankedList.slice(0, 10).map((candidate, idx) => {
            const sequence = candidate.sequence || [];
            const utilityMean = candidate.utility_mean ?? candidate.mean ?? 0;
            const utilityStd = candidate.utility_stdev ?? candidate.std ?? 0;
            const compositeScore = candidate.composite_score ?? utilityMean;
            const isChosen = idx === 0;

            return (
              <div
                key={idx}
                style={{ padding: "8px", borderRadius: "4px", fontSize: "12px", background: isChosen ? "var(--bg-elevated)" : "var(--bg-card)", border: isChosen ? "1px solid var(--purple, #c084fc)" : "1px solid var(--border)" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "24px", textAlign: "center", fontWeight: 700, color: "var(--text-dim)" }}>{idx + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {sequence.map((actionId, i) => (
                        <span key={i}>
                          {i > 0 && " → "}
                          {getActionName(actionId, ontology)}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "4px" }}>
                      μ={utilityMean.toFixed(3)} | σ={utilityStd.toFixed(3)} | score={compositeScore.toFixed(3)}
                    </div>
                  </div>
                  {isChosen && <span style={{ color: "var(--purple, #c084fc)", fontWeight: 700 }}>CHOSEN</span>}
                </div>
              </div>
            );
          })}

          {rankedList.length === 0 && (
            <p style={{ color: "var(--text-dim)", fontSize: "12px" }}>No candidate sequences generated</p>
          )}
        </div>
      </div>

      <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "12px" }}>
        <h5 style={{ fontWeight: 500, marginBottom: "6px", fontSize: "12px", color: "var(--text-primary)" }}>Final Chosen Sequence</h5>
        <div style={{ background: "var(--bg-card)", padding: "8px 10px", borderRadius: "4px" }}>
          {chosenSequence.length > 0 ? (
            <ol style={{ listStyleType: "decimal", listStylePosition: "inside", display: "flex", flexDirection: "column", gap: "4px" }}>
              {chosenSequence.map((actionId, idx) => (
                <li key={idx} style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                  {getActionName(actionId, ontology)}
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: "var(--text-dim)" }}>No action selected</p>
          )}
        </div>
      </div>
    </div>
  );
};

// Goal color palette (consistent with GoalLedgerChart)
const GOAL_COLORS = [
  "#e63946", "#457b9d", "#2a9d8f", "#e9c46a", "#264653",
  "#f4a261", "#6a4c93", "#1982c4", "#8ac926", "#ff595e",
  "#ffca3a", "#6a994e"
];

// PT Value Function tooltip
const ValueFunctionTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{ background: "var(--bg-main)", padding: "8px", borderRadius: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.4)", border: "1px solid var(--border)", fontSize: "10px", color: "var(--text-primary)" }}>
        <div style={{ fontFamily: "var(--font-mono)" }}>x = {data.x?.toFixed(3)}</div>
        <div style={{ fontFamily: "var(--font-mono)" }}>v(x) = {data.vx?.toFixed(3)}</div>
        {data.goalName && (
          <div style={{ fontWeight: 500, marginTop: "4px", color: "var(--purple, #c084fc)" }}>{data.goalName}</div>
        )}
      </div>
    );
  }
  return null;
};

// Gain/Loss decomposition tooltip
const GainLossTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: "var(--bg-main)", padding: "8px", borderRadius: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.4)", border: "1px solid var(--border)", fontSize: "10px", color: "var(--text-primary)", maxWidth: "240px" }}>
        <div style={{ fontWeight: 500, marginBottom: "4px" }}>{label}</div>
        {payload.map((entry, idx) => (
          <div key={idx} style={{ color: entry.color }}>
            {entry.name}: <span style={{ fontFamily: "var(--font-mono)" }}>{entry.value?.toFixed(3)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Prospect Theory Sub-view
const PTSubView = ({ eventData, ontology }) => {
  const ptEnabled = eventData?.["PT-Enabled"];
  const rankedList = eventData?.["Ranked-Response-List"] || eventData?.["Candidate-Action-Sequences"] || [];
  const chosenSequence = eventData?.["Chosen-Action-Sequence"] || [];
  const objectiveNames = ontology?.objectives || [];

  // PT parameters from event data
  const alpha = eventData?.["PT-Alpha-Used"] ?? eventData?.["PT-Alpha"] ?? 0.88;
  const lambda_loss = eventData?.["PT-Lambda-Used"] ?? eventData?.["PT-Lambda"] ?? 2.25;
  const gamma = eventData?.["PT-Gamma-Used"] ?? eventData?.["PT-Gamma"] ?? 0.65;
  const referencePoint = eventData?.["PT-Reference-Point"] || [];
  const priorityWeights = eventData?.["PT-Priority-Weights"] || [];

  // State for which candidate to inspect
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState(0);

  // Find the chosen candidate
  const chosenCandidate = useMemo(() => {
    if (rankedList.length === 0) return null;
    // First candidate in ranked list is the chosen one
    return rankedList[0];
  }, [rankedList]);

  const selectedCandidate = rankedList[selectedCandidateIdx] || chosenCandidate;

  // Generate the S-shaped value function curve data
  const valueFunctionCurve = useMemo(() => {
    if (!selectedCandidate) return [];

    // Determine x-axis range from prospect vector
    const prospectVector = selectedCandidate.prospect_vector || [];
    let maxAbs = 0.5;
    prospectVector.forEach(v => {
      const val = Array.isArray(v) ? v[0] : v;
      if (Math.abs(val) > maxAbs) maxAbs = Math.abs(val);
    });
    const range = maxAbs * 1.5;
    const step = range / 50;
    const points = [];

    for (let x = -range; x <= range; x += step) {
      let vx;
      if (x >= 0) {
        vx = Math.pow(Math.abs(x) + 1e-12, alpha);
      } else {
        vx = -lambda_loss * Math.pow(Math.abs(x) + 1e-12, alpha);
      }
      points.push({ x: parseFloat(x.toFixed(4)), vx: parseFloat(vx.toFixed(4)) });
    }
    return points;
  }, [selectedCandidate, alpha, lambda_loss]);

  // Goal-level outcome dots to overlay on the value function curve
  const goalOutcomeDots = useMemo(() => {
    if (!selectedCandidate) return [];

    const prospectVector = selectedCandidate.prospect_vector || [];
    const valueVector = selectedCandidate.value_vector || [];

    return prospectVector.map((pv, idx) => {
      const x = Array.isArray(pv) ? pv[0] : pv;
      const vx = valueVector[idx] !== undefined
        ? (Array.isArray(valueVector[idx]) ? valueVector[idx][0] : valueVector[idx])
        : (x >= 0 ? Math.pow(Math.abs(x) + 1e-12, alpha) : -lambda_loss * Math.pow(Math.abs(x) + 1e-12, alpha));
      return {
        x: parseFloat(x.toFixed(4)),
        vx: parseFloat(vx.toFixed(4)),
        goalName: objectiveNames[idx] || `Goal ${idx + 1}`,
        goalIdx: idx,
        color: GOAL_COLORS[idx % GOAL_COLORS.length],
        weight: priorityWeights[idx] ?? 0,
      };
    });
  }, [selectedCandidate, objectiveNames, alpha, lambda_loss, priorityWeights]);

  // Gain/Loss decomposition data per goal for the selected candidate
  const gainLossData = useMemo(() => {
    if (!selectedCandidate) return [];

    const prospectVector = selectedCandidate.prospect_vector || [];
    const valueVector = selectedCandidate.value_vector || [];
    const goalOutcomeNet = selectedCandidate.goal_outcome_net || [];

    return prospectVector.map((pv, idx) => {
      const prospect = Array.isArray(pv) ? pv[0] : pv;
      const vVal = valueVector[idx] !== undefined
        ? (Array.isArray(valueVector[idx]) ? valueVector[idx][0] : valueVector[idx])
        : 0;
      const rawOutcome = goalOutcomeNet[idx] !== undefined
        ? (Array.isArray(goalOutcomeNet[idx]) ? goalOutcomeNet[idx][0] : goalOutcomeNet[idx])
        : prospect;
      const ref = referencePoint[idx] ?? 0;
      const weight = priorityWeights[idx] ?? 0;

      return {
        name: objectiveNames[idx] || `Goal ${idx + 1}`,
        goalIdx: idx,
        rawOutcome: parseFloat(rawOutcome.toFixed(4)),
        referencePoint: parseFloat(ref.toFixed(4)),
        prospect: parseFloat(prospect.toFixed(4)),
        gain: prospect > 0 ? parseFloat(prospect.toFixed(4)) : 0,
        loss: prospect < 0 ? parseFloat(prospect.toFixed(4)) : 0,
        subjGain: vVal > 0 ? parseFloat(vVal.toFixed(4)) : 0,
        subjLoss: vVal < 0 ? parseFloat(vVal.toFixed(4)) : 0,
        weight: parseFloat(weight.toFixed(3)),
        color: GOAL_COLORS[idx % GOAL_COLORS.length],
      };
    });
  }, [selectedCandidate, objectiveNames, referencePoint, priorityWeights]);

  if (!ptEnabled) {
    return (
      <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "20px", textAlign: "center", color: "var(--text-dim)" }}>
        <p style={{ fontSize: "12px" }}>Prospect Theory is disabled for this actor.</p>
        <p style={{ fontSize: "10px", marginTop: "4px" }}>Enable PT in the actor configuration to see value function analysis.</p>
      </div>
    );
  }

  if (rankedList.length === 0 || !selectedCandidate?.prospect_vector) {
    return (
      <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "20px", textAlign: "center", color: "var(--text-dim)" }}>
        <p style={{ fontSize: "12px" }}>No PT data available for this event.</p>
        <p style={{ fontSize: "10px", marginTop: "4px" }}>PT data requires candidate action sequences to be evaluated.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* PT Parameters Summary */}
      <div style={{ background: "var(--bg-elevated)", borderRadius: "6px", padding: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
          <h5 style={{ fontWeight: 500, fontSize: "12px", color: "var(--text-primary)" }}>Prospect Theory Parameters</h5>
          <div style={{ display: "flex", gap: "12px", fontSize: "10px", color: "var(--text-secondary)" }}>
            <span>α = <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{alpha.toFixed(2)}</span></span>
            <span>λ = <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{lambda_loss.toFixed(2)}</span></span>
            <span>γ = <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{gamma.toFixed(2)}</span></span>
          </div>
        </div>

        {/* Candidate selector */}
        {rankedList.length > 1 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {rankedList.slice(0, 8).map((candidate, idx) => {
              const seq = candidate.sequence || [];
              const isChosen = idx === 0;
              const isSelected = selectedCandidateIdx === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedCandidateIdx(idx)}
                  style={{
                    padding: "4px 8px", fontSize: "10px", borderRadius: "4px", cursor: "pointer", transition: "all 0.2s",
                    background: isSelected ? "var(--purple, #c084fc)" : isChosen ? "var(--bg-elevated)" : "var(--bg-card)",
                    color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                    border: isSelected ? "1px solid var(--purple, #c084fc)" : isChosen ? "1px solid var(--purple, #c084fc)" : "1px solid var(--border)",
                  }}
                  title={seq.map(a => getActionName(a, ontology)).join(" → ")}
                >
                  #{idx + 1} {isChosen ? "(chosen)" : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "12px", minHeight: "450px" }}>
        {/* Left: Value Function Curve (#1) */}
        <div style={{ width: "50%", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-elevated)", padding: "10px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px", flexShrink: 0 }}>
            Value Function
            <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "8px", fontWeight: 400 }}>v(x) with per-goal outcomes</span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "6px", flexShrink: 0 }}>
            Candidate: {(selectedCandidate?.sequence || []).map(a => getActionName(a, ontology)).join(" → ")}
          </div>
          <div style={{ flex: 1, background: "var(--bg-card)", borderRadius: "4px", border: "1px solid var(--border)", minHeight: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={valueFunctionCurve} margin={{ top: 15, right: 20, bottom: 35, left: 45 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="x"
                  type="number"
                  tick={{ fill: "var(--text-dim)", fontSize: 9 }}
                  stroke="var(--border)"
                  label={{ value: "Prospect (x − ref)", position: "bottom", fontSize: 10, offset: 15, fill: "var(--text-dim)" }}
                  domain={['dataMin', 'dataMax']}
                />
                <YAxis
                  dataKey="vx"
                  type="number"
                  tick={{ fill: "var(--text-dim)", fontSize: 9 }}
                  stroke="var(--border)"
                  label={{ value: "Subjective Value v(x)", angle: -90, position: "left", fontSize: 10, offset: 15, fill: "var(--text-dim)" }}
                />
                <Tooltip content={<ValueFunctionTooltip />} />
                <ReferenceLine x={0} stroke="var(--text-dim)" strokeDasharray="3 3" strokeWidth={1.5} />
                <ReferenceLine y={0} stroke="var(--text-dim)" strokeDasharray="3 3" strokeWidth={1.5} />

                {/* The S-curve */}
                <Line
                  dataKey="vx"
                  stroke="var(--purple, #c084fc)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Overlay goal dots as a separate layer description */}
          <div style={{ marginTop: "6px", flexShrink: 0 }}>
            <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "4px" }}>Per-Goal Outcomes on Curve:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {goalOutcomeDots.map((dot) => (
                <div
                  key={dot.goalIdx}
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", border: `1px solid ${dot.color}`, backgroundColor: `${dot.color}15` }}
                >
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, backgroundColor: dot.color }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80px", color: "var(--text-primary)" }} title={dot.goalName}>{dot.goalName}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                    ({dot.x > 0 ? "+" : ""}{dot.x.toFixed(2)} → {dot.vx > 0 ? "+" : ""}{dot.vx.toFixed(2)})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Additional chart for goal dots plotted on curve */}
          {goalOutcomeDots.length > 0 && (
            <div style={{ marginTop: "4px", background: "var(--bg-card)", borderRadius: "4px", border: "1px solid var(--border)", minHeight: "120px" }}>
              <ResponsiveContainer width="100%" height={120}>
                <ScatterChart margin={{ top: 5, right: 20, bottom: 5, left: 45 }}>
                  <XAxis
                    dataKey="x"
                    type="number"
                    tick={{ fill: "var(--text-dim)", fontSize: 8 }}
                    stroke="var(--border)"
                    domain={[
                      Math.min(...valueFunctionCurve.map(p => p.x)),
                      Math.max(...valueFunctionCurve.map(p => p.x))
                    ]}
                    hide
                  />
                  <YAxis
                    dataKey="vx"
                    type="number"
                    tick={{ fill: "var(--text-dim)", fontSize: 8 }}
                    stroke="var(--border)"
                    domain={[
                      Math.min(...valueFunctionCurve.map(p => p.vx)),
                      Math.max(...valueFunctionCurve.map(p => p.vx))
                    ]}
                    hide
                  />
                  <ReferenceLine x={0} stroke="var(--text-dim)" strokeDasharray="3 3" />
                  <ReferenceLine y={0} stroke="var(--text-dim)" strokeDasharray="3 3" />
                  <Scatter data={goalOutcomeDots} fill="var(--accent)">
                    {goalOutcomeDots.map((dot, idx) => (
                      <Cell key={idx} fill={dot.color} stroke={dot.color} strokeWidth={2} r={6} />
                    ))}
                  </Scatter>
                  <Tooltip content={<ValueFunctionTooltip />} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right: Gain/Loss Decomposition (#2) */}
        <div style={{ width: "50%", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-elevated)", padding: "10px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px", flexShrink: 0 }}>
            Gain/Loss Decomposition
            <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "8px", fontWeight: 400 }}>per goal, relative to reference</span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "6px", flexShrink: 0 }}>
            Objective prospect (raw) vs subjective value (after v(x))
          </div>

          {/* Raw prospect: gains and losses */}
          <div style={{ flex: 1, background: "var(--bg-card)", borderRadius: "4px", border: "1px solid var(--border)", minHeight: "180px", marginBottom: "6px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={gainLossData}
                layout="vertical"
                margin={{ top: 10, right: 20, bottom: 10, left: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 9 }} stroke="var(--border)"
                  label={{ value: "Objective Prospect", position: "bottom", fontSize: 10, offset: -5, fill: "var(--text-dim)" }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: "var(--text-dim)", fontSize: 9 }}
                  stroke="var(--border)"
                  width={95}
                />
                <Tooltip content={<GainLossTooltip />} />
                <ReferenceLine x={0} stroke="var(--text-dim)" strokeWidth={1.5} />
                <Bar dataKey="gain" stackId="prospect" fill="var(--green)" name="Gain" radius={[0, 3, 3, 0]} />
                <Bar dataKey="loss" stackId="prospect" fill="var(--red)" name="Loss" radius={[3, 0, 0, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Subjective value: gains and losses after v(x) */}
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "4px", flexShrink: 0 }}>
            After value function distortion (note loss amplification):
          </div>
          <div style={{ flex: 1, background: "var(--bg-card)", borderRadius: "4px", border: "1px solid var(--border)", minHeight: "180px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={gainLossData}
                layout="vertical"
                margin={{ top: 10, right: 20, bottom: 10, left: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 9 }} stroke="var(--border)"
                  label={{ value: "Subjective Value v(x)", position: "bottom", fontSize: 10, offset: -5, fill: "var(--text-dim)" }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: "var(--text-dim)", fontSize: 9 }}
                  stroke="var(--border)"
                  width={95}
                />
                <Tooltip content={<GainLossTooltip />} />
                <ReferenceLine x={0} stroke="var(--text-dim)" strokeWidth={1.5} />
                <Bar dataKey="subjGain" stackId="subjective" fill="var(--green)" name="Subj. Gain" radius={[0, 3, 3, 0]} />
                <Bar dataKey="subjLoss" stackId="subjective" fill="var(--red)" name="Subj. Loss" radius={[3, 0, 0, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Reference point display */}
          <div style={{ marginTop: "6px", flexShrink: 0 }}>
            <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "4px" }}>Reference Point (per goal):</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {referencePoint.map((ref, idx) => (
                <span key={idx} style={{ fontSize: "10px", fontFamily: "var(--font-mono)", background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: "4px", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                  {objectiveNames[idx] || `G${idx}`}: {(typeof ref === 'number' ? ref : 0).toFixed(3)}
                </span>
              ))}
            </div>
          </div>

          {/* Aggregate prospect value */}
          <div style={{ marginTop: "6px", background: "var(--bg-elevated)", borderRadius: "4px", padding: "8px", border: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px" }}>
              <span style={{ color: "var(--purple, #c084fc)", fontWeight: 500 }}>Aggregate Prospect Value (V):</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>
                {selectedCandidate?.prospect_value?.toFixed(4) ?? "N/A"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", marginTop: "4px" }}>
              <span style={{ color: "var(--purple, #c084fc)" }}>CPT Composite Score:</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>
                {selectedCandidate?.composite_score?.toFixed(4) ?? "N/A"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Analytical View Component
const DevView = ({ eventData, actorName, ontology }) => {
  const [activeSubStage, setActiveSubStage] = useState("risk");

  const ptEnabled = eventData?.["PT-Enabled"];

  const subStages = [
    { id: "risk", name: "Risk Propensity" },
    { id: "utility", name: "Utility Breakdown" },
    { id: "ranked", name: "Ranked Sequences" },
    ...(ptEnabled ? [{ id: "pt", name: "Prospect Theory" }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "6px" }}>
        {subStages.map(stage => (
          <SubStageTab
            key={stage.id}
            id={stage.id}
            name={stage.name}
            isActive={activeSubStage === stage.id}
            onClick={setActiveSubStage}
          />
        ))}
      </div>

      {activeSubStage === "risk" && <RiskSubView eventData={eventData} actorName={actorName} />}
      {activeSubStage === "utility" && <UtilitySubView eventData={eventData} ontology={ontology} />}
      {activeSubStage === "ranked" && <RankedSubView eventData={eventData} ontology={ontology} />}
      {activeSubStage === "pt" && <PTSubView eventData={eventData} ontology={ontology} />}
    </div>
  );
};

// Main Component
const Stage3DecisionMaking = ({ eventData, actorName, isDevMode, ontology, allEvents }) => {
  if (!isDevMode) {
    return <SMEView eventData={eventData} actorName={actorName} ontology={ontology} allEvents={allEvents} />;
  }

  return <DevView eventData={eventData} actorName={actorName} ontology={ontology} />;
};

export default Stage3DecisionMaking;
