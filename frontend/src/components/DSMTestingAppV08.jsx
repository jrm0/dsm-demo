import React, { useState, useCallback, useEffect, Component } from "react";

// Lightweight error boundary to catch render crashes in new components
class RenderBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: "12px", margin: "8px 0", borderRadius: "6px",
          background: "var(--red-dim)", border: "1px solid var(--red-border)",
          color: "var(--red)", fontSize: "11px",
        }}>
          <strong>Render error:</strong> {this.state.error.message}
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginLeft: 12, background: "none", border: "none", color: "var(--red)", cursor: "pointer", textDecoration: "underline" }}
          >Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Layout Components (v0.8)
import AppShell from "./layout/AppShell";
import ActionDetailSidebar from "./layout/ActionDetailSidebar";
import ParamDetailSidebar from "./layout/ParamDetailSidebar";
import ActorDeepDive from "./layout/ActorDeepDive";

// Setup Components
import SetupWizard from "./setup/SetupWizard";
import GenerateWizard from "./setup/GenerateWizard";

// Simulation Components (reused from existing)
import TimelineView from "./simulation/TimelineView";
import ActionTimeline from "./simulation/ActionTimeline";
import CurrentStateDashboard from "./simulation/CurrentStateDashboard";
import GoalLedgerChart from "./simulation/GoalLedgerChart";
import OverridePanel from "./simulation/OverridePanel";

// Inspector Components (reused from existing)
import EventInspector from "./inspector/EventInspector";

/**
 * DSMTestingAppV08 - v0.8 Testing UI with Three-Panel Architecture
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Replaces the vertical-scroll layout with:
 *   Left Sidebar (nav + action detail)
 *   Main Content (config bar + timeline + event log + deep-dive)
 *
 * Components are slot-based for easy portability.
 */

// Helper to convert time horizon numeric value to label
const getTimeHorizonLabel = (value) => {
  if (value === undefined || value === null) return "Medium";
  if (value <= 1) return "Short";
  if (value >= 3) return "Long";
  return "Medium";
};

