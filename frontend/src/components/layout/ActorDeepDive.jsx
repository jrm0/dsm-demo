import React from "react";

/**
 * ActorDeepDive - Bottom panel showing actor state at a specific event
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Four columns:
 *  1. Posture Summary — TPS, Capability, Resolve with trends
 *  2. Goal Ledger — per-goal discrepancy, priority, bars
 *  3. Active Commitments — typed, status-tagged list
 *  4. Adversary Perception — PAPT trend, perceived hostility
 *
 * Props receive pre-extracted data from the event or actor state.
 * The drill-down into Stage 1-4 matrix inspector is triggered via callback.
 */

// ─── Helpers ───

const COMMITMENT_TYPE_LABELS = {
  0: "Implicit",
  1: "Threat",
  2: "Promise",
  3: "Proposal",
  4: "Redline",
  5: "Ultimatum",
};

const COMMITMENT_STATUS_LABELS = {
  0: "Untriggered",
  1: "Triggered",
  2: "Fulfilled",
  3: "Violated",
  4: "Expired",
  5: "Withdrawn",
  6: "Pending",
  7: "Rejected",
  8: "Complied",
};

const COMMITMENT_TYPE_COLORS = {
  0: "var(--text-dim)",
  1: "var(--gold)",
  2: "var(--green)",
  3: "var(--accent)",
  4: "var(--red)",
  5: "var(--red)",
};

const COMMITMENT_STATUS_STYLES = {
  0: { bg: "var(--bg-card)", color: "var(--text-dim)" },
  1: { bg: "var(--gold-dim)", color: "var(--gold)" },
  2: { bg: "var(--green-dim)", color: "var(--green)" },
  3: { bg: "var(--red-dim)", color: "var(--red)" },
  4: { bg: "var(--bg-card)", color: "var(--text-dim)" },
  5: { bg: "var(--bg-card)", color: "var(--text-dim)" },
  6: { bg: "var(--accent-dim)", color: "var(--accent)" },
  7: { bg: "var(--red-dim)", color: "var(--red)" },
  8: { bg: "var(--green-dim)", color: "var(--green)" },
};

const PAPT_TREND_LABELS = {
  "escalating": { label: "Escalating", color: "var(--red)" },
  "hardening": { label: "Hardening", color: "var(--gold)" },
  "stable": { label: "Stable", color: "var(--text-secondary)" },
  "softening": { label: "Softening", color: "var(--accent)" },
  "de-escalating": { label: "De-escalating", color: "var(--green)" },
};

// ─── Sub-components ───

const SectionTitle = ({ children, rightContent }) => (
  <div style={{
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "var(--text-dim)",
    marginBottom: "8px",
    fontWeight: 600,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  }}>
    <span>{children}</span>
    {rightContent}
  </div>
);

const StatBox = ({ label, value, subtext, valueColor = "var(--text-primary)" }) => (
  <div style={{
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    padding: "6px 10px",
    flex: 1,
    textAlign: "center",
  }}>
    <div style={{
      fontSize: "8px",
      color: "var(--text-dim)",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    }}>
      {label}
    </div>
    <div style={{ fontSize: "18px", fontWeight: 700, color: valueColor }}>
      {value}
    </div>
    {subtext && (
      <div style={{ fontSize: "9px", color: "var(--text-dim)" }}>{subtext}</div>
    )}
  </div>
);

const PostureBar = ({ label, value, color, trend }) => {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  const trendSymbol = trend > 0 ? "+" : trend < 0 ? "-" : "=";
  const trendColor = trend > 0 ? "var(--red)" : trend < 0 ? "var(--green)" : "var(--text-dim)";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "6px",
    }}>
      <span style={{ fontSize: "9px", color: "var(--text-secondary)", width: "32px" }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: "6px",
        background: "var(--border)",
        borderRadius: "3px",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: "3px",
          transition: "width 0.3s ease",
        }} />
      </div>
      <span style={{
        fontSize: "10px",
        width: "32px",
        textAlign: "right",
        fontWeight: 500,
        color: color,
        fontFamily: "var(--font-mono)",
      }}>
        {typeof value === "number" ? value.toFixed(2) : "—"}
      </span>
      <span style={{ fontSize: "10px", color: trendColor }}>{trendSymbol}</span>
    </div>
  );
};

