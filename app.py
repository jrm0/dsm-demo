# app.py — DSM Demo Server
# Self-contained Flask server for the DSM Testing UI.
# Based on standalone_app.py; modified for hosted deployment:
#   - Serves Vite-built static UI from static/
#   - Optional basic auth via AUTH_USER / AUTH_PASS env vars
#   - Loads engine modules from engine/ subdirectory
#   - Loads scenarios from scenarios/ and data from data/

from __future__ import annotations
import sys, os

# Add engine/ to path so unmodified DPM modules resolve their imports
ENGINE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine")
sys.path.insert(0, ENGINE_DIR)

from flask import Flask, Blueprint, request, jsonify, send_from_directory, Response
from dataclasses import dataclass, field
from typing import Dict, Any, Optional
from functools import wraps
import threading
import uuid
import json
import csv

from helpers import fast_deepcopy
import numpy as np
from model import Model, model_from_json, model_from_saved_sim


# ──────────────────────────────────────────────────────────────────────────────
# Paths
# ──────────────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCENARIOS_DIR = os.path.join(BASE_DIR, "scenarios")
DATA_DIR = os.path.join(BASE_DIR, "data")
STATIC_DIR = os.path.join(BASE_DIR, "static")


# ──────────────────────────────────────────────────────────────────────────────
# Basic Auth (optional — set AUTH_USER and AUTH_PASS env vars to enable)
# ──────────────────────────────────────────────────────────────────────────────
AUTH_USER = os.environ.get("AUTH_USER")
AUTH_PASS = os.environ.get("AUTH_PASS")

def check_auth(username, password):
    return username == AUTH_USER and password == AUTH_PASS

def authenticate():
    return Response(
        "Authentication required.", 401,
        {"WWW-Authenticate": 'Basic realm="DSM Demo"'},
    )

def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not AUTH_USER:
            return f(*args, **kwargs)  # Auth disabled
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated


# ──────────────────────────────────────────────────────────────────────────────
# Phase 2 Data Migration
# ──────────────────────────────────────────────────────────────────────────────

def _migrate_scenario_to_phase2(data: dict) -> dict:
    """
    Migrate v2.5 scenario data to Phase 2 format in-place.
    See standalone_app.py for full commentary on each shim.
    """
    actor_profiles = data.get("actor_profiles", [])
    sc = data.get("scenario_config", {})
    num_goals = len(sc.get("objectives", []))
    num_actions = len(sc.get("actions", []))

    for profile in actor_profiles:
        # Replace relevance_tensor with goal_impact_tensor
        if "relevance_tensor" in profile and "goal_impact_tensor" not in profile:
            coa_effects = profile.get("coa_effects_tensor")
            if coa_effects is not None:
                coa_arr = np.array(coa_effects).reshape((num_goals, num_actions, 3))
                git_arr = np.transpose(coa_arr, (2, 0, 1))
                git_arr[2, :, :] = -np.abs(git_arr[2, :, :])
                profile["goal_impact_tensor"] = git_arr.tolist()
            else:
                profile["goal_impact_tensor"] = np.zeros((3, num_goals, num_actions)).tolist()
            del profile["relevance_tensor"]

        # Derive goal_impact_tensor when no GIM in payload
        if ("goal_impact_tensor" not in profile
                and "goal_impact_matrix" not in profile
                and "relevance_tensor" not in profile):
            coa_effects = profile.get("coa_effects_tensor")
            if coa_effects is not None:
                coa_arr = np.array(coa_effects).reshape((num_goals, num_actions, 3))
                git_arr = np.transpose(coa_arr, (2, 0, 1))
                profile["goal_impact_tensor"] = git_arr.tolist()
            else:
                profile["goal_impact_tensor"] = np.zeros((3, num_goals, num_actions)).tolist()

        # Lower action_discrepancy_threshold for testing
        if profile.get("action_discrepancy_threshold", 0) > 0.15:
            profile["action_discrepancy_threshold"] = 0.15

        # Remove DIM keys that Phase 2 Actor does not accept
        for key in list(profile.keys()):
            if key.startswith("dim_") or key.startswith("DIM"):
                del profile[key]

    # Map MAGIC commitment types to DPM enum
    _COMMITMENT_TYPE_MAP = {
        "self_binding_declaration": "promise",
        "private_warning": "threat",
        "allied_commitment": "promise",
        "conditional_threat": "threat",
        "declaratory_limit": "redline",
    }
    for entry in sc.get("commitment_creating_actions", []):
        ct = entry.get("commitment_type", "")
        if ct in _COMMITMENT_TYPE_MAP:
            entry["commitment_type"] = _COMMITMENT_TYPE_MAP[ct]

    # Provide default simulation_config if absent
    if "simulation_config" not in data:
        data["simulation_config"] = {
            "configuration_type": "rr",
            "max_actions_per_turn": 2,
            "max_num_turns": 10,
            "num_actions_explored": 5,
            "outcomes_variance": 0,
            "random_distribution": "normal",
            "random_seed": 42,
            "use_stochasticity": True,
        }

    # Provide default initial_action_sequence if absent
    if "initial_action_sequence" not in data or not data["initial_action_sequence"]:
        data["initial_action_sequence"] = [
            {"actor_id": 1, "coa_id_list": [0]}
        ]

    # Inject Phase 2 simulation_parameters defaults
    sim_params = data.get("simulation_parameters", {})
    sim_params.setdefault("severity_activation_threshold", 0.0)
    sim_params.setdefault("base_decay_rate", 0.3)

    # Dampen feasibility cost amplification
    if sim_params.get("feasibility_scaling_weight", 0) > 0.1:
        sim_params["feasibility_scaling_weight"] = 0.1

    data["simulation_parameters"] = sim_params
    return data


