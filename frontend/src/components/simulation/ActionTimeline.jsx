import React, { useMemo, useState } from "react";

/**
 * ActionTimeline - DIME-Grouped Collapsible Gantt-Style Swimlane Visualization
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Groups actions by DIME domain (Diplomatic, Informational, Military, Economic)
 * within each actor lane.
 *
 * Collapsed: Composite density band — height/opacity varies by concurrent
 *   action count at each turn.  Initiation markers (dots) overlaid within the
 *   band show where individual actions start.
 * Expanded: Full stacked action bars with lifecycle line-style rendering.
 *   Action names are pinned to the left edge so they stay visible during
 *   horizontal scroll.
 *
 * Visual language (line type = lifecycle phase, color = actor identity):
 *   ● ─ ─ ─ ─ ─    Dashed line = In Progress (executing)
 *   ━━━━━━━━━━━━    Solid thick bar = Sustaining (completed + maintained)
 *   ━━━━━▸           Tapering tail = Decaying (signal fading)
 *   ●                Circle dot = Initiation point
 *
 * Data source: World-State-Timeline records from system data
 */

// ─── Constants ───

const ACTOR_COLORS = {
  0: "var(--blue)",
  1: "var(--red)",
};
const ACTOR_HEX = { 0: "#58a6ff", 1: "#ff6b6b" };

const DIME_DOMAINS = [
  { key: "D", label: "Diplomatic" },
  { key: "I", label: "Informational" },
  { key: "M", label: "Military" },
  { key: "E", label: "Economic" },
];

export const EVENT_COL_WIDTH = 228;   // pitch per event card (200px card + 28px connector)
export const TURN_WIDTH = EVENT_COL_WIDTH * 2;  // 2 events per turn (round-robin)
export const HEADER_WIDTH = 140;

const LANE_HEIGHT = 24;
const LANE_PADDING = 2;
const DENSITY_BAND_HEIGHT = 26;
const DOMAIN_HEADER_HEIGHT = 22;

// ─── DIME Domain Inference ───

export const DIME_KEYWORDS = {
  D: [
    "diplom", "protest", "demarche", "ceasefire", "peace", "deconflict",
    "allied action", "leadership visit", "legal status", "negotiat",
    "operational pause", "warning (private",
  ],
  I: [
    "public address", "signal", "intelligence", "disinformation", "influence",
    "electronic warfare", "cyber", "information", "media", "broadcast",
    "disclose",
  ],
  M: [
    "military", "naval", "deploy", "force", "exercise", "blockade",
    "quarantine", "strike", "assault", "mining", "intercept",
    "warning shot", "posture", "embark", "coercion", "maritime",
    "sead", "dead", "amphibious", "tripwire", "preposition",
    "harden", "readiness", "evacuati", "neo", "alert",
    "stand down", "reduce forward", "lift naval", "return strategic",
    "direct military support",
  ],
  E: [
    "trade", "economic", "sanction", "financial", "commercial",
    "export", "import", "inducement", "concession", "port access",
    "logistics", "sectoral", "weaponize", "resource",
  ],
};

export const inferDIME = (coaId, ontology) => {
  if (ontology?.action_domains) {
    const domain = ontology.action_domains[coaId];
    if (domain && "DIME".includes(domain[0]?.toUpperCase())) {
      return domain[0].toUpperCase();
    }
  }
  const name = getActionName(coaId, ontology).toLowerCase();
  if (name === "do nothing") return "D";
  let best = "M";
  let bestScore = 0;
  for (const [domain, keywords] of Object.entries(DIME_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (name.includes(kw)) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = domain; }
  }
  return best;
};

// ─── Helpers ───

const getActionName = (coaId, ontology) => {
  if (ontology?.actions) {
    const name = Array.isArray(ontology.actions)
      ? ontology.actions[coaId] : ontology.actions[coaId];
    if (typeof name === "string") return name.replace(/_/g, " ");
  }
  if (ontology?.actionNames) {
    const name = ontology.actionNames[coaId];
    if (typeof name === "string") return name.replace(/_/g, " ");
  }
  return `Action ${coaId}`;
};