const GoalRow = ({ name, discrepancy, priority, maxDiscrepancy = 1 }) => {
  const absDis = Math.abs(discrepancy || 0);
  const pct = maxDiscrepancy > 0 ? (absDis / maxDiscrepancy) * 100 : 0;
  const barColor = absDis > 0.5 ? "var(--red)" : absDis > 0.25 ? "var(--gold)" : "var(--green)";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "3px 0",
      fontSize: "10px",
    }}>
      <span style={{
        flex: 1,
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {name}
      </span>
      <div style={{
        width: "50px",
        height: "4px",
        background: "var(--border)",
        borderRadius: "2px",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          background: barColor,
          borderRadius: "2px",
        }} />
      </div>
      <span style={{
        width: "36px",
        textAlign: "right",
        fontWeight: 500,
        color: barColor,
        fontFamily: "var(--font-mono)",
      }}>
        {typeof discrepancy === "number" ? discrepancy.toFixed(2) : "—"}
      </span>
      <span style={{
        width: "24px",
        textAlign: "center",
        fontSize: "9px",
        color: "var(--text-dim)",
      }}>
        P{priority || "?"}
      </span>
    </div>
  );
};

const CommitmentItem = ({ type, status, description }) => {
  const typeLabel = COMMITMENT_TYPE_LABELS[type] || "Unknown";
  const typeColor = COMMITMENT_TYPE_COLORS[type] || "var(--text-dim)";
  const statusLabel = COMMITMENT_STATUS_LABELS[status] || "Unknown";
  const statusStyle = COMMITMENT_STATUS_STYLES[status] || { bg: "var(--bg-card)", color: "var(--text-dim)" };

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      padding: "7px 10px",
      marginBottom: "6px",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "3px",
      }}>
        <span style={{
          fontSize: "9px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: typeColor,
        }}>
          {typeLabel}
        </span>
        <span style={{
          fontSize: "8px",
          padding: "1px 5px",
          borderRadius: "3px",
          background: statusStyle.bg,
          color: statusStyle.color,
        }}>
          {statusLabel}
        </span>
      </div>
      <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
        {description}
      </div>
    </div>
  );
};

// ─── Main Component ───