const DSMTestingAppV08 = () => {
  // ============ STATE ============

  // Scenario & Configuration
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [selectedRegime, setSelectedRegime] = useState(null);
  const [parameterRegimes, setParameterRegimes] = useState({});
  const [daysPerTurn, setDaysPerTurn] = useState(null); // Turn duration for temporal profile conversion
  const [calibratedDefaults, setCalibratedDefaults] = useState(null); // Sweep-calibrated regimes + archetypes

  // Initial Action Selection
  const [initialActorId, setInitialActorId] = useState(0);
  const [initialActionId, setInitialActionId] = useState(null);

  // Simulation State
  const [simulationId, setSimulationId] = useState(null);
  const [events, setEvents] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);

  // Actor & System State (latest snapshot)
  const [latestActorsData, setLatestActorsData] = useState(null);
  const [latestSystemData, setLatestSystemData] = useState(null);

  // World State Timeline (top-level from state() — not in json_excluded system_data)
  const [worldStateTimeline, setWorldStateTimeline] = useState(null);

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState(null);
  const [ontology, setOntology] = useState(null);
  const [setupExpanded, setSetupExpanded] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeView, setActiveView] = useState("simulation");

  // Selected action(s) in sidebar — array to support multi-action events
  const [selectedActionIds, setSelectedActionIds] = useState([]);
  const [selectedActionActorId, setSelectedActionActorId] = useState(null);

  // Selected parameter in sidebar (during setup)
  const [selectedParamKey, setSelectedParamKey] = useState(null);
  const [selectedParamActorIndex, setSelectedParamActorIndex] = useState(null);

  // Right panel (status charts)
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // Override/Counterfactual State
  const [overridePanelOpen, setOverridePanelOpen] = useState(false);
  const [overrideEventIndex, setOverrideEventIndex] = useState(null);
  const [counterfactualEvents, setCounterfactualEvents] = useState(null);
  const [counterfactualLoading, setCounterfactualLoading] = useState(false);
  const [viewingCounterfactual, setViewingCounterfactual] = useState(false);

  // Derived State
  const maxTurns = scenario?.simulation_config?.max_num_turns || 10;
  const currentActorName = events.length % 2 === 0 ? "Actor A" : "Actor B";
  const selectedEvent = selectedEventIndex !== null ? events[selectedEventIndex] : null;

  // ============ API CALLS ============

  const fetchScenarios = useCallback(async () => {
    try {
      const res = await fetch("/api/scenarios");
      if (!res.ok) throw new Error(`Failed to fetch scenarios: ${res.status}`);
      const data = await res.json();
      setScenarios(data.scenarios || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const fetchScenario = useCallback(async (scenarioId) => {
    if (!scenarioId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scenarios/${encodeURIComponent(scenarioId)}`);
      if (!res.ok) throw new Error(`Failed to fetch scenario: ${res.status}`);
      const data = await res.json();
      setScenario(data.scenario);
      setSelectedScenarioId(scenarioId);
      // Initialize days_per_turn from scenario if present
      setDaysPerTurn(data.scenario?.scenario_config?.days_per_turn ?? null);

      const [ontRes, regimeRes, calibRes] = await Promise.all([
        fetch("/api/ontology"),
        fetch("/api/scenarios/parameter_regimes"),
        fetch("/api/calibrated_defaults"),
      ]);

      if (ontRes.ok) {
        const ontData = await ontRes.json();
        setOntology(ontData.ontology);
      }
      if (regimeRes.ok) {
        const regimeData = await regimeRes.json();
        setParameterRegimes(regimeData.parameter_regimes || {});
      }
      if (calibRes.ok) {
        const calibData = await calibRes.json();
        setCalibratedDefaults(calibData.calibrated_defaults || null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyRegime = useCallback((regimeName) => {
    if (!scenario) return;

    // Prefer calibrated defaults (sweep-derived), fall back to CSV regimes
    const calibRegime = calibratedDefaults?.environment_regimes?.[regimeName];
    const calibBaseline = calibratedDefaults?.baseline?.simulation_parameters;

    setScenario(prev => {
      if (!prev) return prev;
      const newScenario = structuredClone(prev);
      if (!newScenario.simulation_parameters) newScenario.simulation_parameters = {};
      if (!newScenario.scenario_parameters) newScenario.scenario_parameters = {};

      if (calibBaseline) {
        // Apply sweep baseline first (A+B+C consensus)
        Object.assign(newScenario.simulation_parameters, calibBaseline);
      }

      if (calibRegime) {
        // Apply regime overlay (Sweep D)
        Object.assign(newScenario.simulation_parameters, calibRegime.parameters);
      } else if (parameterRegimes[regimeName]) {
        // Fallback: CSV-based regime (dot-path keys)
        const regimeParams = parameterRegimes[regimeName];
        for (const [paramPath, value] of Object.entries(regimeParams)) {
          const keys = paramPath.split(".");
          let obj = newScenario;
          for (let i = 0; i < keys.length - 1; i++) {
            if (obj[keys[i]] === undefined) obj[keys[i]] = {};
            obj = obj[keys[i]];
          }
          obj[keys[keys.length - 1]] = value;
        }
      }

      return newScenario;
    });
    setSelectedRegime(regimeName);
  }, [scenario, parameterRegimes, calibratedDefaults]);

  const handleDaysPerTurnChange = useCallback((value) => {
    setDaysPerTurn(value);
    setScenario(prev => {
      if (!prev) return prev;
      const newScenario = structuredClone(prev);
      if (!newScenario.scenario_config) newScenario.scenario_config = {};
      newScenario.scenario_config.days_per_turn = value;
      return newScenario;
    });
  }, []);

  const updateActorConfig = useCallback((actorId, path, value) => {
    setScenario(prev => {
      if (!prev) return prev;
      const newScenario = structuredClone(prev);
      const actorKey = actorId === 0 ? "actor_a" : "actor_b";
      const keys = path.split(".");
      let obj = newScenario.scenario_config?.[actorKey] || newScenario[actorKey];
      if (!obj) return prev;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
        if (!obj) return prev;
      }
      obj[keys[keys.length - 1]] = value;
      return newScenario;
    });
  }, []);

  // Update a parameter directly on actor_profiles[actorIndex]
  // paramName can be a string (single param) or an object {key: value, ...} for batch updates
  const updateActorProfile = useCallback((actorIndex, paramNameOrBatch, value) => {
    setScenario(prev => {
      if (!prev?.actor_profiles?.[actorIndex]) return prev;
      const newScenario = structuredClone(prev);
      if (typeof paramNameOrBatch === "object" && !Array.isArray(paramNameOrBatch)) {
        // Batch update: paramNameOrBatch is {key: value, key: value, ...}
        Object.assign(newScenario.actor_profiles[actorIndex], paramNameOrBatch);
      } else {
        newScenario.actor_profiles[actorIndex][paramNameOrBatch] = value;
      }
      return newScenario;
    });
  }, []);

  const createSimulation = useCallback(async () => {
    if (!scenario) return null;
    const simScenario = structuredClone(scenario);
    if (initialActionId !== null) {
      simScenario.initial_action_sequence = [{
        actor_id: initialActorId,
        coa_id_list: [initialActionId],
      }];
    }
    const res = await fetch("/api/simulation/new_simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(simScenario),
    });
    if (!res.ok) throw new Error(`Failed to create simulation: ${res.status}`);
    const data = await res.json();
    return data.sim_id;
  }, [scenario, initialActorId, initialActionId]);

  // Shared event extraction logic
  const extractEvents = useCallback((responseData) => {
    const allEvents = [];
    const turns = responseData.data?.turns || [];
    const scenarioConfig = responseData.data?.scenario_config || scenario?.scenario_config || {};
    const actionNameList = scenarioConfig.actions || [];

    turns.forEach((turn, turnIdx) => {
      turn.steps?.forEach((step, stepIdx) => {
        step.events?.forEach((event) => {
          const ed = event.event_data || {};
          const actionSeq = event.resulting_action_sequence || {};
          const coaIds = actionSeq.coa_id_list || [];
          const coaChars = actionSeq.coa_characteristics_list || [];

          const chosenActionNames = coaIds.map(id => {
            const name = actionNameList[id] || `Action ${id}`;
            return typeof name === 'string' ? name.replace(/_/g, ' ') : name;
          });

          const firstActionChars = coaChars[0] || [];
          const severity = Array.isArray(firstActionChars) && firstActionChars[0]
            ? (Array.isArray(firstActionChars[0]) ? firstActionChars[0][0] : firstActionChars[0])
            : 0;

          const relMatrix = step.resulting_system_data?.["Relationship-Score-Matrix"] || [[0,0],[0,0]];
          const relationshipScore = (relMatrix[0]?.[1] + relMatrix[1]?.[0]) / 2;

          allEvents.push({
            event_id: event.event_id,
            turn_id: turn.turn_id,
            step_id: step.step_id,
            turn_index: turnIdx,
            step_index: stepIdx,
            acting_actor_id: event.acting_actor_id,
            action_name: chosenActionNames.join(", ") || "Do Nothing",
            action_ids: coaIds,
            action_severity: severity,
            total_problem_score: ed["Total-Problem-Score"],
            effective_risk_propensity: ed["Effective-Risk-Propensity"],
            relationship_score: relationshipScore,
            action_sequence: actionSeq,
            ...ed,
          });
        });
      });
    });

    return { allEvents, turns };
  }, [scenario]);

  const runEvent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let simId = simulationId;
      if (!simId) {
        simId = await createSimulation();
        setSimulationId(simId);
      }
      const res = await fetch(`/api/simulation/${simId}/run_step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`Failed to run step: ${res.status}`);
      const responseData = await res.json();
      const { allEvents, turns } = extractEvents(responseData);

      setEvents(allEvents);
      setCurrentTurn(turns.length);
      // Collapse setup once simulation starts
      setSetupExpanded(false);

      const lastTurn = turns[turns.length - 1];
      const lastStep = lastTurn?.steps?.[lastTurn.steps.length - 1];
      if (lastStep) {
        setLatestActorsData(lastStep.resulting_actors_data || null);
        setLatestSystemData(lastStep.resulting_system_data || null);
      }
      // Capture top-level WST from state() (not in json_excluded system_data)
      const stateData = responseData.data || {};
      setWorldStateTimeline(stateData.world_state_timeline || null);
      if (responseData.complete) setSimulationComplete(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [simulationId, createSimulation, extractEvents]);

  const runAll = useCallback(async () => {
    setLoading(true);
    setIsRunning(true);
    setError(null);
    try {
      let simId = simulationId;
      if (!simId) {
        simId = await createSimulation();
        setSimulationId(simId);
      }
      const res = await fetch(`/api/simulation/${simId}/run_all_steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`Failed to run simulation: ${res.status}`);
      const responseData = await res.json();
      const { allEvents, turns } = extractEvents(responseData);

      setEvents(allEvents);
      setCurrentTurn(turns.length);
      setSetupExpanded(false);

      const lastTurn = turns[turns.length - 1];
      const lastStep = lastTurn?.steps?.[lastTurn.steps.length - 1];
      if (lastStep) {
        setLatestActorsData(lastStep.resulting_actors_data || null);
        setLatestSystemData(lastStep.resulting_system_data || null);
      }
      // Capture top-level WST from state()
      const stateData = responseData.data || {};
      setWorldStateTimeline(stateData.world_state_timeline || null);
      setSimulationComplete(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setIsRunning(false);
    }
  }, [simulationId, createSimulation, extractEvents]);

  const resetSimulation = useCallback(() => {
    setSimulationId(null);
    setEvents([]);
    setCurrentTurn(0);
    setSimulationComplete(false);
    setSelectedEventIndex(null);
    setError(null);
    setCounterfactualEvents(null);
    setViewingCounterfactual(false);
    setOverridePanelOpen(false);
    setLatestActorsData(null);
    setLatestSystemData(null);
    setWorldStateTimeline(null);
    setOverrideEventIndex(null);
    setSelectedRegime(null);
    setSelectedActionIds([]);
    setSelectedParamKey(null);
    setInspectorOpen(false);
    if (selectedScenarioId) fetchScenario(selectedScenarioId);
  }, [selectedScenarioId, fetchScenario]);

  // Handle param clicks from SetupWizard — show detail in sidebar
  const handleParamSelect = useCallback((paramKey, actorIndex) => {
    setSelectedParamKey(paramKey);
    setSelectedParamActorIndex(actorIndex);
  }, []);

  const handleEventSelect = useCallback((index) => {
    setSelectedEventIndex(index);
    // Auto-select the action in the sidebar
    const event = events[index];
    if (event) {
      const actionIds = event.action_ids || [];
      if (actionIds.length > 0) {
        setSelectedActionIds(actionIds);
        setSelectedActionActorId(event.acting_actor_id);
      }
    }
  }, [events]);

  const handleOverrideRequest = useCallback((index, event) => {
    setSelectedEventIndex(index);
    setOverrideEventIndex(index);
    setOverridePanelOpen(true);
  }, []);

  const handleRunCounterfactual = useCallback(async (eventIndex, actionIds) => {
    if (!simulationId) {
      setError("No simulation to run counterfactual on");
      return;
    }
    const actionIdArray = Array.isArray(actionIds) ? actionIds : [actionIds];
    setCounterfactualLoading(true);
    setError(null);
    try {
      const body = { event_index: eventIndex, action_ids: actionIdArray };
      const res = await fetch(`/api/simulation/${simulationId}/run_counterfactual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let errMsg = `Failed: ${res.status}`;
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch (_) { /* response wasn't JSON */ }
        throw new Error(errMsg);
      }
      const responseData = await res.json();
      const { allEvents: cfEvents } = extractEvents(responseData);

      setCounterfactualEvents({
        forkIndex: eventIndex,
        originalActionIds: responseData.original_action_ids,
        counterfactualActionIds: responseData.counterfactual_action_ids,
        events: cfEvents,
      });
      setViewingCounterfactual(false);
      setSelectedEventIndex(null);
      setOverridePanelOpen(false);
      setOverrideEventIndex(null);
    } catch (err) {
      setError(`Counterfactual failed: ${err.message}`);
    } finally {
      setCounterfactualLoading(false);
    }
  }, [simulationId, extractEvents]);

  // ============ EFFECTS ============

  useEffect(() => { fetchScenarios(); }, [fetchScenarios]);

  // Re-expand setup on reset (when scenario clears)
  useEffect(() => {
    if (!simulationId && events.length === 0) setSetupExpanded(true);
  }, [simulationId, events.length]);

  // Default to "Competitive" environment regime when calibrated defaults arrive
  useEffect(() => {
    if (calibratedDefaults && scenario && !selectedRegime) {
      const regimes = calibratedDefaults.environment_regimes || {};
      const validRegimes = Object.keys(regimes).filter(k => !k.startsWith('_'));
      const defaultRegime = validRegimes.includes("Competitive") ? "Competitive" : validRegimes[0];
      if (defaultRegime) {
        applyRegime(defaultRegime);
      }
    }
  }, [calibratedDefaults, scenario, selectedRegime, applyRegime]);

  // ============ DERIVED DATA ============

  const actorProfiles = scenario?.actor_profiles || [];
  const actorConfigs = scenario?.scenario_config?.actors || [];

  // Extract actor name adaptively: handle both string ("United States") and object ({name: "US"}) formats
  const getActorName = (cfg, profile, fallback) => {
    if (typeof cfg === "string" && cfg) return cfg;
    if (cfg?.name) return cfg.name;
    if (profile?.actor_name) return profile.actor_name;
    return fallback;
  };

  const actorA = actorProfiles[0]
    ? { ...actorProfiles[0], actor_name: getActorName(actorConfigs[0], actorProfiles[0], "Actor A"), actor_role: actorConfigs[0]?.role }
    : null;
  const actorB = actorProfiles[1]
    ? { ...actorProfiles[1], actor_name: getActorName(actorConfigs[1], actorProfiles[1], "Actor B"), actor_role: actorConfigs[1]?.role }
    : null;

  const actionNames = scenario?.scenario_config?.actions || [];
  const coaCharacteristics = scenario?.scenario_parameters?.coa_characteristics_matrix || [];

  const deescFlags = scenario?.scenario_parameters?.coa_deescalation_flag_vector || [];
  // Severity is the first row of characteristics matrix: coa_characteristics_matrix[0][action_id]
  const severities = Array.isArray(coaCharacteristics[0]) ? coaCharacteristics[0] : [];

  // Build temporal profile lookup from scenario_config (keyed by coa_id)
  const temporalProfilesByAction = {};
  (scenario?.scenario_config?.temporal_profiles || []).forEach(tp => {
    if (tp.coa_id != null) temporalProfilesByAction[tp.coa_id] = tp;
  });

  // Support/cost sets live in scenario_config.support_cost_sets (not top-level)
  const supportAndCostSets = scenario?.scenario_config?.support_cost_sets
    || scenario?.support_and_cost_sets || [];

  // Commitment-creating action metadata
  const commitmentCreatingActions = scenario?.scenario_config?.commitment_creating_actions || [];

  // Volatility vector
  const volatilityVector = scenario?.scenario_parameters?.coa_volatility_vector || [];

  // Base cost vector
  const baseCostVector = scenario?.scenario_parameters?.base_cost_vector || [];

  // Action type vector (0=Repeatable, 1=One-Off)
  const actionTypeVector = scenario?.scenario_parameters?.action_type_vector || [];

  // Actor exclusions
  const actorExclusions = actorProfiles.map(ap => ap.excluded_actions || []);

  const actions = actionNames.map((name, idx) => {
    const displayName = typeof name === 'string' ? name.replace(/_/g, ' ') : `Action ${idx}`;
    // Extract characteristics column: coaCharacteristics is [char_type][action_id]
    // We need [char0][idx], [char1][idx], ... [char6][idx] (skip row 7 = legacy PA)
    const NUM_CHARS = 7;
    const charColumn = [];
    for (let c = 0; c < NUM_CHARS; c++) {
      charColumn.push(
        Array.isArray(coaCharacteristics[c]) ? (coaCharacteristics[c][idx] ?? 0) : 0
      );
    }
    return {
      id: idx,
      name: displayName,
      action_name: displayName,
      characteristics: charColumn,
      temporal_profile: temporalProfilesByAction[idx] || {},
      action_type_id: actionTypeVector[idx] ?? 0,
      volatility: volatilityVector[idx] ?? 0,
      base_cost: baseCostVector[idx] ?? 0,
      deesc_flag: deescFlags[idx] ?? 0,
    };
  });

  // Build selected action(s) data for sidebar — supports multi-action events
  const selectedActorColor = selectedActionActorId === 1 ? "var(--red)" : "var(--accent)";

  const selectedActionsWithData = selectedActionIds
    .filter(id => id != null && actions[id])
    .map(actionId => {
      const supportSets = [];
      const costSets = [];
      if (selectedActionActorId != null) {
        const actorScs = supportAndCostSets.filter(s => s.actor_id === selectedActionActorId);
        actorScs.forEach(scs => {
          if (scs.source_coa_id === actionId) {
            if (scs.support_set) supportSets.push(...scs.support_set);
            if (scs.cost_set) costSets.push(...scs.cost_set);
          }
        });
      }
      return {
        action: actions[actionId],
        supportSets,
        costSets,
        commitmentInfo: commitmentCreatingActions.find(c => c.coa_id === actionId) || null,
      };
    });

  // Deep-dive data extraction from selected event
  const actorALatest = events.filter(e => e.acting_actor_id === 0).slice(-1)[0];
  const actorBLatest = events.filter(e => e.acting_actor_id === 1).slice(-1)[0];

  // Pick deep-dive actor based on selected event
  const deepDiveActorId = selectedEvent?.acting_actor_id ?? 0;
  const deepDiveActorEvent = deepDiveActorId === 0 ? actorALatest : actorBLatest;
  const deepDiveActorProfile = deepDiveActorId === 0 ? actorA : actorB;
  const deepDiveActorName = deepDiveActorProfile?.actor_name || (deepDiveActorId === 0 ? "Actor A" : "Actor B");
  const deepDiveActorColor = deepDiveActorId === 0 ? "var(--accent)" : "var(--red)";

  // Extract SPV capability and resolve from latest event data
  const spv = deepDiveActorEvent?.["Self-Profile-Vector"];
  const capability = Array.isArray(spv) ? (Array.isArray(spv[5]) ? spv[5][0] : spv[5]) : null;
  const resolve = Array.isArray(spv) ? (Array.isArray(spv[3]) ? spv[3][0] : spv[3]) : null;

  // Goal ledger from event data
  const goalLedger = deepDiveActorEvent?.["Goal-Ledger"];
  const goalNames = ontology?.goals || scenario?.scenario_config?.goals || [];
  const goals = goalLedger
    ? (Array.isArray(goalLedger) ? goalLedger : []).map((val, i) => ({
        name: (typeof goalNames[i] === "string" ? goalNames[i].replace(/_/g, " ") : `Goal ${i}`),
        discrepancy: Array.isArray(val) ? val[0] : val,
        priority: i + 1,
      }))
    : [];

  // Enriched actors for charts
  const enrichedActorA = actorA ? {
    ...actorA,
    total_problem_score: actorALatest?.total_problem_score ?? 0,
    time_horizon: getTimeHorizonLabel(actorALatest?.["Actor-Time-Horizon"] ?? actorA?.actor_time_horizon),
  } : null;
  const enrichedActorB = actorB ? {
    ...actorB,
    total_problem_score: actorBLatest?.total_problem_score ?? 0,
    time_horizon: getTimeHorizonLabel(actorBLatest?.["Actor-Time-Horizon"] ?? actorB?.actor_time_horizon),
  } : null;

  const relationshipScore = (events.length > 0 ? events[events.length - 1] : null)?.relationship_score ??
    scenario?.scenario_config?.initial_relationship_score ?? 0;

  // Active display events — counterfactual when toggled, original otherwise
  const displayEvents = viewingCounterfactual && counterfactualEvents?.events
    ? counterfactualEvents.events
    : events;

  // ============ RENDER ============

  return (
    <>
      <AppShell
        // View state
        activeView={activeView}
        onActiveViewChange={setActiveView}

        // Config bar
        scenario={scenario ? {
          name: selectedScenarioId?.replace(/_/g, " ") || "Unknown",
          ...scenario,
        } : null}
        regime={selectedRegime}
        actors={[
          actorA && { name: actorA.actor_name },
          actorB && { name: actorB.actor_name },
        ].filter(Boolean)}
        onExpandSetup={() => setSetupExpanded(!setupExpanded)}
        setupExpanded={setupExpanded}

        // Setup overlay — guided wizard
        setupContent={
          <>
            {/* Error display */}
            {error && (
              <div style={{
                background: "var(--red-dim)",
                border: "1px solid var(--red-border)",
                color: "var(--red)",
                padding: "8px 12px",
                borderRadius: "6px",
                margin: "16px 20px 0",
                fontSize: "11px",
                display: "flex",
                justifyContent: "space-between",
              }}>
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}
                >
                  x
                </button>
              </div>
            )}
            <SetupWizard
              scenarios={scenarios}
              selectedScenarioId={selectedScenarioId}
              scenario={scenario}
              onSelectScenario={fetchScenario}
              selectedRegime={selectedRegime}
              onSelectRegime={applyRegime}
              daysPerTurn={daysPerTurn}
              onDaysPerTurnChange={handleDaysPerTurnChange}
              calibratedDefaults={calibratedDefaults}
              actors={[actorA, actorB].filter(Boolean)}
              actorProfiles={actorProfiles}
              goalNames={scenario?.scenario_config?.objectives || scenario?.scenario_config?.goals || []}
              onActorProfileChange={updateActorProfile}
              onParamSelect={handleParamSelect}
              actions={actions}
              initialActorId={initialActorId}
              initialActionId={initialActionId}
              onInitialActorChange={setInitialActorId}
              onInitialActionChange={setInitialActionId}
              deescFlags={deescFlags}
              severities={severities}
              onRunAll={runAll}
              onRunEvent={runEvent}
              loading={loading}
              canRun={!!scenario && initialActionId !== null}
              isRunning={isRunning}
              simulationComplete={simulationComplete}
              currentTurn={currentTurn}
              maxTurns={maxTurns}
              onReset={resetSimulation}
            />
          </>
        }

        // Sidebar content: depends on active view
        sidebarContent={
          activeView === "generate" ? (
            // Generate view sidebar — quick start shortcut
            <div style={{ padding: "12px" }}>
              <div style={{
                fontSize: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--text-dim)",
                marginBottom: "8px",
                padding: "0 4px",
              }}>
                Quick Start
              </div>
              <button
                onClick={() => {
                  setActiveView("simulation");
                  setSetupExpanded(true);
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                  Load Prebuilt
                </div>
                <div style={{ fontSize: "9px", color: "var(--text-dim)", lineHeight: "1.4" }}>
                  Skip to simulation with an existing scenario payload
                </div>
              </button>
            </div>
          ) : setupExpanded ? (
            <ParamDetailSidebar
              paramKey={selectedParamKey}
              actorName={
                selectedParamActorIndex === 0 ? (actorA?.actor_name || "Actor A") :
                selectedParamActorIndex === 1 ? (actorB?.actor_name || "Actor B") : null
              }
              actorColor={
                selectedParamActorIndex === 0 ? "var(--blue)" :
                selectedParamActorIndex === 1 ? "var(--red)" : null
              }
            />
          ) : (
            <ActionDetailSidebar
              selectedActions={selectedActionsWithData}
              actorId={selectedActionActorId}
              actorColor={selectedActorColor}
              ontology={ontology}
              actorNames={[
                actorA?.actor_name || "Actor A",
                actorB?.actor_name || "Actor B",
              ]}
              actorExclusions={actorExclusions}
              actionNames={actionNames}
            />
          )
        }

        // Timeline
        timelineContent={events.length > 0 ? (
          <div style={{ padding: "12px 20px" }}>
            {/* Counterfactual banner */}
            {counterfactualEvents && (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                marginBottom: "8px",
                borderRadius: "6px",
                background: viewingCounterfactual ? "var(--purple-dim)" : "var(--bg-card)",
                border: `1px solid ${viewingCounterfactual ? "var(--purple)" : "var(--border)"}`,
                fontSize: "11px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    onClick={() => setViewingCounterfactual(false)}
                    style={{
                      padding: "3px 10px", borderRadius: "4px", fontSize: "10px",
                      cursor: "pointer", border: "1px solid var(--border)",
                      background: !viewingCounterfactual ? "var(--accent)" : "var(--bg-elevated)",
                      color: !viewingCounterfactual ? "#fff" : "var(--text-secondary)",
                      fontWeight: !viewingCounterfactual ? 600 : 400,
                    }}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => setViewingCounterfactual(true)}
                    style={{
                      padding: "3px 10px", borderRadius: "4px", fontSize: "10px",
                      cursor: "pointer", border: "1px solid var(--border)",
                      background: viewingCounterfactual ? "var(--purple)" : "var(--bg-elevated)",
                      color: viewingCounterfactual ? "#fff" : "var(--text-secondary)",
                      fontWeight: viewingCounterfactual ? 600 : 400,
                    }}
                  >
                    Counterfactual
                  </button>
                  {viewingCounterfactual && (
                    <span style={{ color: "var(--purple)", fontWeight: 500 }}>
                      Fork at E{counterfactualEvents.forkIndex + 1}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setCounterfactualEvents(null); setViewingCounterfactual(false); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-dim)", fontSize: "10px",
                  }}
                >
                  Clear Counterfactual ×
                </button>
              </div>
            )}

            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}>
              <span style={{ fontWeight: 600, fontSize: "12px" }}>
                {viewingCounterfactual ? "Timeline (Counterfactual)" : "Timeline"}
              </span>
              {!setupExpanded && (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={runEvent}
                    disabled={loading || simulationComplete}
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: loading || simulationComplete ? "var(--text-dim)" : "var(--accent)",
                      padding: "3px 10px",
                      borderRadius: "4px",
                      fontSize: "10px",
                      cursor: loading || simulationComplete ? "default" : "pointer",
                    }}
                  >
                    Run Turn
                  </button>
                  <button
                    onClick={runAll}
                    disabled={loading || simulationComplete || isRunning}
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: loading || simulationComplete ? "var(--text-dim)" : "var(--accent)",
                      padding: "3px 10px",
                      borderRadius: "4px",
                      fontSize: "10px",
                      cursor: loading || simulationComplete ? "default" : "pointer",
                    }}
                  >
                    Run All
                  </button>
                </div>
              )}
            </div>

            {/* Unified horizontal scroll container — keeps Timeline and Event Log aligned */}
            <div style={{ overflowX: "auto", paddingBottom: "4px" }}>
              {/* Gantt-style action lifecycle swimlanes */}
              <RenderBoundary>
                <ActionTimeline
                  worldStateTimeline={worldStateTimeline}
                  events={displayEvents}
                  currentTurn={viewingCounterfactual ? displayEvents.length : currentTurn}
                  actorNames={{
                    0: actorA?.actor_name || "Actor A",
                    1: actorB?.actor_name || "Actor B",
                  }}
                  ontology={ontology}
                  actionNames={scenario?.scenario_config?.actions || actions}
                  temporalProfiles={scenario?.actor_profiles
                    ? scenario.actor_profiles.map(ap => ap.temporal_profiles || [])
                    : null
                  }
                  onRecordClick={(record) => {
                    setSelectedActionIds([record.coa_id]);
                    setSelectedActionActorId(record.actor_id);
                  }}
                  selectedRecordId={null}
                />
              </RenderBoundary>

              {/* Turn-aligned Event Log — columns match Timeline turn grid */}
              <div style={{ marginTop: "12px" }}>
                <RenderBoundary>
                  <TimelineView
                    events={displayEvents}
                    selectedEvent={selectedEventIndex}
                    onEventSelect={handleEventSelect}
                    onOverrideRequest={viewingCounterfactual ? null : handleOverrideRequest}
                    currentTurn={viewingCounterfactual ? displayEvents.length : currentTurn}
                    actorNames={{
                      0: actorA?.actor_name || "Actor A",
                      1: actorB?.actor_name || "Actor B",
                    }}
                    ontology={ontology}
                    actionNames={scenario?.scenario_config?.actions || []}
                    counterfactualData={!viewingCounterfactual ? counterfactualEvents : null}
                  />
                </RenderBoundary>
              </div>
            </div>
          </div>
        ) : null}

        // Event log area — placeholder when no simulation
        eventLogContent={
          events.length === 0 && !setupExpanded ? (
            <div style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-dim)",
            }}>
              <p style={{ fontSize: "14px", marginBottom: "8px" }}>No simulation running</p>
              <p style={{ fontSize: "11px" }}>
                Open{" "}
                <button
                  onClick={() => setSetupExpanded(true)}
                  style={{
                    background: "none", border: "none",
                    color: "var(--accent)", cursor: "pointer",
                    fontSize: "11px", textDecoration: "underline",
                  }}
                >
                  Setup
                </button>
                {" "}to load a scenario and configure parameters.
              </p>
            </div>
          ) : null
        }

        // Right panel — status charts stacked vertically
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={() => setRightPanelOpen(!rightPanelOpen)}
        rightPanelContent={events.length > 0 ? (
          <RenderBoundary>
            <CurrentStateDashboard
              actorA={enrichedActorA}
              actorB={enrichedActorB}
              relationshipScore={selectedEvent?.relationship_score ?? relationshipScore}
              previousRelationshipScore={selectedEventIndex > 0 ? displayEvents[selectedEventIndex - 1]?.relationship_score : undefined}
              escalationLevel={selectedEvent?.action_severity ?? 0}
              crisisThreshold={scenario?.scenario_parameters?.crisis_threshold ?? 10}
              lastActionA={displayEvents.filter(e => e.acting_actor_id === 0).slice(-1)[0]?.action_name}
              lastActionB={displayEvents.filter(e => e.acting_actor_id === 1).slice(-1)[0]?.action_name}
              selectedEvent={selectedEvent}
              selectedEventIndex={selectedEventIndex}
              allEvents={events}
              counterfactualData={counterfactualEvents}
              ontology={ontology}
              onEventSelect={handleEventSelect}
              hideGoalLedger
            />
          </RenderBoundary>
        ) : null}

        // Deep-dive panel — collapsible actor detail bar at bottom
        deepDiveContent={events.length > 0 ? (
          <div style={{
            border: "1px solid var(--border)",
            borderRadius: "6px",
            background: "var(--bg-card)",
            overflow: "hidden",
            margin: "0 20px 12px",
          }}>
            <button
              onClick={() => setInspectorOpen(!inspectorOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "8px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: selectedEvent ? "var(--accent)" : "var(--text-dim)",
              }}
            >
              <span style={{ fontSize: "11px", fontWeight: 600 }}>
                {selectedEvent
                  ? `Actor Detail — ${
                      selectedEvent.acting_actor_id === 0
                        ? actorA?.actor_name || "Actor A"
                        : actorB?.actor_name || "Actor B"
                    } / ${selectedEvent.action_name}`
                  : "Select an event to view actor details"
                }
              </span>
              <span style={{
                fontSize: "10px",
                color: "var(--text-dim)",
                transform: inspectorOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.2s ease",
              }}>
                ▼
              </span>
            </button>

            {inspectorOpen && selectedEvent && (
              <div style={{
                borderTop: "1px solid var(--border)",
                padding: "12px 14px",
                maxHeight: "50vh",
                overflowY: "auto",
              }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "12px",
                }}>
                  {/* Actor Deep Dive summary */}
                  <RenderBoundary>
                    <ActorDeepDive
                      actorName={deepDiveActorName}
                      actorColor={deepDiveActorColor}
                      currentTurn={currentTurn}
                      totalProblemScore={deepDiveActorEvent?.total_problem_score}
                      tpsChange={null}
                      escalationLevel={deepDiveActorEvent?.action_severity}
                      capability={capability}
                      capabilityTrend={null}
                      resolve={resolve}
                      resolveTrend={null}
                      goals={goals}
                      commitments={[]}
                      paptTrend="stable"
                      paptConfidence={null}
                      perceivedHostility={null}
                      hostilityChange={null}
                      onDrillDown={() => {}}
                    />
                  </RenderBoundary>

                  {/* Goal Ledger */}
                  <RenderBoundary>
                    <GoalLedgerChart
                      allEvents={events}
                      ontology={ontology}
                      onEventSelect={handleEventSelect}
                      selectedEventIndex={selectedEventIndex}
                      actorAName={actorA?.actor_name || "Actor A"}
                      actorBName={actorB?.actor_name || "Actor B"}
                    />
                  </RenderBoundary>

                  {/* Decision Logic Inspector */}
                  <RenderBoundary>
                    <EventInspector
                      eventData={selectedEvent}
                      allEvents={events}
                      selectedEventIndex={selectedEventIndex}
                      actorName={selectedEvent.acting_actor_id === 0
                        ? actorA?.actor_name || "Actor A"
                        : actorB?.actor_name || "Actor B"
                      }
                      observedAction={selectedEvent.action_name || "Action"}
                      otherActorName={selectedEvent.acting_actor_id === 0
                        ? actorB?.actor_name || "Actor B"
                        : actorA?.actor_name || "Actor A"
                      }
                      ontology={ontology}
                    />
                  </RenderBoundary>
                </div>
              </div>
            )}
          </div>
        ) : null}

        // Generate view content
        generateContent={
          <GenerateWizard
            onNavigateToSimulation={() => {
              setActiveView("simulation");
              setSetupExpanded(true);
            }}
          />
        }
      />

      {/* Floating error banner — visible regardless of setup state */}
      {error && !setupExpanded && (
        <div style={{
          position: "fixed",
          top: "12px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          background: "var(--red-dim)",
          border: "1px solid var(--red-border)",
          color: "var(--red)",
          padding: "8px 16px",
          borderRadius: "8px",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          maxWidth: "600px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: "none", border: "none",
              color: "var(--red)", cursor: "pointer",
              fontSize: "14px", fontWeight: "bold", flexShrink: 0,
            }}
          >×</button>
        </div>
      )}

      {/* Override Panel Modal */}
      {overridePanelOpen && overrideEventIndex !== null && (
        <OverridePanel
          event={events[overrideEventIndex]}
          eventIndex={overrideEventIndex}
          actorName={events[overrideEventIndex]?.acting_actor_id === 0
            ? actorA?.actor_name || "Actor A"
            : actorB?.actor_name || "Actor B"
          }
          actions={actions}
          ontology={ontology}
          objectiveNames={scenario?.scenario_config?.objectives || scenario?.scenario_config?.goals || []}
          onClose={() => { setOverridePanelOpen(false); setOverrideEventIndex(null); }}
          onRunCounterfactual={handleRunCounterfactual}
          isLoading={counterfactualLoading}
        />
      )}
    </>
  );
};

export default DSMTestingAppV08;
