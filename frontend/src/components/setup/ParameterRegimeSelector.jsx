import React, { useEffect, useState } from "react";

/**
 * ParameterRegimeSelector - Select global simulation parameter regimes
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Parameter regimes control GLOBAL simulation behavior (not per-actor settings).
 * Examples: OWL, HAWK, DOVE, etc.
 */
const ParameterRegimeSelector = ({ onRegimeSelect, appliedRegime }) => {
  const [regimes, setRegimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [pendingRegime, setPendingRegime] = useState(null);

  // Track what's selected in dropdown vs what's actually applied
  const displayRegime = pendingRegime || appliedRegime || "";

  useEffect(() => {
    const fetchRegimes = async () => {
      try {
        const res = await fetch("/api/scenarios/parameter_regimes");
        if (!res.ok) throw new Error(`Error: ${res.status}`);
        const data = await res.json();
        // data.parameter_regimes is an object with regime names as keys
        setRegimes(Object.entries(data.parameter_regimes || {}));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchRegimes();
  }, []);

  // Reset pending selection when appliedRegime is cleared (e.g., on simulation reset)
  useEffect(() => {
    if (!appliedRegime) {
      setPendingRegime(null);
    }
  }, [appliedRegime]);

  if (loading) return <p style={{ color: "var(--text-dim)" }}>Loading parameter regimes...</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  const currentRegime = displayRegime
    ? regimes.find(([name]) => name === displayRegime)?.[1]
    : null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px", background: "var(--bg-card)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
      <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Parameter Regime</h3>
      <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
        Controls global simulation behavior (applies to entire simulation, not individual actors)
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <select
          style={{ border: "1px solid var(--border)", borderRadius: "4px", padding: "6px", flex: 1 }}
          value={displayRegime}
          onChange={(e) => setPendingRegime(e.target.value)}
        >
          <option value="">Select a regime...</option>
          {regimes.map(([name]) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            if (displayRegime) {
              onRegimeSelect(displayRegime);
              setPendingRegime(null);
            }
          }}
          disabled={!displayRegime || displayRegime === appliedRegime}
          style={
            displayRegime === appliedRegime && appliedRegime
              ? { padding: "6px 12px", borderRadius: "4px", transition: "background-color 0.15s", background: "var(--green)", color: "#fff", cursor: "default" }
              : { padding: "6px 12px", borderRadius: "4px", transition: "background-color 0.15s", background: "var(--accent)", color: "#fff", opacity: (!displayRegime || displayRegime === appliedRegime) ? 0.5 : 1 }
          }
        >
          {displayRegime === appliedRegime && appliedRegime ? "✓ Applied" : "Apply Regime"}
        </button>
      </div>

      {currentRegime && (
        <div style={{ marginTop: "8px" }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ fontSize: "12px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", padding: 0 }}
          >
            {expanded ? "▼" : "►"} {expanded ? "Hide" : "Show"} Parameter Values
          </button>

          {expanded && (
            <div style={{ marginTop: "6px", background: "var(--bg-elevated)", borderRadius: "4px", padding: "8px 10px", fontSize: "12px", maxHeight: "256px", overflowY: "auto" }}>
              <table style={{ width: "100%" }}>
                <tbody>
                  {Object.entries(currentRegime).map(([key, value]) => (
                    <tr key={key} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "4px 8px 4px 0", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>{key}</td>
                      <td style={{ padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
                        {typeof value === 'number' ? value.toFixed(3) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ParameterRegimeSelector;