const extractRecords = (wst) => {
  if (!wst) return [];
  if (Array.isArray(wst)) return wst;
  if (wst.records && typeof wst.records === "object") {
    return Array.isArray(wst.records) ? wst.records : Object.values(wst.records);
  }
  if (wst._records && typeof wst._records === "object") {
    return Object.values(wst._records);
  }
  if (typeof wst === "object" && !Array.isArray(wst)) {
    const vals = Object.values(wst);
    if (vals.length > 0 && vals[0]?.record_id !== undefined) return vals;
  }
  return [];
};

// ─── Lifecycle Segment Inference ───

const inferLifecycleSegments = (record, maxTurn) => {
  const segments = [];
  const initiated = record.turn_initiated ?? 0;
  const completed = record.turn_completed;
  const sustained = record.turns_sustained ?? 0;
  const finalState = record.lifecycle_state ?? 0;

  if (completed == null) {
    segments.push({ startTurn: initiated, endTurn: maxTurn, phase: "in_progress" });
    return segments;
  }
  if (completed > initiated) {
    segments.push({ startTurn: initiated, endTurn: completed, phase: "in_progress" });
  } else {
    segments.push({ startTurn: initiated, endTurn: initiated, phase: "in_progress" });
  }
  if (sustained > 0) {
    const sustainEnd = Math.min(completed + sustained, maxTurn);
    segments.push({ startTurn: completed, endTurn: sustainEnd, phase: "sustaining" });
  }
  const decayStart = sustained > 0 ? completed + sustained : completed;
  if (decayStart < maxTurn && (finalState === 4 || finalState === 5 || finalState === 2)) {
    segments.push({ startTurn: decayStart, endTurn: maxTurn, phase: "decaying" });
  }
  return segments;
};

/** End turn for a record (visual extent) */
const recordEndTurn = (r, maxTurn) => {
  if (r.turn_completed == null) return maxTurn;
  return Math.min(r.turn_completed + (r.turns_sustained ?? 0) + 2, maxTurn);
};

// ─── Sticky cell style helper ───
const stickyLeft = (bg, zIndex = 3) => ({
  position: "sticky",
  left: 0,
  zIndex,
  background: bg,
});

// ─── SVG Action Bar (expanded view) ───

