import React, { useState, useMemo } from "react";

/**
 * InitialActionSelector
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Allows selection of the instigating action that kicks off the simulation.
 */

// DIME category info (Diplomatic, Informational, Military, Economic)
const CATEGORIES = {
  standby: { name: "Standby", badgeStyle: { background: "var(--bg-elevated)", color: "var(--text-primary)" } },
  diplomatic: { name: "Diplomatic Instruments", badgeStyle: { background: "rgba(192,132,252,0.15)", color: "var(--purple)" } },
  economic: { name: "Economic Instruments", badgeStyle: { background: "rgba(251,191,36,0.15)", color: "var(--gold)" } },
  informational: { name: "Informational & Cyber Instruments", badgeStyle: { background: "rgba(129,140,248,0.15)", color: "var(--accent)" } },
  military: { name: "Military Instruments", badgeStyle: { background: "rgba(248,113,113,0.15)", color: "var(--red)" } },
};

// Map action index to category (based on Action Set ordering)
// This matches the docx: Do Nothing, then Diplomatic (1-8), Economic (9-16), Info/Cyber (17-22), Military (23-30)
const getActionCategory = (actionIndex) => {
  if (actionIndex === 0) return "standby";
  if (actionIndex >= 1 && actionIndex <= 8) return "diplomatic";
  if (actionIndex >= 9 && actionIndex <= 16) return "economic";
  if (actionIndex >= 17 && actionIndex <= 22) return "informational";
  if (actionIndex >= 23 && actionIndex <= 30) return "military";
  return "standby"; // fallback
};

// Characteristic dimension labels
const CHARACTERISTIC_DIMS = [
  "Severity", "Clarity", "Irreversibility", "Unpredictability",
  "Salience", "Attribution", "Deniability", "Precision"
];

const CharacteristicsRadar = ({ characteristics }) => {
  if (!characteristics || characteristics.length !== 8) return null;

  // Simple bar-based visualization (radar would require D3/Recharts)
  return (
    <div style={{ marginTop: "6px" }}>
      <p style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "4px" }}>Action Characteristics:</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {CHARACTERISTIC_DIMS.map((dim, idx) => {
          const val = characteristics[idx] || 0;
          const pct = Math.round(val * 100);
          const barColor = val > 0.7 ? "var(--red)" : val > 0.4 ? "var(--gold)" : "var(--green)";
          return (
            <div key={dim} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
              <span style={{ width: "96px", color: "var(--text-secondary)" }}>{dim}</span>
              <div style={{ flex: 1, background: "var(--border)", borderRadius: "4px", height: "8px" }}>
                <div
                  style={{ height: "8px", borderRadius: "4px", background: barColor, width: `${pct}%` }}
                />
              </div>
              <span style={{ width: "32px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{val.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const InitialActionSelector = ({
  actions,
  coaCharacteristics,
  actors,
  selectedActorId,
  selectedActionId,
  onActorChange,
  onActionChange,
}) => {
  const [showCharacteristics, setShowCharacteristics] = useState(true);

  // Group actions by DIME category based on index position
  const groupedActions = useMemo(() => {
    if (!actions) return {};

    const groups = {};
    // Define category order for display
    const categoryOrder = ["standby", "diplomatic", "economic", "informational", "military"];
    categoryOrder.forEach(cat => { groups[cat] = []; });

    actions.forEach((action, idx) => {
      const category = getActionCategory(idx);
      groups[category].push({ ...action, id: idx, category });
    });

    // Remove empty categories
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) delete groups[key];
    });

    return groups;
  }, [actions]);

  // Get characteristics for selected action
  const selectedCharacteristics = useMemo(() => {
    if (selectedActionId === null || selectedActionId === undefined) return null;
    if (!coaCharacteristics) return null;

    // coaCharacteristics is typically a matrix [action_id][characteristic_dim]
    return coaCharacteristics[selectedActionId] || null;
  }, [selectedActionId, coaCharacteristics]);

  if (!actions || actions.length === 0) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px", background: "var(--bg-elevated)" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--gold)" }}>
          Initial Action
        </h3>
        <p style={{ color: "var(--gold)" }}>No actions available. Load a scenario first.</p>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px", background: "var(--bg-elevated)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--gold)", marginBottom: "6px" }}>
        Initial Action Selection
      </h3>
      <p style={{ fontSize: "12px", color: "var(--gold)", marginBottom: "8px" }}>
        Select the instigating action that kicks off the simulation
      </p>

      {/* Actor Selector */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Initiating Actor</label>
        <select
          style={{ border: "1px solid var(--border)", borderRadius: "4px", padding: "6px", width: "100%", background: "var(--bg-card)", color: "var(--text-primary)" }}
          value={selectedActorId ?? 0}
          onChange={(e) => onActorChange(parseInt(e.target.value))}
        >
          {actors?.map((actor, idx) => (
            <option key={idx} value={idx}>
              {actor.actor_name || `Actor ${idx === 0 ? 'A' : 'B'}`}
            </option>
          ))}
        </select>
      </div>

      {/* Action Selector - Grouped by DIME Category */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Initial Action</label>
        <select
          style={{ border: "1px solid var(--border)", borderRadius: "4px", padding: "6px", width: "100%", background: "var(--bg-card)", color: "var(--text-primary)" }}
          value={selectedActionId ?? ""}
          onChange={(e) => onActionChange(parseInt(e.target.value))}
        >
          <option value="">Select an action...</option>
          {Object.entries(groupedActions).map(([category, categoryActions]) => {
            const catInfo = CATEGORIES[category] || { name: category };
            return (
              <optgroup key={category} label={catInfo.name}>
                {categoryActions.map((action) => (
                  <option key={action.id} value={action.id}>
                    {action.name || action.action_name || `Action ${action.id}`}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {/* Action Category Badge */}
      {selectedActionId !== null && selectedActionId !== undefined && (
        <div style={{ marginBottom: "6px" }}>
          {(() => {
            const category = getActionCategory(selectedActionId);
            const catInfo = CATEGORIES[category] || { name: "Unknown", badgeStyle: { background: "var(--bg-elevated)", color: "var(--text-primary)" } };
            return (
              <span style={{ paddingLeft: "6px", paddingRight: "6px", paddingTop: "3px", paddingBottom: "3px", borderRadius: "4px", fontSize: "10px", fontWeight: 500, ...catInfo.badgeStyle }}>
                {catInfo.name}
              </span>
            );
          })()}
        </div>
      )}

      {/* Characteristics Toggle & Display */}
      {selectedActionId !== null && selectedActionId !== undefined && (
        <>
          <button
            onClick={() => setShowCharacteristics(!showCharacteristics)}
            style={{ fontSize: "12px", color: "var(--gold)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", padding: 0 }}
          >
            {showCharacteristics ? "▼" : "►"} {showCharacteristics ? "Hide" : "Show"} Characteristics
          </button>

          {showCharacteristics && selectedCharacteristics && (
            <CharacteristicsRadar characteristics={selectedCharacteristics} />
          )}
        </>
      )}
    </div>
  );
};

export default InitialActionSelector;
