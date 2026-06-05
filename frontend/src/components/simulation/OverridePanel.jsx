import React, { useState, useMemo, useRef, useCallback } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, ResponsiveContainer } from "recharts";

/**
 * OverridePanel - Enhanced panel for selecting alternative actions
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Two-column layout (1/3 + 2/3):
 * - Left: Action list ranked by utility with detailed metrics
 * - Right: Upper quadrant (Goal Discrepancy + Heatmap), Lower quadrant (Scatter plot)
 *
 * Dark theme using CSS variables from theme.css
 */

const getSeverityStyle = (severity) => {
  if (severity >= 0.7) return { bg: "var(--red-dim)", color: "var(--red)", border: "var(--red-border)" };
  if (severity >= 0.4) return { bg: "var(--gold-dim, rgba(234,179,8,0.1))", color: "var(--gold)", border: "var(--accent-border)" };
  if (severity >= 0.1) return { bg: "var(--green-dim, rgba(90,176,106,0.1))", color: "var(--green)", border: "rgba(90,176,106,0.4)" };
  return { bg: "var(--bg-elevated)", color: "var(--text-dim)", border: "var(--border)" };
};

const getSeverityLabel = (severity) => {
  if (severity >= 0.7) return "Esc";
  if (severity >= 0.4) return "Mod";
  if (severity >= 0.1) return "De";
  return "Neu";
};

