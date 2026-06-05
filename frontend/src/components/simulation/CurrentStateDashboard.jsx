import React, { useMemo, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
} from "recharts";
import GoalLedgerChart from "./GoalLedgerChart";

/**
 * CurrentStateDashboard - Display simulation status over time with line charts
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Shows line charts tracking:
 * - Problem Score (both actors)
 * - Culmination Index (both actors)
 * - Escalation Level (max severity over time)
 *
 * Features:
 * - Click on any chart to enlarge it in a modal
 * - Click on data points to select that event in the timeline
 * - Supports counterfactual comparison with dashed lines
 */

// Actor colors — match the blue/red used throughout the dark-theme UI
const ACTOR_COLORS = {
  0: "#58a6ff", // blue for Actor A (var(--blue))
  1: "#ff6b6b", // red for Actor B (var(--red))
};

// Counterfactual colors (muted versions)
const CF_ACTOR_COLORS = {
  0: "#2d5a8e", // muted blue for Actor A counterfactual
  1: "#8e3a3a", // muted red for Actor B counterfactual
};

// Custom dot renderer - clickable and only shows if this actor acted
const CustomDot = ({ cx, cy, payload, actorId, color, isCounterfactual = false, onEventSelect, isActive = false }) => {
  if (payload?.actingActorId !== actorId) return null;
  if (cx === undefined || cy === undefined) return null;

  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onEventSelect && payload?.eventIndex !== undefined) {
      onEventSelect(payload.eventIndex);
    }
  };

  const radius = isActive ? 4.5 : 3;

  if (isCounterfactual) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="#16161a"
        stroke={color}
        strokeWidth={1.5}
        style={{ cursor: 'pointer', pointerEvents: 'all' }}
        onClick={handleClick}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={color}
      stroke="#16161a"
      strokeWidth={1.5}
      style={{ cursor: 'pointer', pointerEvents: 'all' }}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
};

// Active dot renderer - same as CustomDot but for hover state
const ActiveDot = ({ cx, cy, payload, actorId, color, isCounterfactual = false, onEventSelect }) => {
  return (
    <CustomDot
      cx={cx}
      cy={cy}
      payload={payload}
      actorId={actorId}
      color={color}
      isCounterfactual={isCounterfactual}
      onEventSelect={onEventSelect}
      isActive={true}
    />
  );
};

