import React, { useRef } from "react";
import { EVENT_COL_WIDTH, HEADER_WIDTH } from "./ActionTimeline";

/**
 * TimelineView - 2-Player Simplified Event Log with Counterfactual Support
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Displays simulation events as a horizontal scrollable sequence:
 *   E1 → E2 → E3 → ...
 * Each event card shows the acting actor, chosen actions, and severity.
 * Right-click any event to initiate a counterfactual override.
 *
 * Event cells are EVENT_COL_WIDTH wide, matching ActionTimeline's
 * column grid so event cards align vertically with timeline turns.
 */

const EVENT_CARD_WIDTH = EVENT_COL_WIDTH - 28;  // 200px card within 228px cell

// Color coding for action severity — uses CSS variables from theme.css
const getSeverityDot = (severity) => {
  if (severity >= 0.7) return { bg: "var(--red)", border: "var(--red-border)" };
  if (severity >= 0.4) return { bg: "var(--gold)", border: "var(--accent-border)" };
  if (severity >= 0.1) return { bg: "var(--green)", border: "rgba(90,176,106,0.4)" };
  return { bg: "var(--text-dim)", border: "var(--border-light)" };
};

const getSeverityLabel = (severity) => {
  if (severity >= 0.7) return "High Severity";
  if (severity >= 0.4) return "Moderate Severity";
  if (severity >= 0.1) return "De-escalatory";
  return "Neutral";
};