# ──────────────────────────────────────────────────────────────────────────────
# File-based scenario loader
# ──────────────────────────────────────────────────────────────────────────────

def _load_scenarios_from_disk() -> Dict[str, Any]:
    """Load scenario JSON files from scenarios/ directory."""
    scenarios = {}
    if os.path.isdir(SCENARIOS_DIR):
        for fname in sorted(os.listdir(SCENARIOS_DIR)):
            if fname.endswith(".json"):
                fpath = os.path.join(SCENARIOS_DIR, fname)
                scenario_id = os.path.splitext(fname)[0]
                with open(fpath, "r") as f:
                    scenarios[scenario_id] = json.load(f)
    print(f"Loaded {len(scenarios)} scenario(s): {list(scenarios.keys())}")
    return scenarios

SCENARIOS = _load_scenarios_from_disk()


# ──────────────────────────────────────────────────────────────────────────────
# Flask App
# ──────────────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")

# Custom JSON provider for numpy types
from flask.json.provider import DefaultJSONProvider

class DSMJSONProvider(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, np.bool_):
            return bool(o)
        if hasattr(o, '__dict__'):
            return {k: v for k, v in o.__dict__.items() if not k.startswith('_')}
        return super().default(o)

app.json_provider_class = DSMJSONProvider
app.json = DSMJSONProvider(app)

# API Blueprint
api = Blueprint("api", __name__)


# ──────────────────────────────────────────────────────────────────────────────
# Simulation Registry
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class ManagedSim:
    sim: Model
    config: dict = None
    lock: threading.RLock = field(default_factory=threading.RLock)

REGISTRY: Dict[str, ManagedSim] = {}
REGISTRY_LOCK = threading.RLock()

def _get_sim(sim_id: str) -> Optional[ManagedSim]:
    with REGISTRY_LOCK:
        return REGISTRY.get(sim_id)

def _json_error(msg: str, code: int = 400):
    return jsonify({"ok": False, "error": msg}), code


# Heavy keys to strip from event_data before sending to UI
_HEAVY_EVENT_DATA_KEYS = {
    "Candidate-Action-Sequences",
    "PT-Prospect-Values",
}
_RANKED_LIST_MAX = 20

def _slim_state(sim):
    """Return sim state with heavy intermediate tensors stripped."""
    full_state = sim.state()
    for turn in full_state.get("turns", []):
        for step in turn.get("steps", []):
            for event in step.get("events", []):
                ed = event.get("event_data")
                if isinstance(ed, dict):
                    for key in _HEAVY_EVENT_DATA_KEYS:
                        ed.pop(key, None)
                    ranked = ed.get("Ranked-Response-List")
                    if isinstance(ranked, list) and len(ranked) > _RANKED_LIST_MAX:
                        ed["Ranked-Response-List"] = ranked[:_RANKED_LIST_MAX]
    return full_state