const MetricChart = ({
  title,
  data,
  dataKeyA,
  dataKeyB,
  cfDataKeyA,
  cfDataKeyB,
  actorAName,
  actorBName,
  selectedIndex,
  yDomain,
  formatValue = (v) => v?.toFixed(2),
  height = 120,
  hasCounterfactual = false,
  forkIndex = null,
  onEventSelect,
  onExpand,
  isExpanded = false,
}) => {
  const selectedPoint = selectedIndex !== null && selectedIndex !== undefined
    ? data[selectedIndex]
    : null;

  const chartHeight = isExpanded ? 400 : "100%";

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '10px',
      background: 'var(--bg-card)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
      }}>
        <h4 style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          margin: 0,
          fontFamily: 'var(--font-sans)',
          letterSpacing: '0.3px',
        }}>{title}</h4>
        {!isExpanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            style={{
              fontSize: '9px',
              color: 'var(--text-dim)',
              background: 'transparent',
              padding: '2px 6px',
              borderRadius: '3px',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'color 0.15s, border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--accent)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-dim)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            ⤢ Expand
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: '120px' }}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: isExpanded ? 10 : -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="turn"
            tick={{ fontSize: isExpanded ? 12 : 10, fill: '#6b6b73' }}
            stroke="#6b6b73"
            label={isExpanded ? { value: "Event", position: "bottom", fontSize: 12, fill: '#6b6b73' } : undefined}
          />
          <YAxis
            domain={yDomain || ["auto", "auto"]}
            tick={{ fontSize: isExpanded ? 12 : 10, fill: '#6b6b73' }}
            stroke="#6b6b73"
            width={isExpanded ? 50 : 40}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              padding: "6px 10px",
              background: '#1e1e22',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#e4e4e7',
              borderRadius: '6px',
            }}
            labelStyle={{ color: '#a0a0a8' }}
            itemStyle={{ color: '#e4e4e7' }}
            formatter={(value, name) => [formatValue(value), name]}
            labelFormatter={(label) => `Event ${label}`}
          />

          {/* Fork point indicator */}
          {hasCounterfactual && forkIndex !== null && (
            <ReferenceLine
              x={forkIndex + 1}
              stroke="#a855f7"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{ value: "Fork", position: "top", fontSize: 10, fill: "#a855f7" }}
            />
          )}

          {/* Original Actor A Line — dashed/muted when CF is present */}
          <Line
            type="monotone"
            dataKey={dataKeyA}
            name={hasCounterfactual ? `${actorAName} (Orig)` : actorAName}
            stroke={hasCounterfactual ? CF_ACTOR_COLORS[0] : ACTOR_COLORS[0]}
            strokeWidth={hasCounterfactual ? 1.5 : 2}
            strokeDasharray={hasCounterfactual ? "6 4" : undefined}
            dot={(props) => (
              <CustomDot
                {...props}
                actorId={0}
                color={hasCounterfactual ? CF_ACTOR_COLORS[0] : ACTOR_COLORS[0]}
                isCounterfactual={hasCounterfactual}
                onEventSelect={onEventSelect}
              />
            )}
            activeDot={(props) => (
              <ActiveDot
                {...props}
                actorId={0}
                color={hasCounterfactual ? CF_ACTOR_COLORS[0] : ACTOR_COLORS[0]}
                isCounterfactual={hasCounterfactual}
                onEventSelect={onEventSelect}
              />
            )}
            connectNulls
          />

          {/* Original Actor B Line — dashed/muted when CF is present */}
          <Line
            type="monotone"
            dataKey={dataKeyB}
            name={hasCounterfactual ? `${actorBName} (Orig)` : actorBName}
            stroke={hasCounterfactual ? CF_ACTOR_COLORS[1] : ACTOR_COLORS[1]}
            strokeWidth={hasCounterfactual ? 1.5 : 2}
            strokeDasharray={hasCounterfactual ? "6 4" : undefined}
            dot={(props) => (
              <CustomDot
                {...props}
                actorId={1}
                color={hasCounterfactual ? CF_ACTOR_COLORS[1] : ACTOR_COLORS[1]}
                isCounterfactual={hasCounterfactual}
                onEventSelect={onEventSelect}
              />
            )}
            activeDot={(props) => (
              <ActiveDot
                {...props}
                actorId={1}
                color={hasCounterfactual ? CF_ACTOR_COLORS[1] : ACTOR_COLORS[1]}
                isCounterfactual={hasCounterfactual}
                onEventSelect={onEventSelect}
              />
            )}
            connectNulls
          />

          {/* Counterfactual Actor A Line — solid/bright (primary focus) */}
          {hasCounterfactual && cfDataKeyA && (
            <Line
              type="monotone"
              dataKey={cfDataKeyA}
              name={`${actorAName} (CF)`}
              stroke={ACTOR_COLORS[0]}
              strokeWidth={2}
              dot={(props) => (
                <CustomDot
                  {...props}
                  actorId={0}
                  color={ACTOR_COLORS[0]}
                  onEventSelect={onEventSelect}
                />
              )}
              activeDot={(props) => (
                <ActiveDot
                  {...props}
                  actorId={0}
                  color={ACTOR_COLORS[0]}
                  onEventSelect={onEventSelect}
                />
              )}
              connectNulls
            />
          )}

          {/* Counterfactual Actor B Line — solid/bright (primary focus) */}
          {hasCounterfactual && cfDataKeyB && (
            <Line
              type="monotone"
              dataKey={cfDataKeyB}
              name={`${actorBName} (CF)`}
              stroke={ACTOR_COLORS[1]}
              strokeWidth={2}
              dot={(props) => (
                <CustomDot
                  {...props}
                  actorId={1}
                  color={ACTOR_COLORS[1]}
                  onEventSelect={onEventSelect}
                />
              )}
              activeDot={(props) => (
                <ActiveDot
                  {...props}
                  actorId={1}
                  color={ACTOR_COLORS[1]}
                  onEventSelect={onEventSelect}
                />
              )}
              connectNulls
            />
          )}

          {/* Highlight selected point for Actor A */}
          {selectedPoint && selectedPoint.actingActorId === 0 && selectedPoint[dataKeyA] !== undefined && selectedPoint[dataKeyA] !== null && (
            <ReferenceDot
              x={selectedPoint.turn}
              y={selectedPoint[dataKeyA]}
              r={isExpanded ? 6 : 4.5}
              fill={ACTOR_COLORS[0]}
              stroke="var(--bg-deep)"
              strokeWidth={2}
            />
          )}

          {/* Highlight selected point for Actor B */}
          {selectedPoint && selectedPoint.actingActorId === 1 && selectedPoint[dataKeyB] !== undefined && selectedPoint[dataKeyB] !== null && (
            <ReferenceDot
              x={selectedPoint.turn}
              y={selectedPoint[dataKeyB]}
              r={isExpanded ? 6 : 4.5}
              fill={ACTOR_COLORS[1]}
              stroke="var(--bg-deep)"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      </div>

      {/* Custom Legend */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '10px',
        marginTop: '6px',
        fontSize: isExpanded ? '11px' : '10px',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
      }}>
        {hasCounterfactual ? (
          <>
            {/* When CF present: CF lines are solid/bright, originals are dashed/muted */}
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ACTOR_COLORS[0] }} />
              {actorAName} (CF)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ACTOR_COLORS[1] }} />
              {actorBName} (CF)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', border: '1.5px dashed', borderColor: CF_ACTOR_COLORS[0], backgroundColor: 'transparent' }} />
              {actorAName} (Orig)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', border: '1.5px dashed', borderColor: CF_ACTOR_COLORS[1], backgroundColor: 'transparent' }} />
              {actorBName} (Orig)
            </span>
          </>
        ) : (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ACTOR_COLORS[0] }} />
              {actorAName}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ACTOR_COLORS[1] }} />
              {actorBName}
            </span>
          </>
        )}
      </div>

      {isExpanded && (
        <p style={{
          fontSize: '0.75rem',
          color: 'var(--text-dim)',
          textAlign: 'center',
          marginTop: '0.5rem',
          fontFamily: 'var(--font-sans)',
        }}>
          Click on any data point to select that event in the timeline
        </p>
      )}
    </div>
  );
};

