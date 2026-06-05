import React, { useMemo, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/**
 * GoalLedgerChart - Interactive cross-turn Goal Ledger trajectory visualization
 *
 * Phase 2 Feature: Displays how each goal's cumulative strategic position evolves
 * over the course of a simulation. The Goal Ledger replaces the single-turn
 * discrepancy calculation with a persistent, decaying memory of strategic impacts.
 *
 * Features:
 * - Shows top N most impacted goals by default (avoids clutter)
 * - Clickable goal list to toggle any goal on/off
 * - Per-actor tabs (each actor has their own Goal Ledger)
 * - Compact card view + expanded view with side-panel goal list
 * - Info tooltip explaining what the ledger represents
 */

// Color palette for goal lines — distinct, colorblind-friendly
const GOAL_COLORS = [
  "#e63946", // red
  "#457b9d", // steel blue
  "#2a9d8f", // teal
  "#e9c46a", // amber
  "#264653", // dark teal
  "#f4a261", // sandy
  "#6a4c93", // purple
  "#1982c4", // blue
  "#8ac926", // yellow-green
  "#ff595e", // coral
  "#6d6875", // mauve
  "#b5838d", // rose
];

const DEFAULT_VISIBLE_COUNT = 5;

const LEDGER_EXPLANATION =
  "The Goal Ledger tracks each actor's cumulative strategic position across " +
  "all objectives over the course of the simulation, preserving the impact " +
  "of past actions. Highly irreversible actions persist longer while " +
  "reversible ones decay over time.\n\n" +
  "Values represent net strategic pressure on each goal:\n" +
  "  Negative = accumulated deterioration (threats outweigh gains)\n" +
  "  Positive = accumulated improvement (gains outweigh threats)\n" +
  "  Zero = neutral or fully decayed";

/**
 * Info icon with hover tooltip — uses fixed positioning so it appears
 * beside the icon without overlaying the chart content.
 */
const InfoPopout = ({ text }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const iconRef = React.useRef(null);

  const handleEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 8, left: rect.right + 8 });
    }
    setShow(true);
  };

  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: "0.25rem" }}>
      <span
        ref={iconRef}
        style={{ cursor: "help", color: "var(--text-dim)" }}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        <svg
          style={{ width: "1rem", height: "1rem", display: "inline", verticalAlign: "middle" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" strokeWidth="2" />
          <path strokeWidth="2" d="M12 16v-4m0-4h.01" />
        </svg>
      </span>
      {show && (
        <div
          style={{
            position: "fixed",
            zIndex: 100,
            width: "18rem",
            padding: "0.75rem",
            fontSize: "0.75rem",
            backgroundColor: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-light)",
            borderRadius: "0.5rem",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.3)",
            whiteSpace: "pre-line",
            transform: "translateY(-100%)",
            top: pos.top,
            left: pos.left,
            fontFamily: "var(--font-sans)",
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
};

/**
 * Extract Goal Ledger data from an array of events for a specific actor.
 */
const processGoalLedgerData = (events, actorId, goalNames) => {
  if (!events || events.length === 0 || !goalNames || goalNames.length === 0) {
    return { chartData: [], goalRankings: [] };
  }

  const numGoals = goalNames.length;
  let latestLedger = new Array(numGoals).fill(0);
  const chartData = [];
  const maxAbsPerGoal = new Array(numGoals).fill(0);

  events.forEach((event, idx) => {
    const eventActorId = event?.acting_actor_id;
    const goalLedger = event?.["Goal-Ledger"];

    if (eventActorId === actorId && goalLedger) {
      for (let g = 0; g < numGoals; g++) {
        let val = 0;
        if (Array.isArray(goalLedger[g])) {
          val = goalLedger[g][0] ?? 0;
        } else if (typeof goalLedger[g] === "number") {
          val = goalLedger[g];
        }
        latestLedger[g] = val;
        maxAbsPerGoal[g] = Math.max(maxAbsPerGoal[g], Math.abs(val));
      }
    }

    const point = {
      turn: idx + 1,
      eventIndex: idx,
      actingActorId: eventActorId,
    };
    for (let g = 0; g < numGoals; g++) {
      point[`goal_${g}`] = latestLedger[g];
    }
    chartData.push(point);
  });

  const goalRankings = goalNames
    .map((name, idx) => ({
      index: idx,
      name,
      maxAbs: maxAbsPerGoal[idx],
      currentValue: latestLedger[idx],
    }))
    .sort((a, b) => b.maxAbs - a.maxAbs);

  return { chartData, goalRankings };
};

/**
 * The line chart portion — shared between compact and expanded views.
 */
const LedgerLineChart = ({ chartData, goalNames, activeGoalIndices, handleEventSelect, height, isExpanded }) => (
  <ResponsiveContainer width="100%" height={height}>
    <LineChart
      data={chartData}
      margin={{ top: 5, right: 10, left: isExpanded ? 10 : -20, bottom: 5 }}
    >
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
      <XAxis
        dataKey="turn"
        tick={{ fontSize: isExpanded ? 12 : 10, fill: "var(--text-dim)" }}
        stroke="var(--text-dim)"
        label={isExpanded ? { value: "Event", position: "bottom", fontSize: 12, fill: "var(--text-secondary)" } : undefined}
      />
      <YAxis
        tick={{ fontSize: isExpanded ? 12 : 10, fill: "var(--text-dim)" }}
        stroke="var(--text-dim)"
        width={isExpanded ? 50 : 40}
      />
      {/* Only show hover tooltip in expanded view — too distracting at compact size */}
      {isExpanded && (
        <Tooltip
          contentStyle={{
            fontSize: 11,
            padding: "6px 10px",
            maxHeight: 200,
            overflow: "auto",
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-light)",
            borderRadius: "0.375rem",
            color: "var(--text-primary)",
          }}
          itemStyle={{ color: "var(--text-primary)" }}
          labelStyle={{ color: "var(--text-secondary)" }}
          formatter={(value, name) => {
            const idx = parseInt(name.replace("goal_", ""), 10);
            const label = goalNames[idx] || name;
            return [typeof value === "number" ? value.toFixed(1) : value, label];
          }}
          labelFormatter={(label) => `Event ${label}`}
        />
      )}
      <ReferenceLine y={0} stroke="var(--text-dim)" strokeDasharray="3 3" />

      {goalNames.map((_, gIdx) => {
        if (!activeGoalIndices.has(gIdx)) return null;
        return (
          <Line
            key={`goal_${gIdx}`}
            type="monotone"
            dataKey={`goal_${gIdx}`}
            stroke={GOAL_COLORS[gIdx % GOAL_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{
              r: 4,
              cursor: "pointer",
              onClick: (_, payload) => {
                if (payload?.payload?.eventIndex !== undefined) {
                  handleEventSelect(payload.payload.eventIndex);
                }
              },
            }}
            connectNulls
          />
        );
      })}
    </LineChart>
  </ResponsiveContainer>
);

/**
 * Goal list item — clickable row with color indicator, name, and current value.
 */
const GoalListItem = ({ goal, isVisible, isExpanded, onToggle }) => {
  const color = GOAL_COLORS[goal.index % GOAL_COLORS.length];
  const val = goal.currentValue;
  const pressureLabel = val < -0.5 ? "High pressure" : val < -0.1 ? "Some pressure" : val > 0.1 ? "Improving" : "Neutral";

  if (isExpanded) {
    // Expanded: full row with name, pressure label, value
    return (
      <button
        onClick={() => onToggle(goal.index)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          width: "100%",
          textAlign: "left",
          padding: "0.25rem 0.5rem",
          borderRadius: "0.25rem",
          fontSize: "0.75rem",
          transition: "all 150ms",
          backgroundColor: isVisible ? "var(--bg-card)" : "var(--bg-main)",
          color: isVisible ? "var(--text-primary)" : "var(--text-dim)",
          border: isVisible ? "1px solid var(--border)" : "1px solid transparent",
          boxShadow: isVisible ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
        }}
      >
        <span
          style={{
            width: "0.625rem",
            height: "0.625rem",
            borderRadius: "9999px",
            flexShrink: 0,
            backgroundColor: isVisible ? color : "var(--text-dim)",
          }}
        />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={goal.name}>{goal.name}</span>
        <span style={{
          fontSize: "10px",
          color: val < -0.1 ? "var(--red)" : val > 0.1 ? "var(--green)" : "var(--text-dim)",
        }}>
          {pressureLabel}
        </span>
        <span style={{
          fontFamily: "var(--font-mono)",
          width: "2.5rem",
          textAlign: "right",
          color: val < 0 ? "var(--red)" : val > 0 ? "var(--green)" : "var(--text-dim)",
        }}>
          {val.toFixed(1)}
        </span>
      </button>
    );
  }

  // Compact: chip style
  return (
    <button
      onClick={() => onToggle(goal.index)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "10px",
        padding: "0.125rem 0.375rem",
        borderRadius: "0.25rem",
        transition: "all 150ms",
        border: isVisible ? "1px solid var(--border)" : "1px solid transparent",
        backgroundColor: isVisible ? "var(--bg-card)" : "var(--bg-main)",
        color: isVisible ? "var(--text-primary)" : "var(--text-dim)",
        boxShadow: isVisible ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
      }}
      title={`${goal.name}: ${pressureLabel} (${val.toFixed(1)})`}
    >
      <span
        style={{
          display: "inline-block",
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "9999px",
          flexShrink: 0,
          backgroundColor: isVisible ? color : "var(--text-dim)",
        }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>{goal.name}</span>
      <span style={{
        fontFamily: "var(--font-mono)",
        color: val < 0 ? "var(--red)" : val > 0 ? "var(--green)" : "var(--text-dim)",
      }}>
        {val.toFixed(1)}
      </span>
    </button>
  );
};


const GoalLedgerChart = ({
  allEvents = [],
  ontology,
  onEventSelect,
  selectedEventIndex,
  actorAName = "Actor A",
  actorBName = "Actor B",
  isExpanded = false,
  onExpand,
}) => {
  const [selectedActorId, setSelectedActorId] = useState(0);
  const [visibleGoals, setVisibleGoals] = useState(null);

  const goalNames = ontology?.objectives || [];

  const { chartData, goalRankings } = useMemo(
    () => processGoalLedgerData(allEvents, selectedActorId, goalNames),
    [allEvents, selectedActorId, goalNames]
  );

  const activeGoalIndices = useMemo(() => {
    if (visibleGoals !== null) return visibleGoals;
    return new Set(
      goalRankings.slice(0, DEFAULT_VISIBLE_COUNT).map((g) => g.index)
    );
  }, [visibleGoals, goalRankings]);

  const toggleGoal = useCallback(
    (goalIndex) => {
      setVisibleGoals((prev) => {
        const current = prev !== null
          ? new Set(prev)
          : new Set(goalRankings.slice(0, DEFAULT_VISIBLE_COUNT).map((g) => g.index));
        if (current.has(goalIndex)) {
          current.delete(goalIndex);
        } else {
          current.add(goalIndex);
        }
        return current;
      });
    },
    [goalRankings]
  );

  const handleEventSelect = useCallback(
    (eventIndex) => {
      if (onEventSelect) onEventSelect(eventIndex);
    },
    [onEventSelect]
  );

  const hasLedgerData = allEvents.some((e) => e?.["Goal-Ledger"]);

  if (!hasLedgerData) {
    return (
      <div style={{
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        padding: "0.75rem",
        backgroundColor: "var(--bg-card)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        fontFamily: "var(--font-sans)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h4 style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-secondary)" }}>
            Goal Ledger
            <InfoPopout text={LEDGER_EXPLANATION} />
          </h4>
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", textAlign: "center", padding: "1rem 0" }}>
          Goal Ledger data not available (requires Phase 2 backend)
        </div>
      </div>
    );
  }

  // ── Actor tabs (shared between compact & expanded) ──
  const actorTabs = (
    <div style={{ display: "flex", gap: "0.25rem" }}>
      <button
        onClick={() => { setSelectedActorId(0); setVisibleGoals(null); }}
        style={{
          fontSize: "0.75rem",
          padding: "0.125rem 0.5rem",
          borderRadius: "0.25rem",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          backgroundColor: selectedActorId === 0 ? "var(--blue-dim)" : "transparent",
          color: selectedActorId === 0 ? "var(--blue)" : "var(--text-secondary)",
          fontWeight: selectedActorId === 0 ? 500 : 400,
        }}
      >
        {actorAName}
      </button>
      <button
        onClick={() => { setSelectedActorId(1); setVisibleGoals(null); }}
        style={{
          fontSize: "0.75rem",
          padding: "0.125rem 0.5rem",
          borderRadius: "0.25rem",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          backgroundColor: selectedActorId === 1 ? "var(--red-dim)" : "transparent",
          color: selectedActorId === 1 ? "var(--red)" : "var(--text-secondary)",
          fontWeight: selectedActorId === 1 ? 500 : 400,
        }}
      >
        {actorBName}
      </button>
    </div>
  );

  // ══════════════════════════════════════════════════════
  // EXPANDED VIEW — side-by-side: goal list | chart
  // ══════════════════════════════════════════════════════
  if (isExpanded) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontFamily: "var(--font-sans)" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h4 style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-secondary)" }}>
            Goal Ledger
            <InfoPopout text={LEDGER_EXPLANATION} />
          </h4>
          {actorTabs}
        </div>

        {/* Two-column layout: goal list left, chart right */}
        <div style={{ display: "flex", gap: "1rem" }}>
          {/* Left column — scrollable objective list */}
          <div style={{ width: "18rem", flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "380px", overflowY: "auto", paddingRight: "0.25rem" }}>
            <div style={{
              fontSize: "10px",
              color: "var(--text-dim)",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.25rem",
              padding: "0 0.5rem",
            }}>
              Objectives (click to toggle)
            </div>
            {goalRankings.map((goal) => (
              <GoalListItem
                key={goal.index}
                goal={goal}
                isVisible={activeGoalIndices.has(goal.index)}
                isExpanded={true}
                onToggle={toggleGoal}
              />
            ))}
          </div>

          {/* Right — chart fills remaining space */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <LedgerLineChart
              chartData={chartData}
              goalNames={goalNames}
              activeGoalIndices={activeGoalIndices}
              handleEventSelect={handleEventSelect}
              height={370}
              isExpanded={true}
            />
          </div>
        </div>

        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", textAlign: "center" }}>
          Values show net strategic pressure. Negative = deterioration, Positive = improvement.
        </p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // COMPACT VIEW — small card matching other dashboard charts
  // ══════════════════════════════════════════════════════
  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      padding: "0.75rem",
      backgroundColor: "var(--bg-card)",
      boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
      fontFamily: "var(--font-sans)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h4 style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-secondary)" }}>
            Goal Ledger
            <InfoPopout text={LEDGER_EXPLANATION} />
          </h4>
          {actorTabs}
        </div>
        {onExpand && (
          <button
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            style={{
              fontSize: "10px",
              color: "var(--text-secondary)",
              padding: "0.25rem 0.5rem",
              borderRadius: "0.25rem",
              border: "1px solid var(--border)",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              transition: "all 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--purple)";
              e.currentTarget.style.borderColor = "var(--purple)";
              e.currentTarget.style.backgroundColor = "var(--purple-dim)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-secondary)";
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            ⤢ Expand
          </button>
        )}
      </div>

      {/* Chart */}
      <LedgerLineChart
        chartData={chartData}
        goalNames={goalNames}
        activeGoalIndices={activeGoalIndices}
        handleEventSelect={handleEventSelect}
        height={160}
        isExpanded={false}
      />

      {/* Compact goal chips */}
      <div style={{ marginTop: "0.5rem", maxHeight: "6rem", overflowY: "auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
          {goalRankings.map((goal) => (
            <GoalListItem
              key={goal.index}
              goal={goal}
              isVisible={activeGoalIndices.has(goal.index)}
              isExpanded={false}
              onToggle={toggleGoal}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default GoalLedgerChart;