# ──────────────────────────────────────────────────────────────────────────────
# Health
# ──────────────────────────────────────────────────────────────────────────────
@api.get("/healthz")
def healthz():
    return jsonify({"ok": True, "service": "dsm-demo"})

@api.get("/readyz")
def readyz():
    return jsonify(status="ready", checks={"mode": "standalone"}), 200


# ──────────────────────────────────────────────────────────────────────────────
# Ontology
# ──────────────────────────────────────────────────────────────────────────────
from enums import Char, Relationship, Party, TimeHorizon

def _build_ontology(scenario_data):
    sc = scenario_data.get("scenario_config", {})
    return {
        "actions": sc.get("actions", []),
        "objectives": sc.get("objectives", sc.get("goals", [])),
        "characteristics": Char().members(),
        "relationships": Relationship().members(),
        "parties": Party().members(),
        "TimeHorizon": TimeHorizon().members(),
    }

_default_ontology = _build_ontology(next(iter(SCENARIOS.values()))) if SCENARIOS else {}

@api.get("/ontology")
def get_ontology_standalone():
    return jsonify({"ok": True, "ontology": _default_ontology})


# ──────────────────────────────────────────────────────────────────────────────
# Scenarios
# ──────────────────────────────────────────────────────────────────────────────
@api.get("/scenarios")
def list_scenarios():
    scenario_list = [{"id": sid, "name": sid} for sid in SCENARIOS.keys()]
    return jsonify({"ok": True, "scenarios": scenario_list})

@api.get("/scenarios/parameter_regimes")
def get_parameter_regimes():
    try:
        csv_path = os.path.join(DATA_DIR, "parameter_regimes.csv")
        parameter_regimes = {}
        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            regimes = reader.fieldnames[1:]
            param_name_field = reader.fieldnames[0]
            for regime in regimes:
                parameter_regimes[regime] = {}
            for row in reader:
                param_name = row[param_name_field]
                for regime in regimes:
                    parameter_regimes[regime][param_name] = float(row[regime])
        return jsonify({"ok": True, "parameter_regimes": parameter_regimes})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e), "parameter_regimes": {}})

@api.get("/scenarios/<scenario_id>")
def get_scenario(scenario_id):
    if scenario_id not in SCENARIOS:
        return _json_error("scenario not found", 404)
    return jsonify({"ok": True, "scenario": SCENARIOS[scenario_id]})