const ActionBarSVG = ({
  record, startTurn, endTurn, minTurn, maxTurn,
  ontology, actorColor, onClick, isSelected,
}) => {
  const salience = record.current_signal_salience ?? 1.0;
  const name = getActionName(record.coa_id, ontology);

  const leftOffset = (startTurn - minTurn) * TURN_WIDTH;
  const span = Math.max(1, endTurn - startTurn + 1);
  const totalWidth = span * TURN_WIDTH;
  const midY = LANE_HEIGHT / 2;
  const segments = inferLifecycleSegments(record, maxTurn);
  const opacity = 0.5 + salience * 0.5;
  const stateLabels = { 0: "Initiated", 1: "In Progress", 2: "Completed", 3: "Sustaining", 4: "Decaying", 5: "Expired" };
  const turnToX = (turn) => (turn - startTurn) * TURN_WIDTH;

  return (
    <div
      style={{
        position: "absolute", left: leftOffset, top: 0,
        width: totalWidth, height: LANE_HEIGHT,
        cursor: "pointer",
        outline: isSelected ? "2px solid var(--accent)" : "none",
        outlineOffset: 1, borderRadius: 3,
      }}
      onClick={() => onClick?.(record)}
      title={[
        name,
        `State: ${stateLabels[record.lifecycle_state] || "Unknown"}`,
        `Turns: ${startTurn}→${endTurn === maxTurn ? "..." : endTurn}`,
        `Salience: ${salience.toFixed(2)}`,
        record.turns_sustained ? `Sustained: ${record.turns_sustained} turns` : "",
      ].filter(Boolean).join("\n")}
    >
      <svg width={totalWidth} height={LANE_HEIGHT}
        viewBox={`0 0 ${totalWidth} ${LANE_HEIGHT}`}
        style={{ display: "block", overflow: "visible", opacity }}>
        {segments.map((seg, idx) => {
          const x1 = turnToX(seg.startTurn) + (idx === 0 ? 6 : 0);
          const x2 = turnToX(seg.endTurn + 1) - (idx === segments.length - 1 ? 2 : 0);
          const segWidth = Math.max(4, x2 - x1);
          const barH = 10;

          if (seg.phase === "in_progress") {
            return (
              <g key={idx}>
                <circle cx={turnToX(seg.startTurn) + 3} cy={midY} r={4}
                  fill={actorColor} stroke="var(--bg-card)" strokeWidth={1} />
                {segWidth > 10 && (
                  <line x1={turnToX(seg.startTurn) + 8} y1={midY} x2={x2} y2={midY}
                    stroke={actorColor} strokeWidth={3}
                    strokeDasharray="8 5" strokeLinecap="round" />
                )}
              </g>
            );
          }
          if (seg.phase === "sustaining") {
            return (
              <rect key={idx} x={x1} y={midY - barH / 2}
                width={segWidth} height={barH} rx={2}
                fill={actorColor} opacity={0.85} />
            );
          }
          if (seg.phase === "decaying") {
            return (
              <polygon key={idx}
                points={[
                  `${x1},${midY - barH / 2}`, `${x2},${midY - 1}`,
                  `${x2},${midY + 1}`, `${x1},${midY + barH / 2}`,
                ].join(" ")}
                fill={actorColor} opacity={0.45} />
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
};

// ─── Density Band (collapsed view) ───

const DensityBand = ({ records, actorId, minTurn, maxTurn, totalTurns, ontology, onRecordClick }) => {
  const gridWidth = totalTurns * TURN_WIDTH;
  const hex = ACTOR_HEX[actorId] || "#58a6ff";
  const h = DENSITY_BAND_HEIGHT;

  const densityData = useMemo(() => {
    const data = [];
    let maxDensity = 0;
    for (let t = minTurn; t <= maxTurn; t++) {
      let count = 0;
      for (const r of records) {
        const start = r.turn_initiated ?? 0;
        const end = recordEndTurn(r, maxTurn);
        if (t >= start && t <= end) count++;
      }
      if (count > maxDensity) maxDensity = count;
      data.push({ turn: t, count });
    }
    return { data, maxDensity: Math.max(1, maxDensity) };
  }, [records, minTurn, maxTurn]);

  const { data, maxDensity } = densityData;
  const maxBarH = h - 6;
  const midY = h / 2;

  const topPoints = [];
  const bottomPoints = [];
  for (let i = 0; i < data.length; i++) {
    const x = (i + 0.5) * TURN_WIDTH;
    const fraction = data[i].count / maxDensity;
    const barH = Math.max(2, fraction * maxBarH);
    topPoints.push(`${x},${midY - barH / 2}`);
    bottomPoints.push(`${x},${midY + barH / 2}`);
  }
  const envelopePoints = [...topPoints, ...bottomPoints.reverse()].join(" ");

  const initiations = records.map(r => ({
    turn: r.turn_initiated ?? 0,
    name: getActionName(r.coa_id, ontology),
    record: r,
    salience: r.current_signal_salience ?? 0.5,
  }));

  return (
    <svg width={gridWidth} height={h} style={{ display: "block" }}>
      <polygon points={envelopePoints} fill={hex} opacity={0.3} />
      {(() => {
        const innerTop = [];
        const innerBot = [];
        for (let i = 0; i < data.length; i++) {
          const x = (i + 0.5) * TURN_WIDTH;
          const fraction = data[i].count / maxDensity;
          const barH = Math.max(1, fraction * maxBarH * 0.5);
          innerTop.push(`${x},${midY - barH / 2}`);
          innerBot.push(`${x},${midY + barH / 2}`);
        }
        return (
          <polygon
            points={[...innerTop, ...innerBot.reverse()].join(" ")}
            fill={hex} opacity={0.2}
          />
        );
      })()}
      {initiations.map((init, idx) => {
        const x = (init.turn - minTurn + 0.5) * TURN_WIDTH;
        return (
          <g key={idx} style={{ cursor: "pointer" }}
            onClick={() => onRecordClick?.(init.record)}>
            <title>{init.name} (T{init.turn})</title>
            <circle cx={x} cy={midY} r={3.5}
              fill={hex} stroke="var(--bg-card)" strokeWidth={1.2}
              opacity={0.5 + init.salience * 0.5} />
          </g>
        );
      })}
    </svg>
  );
};

// ─── DIME Domain Lane ───

const DIMELane = ({
  domainKey, domainLabel, records, actorId, actorColor,
  ontology, minTurn, maxTurn, totalTurns, currentTurn,
  onRecordClick, selectedRecordId, bgColor,
}) => {
  const [expanded, setExpanded] = useState(false);
  const gridWidth = totalTurns * TURN_WIDTH;

  // Stack records into rows for expanded view
  const stackedRows = useMemo(() => {
    const rows = [];
    const byStart = [...records].sort((a, b) => (a.turn_initiated ?? 0) - (b.turn_initiated ?? 0));
    for (const record of byStart) {
      const start = record.turn_initiated ?? 0;
      const end = recordEndTurn(record, maxTurn);
      let placed = false;
      for (const row of rows) {
        const overlaps = row.some(r => {
          const rStart = r.turn_initiated ?? 0;
          const rEnd = recordEndTurn(r, maxTurn);
          return start <= rEnd && end >= rStart;
        });
        if (!overlaps) { row.push(record); placed = true; break; }
      }
      if (!placed) rows.push([record]);
    }
    return rows;
  }, [records, maxTurn]);

  if (records.length === 0) return null;

  const contentHeight = expanded
    ? stackedRows.length * (LANE_HEIGHT + LANE_PADDING)
    : DENSITY_BAND_HEIGHT;

  return (
    <div style={{ borderBottom: "1px solid var(--border)", opacity: 0.97 }}>
      {/* Domain header row — full width, label portion is sticky */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center",
          height: DOMAIN_HEADER_HEIGHT,
          cursor: "pointer", userSelect: "none",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
        }}
      >
        <div style={{
          width: HEADER_WIDTH, flexShrink: 0,
          display: "flex", alignItems: "center",
          gap: 4, paddingLeft: 12,
          height: DOMAIN_HEADER_HEIGHT,
          ...stickyLeft(bgColor || "var(--bg-elevated)", 3),
          borderRight: "1px solid var(--border)",
        }}>
          <span style={{
            fontSize: "8px",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            color: "var(--text-dim)",
          }}>▶</span>
          <span style={{
            fontSize: "9px", fontWeight: 600,
            color: "var(--text-secondary)", letterSpacing: "0.5px",
          }}>{domainKey}</span>
          <span style={{ fontSize: "8px", color: "var(--text-dim)" }}>
            {domainLabel}
          </span>
          {records.length > 0 && (
            <span style={{
              fontSize: "8px", color: "var(--text-dim)",
              background: "var(--bg-card)", padding: "1px 4px",
              borderRadius: 3, marginLeft: 2,
            }}>{records.length}</span>
          )}
        </div>
        {/* Transparent fill so click target extends across full width */}
        <div style={{ flex: 1, height: DOMAIN_HEADER_HEIGHT, background: bgColor || "var(--bg-elevated)" }} />
      </div>

      {/* Content area */}
      <div style={{ display: "flex", minHeight: contentHeight }}>
        {/* ── Sticky left column: action labels (expanded) or empty (collapsed) ── */}
        <div style={{
          width: HEADER_WIDTH, flexShrink: 0,
          ...stickyLeft(bgColor || "var(--bg-card)", 2),
          borderRight: "1px solid var(--border)",
        }}>
          {expanded && stackedRows.map((row, rowIdx) => {
            // Show first record's name for this row (multiple records in
            // a row are non-overlapping — first is a reasonable label)
            const primaryRecord = row[0];
            const name = getActionName(primaryRecord.coa_id, ontology);
            const salience = primaryRecord.current_signal_salience ?? 1.0;
            const isExpired = primaryRecord.lifecycle_state === 5;
            return (
              <div
                key={primaryRecord.record_id ?? rowIdx}
                style={{
                  height: LANE_HEIGHT + LANE_PADDING,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 16,
                  paddingRight: 4,
                  opacity: isExpired ? 0.4 : (0.5 + salience * 0.5),
                }}
                title={row.length > 1
                  ? row.map(r => getActionName(r.coa_id, ontology)).join(", ")
                  : name}
              >
                <span style={{
                  fontSize: "9px",
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: 500,
                }}>
                  {name}
                  {row.length > 1 && (
                    <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>
                      {" "}+{row.length - 1}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Scrollable timeline area ── */}
        <div style={{ position: "relative", width: gridWidth, flexShrink: 0 }}>
          {/* Grid lines — turn boundaries + mid-turn event divider */}
          {Array.from({ length: totalTurns }).map((_, i) => (
            <React.Fragment key={i}>
              <div style={{
                position: "absolute",
                left: i * TURN_WIDTH, top: 0, bottom: 0, width: 1,
                background: "var(--border)", opacity: 0.2,
              }} />
              <div style={{
                position: "absolute",
                left: i * TURN_WIDTH + EVENT_COL_WIDTH, top: 0, bottom: 0, width: 1,
                background: "var(--border)", opacity: 0.12,
                borderLeft: "1px dashed var(--border)",
              }} />
            </React.Fragment>
          ))}

          {/* Current turn highlight */}
          {currentTurn >= minTurn && currentTurn <= maxTurn && (
            <div style={{
              position: "absolute",
              left: (currentTurn - minTurn) * TURN_WIDTH,
              top: 0, bottom: 0, width: TURN_WIDTH,
              background: "var(--accent-dim)",
              borderLeft: "2px solid var(--accent)",
              opacity: 0.2, pointerEvents: "none",
            }} />
          )}

          {!expanded ? (
            /* Collapsed: density band */
            <DensityBand
              records={records}
              actorId={actorId}
              minTurn={minTurn}
              maxTurn={maxTurn}
              totalTurns={totalTurns}
              ontology={ontology}
              onRecordClick={onRecordClick}
            />
          ) : (
            /* Expanded: full stacked action bars */
            stackedRows.map((row, rowIdx) =>
              row.map((record) => {
                const start = record.turn_initiated ?? 0;
                const end = recordEndTurn(record, maxTurn);
                return (
                  <div key={record.record_id} style={{
                    position: "absolute",
                    top: rowIdx * (LANE_HEIGHT + LANE_PADDING),
                    left: 0, right: 0, height: LANE_HEIGHT,
                  }}>
                    <ActionBarSVG
                      record={record} startTurn={start} endTurn={end}
                      minTurn={minTurn} maxTurn={maxTurn}
                      ontology={ontology} actorColor={actorColor}
                      onClick={onRecordClick}
                      isSelected={selectedRecordId === record.record_id}
                    />
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Sub-components ───

const TurnHeader = ({ turn, minTurn }) => {
  const eventBase = (turn - minTurn) * 2;
  return (
    <div style={{
      width: TURN_WIDTH, flexShrink: 0,
      borderLeft: "1px solid var(--border)",
      display: "flex", flexDirection: "column", alignItems: "stretch",
    }}>
      <div style={{
        textAlign: "center", fontSize: "9px", fontWeight: 600,
        color: "var(--text-dim)", padding: "2px 0 0",
      }}>T{turn}</div>
      <div style={{ display: "flex" }}>
        <div style={{
          flex: 1, textAlign: "center", fontSize: "7px",
          color: "var(--text-dim)", opacity: 0.6, padding: "1px 0 2px",
          borderRight: "1px dashed var(--border)",
        }}>e{eventBase + 1}</div>
        <div style={{
          flex: 1, textAlign: "center", fontSize: "7px",
          color: "var(--text-dim)", opacity: 0.6, padding: "1px 0 2px",
        }}>e{eventBase + 2}</div>
      </div>
    </div>
  );
};

// ─── Main Component ───

const ActionTimeline = ({
  worldStateTimeline,
  events = [],
  currentTurn = 0,
  actorNames = { 0: "Actor A", 1: "Actor B" },
  ontology,
  temporalProfiles,
  onRecordClick,
  selectedRecordId,
  actionNames,
}) => {
  const mergedOntology = useMemo(() => {
    if (!actionNames && !ontology) return null;
    return { ...ontology, actionNames: actionNames || ontology?.actions || [] };
  }, [ontology, actionNames]);

  const { allRecords, minTurn, maxTurn } = useMemo(() => {
    const raw = extractRecords(worldStateTimeline);
    const seen = new Set();
    const all = [];
    for (const r of raw) {
      const id = r.record_id;
      if (id !== undefined && seen.has(id)) continue;
      if (id !== undefined) seen.add(id);
      all.push(r);
    }
    let min = 0;
    let max = currentTurn;
    for (const r of all) {
      if (r.turn_initiated != null && r.turn_initiated < min) min = r.turn_initiated;
      const end = recordEndTurn(r, max);
      if (end > max) max = end;
    }
    return { allRecords: all, minTurn: min, maxTurn: max };
  }, [worldStateTimeline, currentTurn]);

  const groupedByActorDIME = useMemo(() => {
    const groups = { 0: { D: [], I: [], M: [], E: [] }, 1: { D: [], I: [], M: [], E: [] } };
    for (const record of allRecords) {
      const aid = record.actor_id;
      if (!(aid in groups)) groups[aid] = { D: [], I: [], M: [], E: [] };
      const domain = inferDIME(record.coa_id, mergedOntology);
      groups[aid][domain].push(record);
    }
    return groups;
  }, [allRecords, mergedOntology]);

  const totalTurns = maxTurn - minTurn + 1;

  // ─── Empty States ───
  if (!worldStateTimeline) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "16px", background: "var(--bg-card)", textAlign: "center" }}>
        <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>Run the simulation to see action lifecycles</div>
      </div>
    );
  }
  const records = extractRecords(worldStateTimeline);
  if (!records || records.length === 0) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "16px", background: "var(--bg-card)", textAlign: "center" }}>
        <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>No temporal timeline data available</div>
      </div>
    );
  }

  // Actor section background tints
  const ACTOR_BG = {
    0: "rgba(88, 166, 255, 0.04)",
    1: "rgba(255, 107, 107, 0.04)",
  };
  const ACTOR_BG_SOLID = {
    0: "#0f1117",  // approximate bg-card + blue tint
    1: "#110f14",  // approximate bg-card + red tint
  };

  // ─── Render ───

  const renderActorSection = (actorId) => {
    const actorRecords = allRecords.filter(r => r.actor_id === actorId);
    const color = ACTOR_COLORS[actorId];
    const bgTint = ACTOR_BG[actorId] || "transparent";
    // Solid bg for sticky elements (can't use semi-transparent on sticky)
    const bgSolid = ACTOR_BG_SOLID[actorId] || "var(--bg-card)";

    return (
      <div style={{ borderBottom: actorId === 0 ? "2px solid var(--border)" : "none" }}>
        {/* Actor name banner — sticky left */}
        <div style={{
          display: "flex", alignItems: "center", height: 24,
          background: bgTint, borderBottom: "1px solid var(--border)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            width: HEADER_WIDTH, flexShrink: 0,
            height: 24, paddingLeft: 8,
            ...stickyLeft(bgSolid, 3),
            borderRight: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color, letterSpacing: "0.3px" }}>
              {actorNames[actorId] || `Actor ${actorId === 0 ? "A" : "B"}`}
            </span>
            <span style={{ fontSize: "8px", color: "var(--text-dim)" }}>
              {actorRecords.length} actions
            </span>
          </div>
        </div>
        {DIME_DOMAINS.map(({ key, label }) => (
          <DIMELane
            key={`a${actorId}-${key}`}
            domainKey={key}
            domainLabel={label}
            records={groupedByActorDIME[actorId]?.[key] || []}
            actorId={actorId}
            actorColor={color}
            ontology={mergedOntology}
            minTurn={minTurn}
            maxTurn={maxTurn}
            totalTurns={totalTurns}
            currentTurn={currentTurn}
            onRecordClick={onRecordClick}
            selectedRecordId={selectedRecordId}
            bgColor={bgSolid}
          />
        ))}
      </div>
    );
  };

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 6,
      background: "var(--bg-card)", minWidth: "max-content",
    }}>
      {/* Turn headers — sticky top + left corner is sticky both axes */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "4px 0", borderBottom: "1px solid var(--border)",
        background: "var(--bg-elevated)", position: "sticky", top: 0, zIndex: 5,
      }}>
        <div style={{
          width: HEADER_WIDTH, flexShrink: 0,
          fontSize: "9px", textTransform: "uppercase", letterSpacing: "1px",
          color: "var(--text-dim)", fontWeight: 600, paddingLeft: 8,
          display: "flex", alignItems: "center", height: "100%",
          ...stickyLeft("var(--bg-elevated)", 6),
          borderRight: "1px solid var(--border)",
        }}>Actor</div>
        <div style={{ display: "flex" }}>
          {Array.from({ length: totalTurns }).map((_, i) => (
            <TurnHeader key={i} turn={minTurn + i} minTurn={minTurn} />
          ))}
        </div>
      </div>

      {/* Body — scroll handled by parent container */}
      <div>
        {renderActorSection(0)}
        {renderActorSection(1)}
      </div>

      {/* Legend */}
      <div style={{
        borderTop: "1px solid var(--border)", padding: "5px 12px",
        display: "flex", flexWrap: "wrap", gap: 12,
        fontSize: "8px", color: "var(--text-secondary)", background: "var(--bg-elevated)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="3.5" fill="var(--text-secondary)" stroke="var(--bg-card)" strokeWidth="1" />
          </svg>
          Initiated
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <svg width="20" height="10" viewBox="0 0 20 10">
            <line x1="0" y1="5" x2="20" y2="5" stroke="var(--text-secondary)" strokeWidth="2.5" strokeDasharray="4 3" strokeLinecap="round" />
          </svg>
          In progress
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <svg width="20" height="10" viewBox="0 0 20 10">
            <rect x="0" y="2" width="20" height="6" rx="1.5" fill="var(--text-secondary)" opacity="0.7" />
          </svg>
          Sustaining
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <svg width="20" height="10" viewBox="0 0 20 10">
            <polygon points="0,2 20,4 20,6 0,8" fill="var(--text-secondary)" opacity="0.4" />
          </svg>
          Decaying
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <svg width="16" height="10" viewBox="0 0 16 10">
            <rect x="0" y="2" width="16" height="6" rx="3" fill="var(--text-secondary)" opacity="0.25" />
            <circle cx="5" cy="5" r="2" fill="var(--text-secondary)" opacity="0.6" />
            <circle cx="11" cy="5" r="2" fill="var(--text-secondary)" opacity="0.6" />
          </svg>
          Density band (collapsed)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: "auto", color: "var(--text-dim)" }}>
          Click domain to expand
        </span>
      </div>
    </div>
  );
};

export default ActionTimeline;
