import React, { useState } from "react";
import { inferDIME } from "../simulation/ActionTimeline";

/**
 * ActionDetailSidebar - Left sidebar panel showing selected action details
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Supports multi-action events: displays one card per selected action,
 * each with collapsible sub-sections for easy comparison.
 */

const CHAR_LABELS = [
  "Severity",
  "Clarity",
  "Irreversibility",
  "Resolve",
  "Credibility",
  "Capability",
  "Risk Prop.",
];

const TEMPORAL_ARCHETYPE_NAMES = {
  0: "Instant Action",
  1: "Rapid Action",
  2: "Gradual Action",
  3: "Sustained Action",
  4: "Covert Action",
  5: "Covert Operation",
  null_action: "Null Action",
  diplomatic_declaration: "Diplomatic Declaration",
  rapid_deployment: "Rapid Deployment",
  sustained_campaign: "Sustained Campaign",
  covert_action: "Covert Action",
  covert_operation: "Covert Operation",
  gradual_buildup: "Gradual Buildup",
  instant_strike: "Instant Strike",
};

const ACTION_TYPE_LABELS = { 0: "Repeatable", 1: "One-Off", 2: "Toggle" };

const DIME_COLORS = { D: "#c084fc", I: "#818cf8", M: "#f87171", E: "#fbbf24" };
const DIME_FULL  = { D: "Diplomatic", I: "Informational", M: "Military", E: "Economic" };

// ─── Shared sub-components ───

const SectionToggle = ({ label, open, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      padding: "6px 0",
      border: "none",
      background: "none",
      cursor: "pointer",
      fontFamily: "inherit",
    }}
  >
    <span style={{
      fontSize: "9px",
      textTransform: "uppercase",
      letterSpacing: "1px",
      color: "var(--text-dim)",
      fontWeight: 600,
    }}>
      {label}
    </span>
    <span style={{
      fontSize: "8px",
      color: "var(--text-dim)",
      transform: open ? "rotate(180deg)" : "none",
      transition: "transform 0.15s ease",
    }}>
      ▼
    </span>
  </button>
);

const DetailRow = ({ label, value, valueColor }) => (
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "3px 0",
  }}>
    <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{label}</span>
    <span style={{
      color: valueColor || "var(--text-primary)",
      fontSize: "11px",
      fontWeight: 500,
      maxWidth: "55%",
      textAlign: "right",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }}>
      {value}
    </span>
  </div>
);

const CharacteristicsBar = ({ label, value, color = "var(--accent)" }) => {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "2px 0" }}>
      <span style={{
        color: "var(--text-secondary)", fontSize: "10px",
        width: "72px", textAlign: "right", flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: "5px", background: "var(--border)",
        borderRadius: "3px", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: "3px", transition: "width 0.3s ease",
        }} />
      </div>
      <span style={{
        color: "var(--text-dim)", fontSize: "9px", width: "28px",
        fontFamily: "var(--font-mono)",
      }}>
        {typeof value === "number" ? value.toFixed(2) : "—"}
      </span>
    </div>
  );
};

const SupportCostTag = ({ type, label, value }) => {
  const isSupport = type === "support";
  return (
    <span style={{
      display: "inline-block", fontSize: "9px", padding: "2px 7px",
      borderRadius: "3px", margin: "2px 3px 2px 0",
      background: isSupport ? "var(--green-dim)" : "var(--red-dim)",
      color: isSupport ? "var(--green)" : "var(--red)",
      border: `1px solid ${isSupport ? "rgba(90,176,106,0.25)" : "var(--red-border)"}`,
    }}>
      {isSupport ? "+" : "-"} {label} ({value > 0 ? "+" : ""}{typeof value === "number" ? value.toFixed(2) : value})
    </span>
  );
};

const Badge = ({ label, color }) => (
  <span style={{
    display: "inline-block", fontSize: "9px", fontWeight: 600,
    padding: "2px 8px", borderRadius: "3px", color,
    background: `${color}22`, border: `1px solid ${color}44`,
    letterSpacing: "0.3px",
  }}>
    {label}
  </span>
);