# ──────────────────────────────────────────────────────────────────────────────
# Calibrated Defaults
# ──────────────────────────────────────────────────────────────────────────────
@api.get("/calibrated_defaults")
def get_calibrated_defaults():
    try:
        path = os.path.join(DATA_DIR, "calibrated_defaults.json")
        if not os.path.exists(path):
            return jsonify({"ok": False, "error": "calibrated_defaults.json not found"}), 404
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return jsonify({"ok": True, "calibrated_defaults": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ──────────────────────────────────────────────────────────────────────────────
# Simulation CRUD
# ──────────────────────────────────────────────────────────────────────────────
@api.post("/simulation/new_simulation")
def create_sim():
    body = request.get_json()
    sim_id = str(uuid.uuid4())
    body["sim_id"] = sim_id
    _migrate_scenario_to_phase2(body)
    sim = model_from_json(body)
    with REGISTRY_LOCK:
        REGISTRY[sim_id] = ManagedSim(sim=sim, config=fast_deepcopy(body))
    return jsonify({"ok": True, "sim_id": sim_id}), 201

@api.get("/simulation/saved_simulations")
def list_saved_sims():
    return jsonify({"ok": True, "saved_simulations": []})

@api.post("/simulation/load_simulation")
def load_sim():
    return _json_error("Not available in demo mode.", 501)

@api.post("/simulation/<sim_id>/save")
def save_sim(sim_id):
    return _json_error("Not available in demo mode.", 501)

@api.get("/simulation/<sim_id>/ontology")
def get_sim_ontology(sim_id):
    managed = _get_sim(sim_id)
    if not managed:
        return _json_error("simulation not found", 404)
    with managed.lock:
        return jsonify({"ok": True, "ontology": managed.sim.ontology()})

@api.get("/simulation/<sim_id>")
def get_sim(sim_id):
    managed = _get_sim(sim_id)
    if not managed:
        return _json_error("simulation not found", 404)
    with managed.lock:
        return jsonify({"ok": True, "data": managed.sim.state()})

@api.delete("/simulation/<sim_id>")
def delete_sim(sim_id):
    with REGISTRY_LOCK:
        if sim_id not in REGISTRY:
            return _json_error("simulation not found", 404)
        del REGISTRY[sim_id]
    return jsonify({"ok": True, "deleted": sim_id})


# ──────────────────────────────────────────────────────────────────────────────
# Simulation Execution
# ──────────────────────────────────────────────────────────────────────────────
@api.post("/simulation/<sim_id>/run_step")
def run_step(sim_id):
    managed = _get_sim(sim_id)
    if not managed:
        return _json_error("simulation not found", 404)
    with managed.lock:
        managed.sim.step_sim_forward()
        return jsonify({"ok": True, "data": _slim_state(managed.sim)})

@api.post("/simulation/<sim_id>/run_all_steps")
def run_all_steps(sim_id):
    managed = _get_sim(sim_id)
    if not managed:
        return _json_error("simulation not found", 404)
    with managed.lock:
        managed.sim.step_sim_to_end()
        return jsonify({"ok": True, "data": _slim_state(managed.sim)})

@api.patch("/simulation/<sim_id>/update_resulting_action")
def update_resulting_action(sim_id):
    managed = _get_sim(sim_id)
    if not managed:
        return _json_error("simulation not found", 404)
    body = request.get_json(silent=True) or {}
    event_id = body.get("event_id")
    action_sequence = body.get("action_sequence")
    if not isinstance(event_id, str):
        return _json_error("body must contain an 'event_id' string", 400)
    if not isinstance(action_sequence, list) or not all(isinstance(a, int) for a in action_sequence):
        return _json_error("body must contain an 'action_sequence' list of integers", 400)
    with managed.lock:
        managed.sim.update_resulting_action(event_id=event_id, new_action_sequence=action_sequence)
        return jsonify({"ok": True, "data": managed.sim.state()})

@api.patch("/simulation/<sim_id>/params")
def update_params(sim_id):
    return _json_error("not implemented", 501)

@api.get("/simulation/<sim_id>/eventdata_metadata")
def get_eventdata_metadata(sim_id):
    managed = _get_sim(sim_id)
    if not managed:
        return _json_error("simulation not found", 404)
    with managed.lock:
        metadata = managed.sim.eventdata_metadata()
        return jsonify({"ok": True, "eventdata_metadata": metadata})


# ──────────────────────────────────────────────────────────────────────────────
# Counterfactual
# ──────────────────────────────────────────────────────────────────────────────
@api.post("/simulation/<sim_id>/run_counterfactual")
def run_counterfactual(sim_id: str):
    msim = _get_sim(sim_id)
    if not msim:
        return _json_error(f"Simulation {sim_id} not found", 404)

    try:
        data = request.get_json(force=True)
        event_index = data.get("event_index")
        new_action_ids = data.get("action_ids", [])

        if event_index is None:
            return _json_error("event_index is required", 400)
        if not new_action_ids:
            return _json_error("action_ids is required", 400)
        if not msim.config:
            return _json_error("Original config not available for counterfactual", 400)

        with msim.lock:
            original_result = msim.sim.save_to_dict()
            original_data = original_result.get("data", {})

            original_actions = []
            original_action_at_fork = None
            event_count = 0

            for turn in original_data.get("turns", []):
                for step in turn.get("steps", []):
                    for event in step.get("events", []):
                        action_seq = event.get("resulting_action_sequence", {})
                        coa_ids = action_seq.get("coa_id_list", [])
                        original_actions.append({
                            "event_index": event_count,
                            "acting_actor_id": event.get("acting_actor_id"),
                            "action_ids": coa_ids,
                        })
                        if event_count == event_index:
                            original_action_at_fork = coa_ids
                        event_count += 1

            if event_index >= len(original_actions):
                return _json_error(
                    f"Event index {event_index} not found (only {len(original_actions)} events)", 404
                )

        cf_config = fast_deepcopy(msim.config)
        counterfactual_sim = model_from_json(cf_config)

        max_turns = counterfactual_sim.max_num_turns
        turn_structure = counterfactual_sim.turn_structure
        total_steps = max_turns * len(turn_structure)
        cf_event_count = 0

        for step_num in range(total_steps):
            turn_idx = step_num // len(turn_structure)
            step_idx = step_num % len(turn_structure)
            step_id = f"t{turn_idx}s{step_idx}"

            try:
                counterfactual_sim.process_step(step_id)
            except Exception as e:
                print(f"[counterfactual] Step {step_id} error: {e}")
                break

            if turn_idx < len(counterfactual_sim.data.turns):
                turn_data = counterfactual_sim.data.turns[turn_idx]
                if step_idx < len(turn_data.steps):
                    step_data = turn_data.steps[step_idx]
                    for evt_idx, event in enumerate(step_data.events):
                        event_id = f"{step_id}e{evt_idx}"
                        if cf_event_count < event_index:
                            if cf_event_count < len(original_actions):
                                target_action = original_actions[cf_event_count]["action_ids"]
                                current_action = (
                                    event.resulting_action_sequence.coa_id_list
                                    if event.resulting_action_sequence else []
                                )
                                if current_action != target_action:
                                    try:
                                        counterfactual_sim.update_resulting_action(event_id, target_action)
                                    except Exception as e:
                                        print(f"[counterfactual] Could not override {event_id}: {e}")
                        elif cf_event_count == event_index:
                            try:
                                counterfactual_sim.update_resulting_action(event_id, new_action_ids)
                            except Exception as e:
                                print(f"[counterfactual] Could not apply fork at {event_id}: {e}")
                        cf_event_count += 1

        counterfactual_sim_id = str(uuid.uuid4())
        with REGISTRY_LOCK:
            REGISTRY[counterfactual_sim_id] = ManagedSim(sim=counterfactual_sim, config=cf_config)

        return jsonify({
            "ok": True,
            "counterfactual_sim_id": counterfactual_sim_id,
            "fork_event_index": event_index,
            "original_action_ids": original_action_at_fork,
            "counterfactual_action_ids": new_action_ids,
            "data": counterfactual_sim.state(),
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return _json_error(f"Error running counterfactual: {e}", 500)


# ──────────────────────────────────────────────────────────────────────────────
# Register API routes at both / and /api/
# ──────────────────────────────────────────────────────────────────────────────
app.register_blueprint(api)
app.register_blueprint(api, url_prefix="/api", name="api_prefixed")


# ──────────────────────────────────────────────────────────────────────────────
# Static file serving (Vite-built UI)
# ──────────────────────────────────────────────────────────────────────────────
@app.before_request
def auth_guard():
    """Apply basic auth to all requests."""
    if not AUTH_USER:
        return
    # Skip auth for health checks
    if request.path in ("/healthz", "/readyz", "/api/healthz", "/api/readyz"):
        return
    auth = request.authorization
    if not auth or not check_auth(auth.username, auth.password):
        return authenticate()

@app.route("/")
def serve_index():
    return send_from_directory(STATIC_DIR, "index.html")

@app.errorhandler(404)
def fallback_to_spa(e):
    """SPA fallback — serve index.html for any unmatched route."""
    # Only fallback for non-API routes
    if request.path.startswith("/api/") or request.path.startswith("/simulation/"):
        return jsonify({"ok": False, "error": "not found"}), 404
    return send_from_directory(STATIC_DIR, "index.html")


# ──────────────────────────────────────────────────────────────────────────────
# CORS
# ──────────────────────────────────────────────────────────────────────────────
try:
    from flask_cors import CORS
    CORS(app, resources={r"/*": {"origins": "*"}})
except ImportError:
    pass


# ──────────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  DSM Demo Server")
    print(f"  Scenarios: {list(SCENARIOS.keys())}")
    print(f"  Auth: {'enabled' if AUTH_USER else 'disabled'}")
    print(f"  Static UI: {STATIC_DIR}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=False)