const EventCard = ({
  event,
  eventIndex,
  isSelected,
  onClick,
  onRightClick,
  isForkPoint,
  isCounterfactual,
  actorNames = { 0: "Actor A", 1: "Actor B" },
  ontology,
  actionNameList = [],
}) => {
  const actorId = event?.acting_actor_id ?? 0;
  const isActorA = actorId === 0;
  const actorName = actorNames[actorId] || (isActorA ? "Actor A" : "Actor B");

  const getActionNames = () => {
    const sequence = event?.["Chosen-Action-Sequence"] || event?.chosen_action_sequence;
    if (!sequence || sequence.length === 0) return [event?.action_name || "Action"];
    return sequence.map(action => {
      const actionId = typeof action === 'number' ? action : (action?.coa_id ?? action?.action_id);
      if (actionId !== undefined) {
        // Try ontology first, then scenario_config action list, then fallback
        const fromOntology = ontology?.actions?.[actionId];
        const fromList = actionNameList[actionId];
        const rawName = fromOntology || fromList || action?.name;
        if (rawName) {
          return typeof rawName === 'string' ? rawName.replace(/_/g, ' ') : rawName;
        }
        return `Action ${actionId}`;
      }
      return action?.name || "Action";
    });
  };

  const actionNames = getActionNames();
  const severity = event?.action_severity ?? event?.characteristics?.[0] ?? 0.5;
  const sevStyle = getSeverityDot(severity);

  const teamBg = isActorA ? "var(--blue-dim)" : "var(--red-dim)";
  const teamBorder = isActorA ? "var(--blue-border)" : "var(--red-border)";
  const teamColor = isActorA ? "var(--blue)" : "var(--red)";
  const badgeBg = isActorA ? "var(--blue-dim)" : "var(--red-dim)";

  // Infer turn from event data or index
  const turn = event?.turn_number ?? event?.step_data_turn ?? Math.floor(eventIndex / 2) + 1;

  return (
    <div
      style={{
        position: "relative",
        flexShrink: 0,
        width: EVENT_CARD_WIDTH,
        padding: "10px 12px",
        borderRadius: 6,
        cursor: "pointer",
        transition: "all 0.15s",
        background: teamBg,
        border: `${isCounterfactual ? "2px dashed" : "2px solid"} ${teamBorder}`,
        opacity: isCounterfactual ? 0.8 : 1,
        outline: isSelected ? `2px solid var(--accent)` : "none",
        outlineOffset: 2,
      }}
      onClick={() => onClick?.(eventIndex, event)}
      onContextMenu={(e) => { e.preventDefault(); onRightClick?.(eventIndex, event); }}
    >
      {isForkPoint && (
        <div style={{
          position: "absolute", top: -8, left: -8,
          background: "var(--purple)", color: "#fff",
          fontSize: 10, padding: "1px 8px", borderRadius: 10, zIndex: 10,
        }}>Fork</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>Turn {turn}</span>
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>E{eventIndex + 1}</span>
      </div>

      <div style={{
        display: "inline-block", padding: "2px 8px", borderRadius: 4,
        fontSize: 10, fontWeight: 600, marginBottom: 6,
        background: badgeBg, color: teamColor,
      }}>{actorName}</div>

      <ul style={{ fontSize: 11, marginBottom: 6, listStyle: "none", padding: 0 }}>
        {actionNames.map((name, idx) => (
          <li key={idx} style={{ display: "flex", alignItems: "start", gap: 4, marginBottom: 2 }}>
            <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>•</span>
            <span style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: sevStyle.bg, border: `1px solid ${sevStyle.border}`,
        }} />
        <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{getSeverityLabel(severity)}</span>
      </div>
    </div>
  );
};

const ArrowConnector = ({ isVertical = false, color }) => (
  <div style={{ flexShrink: 0 }}>
    {isVertical ? (
      <svg width="24" height="32" viewBox="0 0 24 32" fill="none" stroke={color || "var(--text-dim)"} strokeWidth="2">
        <path d="M12 0v28M5 21l7 7 7-7" />
      </svg>
    ) : (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    )}
  </div>
);

const TimelineView = ({
  events = [],
  selectedEvent,
  onEventSelect,
  onOverrideRequest,
  currentTurn,
  actorNames = { 0: "Actor A", 1: "Actor B" },
  ontology,
  actionNames: actionNameList = [],
  counterfactualData = null,
}) => {
  const scrollContainerRef = useRef(null);

  if (!events || events.length === 0) {
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Event Log</div>
        <div style={{
          border: "1px solid var(--border)", borderRadius: 6,
          padding: 24, background: "var(--bg-card)", textAlign: "center",
          color: "var(--text-dim)", fontSize: 12,
        }}>
          No events yet. Run the simulation to see the event log.
        </div>
      </div>
    );
  }

  const hasCounterfactual = counterfactualData?.events && counterfactualData.events.length > 0;
  const forkIndex = counterfactualData?.forkIndex ?? null;
  const counterfactualBranchEvents = hasCounterfactual && forkIndex !== null
    ? counterfactualData.events.slice(forkIndex) : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Event Log</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {events.length} event{events.length !== 1 ? "s" : ""}
            {hasCounterfactual && " · Comparing counterfactual"}
          </span>
          {!hasCounterfactual && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: "var(--purple)", background: "var(--purple-dim)",
              padding: "3px 8px", borderRadius: 4,
            }}>
              Right-click any event to override
            </span>
          )}
        </div>
      </div>

      <div ref={scrollContainerRef}>
        <div style={{ minWidth: "max-content" }}>
            {/* Original timeline — fixed-width cells aligned with ActionTimeline */}
            <div style={{ display: "flex", alignItems: "center", paddingLeft: HEADER_WIDTH }}>
              {events.map((event, idx) => (
                <div key={idx} style={{
                  width: EVENT_COL_WIDTH, flexShrink: 0,
                  display: "flex", alignItems: "center",
                }}>
                  <EventCard
                    event={event} eventIndex={idx}
                    isSelected={selectedEvent === idx}
                    onClick={onEventSelect} onRightClick={onOverrideRequest}
                    isForkPoint={hasCounterfactual && idx === forkIndex}
                    isCounterfactual={false} actorNames={actorNames} ontology={ontology}
                    actionNameList={actionNameList}
                  />
                  {idx < events.length - 1 && (
                    <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                      <ArrowConnector />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Counterfactual branch — aligned to same grid */}
            {hasCounterfactual && forkIndex !== null && counterfactualBranchEvents.length > 0 && (
              <>
                {/* Fork arrow */}
                <div style={{ display: "flex", alignItems: "start", height: 48, paddingLeft: HEADER_WIDTH }}>
                  {Array.from({ length: forkIndex }).map((_, idx) => (
                    <div key={`spacer-${idx}`} style={{ width: EVENT_COL_WIDTH, flexShrink: 0 }} />
                  ))}
                  <div style={{ width: EVENT_COL_WIDTH, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                    <svg width="24" height="40" viewBox="0 0 24 40" fill="none" stroke="var(--purple)" strokeWidth="2">
                      <path d="M12 0v36M5 29l7 7 7-7" />
                    </svg>
                  </div>
                </div>

                {/* Counterfactual event cards */}
                <div style={{ display: "flex", alignItems: "center", paddingLeft: HEADER_WIDTH }}>
                  {Array.from({ length: forkIndex }).map((_, idx) => (
                    <div key={`cf-spacer-${idx}`} style={{
                      width: EVENT_COL_WIDTH, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{ borderTop: "2px dashed var(--border-light)", width: "100%" }} />
                    </div>
                  ))}
                  {counterfactualBranchEvents.map((event, idx) => {
                    const actualEventIndex = forkIndex + idx;
                    return (
                      <div key={`cf-${actualEventIndex}`} style={{
                        width: EVENT_COL_WIDTH, flexShrink: 0,
                        display: "flex", alignItems: "center",
                      }}>
                        <EventCard
                          event={event} eventIndex={actualEventIndex}
                          isSelected={false} onClick={() => {}} onRightClick={null}
                          isForkPoint={idx === 0} isCounterfactual={true}
                          actorNames={actorNames} ontology={ontology}
                          actionNameList={actionNameList}
                        />
                        {idx < counterfactualBranchEvents.length - 1 && (
                          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                            <ArrowConnector />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: 10, paddingTop: 10, paddingLeft: HEADER_WIDTH,
          borderTop: "1px solid var(--border)",
          display: "flex", flexWrap: "wrap", gap: 16, fontSize: 10, color: "var(--text-secondary)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--green)" }} /> De-escalatory
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--gold)" }} /> Moderate Severity
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--red)" }} /> High Severity
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--text-dim)" }} /> Neutral
          </span>
          {hasCounterfactual && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 16 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, border: "2px dashed var(--purple)", background: "transparent" }} /> Counterfactual
            </span>
          )}
        </div>
    </div>
  );
};

export default TimelineView;