// ─── Single Action Card ───

const ActionCard = ({
  action, supportSets, costSets, commitmentInfo,
  actorColor, ontology, actorNames, actorExclusions, actionNames,
  isMulti, defaultExpanded,
}) => {
  const [cardOpen, setCardOpen] = useState(defaultExpanded);
  // Section-level collapse state — all open by default when single action, first two open for multi
  const [sections, setSections] = useState({
    metadata: true,
    temporal: !isMulti,
    characteristics: true,
    commitment: true,
    support: !isMulti,
    availability: false,
  });

  const toggle = (key) => setSections(prev => ({ ...prev, [key]: !prev[key] }));

  const color = actorColor || "var(--accent)";
  const actionName = action.name || action.coa_label || action.action_name || "Unknown Action";
  const characteristics = action.characteristics || [];
  const temporal = action.temporal_profile || {};

  const charValues = CHAR_LABELS.map((_, idx) => {
    const val = characteristics[idx];
    return typeof val === "number" ? val : 0;
  });

  // Classification
  const dimeDomain = inferDIME(action.id, ontology);
  const dimeColor = DIME_COLORS[dimeDomain] || "var(--text-dim)";
  const dimeName = DIME_FULL[dimeDomain] || "Unknown";

  const deescFlag = action.deesc_flag ?? 0;
  const severity = charValues[0] ?? 0;
  const escalationClass = deescFlag >= 0.5 ? "De-escalatory"
    : severity > 0.5 ? "Escalatory" : "Signaling";
  const escalationColor = deescFlag >= 0.5 ? "var(--green)"
    : severity > 0.5 ? "var(--red)" : "var(--yellow, #fbbf24)";

  const archetypeName = temporal.archetype_id != null
    ? (TEMPORAL_ARCHETYPE_NAMES[temporal.archetype_id]
      || String(temporal.archetype_id).replace(/_/g, " "))
    : "—";

  const actionTypeLabel = ACTION_TYPE_LABELS[action.action_type_id] || "Repeatable";

  const actorAvail = (actorExclusions || []).map((excluded, idx) => ({
    name: actorNames?.[idx] || `Actor ${idx}`,
    excluded: Array.isArray(excluded) && excluded.includes(action.id),
  }));

  const resolveActionName = (coaId) => {
    if (ontology?.actions?.[coaId]) {
      const name = ontology.actions[coaId];
      return typeof name === "string" ? name.replace(/_/g, " ") : `Action ${coaId}`;
    }
    if (actionNames?.[coaId]) {
      const name = actionNames[coaId];
      return typeof name === "string" ? name.replace(/_/g, " ") : `Action ${coaId}`;
    }
    return `Action ${coaId}`;
  };

  const formatTrigger = (trigger) => {
    if (!trigger) return "—";
    return [
      trigger.source === "adversary" ? "Adversary" : "Self",
      trigger.domain || "",
      trigger.characteristic || "",
      trigger.operator || "",
      trigger.threshold != null ? trigger.threshold.toFixed(2) : "",
    ].filter(Boolean).join(" ");
  };

  // Outer header — always visible, clickable in multi-action mode
  const header = (
    <div
      onClick={isMulti ? () => setCardOpen(!cardOpen) : undefined}
      style={{
        padding: "10px 16px",
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
        cursor: isMulti ? "pointer" : "default",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px",
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: color, flexShrink: 0,
        }} />
        <div style={{
          fontWeight: 600, fontSize: "12px", color, lineHeight: "1.3", flex: 1,
        }}>
          {actionName}
        </div>
        {isMulti && (
          <span style={{
            fontSize: "9px", color: "var(--text-dim)",
            transform: cardOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}>
            ▼
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <Badge label={dimeName} color={dimeColor} />
        <Badge label={escalationClass} color={escalationColor} />
        <Badge label={actionTypeLabel} color="var(--text-secondary)" />
      </div>
    </div>
  );

  if (isMulti && !cardOpen) return header;

  return (
    <div>
      {header}

      {/* ── Metadata ── */}
      <div style={{ padding: "4px 16px 0", borderBottom: "1px solid var(--border)" }}>
        <SectionToggle label="Metadata" open={sections.metadata} onToggle={() => toggle("metadata")} />
        {sections.metadata && (
          <div style={{ paddingBottom: "8px" }}>
            <DetailRow label="Action ID" value={action.id ?? "—"} />
            <DetailRow label="Type" value={actionTypeLabel} />
            <DetailRow
              label="Base Cost"
              value={action.base_cost != null ? action.base_cost.toFixed(1) : "—"}
            />
            <DetailRow
              label="Volatility"
              value={action.volatility != null ? action.volatility.toFixed(3) : "—"}
            />
            <DetailRow
              label="De-escalation"
              value={deescFlag >= 0.5 ? "Yes" : "No"}
              valueColor={deescFlag >= 0.5 ? "var(--green)" : "var(--text-secondary)"}
            />
          </div>
        )}
      </div>

      {/* ── Temporal Profile ── */}
      <div style={{ padding: "4px 16px 0", borderBottom: "1px solid var(--border)" }}>
        <SectionToggle label="Temporal Profile" open={sections.temporal} onToggle={() => toggle("temporal")} />
        {sections.temporal && (
          <div style={{ paddingBottom: "8px" }}>
            <DetailRow label="Archetype" value={archetypeName} />
            <DetailRow
              label="Duration"
              value={temporal.execution_duration != null
                ? (temporal.execution_duration === 0 ? "Instant" : `${temporal.execution_duration} turns`)
                : "Instant"}
            />
            <DetailRow
              label="Sustained"
              value={temporal.is_sustained ? "Yes" : "No"}
              valueColor={temporal.is_sustained ? "var(--green)" : "var(--text-secondary)"}
            />
            <DetailRow
              label="Salience (init)"
              value={temporal.signal_salience_initial != null
                ? temporal.signal_salience_initial.toFixed(2) : "—"}
            />
            <DetailRow
              label="Decay exp."
              value={temporal.signal_salience_decay_exponent != null
                ? temporal.signal_salience_decay_exponent.toFixed(2) : "—"}
            />
            {temporal.initiation_visibility != null && (
              <DetailRow label="Visibility" value={temporal.initiation_visibility.toFixed(2)} />
            )}
            {temporal.in_progress_impact_fraction > 0 && (
              <DetailRow label="In-progress impact" value={temporal.in_progress_impact_fraction.toFixed(2)} />
            )}
            {temporal.cancellation_cost_fraction > 0 && (
              <DetailRow label="Cancel cost" value={temporal.cancellation_cost_fraction.toFixed(2)} />
            )}
          </div>
        )}
      </div>

      {/* ── Characteristics ── */}
      <div style={{ padding: "4px 16px 0", borderBottom: "1px solid var(--border)" }}>
        <SectionToggle label="Characteristics (7x1)" open={sections.characteristics} onToggle={() => toggle("characteristics")} />
        {sections.characteristics && (
          <div style={{ paddingBottom: "8px" }}>
            {CHAR_LABELS.map((label, idx) => (
              <CharacteristicsBar key={label} label={label} value={charValues[idx]} color={color} />
            ))}
          </div>
        )}
      </div>

      {/* ── Commitment ── */}
      {commitmentInfo && (
        <div style={{ padding: "4px 16px 0", borderBottom: "1px solid var(--border)" }}>
          <SectionToggle label="Commitment" open={sections.commitment} onToggle={() => toggle("commitment")} />
          {sections.commitment && (
            <div style={{ paddingBottom: "8px" }}>
              <DetailRow
                label="Type"
                value={commitmentInfo.commitment_type
                  ? commitmentInfo.commitment_type.charAt(0).toUpperCase() + commitmentInfo.commitment_type.slice(1)
                  : "—"}
                valueColor={
                  commitmentInfo.commitment_type === "threat" ? "var(--red)" :
                  commitmentInfo.commitment_type === "redline" ? "#ff4444" :
                  commitmentInfo.commitment_type === "proposal" ? "var(--green)" :
                  "var(--text-primary)"
                }
              />
              <DetailRow label="Trigger" value={formatTrigger(commitmentInfo.trigger_template)} />
              {commitmentInfo.response_template && (
                <DetailRow
                  label="Response"
                  value={resolveActionName(parseInt(commitmentInfo.response_template, 10))}
                />
              )}
              <DetailRow
                label="Expiry"
                value={commitmentInfo.default_expiry === -1
                  ? "Permanent"
                  : commitmentInfo.default_expiry != null
                    ? `${commitmentInfo.default_expiry} turns` : "—"}
              />
              {commitmentInfo.compliance_actions?.length > 0 && (
                <div style={{ marginTop: "4px" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "10px" }}>Compliance: </span>
                  {commitmentInfo.compliance_actions.map(id => (
                    <span key={id} style={{
                      display: "inline-block", fontSize: "9px", padding: "1px 6px",
                      borderRadius: "3px", margin: "2px 3px 2px 0",
                      background: "var(--bg-deep)", color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                    }}>
                      {resolveActionName(id)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Support & Cost Sets ── */}
      {(supportSets?.length > 0 || costSets?.length > 0) && (
        <div style={{ padding: "4px 16px 0", borderBottom: "1px solid var(--border)" }}>
          <SectionToggle label="Support & Cost Sets" open={sections.support} onToggle={() => toggle("support")} />
          {sections.support && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px", paddingBottom: "8px" }}>
              {supportSets?.map((s, i) => (
                <SupportCostTag
                  key={`s-${i}`} type="support"
                  label={resolveActionName(s.supported_coa_id)} value={s.bonus_strength}
                />
              ))}
              {costSets?.map((c, i) => (
                <SupportCostTag
                  key={`c-${i}`} type="cost"
                  label={resolveActionName(c.penalized_coa_id)} value={-c.penalty_strength}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Actor Availability ── */}
      {actorAvail.length > 0 && (
        <div style={{ padding: "4px 16px 0", borderBottom: "1px solid var(--border)" }}>
          <SectionToggle label="Actor Availability" open={sections.availability} onToggle={() => toggle("availability")} />
          {sections.availability && (
            <div style={{ paddingBottom: "8px" }}>
              {actorAvail.map((a, i) => (
                <DetailRow
                  key={i} label={a.name}
                  value={a.excluded ? "Excluded" : "Available"}
                  valueColor={a.excluded ? "var(--red)" : "var(--green)"}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───

const ActionDetailSidebar = ({
  selectedActions,   // Array of { action, supportSets, costSets, commitmentInfo }
  actorId,
  actorColor,
  ontology,
  actorNames,
  actorExclusions,
  actionNames,
}) => {
  if (!selectedActions || selectedActions.length === 0) {
    return (
      <div style={{ padding: "20px 16px", textAlign: "center" }}>
        <p style={{ color: "var(--text-dim)", fontSize: "11px" }}>
          Select an action in the timeline or event log to view details.
        </p>
      </div>
    );
  }

  const isMulti = selectedActions.length > 1;

  return (
    <div>
      {isMulti && (
        <div style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: "10px",
          color: "var(--text-dim)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}>
          {selectedActions.length} Actions in Event
        </div>
      )}

      {selectedActions.map(({ action, supportSets, costSets, commitmentInfo }, idx) => (
        <ActionCard
          key={action?.id ?? idx}
          action={action}
          supportSets={supportSets}
          costSets={costSets}
          commitmentInfo={commitmentInfo}
          actorColor={actorColor}
          ontology={ontology}
          actorNames={actorNames}
          actorExclusions={actorExclusions}
          actionNames={actionNames}
          isMulti={isMulti}
          defaultExpanded={idx === 0}
        />
      ))}
    </div>
  );
};

export default ActionDetailSidebar;