// Expanded chart modal
const ExpandedChartModal = ({ chart, onClose }) => {
  if (!chart) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '2rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-main)',
          borderRadius: '12px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          width: '100%',
          maxWidth: '56rem',
          padding: '20px',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}>
          <h3 style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
            fontFamily: 'var(--font-sans)',
          }}>{chart.title}</h3>
          <button
            onClick={onClose}
            style={{
              color: 'var(--text-dim)',
              fontSize: '18px',
              fontWeight: 'bold',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {chart.content}
      </div>
    </div>
  );
};

const CurrentStateDashboard = ({
  actorA,
  actorB,
  relationshipScore,
  previousRelationshipScore,
  escalationLevel = 0,
  crisisThreshold = 0.8,
  lastActionA,
  lastActionB,
  selectedEvent,
  selectedEventIndex,
  allEvents = [],
  counterfactualData = null,
  ontology,
  onEventSelect, // New prop: callback when user clicks a data point
  hideGoalLedger = false, // Hide goal ledger chart (moved to actor detail bar)
}) => {
  const [expandedChart, setExpandedChart] = useState(null);

  const actorAName = actorA?.actor_name || "Actor A";
  const actorBName = actorB?.actor_name || "Actor B";

  // Handle event selection from chart clicks
  const handleEventSelect = useCallback((eventIndex) => {
    if (onEventSelect) {
      onEventSelect(eventIndex, allEvents[eventIndex]);
    }
  }, [onEventSelect, allEvents]);

  // Process original events into chart data
  const processEventsToChartData = (events) => {
    if (!events || events.length === 0) return [];

    let lastProblemA = null;
    let lastProblemB = null;
    let lastCulmA = null;
    let lastCulmB = null;
    let lastEscA = 0;
    let lastEscB = 0;

    return events.map((event, idx) => {
      const actorId = event?.acting_actor_id;
      const problemScore = event?.total_problem_score ?? event?.["Total-Problem-Score"];
      const culmination = event?.["Culmination-Index"];
      const severity = event?.action_severity ?? event?.["Max-Action-Severity"] ?? 0;

      if (actorId === 0) {
        if (problemScore !== undefined) lastProblemA = problemScore;
        if (culmination !== undefined) lastCulmA = culmination;
        lastEscA = severity;
      } else if (actorId === 1) {
        if (problemScore !== undefined) lastProblemB = problemScore;
        if (culmination !== undefined) lastCulmB = culmination;
        lastEscB = severity;
      }

      return {
        turn: idx + 1,
        eventIndex: idx,
        actingActorId: actorId,
        problemA: lastProblemA,
        problemB: lastProblemB,
        culminationA: lastCulmA,
        culminationB: lastCulmB,
        escalationA: lastEscA,
        escalationB: lastEscB,
      };
    });
  };

  const originalChartData = useMemo(() => processEventsToChartData(allEvents), [allEvents]);

  const mergedChartData = useMemo(() => {
    if (!counterfactualData?.events || counterfactualData.events.length === 0) {
      return originalChartData;
    }

    const cfEvents = counterfactualData.events;
    const forkIndex = counterfactualData.forkIndex;
    const cfChartData = processEventsToChartData(cfEvents);

    return originalChartData.map((originalPoint, idx) => {
      const merged = { ...originalPoint };

      if (idx < forkIndex) {
        merged.cfProblemA = originalPoint.problemA;
        merged.cfProblemB = originalPoint.problemB;
        merged.cfCulminationA = originalPoint.culminationA;
        merged.cfCulminationB = originalPoint.culminationB;
        merged.cfEscalationA = originalPoint.escalationA;
        merged.cfEscalationB = originalPoint.escalationB;
      } else {
        const cfPoint = cfChartData[idx];
        if (cfPoint) {
          merged.cfProblemA = cfPoint.problemA;
          merged.cfProblemB = cfPoint.problemB;
          merged.cfCulminationA = cfPoint.culminationA;
          merged.cfCulminationB = cfPoint.culminationB;
          merged.cfEscalationA = cfPoint.escalationA;
          merged.cfEscalationB = cfPoint.escalationB;
        }
      }

      return merged;
    });
  }, [originalChartData, counterfactualData]);

  const hasCounterfactual = counterfactualData?.events && counterfactualData.events.length > 0;
  const forkIndex = counterfactualData?.forkIndex ?? null;

  // Chart configurations
  const chartConfigs = [
    {
      id: 'problem',
      title: 'Problem Score',
      dataKeyA: 'problemA',
      dataKeyB: 'problemB',
      cfDataKeyA: 'cfProblemA',
      cfDataKeyB: 'cfProblemB',
      yDomain: [0, 'auto'],
      formatValue: (v) => v?.toFixed(2),
    },
    {
      id: 'culmination',
      title: 'Culmination',
      dataKeyA: 'culminationA',
      dataKeyB: 'culminationB',
      cfDataKeyA: 'cfCulminationA',
      cfDataKeyB: 'cfCulminationB',
      yDomain: [0, 1],
      formatValue: (v) => v !== null && v !== undefined ? `${(v * 100).toFixed(0)}%` : 'N/A',
    },
    {
      id: 'escalation',
      title: 'Escalation (Action Severity)',
      dataKeyA: 'escalationA',
      dataKeyB: 'escalationB',
      cfDataKeyA: 'cfEscalationA',
      cfDataKeyB: 'cfEscalationB',
      yDomain: [0, 1],
      formatValue: (v) => v !== null && v !== undefined ? `${(v * 100).toFixed(0)}%` : 'N/A',
    },
  ];

  // Show placeholder when no data
  if (!allEvents || allEvents.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
          fontFamily: 'var(--font-sans)',
        }}>Simulation Status</h3>
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '20px',
          background: 'var(--bg-card)',
          textAlign: 'center',
        }}>
          <p style={{
            color: 'var(--text-dim)',
            margin: 0,
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
          }}>Run the simulation to see status progression.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
          fontFamily: 'var(--font-sans)',
        }}>Simulation Status</h3>
        {hasCounterfactual && (
          <span style={{
            fontSize: '9px',
            background: 'var(--purple-dim)',
            color: 'var(--purple)',
            padding: '2px 6px',
            borderRadius: '3px',
            fontWeight: 500,
            fontFamily: 'var(--font-sans)',
          }}>
            Counterfactual
          </span>
        )}
      </div>

      {/* Charts — stacked vertically */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(1, 1fr)',
        gap: '8px',
      }}>
        {chartConfigs.map((config) => (
          <MetricChart
            key={config.id}
            title={config.title}
            data={mergedChartData}
            dataKeyA={config.dataKeyA}
            dataKeyB={config.dataKeyB}
            cfDataKeyA={hasCounterfactual ? config.cfDataKeyA : null}
            cfDataKeyB={hasCounterfactual ? config.cfDataKeyB : null}
            actorAName={actorAName}
            actorBName={actorBName}
            selectedIndex={selectedEventIndex}
            yDomain={config.yDomain}
            formatValue={config.formatValue}
            hasCounterfactual={hasCounterfactual}
            forkIndex={forkIndex}
            onEventSelect={handleEventSelect}
            onExpand={() => setExpandedChart(config)}
          />
        ))}

        {/* Goal Ledger Trajectory — hidden when in compact mode */}
        {!hideGoalLedger && (
          <GoalLedgerChart
            allEvents={allEvents}
            ontology={ontology}
            onEventSelect={handleEventSelect}
            selectedEventIndex={selectedEventIndex}
            actorAName={actorAName}
            actorBName={actorBName}
            onExpand={() => setExpandedChart({ id: "goalLedger" })}
          />
        )}
      </div>

      {/* Expanded Chart Modal */}
      {expandedChart && (
        <ExpandedChartModal
          chart={{
            title: expandedChart.id === "goalLedger" ? "Goal Ledger" : expandedChart.title,
            content: expandedChart.id === "goalLedger" ? (
              <GoalLedgerChart
                allEvents={allEvents}
                ontology={ontology}
                onEventSelect={handleEventSelect}
                selectedEventIndex={selectedEventIndex}
                actorAName={actorAName}
                actorBName={actorBName}
                isExpanded={true}
              />
            ) : (
              <MetricChart
                title={expandedChart.title}
                data={mergedChartData}
                dataKeyA={expandedChart.dataKeyA}
                dataKeyB={expandedChart.dataKeyB}
                cfDataKeyA={hasCounterfactual ? expandedChart.cfDataKeyA : null}
                cfDataKeyB={hasCounterfactual ? expandedChart.cfDataKeyB : null}
                actorAName={actorAName}
                actorBName={actorBName}
                selectedIndex={selectedEventIndex}
                yDomain={expandedChart.yDomain}
                formatValue={expandedChart.formatValue}
                hasCounterfactual={hasCounterfactual}
                forkIndex={forkIndex}
                onEventSelect={handleEventSelect}
                isExpanded={true}
              />
            ),
          }}
          onClose={() => setExpandedChart(null)}
        />
      )}
    </div>
  );
};

export default CurrentStateDashboard;