// Compact action row showing Utility, Benefit, Cost
const ActionRow = ({ action, isOriginal, isSelected, selectionOrder, onSelect, rank, isDisabled }) => {
  const severity = action.severity ?? 0;
  const sevStyle = getSeverityStyle(severity);

  return (
    <div
      onClick={() => !isDisabled && onSelect(action)}
      style={{
        padding: "6px 8px",
        borderRadius: "4px",
        cursor: isDisabled && !isSelected ? "not-allowed" : "pointer",
        transition: "all 0.15s",
        background: isSelected ? "var(--purple-dim)" : "var(--bg-card)",
        border: `1px solid ${isSelected ? "var(--purple)" : "var(--border)"}`,
        borderLeft: isOriginal ? "3px solid var(--blue)" : undefined,
        opacity: isDisabled && !isSelected ? 0.5 : 1,
        outline: isSelected ? "1px solid var(--purple)" : "none",
      }}
    >
      {/* Top row: rank, name, severity */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }}>
        <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "10px", flexShrink: 0 }}>#{rank}</span>
        <span style={{
          fontWeight: 500, fontSize: "11px", flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: "var(--text-primary)",
        }} title={action.name}>{action.name}</span>
        {isOriginal && (
          <span style={{
            fontSize: "9px", background: "var(--blue-dim)", color: "var(--blue)",
            padding: "1px 4px", borderRadius: "3px", flexShrink: 0,
          }}>Orig</span>
        )}
        {isSelected && selectionOrder !== undefined && (
          <span style={{
            fontSize: "9px", background: "var(--purple)", color: "#fff",
            width: "16px", height: "16px", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, fontWeight: 700,
          }}>
            {selectionOrder}
          </span>
        )}
        <span style={{
          padding: "1px 5px", borderRadius: "3px", fontSize: "9px", flexShrink: 0,
          background: sevStyle.bg, color: sevStyle.color, border: `1px solid ${sevStyle.border}`,
        }}>
          {getSeverityLabel(severity)}
        </span>
      </div>

      {/* Bottom row: Utility, Benefit, Cost metrics */}
      <div style={{ display: "flex", gap: "10px", fontSize: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={{ color: "var(--text-dim)" }}>U:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--purple)" }}>
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

// Horizontal bar for goal discrepancy
const DiscrepancyBar = ({ value, maxValue }) => {
  const absValue = Math.abs(value);
  const percentage = maxValue > 0 ? (absValue / maxValue) * 100 : 0;
  const isNegative = value < 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", height: "28px" }}>
      <div style={{
        width: "48px", height: "18px",
        background: "var(--bg-elevated)", borderRadius: "3px",
        overflow: "hidden", position: "relative",
      }}>
        <div style={{
          height: "100%", borderRadius: "3px",
          transition: "all 0.2s",
          background: isNegative ? "var(--red)" : "var(--gold)",
          opacity: 0.7,
          width: `${Math.min(percentage, 100)}%`,
        }} />
      </div>
      <span style={{
        width: "40px", fontSize: "10px",
        fontFamily: "var(--font-mono)", color: "var(--text-dim)",
        textAlign: "right",
      }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
};

// Heatmap cell for goal-improvement matrix — data-range normalized, opaque colors
const HeatmapCell = ({ value, isSelected, onClick, maxAbsValue }) => {
  // Luminance-driven diverging scale on dark base.
  // Magnitude controls brightness (cells "glow" stronger with larger values).
  // sqrt curve amplifies small-value visibility.
  const getColor = (v) => {
    if (v === null || v === undefined) return "var(--bg-elevated)";
    const cap = maxAbsValue > 0 ? maxAbsValue : 1;
    const normalized = Math.max(-1, Math.min(1, v / cap));
    // sqrt curve: amplify low-magnitude differences
    const sign = normalized >= 0 ? 1 : -1;
    const t = Math.sqrt(Math.abs(normalized));

    // Base: dark card bg [30,30,34]
    // Positive → teal/green glow: dim [30,50,45] → bright [34,197,94]
    // Negative → warm/red glow:   dim [50,30,30] → bright [239,68,68]
    const base = [30, 30, 34];
    if (sign > 0) {
      const dim  = [30, 55, 48];
      const bright = [34, 197, 94];
      // Two-stage: base→dim for t<0.3, dim→bright for t>=0.3
      if (t < 0.3) {
        const s = t / 0.3;
        return `rgb(${Math.round(base[0] + (dim[0] - base[0]) * s)}, ${Math.round(base[1] + (dim[1] - base[1]) * s)}, ${Math.round(base[2] + (dim[2] - base[2]) * s)})`;
      }
      const s = (t - 0.3) / 0.7;
      return `rgb(${Math.round(dim[0] + (bright[0] - dim[0]) * s)}, ${Math.round(dim[1] + (bright[1] - dim[1]) * s)}, ${Math.round(dim[2] + (bright[2] - dim[2]) * s)})`;
    } else {
      const dim  = [55, 30, 30];
      const bright = [239, 68, 68];
      if (t < 0.3) {
        const s = t / 0.3;
        return `rgb(${Math.round(base[0] + (dim[0] - base[0]) * s)}, ${Math.round(base[1] + (dim[1] - base[1]) * s)}, ${Math.round(base[2] + (dim[2] - base[2]) * s)})`;
      }
      const s = (t - 0.3) / 0.7;
      return `rgb(${Math.round(dim[0] + (bright[0] - dim[0]) * s)}, ${Math.round(dim[1] + (bright[1] - dim[1]) * s)}, ${Math.round(dim[2] + (bright[2] - dim[2]) * s)})`;
    }
  };

  // Text color: brighter as magnitude increases for readability on glowing bg
  const getTextColor = (v) => {
    if (v === null || v === undefined) return "var(--text-dim)";
    const cap = maxAbsValue > 0 ? maxAbsValue : 1;
    const t = Math.sqrt(Math.min(1, Math.abs(v) / cap));
    // Fade from dim gray → white
    const gray = Math.round(100 + t * 155);
    return `rgb(${gray}, ${gray}, ${gray})`;
  };

  // Format: show truncated numeric value instead of just +/−
  const formatValue = (v) => {
    if (v === null || v === undefined) return "";
    if (Math.abs(v) < 0.005) return "";
    // Compact: drop leading zero, 1-2 significant digits
    const abs = Math.abs(v);
    if (abs >= 1) return v > 0 ? `${v.toFixed(1)}` : `${v.toFixed(1)}`;
    return v > 0 ? `.${(abs * 10).toFixed(0)}` : `−.${(abs * 10).toFixed(0)}`;
  };

  return (
    <div
      onClick={onClick}
      title={value?.toFixed(4) ?? "N/A"}
      style={{
        width: "36px", height: "28px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "8px", fontFamily: "var(--font-mono)",
        cursor: "pointer", flexShrink: 0,
        border: `1px solid ${isSelected ? "var(--purple)" : "rgba(255,255,255,0.06)"}`,
        transition: "all 0.15s",
        backgroundColor: getColor(value),
        color: getTextColor(value),
        outline: isSelected ? "1px solid var(--purple)" : "none",
        zIndex: isSelected ? 10 : "auto",
        fontWeight: 500,
        letterSpacing: "-0.3px",
      }}
    >
      {formatValue(value)}
    </div>
  );
};

// Custom tooltip for scatter plot
const ScatterTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{
        background: "var(--bg-elevated)", padding: "8px 10px",
        borderRadius: "6px", border: "1px solid var(--border)",
        fontSize: "11px", color: "var(--text-primary)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}>
        <div style={{ fontWeight: 500, marginBottom: "4px" }}>{data.name}</div>
        <div>Benefit: <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}>{data.benefit?.toFixed(3)}</span></div>
        <div>Adj. Cost: <span style={{ color: "var(--red)", fontFamily: "var(--font-mono)" }}>{data.adjustedCost?.toFixed(3)}</span></div>
        <div>Utility: <span style={{ color: "var(--purple)", fontFamily: "var(--font-mono)" }}>{data.utility?.toFixed(3)}</span></div>
      </div>
    );
  }
  return null;
};