const ActorDeepDive = ({
  // Actor identification
  actorName,
  actorColor = "var(--accent)",
  currentTurn,

  // Posture data
  totalProblemScore,
  tpsChange,
  escalationLevel,
  capability,
  capabilityTrend,
  resolve,
  resolveTrend,

  // Goal ledger: [{ name, discrepancy, priority }]
  goals = [],

  // Commitments: [{ type, status, description }]
  commitments = [],

  // Adversary perception
  paptTrend,          // "escalating" | "hardening" | "stable" | "softening" | "de-escalating"
  paptConfidence,
  perceivedHostility,
  hostilityChange,

  // Callbacks
  onDrillDown,        // () => void — opens Stage 1-4 inspector
  onOtherProfileDetail, // () => void — opens Other-Profile-Vector detail
}) => {
  const maxDiscrepancy = goals.reduce((max, g) => Math.max(max, Math.abs(g.discrepancy || 0)), 0.01);
  const trendInfo = PAPT_TREND_LABELS[paptTrend] || PAPT_TREND_LABELS["stable"];

  const sectionStyle = {
    flex: 1,
    borderRight: "1px solid var(--border)",
    padding: "10px 14px",
    overflowY: "auto",
    minWidth: 0,
  };

  return (
    <div style={{
      display: "flex",
      height: "var(--deep-dive-height)",
      overflow: "hidden",
    }}>

      {/* Column 1: Posture Summary */}
      <div style={sectionStyle}>
        <SectionTitle>
          Actor Posture — <span style={{ color: actorColor }}>{actorName || "Unknown"}</span>
          {currentTurn != null && <span> @ T{currentTurn}</span>}
        </SectionTitle>

        <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
          <StatBox
            label="TPS"
            value={typeof totalProblemScore === "number" ? totalProblemScore.toFixed(2) : "—"}
            subtext={tpsChange != null ? `${tpsChange > 0 ? "+" : ""}${tpsChange.toFixed(1)} from T1` : null}
            valueColor="var(--gold)"
          />
          <StatBox
            label="Escalation"
            value={typeof escalationLevel === "number" ? escalationLevel.toFixed(2) : "—"}
            subtext={escalationLevel > 0.6 ? "High" : escalationLevel > 0.3 ? "Moderate" : "Low"}
            valueColor={actorColor}
          />
        </div>

        <PostureBar label="CAP" value={capability} color={actorColor} trend={capabilityTrend} />
        <PostureBar label="RES" value={resolve} color={actorColor} trend={resolveTrend} />

        {onDrillDown && (
          <button
            onClick={onDrillDown}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10px",
              color: "var(--accent)",
              cursor: "pointer",
              padding: "6px 0 0 0",
              background: "none",
              border: "none",
              fontFamily: "inherit",
            }}
          >
            Decision Logic Inspector
          </button>
        )}
      </div>

      {/* Column 2: Goal Ledger */}
      <div style={sectionStyle}>
        <SectionTitle>Goal Ledger</SectionTitle>
        {goals.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: "10px" }}>No goal data available</div>
        ) : (
          goals.map((goal, i) => (
            <GoalRow
              key={i}
              name={goal.name}
              discrepancy={goal.discrepancy}
              priority={goal.priority}
              maxDiscrepancy={maxDiscrepancy}
            />
          ))
        )}
      </div>

      {/* Column 3: Active Commitments */}
      <div style={sectionStyle}>
        <SectionTitle>Active Commitments</SectionTitle>
        {commitments.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: "10px" }}>No active commitments</div>
        ) : (
          commitments.map((c, i) => (
            <CommitmentItem
              key={i}
              type={c.type}
              status={c.status}
              description={c.description}
            />
          ))
        )}
      </div>

      {/* Column 4: Adversary Perception */}
      <div style={{ ...sectionStyle, borderRight: "none" }}>
        <SectionTitle>Adversary Perception</SectionTitle>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            padding: "8px 12px",
          }}>
            <div style={{
              fontSize: "9px",
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "4px",
            }}>
              PAPT Trend
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: trendInfo.color }}>
              {trendInfo.label}
            </div>
            {paptConfidence != null && (
              <div style={{ fontSize: "9px", color: "var(--text-secondary)", marginTop: "2px" }}>
                Confidence: {(paptConfidence * 100).toFixed(0)}%
              </div>
            )}
          </div>

          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            padding: "8px 12px",
          }}>
            <div style={{
              fontSize: "9px",
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "4px",
            }}>
              Perceived Hostility
            </div>
            <div style={{
              fontSize: "16px",
              fontWeight: 700,
              color: perceivedHostility > 0.6 ? "var(--red)" : perceivedHostility > 0.3 ? "var(--gold)" : "var(--text-primary)",
            }}>
              {typeof perceivedHostility === "number" ? perceivedHostility.toFixed(2) : "—"}
            </div>
            {hostilityChange != null && (
              <div style={{ fontSize: "9px", color: "var(--text-dim)" }}>
                {hostilityChange > 0 ? "+" : ""}{hostilityChange.toFixed(2)} from T1
              </div>
            )}
          </div>
        </div>

        {onOtherProfileDetail && (
          <button
            onClick={onOtherProfileDetail}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10px",
              color: "var(--accent)",
              cursor: "pointer",
              padding: "6px 0 0 0",
              background: "none",
              border: "none",
              fontFamily: "inherit",
            }}
          >
            Other-Profile-Vector detail
          </button>
        )}
      </div>
    </div>
  );
};

export default ActorDeepDive;