const MAX_ACTIONS = 3;
const MIN_PANEL_WIDTH = 900;
const MAX_PANEL_WIDTH = 1800;
const DEFAULT_PANEL_WIDTH = 1280;

const OverridePanel = ({
  event,
  eventIndex,
  actorName,
  actions = [],
  ontology,
  objectiveNames: objectiveNamesProp = [],
  onClose,
  onRunCounterfactual,
  isLoading = false,
}) => {
  const [selectedActions, setSelectedActions] = useState([]);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [localError, setLocalError] = useState(null);
  const panelRef = useRef(null);

  // Handle resize drag
  const handleMouseDown = useCallback((e, direction) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (e) => {
      const delta = direction === 'right' ? e.clientX - startX : startX - e.clientX;
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth + delta * 2));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [panelWidth]);

  const handleToggleAction = (action) => {
    setSelectedActions(prev => {
      const existingIndex = prev.findIndex(a => a.id === action.id);
      if (existingIndex !== -1) {
        return prev.filter(a => a.id !== action.id);
      } else if (prev.length < MAX_ACTIONS) {
        return [...prev, action];
      }
      return prev;
    });
  };

  const originalActionIds = event?.action_ids || event?.["Chosen-Action-Sequence"] || [];

  // Clean up name: replace underscores, title-case
  const cleanName = (name) => {
    if (!name || typeof name !== 'string') return name;
    return name.replace(/_/g, ' ');
  };

  // Build ranked action list with all metrics
  const rankedActions = useMemo(() => {
    const utilityVector = event?.["Provisional-Utility-Vector"] || [];
    const benefitVector = event?.["COA-Benefits"] || [];
    const costVector = event?.["Final-Cost-Vector"] || [];

    const getActionSeverity = (actionId) => {
      if (ontology?.actionCharacteristics?.[actionId]) {
        return ontology.actionCharacteristics[actionId][0] ?? 0;
      }
      return 0;
    };

    const extractValue = (vector, id) => {
      if (!Array.isArray(vector) || id >= vector.length) return null;
      const val = vector[id];
      if (val === null || val === undefined) return null;
      if (Array.isArray(val)) return val[0] ?? null;
      return val;
    };

    const actionList = actions.map((action, idx) => {
      const actionId = action.id ?? idx;
      const utility = extractValue(utilityVector, actionId);
      const benefit = extractValue(benefitVector, actionId);
      const cost = extractValue(costVector, actionId);

      return {
        id: actionId,
        name: cleanName(action.name || action.action_name || `Action ${actionId}`),
        utility,
        benefit,
        cost,
        severity: action.characteristics?.[0] ?? getActionSeverity(actionId),
        isOriginal: originalActionIds.includes(actionId),
        isAvailable: utility !== -1000000,
      };
    });

    return actionList
      .filter(a => a.isAvailable)
      .sort((a, b) => (b.utility ?? -Infinity) - (a.utility ?? -Infinity));
  }, [actions, event, ontology, originalActionIds]);

  // Resolve goal/objective names — prioritize direct prop from scenario_config
  const resolveGoalNames = useMemo(() => {
    const names = (objectiveNamesProp.length > 0 ? objectiveNamesProp : null)
      || ontology?.objectives
      || ontology?.goals
      || [];
    return names.map((n, i) => (typeof n === 'string' && n.trim()) ? cleanName(n) : `Goal ${i + 1}`);
  }, [objectiveNamesProp, ontology]);

  // Extract goal discrepancy data
  const objectiveData = useMemo(() => {
    let discrepancyVector = event?.["Final-Discrepancy-Vector"];
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
        name: resolveGoalNames[idx] || `Goal ${idx + 1}`,
        value: typeof value === 'number' ? value : 0,
      };
    });
  }, [event, resolveGoalNames]);

  // Extract goal-improvement matrix
  const goalImprovementData = useMemo(() => {
    let matrix = event?.["Goal-Improvement-Matrix"];
    if (!matrix) return { objectives: [], matrix: [] };

    if (typeof matrix === 'object' && !Array.isArray(matrix)) {
      matrix = Object.values(matrix);
    }
    if (!Array.isArray(matrix) || matrix.length === 0) return { objectives: [], matrix: [] };

    const objectives = matrix.map((_, idx) => ({
      id: idx,
      name: resolveGoalNames[idx] || `Goal ${idx + 1}`,
    }));

    return { objectives, matrix };
  }, [event, resolveGoalNames]);

  // Compute max absolute value in the goal-improvement matrix for gradient normalization
  const maxAbsGIM = useMemo(() => {
    const matrix = goalImprovementData.matrix;
    if (!matrix || matrix.length === 0) return 1;
    let maxAbs = 0;
    for (const row of matrix) {
      if (!Array.isArray(row)) continue;
      for (let v of row) {
        while (Array.isArray(v)) v = v[0];
        if (typeof v === 'number' && isFinite(v)) {
          maxAbs = Math.max(maxAbs, Math.abs(v));
        }
      }
    }
    return maxAbs > 0 ? maxAbs : 1;
  }, [goalImprovementData.matrix]);

  // Scatter plot data
  const scatterData = useMemo(() => {
    const riskPropensity = event?.["Effective-Risk-Propensity"] ?? 1;

    return rankedActions.map(action => ({
      id: action.id,
      name: action.name,
      benefit: action.benefit ?? 0,
      cost: action.cost ?? 0,
      adjustedCost: riskPropensity > 0 ? (action.cost ?? 0) / riskPropensity : (action.cost ?? 0),
      utility: action.utility ?? 0,
      isOriginal: action.isOriginal,
      isSelected: selectedActions.some(a => a.id === action.id),
    }));
  }, [rankedActions, event, selectedActions]);

  const problemScore = event?.["Total-Problem-Score"];
  const riskPropensity = event?.["Effective-Risk-Propensity"];
  const culmination = event?.["Culmination-Index"];

  const handleRunCounterfactual = () => {
    if (selectedActions.length > 0 && onRunCounterfactual) {
      setLocalError(null);
      const actionIds = selectedActions.map(a => a.id);
      onRunCounterfactual(eventIndex, actionIds);
    }
  };

  const hasOriginalSelected = selectedActions.some(a => a.isOriginal);
  const maxDiscrepancy = Math.max(...objectiveData.map(o => Math.abs(o.value)), 0.1);

  // Get top actions for heatmap columns (show top 15)
  const topActionsForHeatmap = rankedActions.slice(0, 15);

  // Use objectives from goalImprovementData if available, else from objectiveData
  const displayObjectives = goalImprovementData.objectives.length > 0
    ? goalImprovementData.objectives
    : objectiveData;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 50, padding: "16px",
      cursor: isResizing ? "ew-resize" : "auto",
      userSelect: isResizing ? "none" : "auto",
    }}>
      <div
        ref={panelRef}
        style={{
          background: "var(--bg-main)",
          borderRadius: "12px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
          border: "1px solid var(--border)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          width: `${panelWidth}px`,
          maxWidth: "95vw",
          fontFamily: "var(--font-sans)",
          color: "var(--text-primary)",
          fontSize: "12px",
        }}
      >
        {/* Left resize handle */}
        <div
          onMouseDown={(e) => handleMouseDown(e, 'left')}
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: "6px",
            cursor: "ew-resize", zIndex: 30, borderRadius: "12px 0 0 12px",
          }}
        />
        {/* Right resize handle */}
        <div
          onMouseDown={(e) => handleMouseDown(e, 'right')}
          style={{
            position: "absolute", right: 0, top: 0, bottom: 0, width: "6px",
            cursor: "ew-resize", zIndex: 30, borderRadius: "0 12px 12px 0",
          }}
        />

        {/* Header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card)",
          borderRadius: "12px 12px 0 0",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Override Action Analysis
              </h2>
              <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "2px 0 0" }}>
                Event {eventIndex + 1} &bull; <span style={{ fontWeight: 500 }}>{actorName}</span>
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>↔ Drag edges to resize</span>
              <button
                onClick={onClose}
                style={{
                  color: "var(--text-dim)", fontSize: "18px", fontWeight: "bold",
                  background: "none", border: "none", cursor: "pointer", lineHeight: 1,
                }}
              >×</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "8px", fontSize: "11px" }}>
            {problemScore !== undefined && (
              <div style={{
                background: "var(--bg-elevated)", padding: "3px 8px",
                borderRadius: "4px", border: "1px solid var(--border)",
              }}>
                Problem: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{problemScore.toFixed(2)}</span>
              </div>
            )}
            {riskPropensity !== undefined && (
              <div style={{
                background: "var(--bg-elevated)", padding: "3px 8px",
                borderRadius: "4px", border: "1px solid var(--border)",
              }}>
                Risk λ: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{riskPropensity.toFixed(2)}</span>
              </div>
            )}
            {culmination !== undefined && (
              <div style={{
                background: "var(--bg-elevated)", padding: "3px 8px",
                borderRadius: "4px", border: "1px solid var(--border)",
              }}>
                Culmination: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{(culmination * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Error banner */}
        {localError && (
          <div style={{
            padding: "6px 16px", fontSize: "11px",
            background: "var(--red-dim)", color: "var(--red)",
            borderBottom: "1px solid var(--red-border)",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>{localError}</span>
            <button onClick={() => setLocalError(null)} style={{
              background: "none", border: "none", color: "var(--red)", cursor: "pointer",
            }}>×</button>
          </div>
        )}

        {/* Main Content - Two Columns (1/3 + 2/3) */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>

          {/* Left Column: Action List (1/3 width) */}
          <div style={{
            width: "33%", flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              padding: "8px 10px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>
                Actions by Utility
                <span style={{ marginLeft: "8px", color: "var(--purple)", fontWeight: 600 }}>
                  {selectedActions.length}/{MAX_ACTIONS}
                </span>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {rankedActions.map((action, idx) => {
                const selectionIndex = selectedActions.findIndex(a => a.id === action.id);
                const isSelected = selectionIndex !== -1;
                const isDisabled = !isSelected && selectedActions.length >= MAX_ACTIONS;

                return (
                  <ActionRow
                    key={action.id}
                    action={action}
                    rank={idx + 1}
                    isOriginal={action.isOriginal}
                    isSelected={isSelected}
                    selectionOrder={isSelected ? selectionIndex + 1 : undefined}
                    onSelect={handleToggleAction}
                    isDisabled={isDisabled}
                  />
                );
              })}
            </div>
          </div>

          {/* Right Column: Visualizations (2/3 width) */}
          <div style={{ width: "67%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Upper Right: Goal Discrepancy + Goal Names + Heatmap */}
            <div style={{
              flex: 1, padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
              overflow: "hidden", minHeight: 0,
              display: "flex", flexDirection: "column",
            }}>
              <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "8px", flexShrink: 0 }}>
                Goal Discrepancy &amp; Improvement by Action
                <span style={{ color: "var(--text-dim)", marginLeft: "8px" }}>(green = helps, red = hurts)</span>
              </div>

              {displayObjectives.length > 0 ? (
                <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
                  {/* Sticky header row with action names */}
                  <div style={{
                    display: "flex", alignItems: "flex-end",
                    position: "sticky", top: 0, zIndex: 20, paddingBottom: "4px",
                    minHeight: "120px",
                    background: "linear-gradient(to bottom, var(--bg-main) 90%, transparent)",
                    minWidth: `${24 * 4 + 80 * 4 + topActionsForHeatmap.length * 32 + 50}px`,
                  }}>
                    {/* Discrepancy column header */}
                    <div style={{
                      width: "90px", flexShrink: 0,
                      fontSize: "10px", color: "var(--text-dim)",
                      textAlign: "center", alignSelf: "flex-end", paddingBottom: "2px",
                    }}>
                      Discrepancy
                    </div>
                    {/* Goal name column header */}
                    <div style={{
                      width: "180px", flexShrink: 0,
                      fontSize: "10px", color: "var(--text-dim)",
                      textAlign: "center", alignSelf: "flex-end", paddingBottom: "2px",
                    }}>
                      Goal
                    </div>
                    {/* Action headers - 45 degree angle */}
                    <div style={{ display: "flex", flex: 1 }}>
                      {topActionsForHeatmap.map(action => (
                        <div
                          key={action.id}
                          style={{
                            width: "32px", flexShrink: 0,
                            position: "relative", height: "110px",
                            cursor: "pointer",
                          }}
                          onClick={() => handleToggleAction(action)}
                        >
                          <div
                            style={{
                              position: "absolute", bottom: 0, left: 0,
                              transformOrigin: "bottom left",
                              transform: "rotate(-45deg)",
                              whiteSpace: "nowrap",
                              fontSize: "10px", width: "150px", paddingLeft: "4px",
                              color: selectedActions.some(a => a.id === action.id)
                                ? "var(--purple)" : "var(--text-secondary)",
                              fontWeight: selectedActions.some(a => a.id === action.id) ? 700 : 400,
                            }}
                            title={action.name}
                          >
                            {action.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Data rows: Discrepancy bar | Goal name | Heatmap cells */}
                  {displayObjectives.map((obj) => {
                    const discrepancy = objectiveData.find(o => o.id === obj.id)?.value ?? 0;
                    return (
                      <div key={obj.id} style={{ display: "flex", alignItems: "center" }}>
                        {/* Discrepancy bar */}
                        <div style={{ width: "90px", flexShrink: 0 }}>
                          <DiscrepancyBar value={discrepancy} maxValue={maxDiscrepancy} />
                        </div>
                        {/* Goal name */}
                        <div
                          style={{
                            width: "180px", flexShrink: 0,
                            fontSize: "10px", color: "var(--text-secondary)",
                            padding: "0 6px", height: "28px",
                            display: "flex", alignItems: "center",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                          title={obj.name}
                        >
                          {obj.name}
                        </div>
                        {/* Heatmap cells */}
                        <div style={{ display: "flex" }}>
                          {topActionsForHeatmap.map(action => {
                            const row = goalImprovementData.matrix[obj.id];
                            let value = row ? row[action.id] : null;
                            while (Array.isArray(value)) value = value[0];
                            return (
                              <HeatmapCell
                                key={action.id}
                                value={typeof value === 'number' ? value : null}
                                isSelected={selectedActions.some(a => a.id === action.id)}
                                onClick={() => handleToggleAction(action)}
                                maxAbsValue={maxAbsGIM}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  fontSize: "11px", color: "var(--text-dim)", fontStyle: "italic",
                  padding: "30px", textAlign: "center",
                  background: "var(--bg-card)", borderRadius: "6px",
                }}>
                  No goal data available for this event
                </div>
              )}
            </div>

            {/* Lower Right: Scatter Plot */}
            <div style={{
              flex: 1, padding: "10px 12px",
              minHeight: 0, display: "flex", flexDirection: "column",
            }}>
              <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>
                Benefit vs Risk-Adjusted Cost
                <span style={{ color: "var(--text-dim)", marginLeft: "8px" }}>(upper-left = optimal)</span>
              </div>
              <div style={{
                flex: 1, background: "var(--bg-card)", borderRadius: "6px",
                border: "1px solid var(--border)", minHeight: "180px",
              }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 15, right: 20, bottom: 30, left: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                    <XAxis
                      dataKey="adjustedCost"
                      name="Adjusted Cost"
                      type="number"
                      tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                      stroke="var(--text-dim)"
                      label={{ value: "Cost / Risk Propensity", position: "bottom", fontSize: 10, fill: "var(--text-dim)", offset: 10 }}
                    />
                    <YAxis
                      dataKey="benefit"
                      name="Benefit"
                      type="number"
                      tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                      stroke="var(--text-dim)"
                      label={{ value: "Benefit", angle: -90, position: "left", fontSize: 10, fill: "var(--text-dim)", offset: 10 }}
                    />
                    <Tooltip content={<ScatterTooltip />} />
                    <ReferenceLine y={0} stroke="var(--border-light)" strokeDasharray="3 3" />
                    <ReferenceLine x={0} stroke="var(--border-light)" strokeDasharray="3 3" />
                    <Scatter data={scatterData} fill="#8884d8">
                      {scatterData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.isSelected ? "#9333ea" : entry.isOriginal ? "#58a6ff" : "#6b7280"}
                          stroke={entry.isSelected ? "#a855f7" : "none"}
                          strokeWidth={entry.isSelected ? 2 : 0}
                          r={entry.isSelected ? 7 : entry.isOriginal ? 6 : 5}
                          cursor="pointer"
                          onClick={() => {
                            const action = rankedActions.find(a => a.id === entry.id);
                            if (action) handleToggleAction(action);
                          }}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div style={{
                display: "flex", gap: "14px", marginTop: "6px",
                fontSize: "10px", color: "var(--text-dim)", justifyContent: "center",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#58a6ff" }} /> Original
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#9333ea" }} /> Selected
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#6b7280" }} /> Available
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-card)",
          borderRadius: "0 0 12px 12px",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              {selectedActions.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                  <span style={{ fontWeight: 500, marginRight: "4px" }}>Sequence:</span>
                  {selectedActions.map((action, idx) => (
                    <span
                      key={action.id}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        background: "var(--purple-dim)", color: "var(--purple)",
                        padding: "2px 8px", borderRadius: "4px", fontSize: "11px",
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{idx + 1}.</span>
                      <span>{action.name}</span>
                      <button
                        onClick={() => handleToggleAction(action)}
                        style={{
                          marginLeft: "2px", color: "var(--purple)", opacity: 0.6,
                          background: "none", border: "none", cursor: "pointer",
                          fontWeight: "bold", fontSize: "12px",
                        }}
                      >×</button>
                    </span>
                  ))}
                  {hasOriginalSelected && (
                    <span style={{ color: "var(--gold)", fontSize: "10px", marginLeft: "8px" }}>
                      ⚠ Includes original
                    </span>
                  )}
                </div>
              ) : (
                "Click actions to build a counterfactual sequence"
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "6px 14px", fontSize: "12px",
                  color: "var(--text-secondary)", background: "none",
                  border: "1px solid var(--border)", borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRunCounterfactual}
                disabled={selectedActions.length === 0 || isLoading}
                style={{
                  padding: "6px 18px", fontSize: "12px", fontWeight: 500,
                  borderRadius: "6px", cursor: selectedActions.length > 0 && !isLoading ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                  background: selectedActions.length > 0 && !isLoading ? "var(--purple)" : "var(--bg-elevated)",
                  color: selectedActions.length > 0 && !isLoading ? "#fff" : "var(--text-dim)",
                  border: "none",
                }}
              >
                {isLoading ? "Running..." : "Run Counterfactual →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverridePanel;
