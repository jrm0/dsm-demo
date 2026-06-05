from actor import Actor, _drop_pa_from_vector, _drop_pa_from_matrix
from data_classes import SimulationData, EventData, TurnData, StepData, ActionSequenceData, EXOGENOUS_ACTOR_ID, to_builtin, from_dict
from event import Event
from event_data_checker import EventDataChecker
from exogenous import evaluate_triggers, create_exogenous_action_sequence, parse_exogenous_event_configs
from enums import *
from temporal import (
    WorldStateTimeline, TemporalPreProcessor, SustainingReview,
    ContinuationReview, TemporalPlanningHeuristic,
    parse_temporal_profiles_from_config,
    LS_INITIATED,
)
from commitment import (
    CommitmentRegister, PAPTState, CommitmentLandscape,
    ProposalResponseActionMeta,
    parse_support_cost_sets_from_config,
    parse_commitment_creating_actions_from_config,
    parse_proposal_response_actions_from_config,
    extract_commitment_params,
    compute_initial_influence,
    activate_proposal_responses,
    resolve_proposal_acceptance,
    resolve_proposal_rejection,
    find_matching_proposal,
    LB_ACTIVE_ONLY, LB_PERSISTENT,
    CT_PROPOSAL,
)

import numpy as np
import json
from dataclasses import asdict

from helpers import tse_id_to_dict, fast_deepcopy, coerce_enum_values


def _adapt_magic_support_cost_sets(support_entries, cost_entries, actor_id, action_enum):
    """
    Convert MAGIC-format flat support/cost set entries into the grouped format
    expected by parse_support_cost_sets_from_config().

    MAGIC sends per-actor flat lists:
        support_set_entries: [{"source_coa": "name", "supported_coa": "name", ...}]
        cost_set_entries:    [{"source_coa": "name", "penalized_coa": "name", ...}]

    DPM expects grouped-by-source-action dicts:
        [{"actor_id": int, "source_coa_id": int,
          "support_set": [...], "cost_set": [...]}, ...]

    Action name strings are resolved to numeric IDs via the Action enum.
    Integer IDs pass through unchanged for backward compatibility.
    """
    grouped = {}  # source_coa_id -> {"support_set": [], "cost_set": []}

    def _resolve_id(name_or_id):
        if isinstance(name_or_id, str):
            return action_enum[name_or_id]
        return int(name_or_id)

    for entry in (support_entries or []):
        source_id = _resolve_id(entry.get('source_coa', entry.get('source_coa_id')))
        supported_id = _resolve_id(entry.get('supported_coa', entry.get('supported_coa_id')))
        if source_id not in grouped:
            grouped[source_id] = {"support_set": [], "cost_set": []}
        grouped[source_id]["support_set"].append({
            "supported_coa_id": supported_id,
            "bonus_strength": entry.get("bonus_strength", 0.0),
            "rationale": entry.get("rationale", ""),
        })

    for entry in (cost_entries or []):
        source_id = _resolve_id(entry.get('source_coa', entry.get('source_coa_id')))
        penalized_id = _resolve_id(entry.get('penalized_coa', entry.get('penalized_coa_id')))
        if source_id not in grouped:
            grouped[source_id] = {"support_set": [], "cost_set": []}
        grouped[source_id]["cost_set"].append({
            "source_coa_id": source_id,
            "penalized_coa_id": penalized_id,
            "penalty_strength": entry.get("penalty_strength", 0.0),
            "penalty_type": entry.get("penalty_type", 0),
            "is_hard_constraint": entry.get("is_hard_constraint", False),
            "rationale": entry.get("rationale", ""),
        })

    result = []
    for source_id, sets in grouped.items():
        result.append({
            "actor_id": actor_id,
            "source_coa_id": source_id,
            "support_set": sets["support_set"],
            "cost_set": sets["cost_set"],
        })

    return result


# DEPRECATED: N-player configuration type map.
# Retained for backward compatibility with existing N-player scenarios.
# New 2-player scenarios should use TurnMode (simultaneous/sequential) instead.
configuration_type_map = {
    2: {
        "rr": [[0],[1]],
    },
    3: {
        "slmf": [[0],[1,2]],
        "mlsf": [[0,1],[2]],
        "rr": [[0],[1],[2]],
    }
}

# 2-Player turn structure modes
TURN_STRUCTURE_SIMULTANEOUS = [[0, 1]]       # Both decide simultaneously
TURN_STRUCTURE_SEQUENTIAL_AB = [[0], [1]]    # Actor 0 first, then Actor 1
TURN_STRUCTURE_SEQUENTIAL_BA = [[1], [0]]    # Actor 1 first, then Actor 0

def action_sequence_characteristics_from_system_data(system_data: dict, action_sequence: list, enums: dict):
    """
    Given actor data and an action sequence (list of action indices), returns a list of characteristic vectors for each action in the sequence.
    """
    if 'COA-Characteristics-Matrix' not in system_data:
        raise ValueError("System data must include 'COA-Characteristics-Matrix'.")

    characteristics_matrix = system_data['COA-Characteristics-Matrix']

    action_vectors = [characteristics_matrix[:, action].reshape((len(enums['Char']), 1)) for action in
                      action_sequence]

    return action_vectors

def safe_get(d: dict, key: str, default=None):
    if key in d:
        return d[key]
    if default is not None:
        if isinstance(default, str) and default.lower() == 'none':
            return None
        return default
    print(f"Param '{key}' not found.")
    raise KeyError(f"Param '{key}' not found.")


class Model:
    def __init__(self,
                 # Base config
                 sim_id: str,
                 initial_action_sequence: list,

                 actor_profiles: list,
                 scenario_parameters: dict,
                 simulation_parameters: dict,
                 simulation_config: dict,

                 scenario_config: dict,

                 saved_sim_data: dict = None,
                 scenario_init_data_id: str = None,
                 data_generation_job_id: str = None,
                 scenario_id: str = None,
                 ):
        """
        Initializes a Model instance with actor profiles.

        :param sim_id: A unique identifier for the simulation.
        :param initial_action_sequence: A list of initial action sequences for the simulation.
        :param actor_profiles: A list of dictionaries containing actor profile parameters.
        :param scenario_parameters: A dictionary containing scenario parameters.
        :param simulation_parameters: A dictionary containing simulation parameters.
        :param simulation_config: A dictionary containing simulation configuration parameters.
        :param scenario_init_data_id: A unique identifier for the scenario initialization data.
        :param scenario_config: A dictionary containing scenario configuration parameters.
        :param saved_sim_data: A dictionary containing saved simulation data to load (optional).
                                - If provided, the model will be initialized from this data and will
                                  ignore other arguments.
        """
        if saved_sim_data is not None:
            # load saved simulation data
            self.data = from_dict(SimulationData, saved_sim_data["data"])
            self.sim_id = self.data.sim_id
            self.num_actors = len(self.data.initial_actors_data)
            self.event_data_checker = EventDataChecker(len(self.data.initial_actors_data))
            self.initial_action_sequence = self.data.initial_action_sequence
            self.profile = self.data.initial_system_data
            self.configuration_type = self.profile['Configuration-Type']
            self.turn_structure = configuration_type_map[self.num_actors][self.configuration_type]
            self.current_turn = len(self.data.turns) - 1
            self.current_step = len(self.data.turns[self.current_turn].steps) - 1
            self.max_num_turns = self.profile['Max-Num-Turns']
            self.scenario_config = self.data.scenario_config
            self.initialize_enums(self.scenario_config)


            if saved_sim_data["rng"] is not None:
                self.rng = np.random.default_rng()
                self.rng.bit_generator.state = saved_sim_data["rng"]
            else:
                self.rng = None
            return

        self.sim_id = sim_id
        sim_name = safe_get(simulation_config, 'sim_name', sim_id)

        self.scenario_config = scenario_config
        self.initialize_enums(scenario_config)

        random_seed = safe_get(simulation_config, 'random_seed', 'none')
        use_stochasticity = safe_get(simulation_config, 'use_stochasticity', True)
        self.rng = np.random.default_rng(random_seed) if use_stochasticity else None

        self.num_actors = len(actor_profiles)
        self.event_data_checker = EventDataChecker(self.num_actors, self.enums)

        configuration_type = safe_get(simulation_config, 'configuration_type', 'rr')
        max_num_turns = safe_get(simulation_config, 'max_num_turns', 10)
        
        num_actions = len(self.enums['Action'])
        num_objectives = len(self.enums['Goal'])

        self.profile = {}

        # Scenario parameters

        # 2-Player: Relationship scores are per-actor scalars, not system-level matrices.
        # Extract from legacy matrix if present; otherwise derive from relationship_state_matrix
        # or default to adversarial (-1.0 off-diagonal, 0 on-diagonal).
        raw_rsm = scenario_parameters.get('relationship_score_matrix', None)
        if raw_rsm is not None:
            self._legacy_relationship_score_matrix = np.array(raw_rsm).reshape(
                (self.num_actors, self.num_actors))
        else:
            raw_state = scenario_parameters.get('relationship_state_matrix', None)
            if raw_state is not None:
                self._legacy_relationship_score_matrix = np.array(raw_state, dtype=float).reshape(
                    (self.num_actors, self.num_actors))
            else:
                # Default: adversarial off-diagonal
                rsm = np.zeros((self.num_actors, self.num_actors))
                for i in range(self.num_actors):
                    for j in range(self.num_actors):
                        if i != j:
                            rsm[i, j] = -1.0
                self._legacy_relationship_score_matrix = rsm

        # Legacy migration: drop PA column/row from Char-indexed structures if needed.
        _raw_ccm = np.array(safe_get(scenario_parameters, 'coa_characteristics_matrix'))
        self.profile['COA-Characteristics-Matrix'] = _drop_pa_from_matrix(
            _raw_ccm.reshape((-1, len(self.enums['Action']))), axis=0
        )
        _raw_acm = np.array(safe_get(scenario_parameters, 'action_cost_matrix'))
        _acm_full = _drop_pa_from_matrix(
            _raw_acm.reshape((len(self.enums['Action']), -1)), axis=1
        )
        # New payloads supply NUM_IMPACT_DIMS resource columns directly; legacy
        # payloads supply 7 (or 8 pre-PA-drop). Extract the resource columns
        # from wider matrices.
        if _acm_full.shape[1] == NUM_IMPACT_DIMS:
            self.profile['Action-Cost-Matrix'] = _acm_full
        else:
            _impact_map = get_impact_to_profile_map(self.enums['Char'])
            _resource_cols = sorted(_impact_map.values())  # [Capability_idx, Resolve_idx]
            self.profile['Action-Cost-Matrix'] = _acm_full[:, _resource_cols]
        self.profile['Base-Cost-Vector'] = np.array(safe_get(scenario_parameters, 'base_cost_vector')).reshape((len(self.enums['Action']), 1))
        self.profile['COA-Playbook'] = np.array(safe_get(scenario_parameters, 'coa_playbook')).reshape((len(self.enums['Action']), len(self.enums['Party'])))
        self.profile['COA-Conflict-Matrix'] = np.array(safe_get(scenario_parameters, 'coa_conflict_matrix')).reshape((len(self.enums['Action']), len(self.enums['Action'])))
        self.profile['COA-Volatility-Vector'] = np.array(safe_get(scenario_parameters, 'coa_volatility_vector')).reshape((len(self.enums['Action']), 1))
        self.profile['Action-Type-Vector'] = np.array(
            coerce_enum_values(safe_get(scenario_parameters, 'action_type_vector'), self.enums['ActionType'])
        ).reshape((len(self.enums['Action']), 1))
        self.profile['Action-Toggle-Pair-Map'] = safe_get(scenario_parameters, 'action_toggle_pair_map')
        self.profile['Initial-Available-Playbook'] = np.array(safe_get(scenario_parameters, 'initial_available_playbook')).reshape((len(self.enums['Action']), 1))
        self.profile['COA-Deescalation-Flag-Vector'] = np.array(safe_get(scenario_parameters, 'coa_deescalation_flag_vector')).reshape((len(self.enums['Action']), 1))
        self.profile['Nuclear-Powers'] = np.array(safe_get(scenario_parameters, 'nuclear_powers')).reshape((self.num_actors, 1))

        # Cost Annotation Layer: per-action analyst-facing cost metadata
        # Optional — if not in payload, defaults to empty (annotations disabled).
        # Shape: dict mapping action_id (int) → {dim_name: [low, expected, high]}
        raw_annotations = scenario_parameters.get('cost_annotation_matrix', None)
        if raw_annotations and isinstance(raw_annotations, dict):
            # Convert string keys to int (JSON keys are strings)
            self.profile['Cost-Annotation-Matrix'] = {
                int(k): v for k, v in raw_annotations.items()
            }
        elif raw_annotations and isinstance(raw_annotations, list):
            self.profile['Cost-Annotation-Matrix'] = {
                i: v for i, v in enumerate(raw_annotations) if v
            }
        else:
            self.profile['Cost-Annotation-Matrix'] = {}

        # Initialize per-actor cost annotation accumulator
        self.profile['Cost-Annotation-Accumulator'] = init_cost_annotation_accumulator(
            self.num_actors
        )

        # Simulation parameters — System-level engine tuning knobs
        # (Per-actor cognitive/strategic parameters have been moved to actor.py;
        #  see _resolve_actor_param_defaults for backward-compat fallback.)
        self.profile['Max-Ambiguity-SD'] = safe_get(simulation_parameters, 'max_ambiguity_sd')
        self.profile['Z-Score-Range'] = safe_get(simulation_parameters, 'z_score_range')
        self.profile['Surprise-Scaling-Factor'] = safe_get(
            simulation_parameters, 'surprise_scaling_factor',
            default=simulation_parameters.get('scaling_factor', 1.0)
        )
        self.profile['Action-Weight-Range'] = safe_get(
            simulation_parameters, 'action_weight_range',
            default=simulation_parameters.get('update_weight_bounds')
        )
        self.profile['Salience-Decay-Multiplier'] = safe_get(simulation_parameters, 'salience_decay_multiplier')
        self.profile['Feasibility-Scaling-Weight'] = safe_get(simulation_parameters, 'feasibility_scaling_weight')
        self.profile['StDev-Spread-Parameter'] = safe_get(simulation_parameters, 'stdev_spread_parameter')

        self.profile["Sigmoid-Slope-K"] = safe_get(
            simulation_parameters, "sigmoid_slope_k",
            default=simulation_parameters.get('sigmoid_slope', 4.0)
        )
        self.profile["Sigmoid-Midpoint-Tau"] = safe_get(
            simulation_parameters, "sigmoid_midpoint_tau",
            default=simulation_parameters.get('sigmoid_midpoint', 0.1)
        )
        self.profile["Relevance-Activation-Threshold"] = safe_get(simulation_parameters, "relevance_activation_threshold", 0.0)
        self.profile["Outranking-Indifference-Threshold"] = safe_get(simulation_parameters, "outranking_indifference_threshold", 0.01)
        self.profile["Outranking-Preference-Threshold"] = safe_get(simulation_parameters, "outranking_preference_threshold", 0.05)
        self.profile["Goal-Impact-Gain-Scale"] = safe_get(simulation_parameters, "goal_impact_gain_scale", 2.0)
        self.profile["Feasibility-Penalty-Exponent"] = safe_get(simulation_parameters, "feasibility_penalty_exponent", 0.0)
        self.profile["Cost-Horizon-Weight"] = safe_get(simulation_parameters, "cost_horizon_weight", 0.5)
        self.profile["Feasibility-Gate-Threshold"] = safe_get(simulation_parameters, "feasibility_gate_threshold", -0.1)
        # 2-Player Refactor: relationship modifiers for exogenous event interpretation
        # When an exogenous event carries a non-adversary relationship tag, these scalars
        # modify the adversary-baselined Goal Impact Matrix instead of selecting a separate
        # tensor slice. Default values from spec: ally=-0.3, neutral=0.3, adversary=1.0
        self.profile['Relationship-Modifier-Ally'] = safe_get(simulation_parameters, 'relationship_modifier_ally', -0.3)
        self.profile['Relationship-Modifier-Neutral'] = safe_get(simulation_parameters, 'relationship_modifier_neutral', 0.3)
        self.profile['Relationship-Modifier-Adversary'] = safe_get(simulation_parameters, 'relationship_modifier_adversary', 1.0)

        # Simulation config
        self.profile['Max-Actions-Per-Turn'] = safe_get(simulation_config, 'max_actions_per_turn', 3)
        self.profile['Num-Actions-Explored'] = safe_get(simulation_config, 'num_actions_explored', 5)
        self.profile['Max-Num-Turns'] = max_num_turns
        self.profile['Configuration-Type'] = configuration_type
        self.profile['Use-Stochasticity'] = use_stochasticity
        self.profile['Random-Seed'] = random_seed
        self.profile['Random-Distribution'] = safe_get(simulation_config, 'random_distribution', 'normal')
        self.profile['Outcomes-Variance'] = safe_get(simulation_config, 'outcomes_variance', 0)
        self.profile['Simulation-Name'] = sim_name

        # 2-Player Refactor: turn mode and exogenous events
        raw_turn_mode = safe_get(simulation_config, 'turn_mode', 'Sequential')
        # Accept either string name or integer; store as integer
        if isinstance(raw_turn_mode, str):
            # Accept both lowercase and PascalCase (e.g., "simultaneous" or "Simultaneous")
            turn_mode_key = raw_turn_mode.capitalize() if raw_turn_mode[0].islower() else raw_turn_mode
            self.profile['Turn-Mode'] = TurnMode()[turn_mode_key] if turn_mode_key in TurnMode().values else TurnMode()['Sequential']
        else:
            self.profile['Turn-Mode'] = int(raw_turn_mode)
        self.profile['Alternating-Initiative'] = safe_get(simulation_config, 'alternating_initiative', False)
        self.profile['Exogenous-Events'] = safe_get(simulation_config, 'exogenous_events', [])

        actors = [
            Actor(actor_id=actor_idx, enums=self.enums, **params) for actor_idx, params in enumerate(actor_profiles)
        ]
        
        for actor in actors:
            actor['Current-Available-Playbook'] = fast_deepcopy(self.profile['Initial-Available-Playbook'])

            # Per-actor action exclusions: zero out actions that are not
            # plausible for this actor (e.g. alliance-specific actions for
            # a non-allied actor).  The field is an optional list of integer
            # action IDs on the actor profile.
            for action_id in actor.get('excluded_actions', []):
                if 0 <= action_id < actor['Current-Available-Playbook'].shape[0]:
                    actor['Current-Available-Playbook'][action_id, 0] = 0

            actor['Used-One-Off-Actions'] = []

            # Action usage counts must exist from T=0 for persistence logic.
            actor['Action-Usage-Counts'] = np.zeros((len(self.enums['Action']), 1))

            # 2-Player: Relationship-Score is a per-actor scalar in [-1, 1].
            # Preferred source: directly from actor profile (set by Actor() from
            # the payload's relationship_score field).
            # Fallback: extracted from legacy relationship_score_matrix off-diagonal.
            if 'Relationship-Score' not in actor:
                actor_id = actor['actor_id']
                other_id = 1 - actor_id if self.num_actors == 2 else 0
                actor['Relationship-Score'] = float(
                    self._legacy_relationship_score_matrix[actor_id, other_id])

        if self.num_actors == 2:
            # 2-Player Refactor: use TurnMode (Simultaneous/Sequential) instead of
            # the legacy configuration_type system.
            turn_mode = self.profile.get('Turn-Mode', self.enums['TurnMode']['Sequential'])
            if turn_mode == self.enums['TurnMode']['Simultaneous']:
                self.configuration_type = "simultaneous"
                self.turn_structure = TURN_STRUCTURE_SIMULTANEOUS
            else:
                # Sequential mode (default) — preserves backward compatibility with "rr"
                self.configuration_type = "sequential"
                self.turn_structure = TURN_STRUCTURE_SEQUENTIAL_AB
            self.alternating_initiative = self.profile.get('Alternating-Initiative', False)
        else:
            # DEPRECATED: N-player path retained for backward compatibility.
            # New scenarios should use the 2-player architecture.
            self.configuration_type = configuration_type
            if configuration_type.lower() not in configuration_type_map[self.num_actors]:
                raise ValueError(f"Invalid configuration type: {configuration_type}. "
                                 f"Valid types are: {list(configuration_type_map[self.num_actors].keys())}")
            self.turn_structure = configuration_type_map[self.num_actors][configuration_type]
            self.alternating_initiative = False



        self.initial_action_sequence = [
            ActionSequenceData(**action,
                               coa_characteristics_list=action_sequence_characteristics_from_system_data(
                                   system_data=self.profile,
                                   action_sequence=action['coa_id_list'],
                                   enums=self.enums,
                               )) for action in initial_action_sequence
        ]

        self.data = SimulationData(
            sim_id=self.sim_id,
            name=sim_name if sim_name is not None else sim_id,
            turns=[],
            initial_system_data=self.profile,
            initial_actors_data=actors,
            initial_action_sequence=self.initial_action_sequence,
            scenario_init_data_id=scenario_init_data_id,
            scenario_config=self.scenario_config,
        )

        self.current_turn = 0
        self.current_step = 0
        self.max_num_turns = max_num_turns

        # 2-Player Refactor: Parse exogenous event definitions from config
        raw_exo_configs = self.profile.get('Exogenous-Events', [])
        self.exogenous_event_defs = parse_exogenous_event_configs(raw_exo_configs)

        # Temporal Layer: Initialize World State Timeline and processing components
        self._init_temporal_layer(simulation_parameters, scenario_config, actors)

        # Temporal Layer: Resolve per-actor temporal params to system defaults.
        # Actors may arrive with None for these fields (meaning "use system default").
        # Resolved at setup time so nothing is nullable at runtime.
        self._resolve_actor_temporal_defaults(actors)

        # Per-actor cognitive/strategic parameters: resolve to simulation_parameters
        # defaults for backward compatibility. New payloads can put these in each
        # actor's profile for per-actor differentiation; legacy payloads that put
        # them in simulation_parameters still work via this fallback.
        self._resolve_actor_param_defaults(actors, simulation_parameters, scenario_parameters)

        # Commitment Register: Initialize per-actor registers and scenario data
        self._init_commitment_layer(simulation_parameters, scenario_config, actors)
        self._resolve_actor_commitment_defaults(actors)




    def initialize_enums(self, scenario_config: dict):
        """
        Initializes enumerations based on scenario configuration.
        :param scenario_config: A dictionary containing scenario configuration parameters.
        """
        default_goal_list = [
            "Avoid_Nuclear_War",
            "Preserve_National_Sovereignty",
            "Maintain_Regime_Stability_and_Legitimacy",
            "Achieve_Military_Superiority",
            "Maintain_Alliance_Security_and_Credibility",
            "Prevent_WMD_Proliferation",
            "Enhance_Deterrence_Credibility",
            "Strengthen_Alliance_Cohesion",
            "Expand_Sphere_of_Influence",
            "Achieve_Historical_and_Ideological_Goals",
            "Ensure_Domestic_Economic_Growth_and_Stability",
            "Secure_Access_to_Strategic_Resources_and_Energy",
            "Achieve_Technological_and_Scientific_Leadership",
            "Maintain_Domestic_Political_Support",
            "Achieve_Information_Dominance",
        ]
        goal_list = safe_get(scenario_config, 'objectives', default_goal_list)

        default_action_list = [
            "Establish_Secret_Diplomatic_Back_Channel",
            "Issue_Public_Ultimatum",
            "Offer_Secret_Quid_Pro_Quo_Deal",
            "Take_Punitive_Diplomatic_Action",
            "Cede_Authority_to_a_Third_Party_Actor",
            "Forward_Deploy_Military_Forces",
            "Increase_National_Military_Alert_Level",
            "Increase_Surveillance_of_Target_Area",
            "Establish_Naval_Blockade_Quarantine_Zone",
            "Conduct_Limited_Kinetic_Strike_on_Military_Target",
            "Initiate_Crisis_in_a_Secondary_Theater",
            "Conduct_Covert_Sabotage_of_Military_Assets",
            "Deliver_Major_Public_Address_on_Crisis",
            "Publicly_Disclose_Intelligence_on_Adversary",
            "Launch_Covert_Information_Campaign",
            "Threaten_Broad_Economic_Sanctions",
            "Impose_Targeted_Sanctions",
            "Impose_Broad_Economic_Embargo",
            "Pressure_Allies_to_Join_Sanctions_Regime",
            "Do Nothing",
        ]
        action_list = safe_get(scenario_config, 'actions', default_action_list)
        
        # Check for 'Do_Nothing' action and change to 'Do Nothing' for consistency
        if 'Do_Nothing' in action_list:
            idx = action_list.index('Do_Nothing')
            action_list[idx] = 'Do Nothing'

        self.enums = {
            'Goal': Enumeration(values=goal_list),
            'Action': Enumeration(values=action_list),
            'Char': Char(),
            'Relationship': Relationship(),
            'Party': Party(),
            'TimeHorizon': TimeHorizon(),
            'ActionType': ActionType(),
            'ReferencePointType': ReferencePointType(),
            'TurnMode': TurnMode(),
            'ExogenousTriggerType': ExogenousTriggerType(),
            'RelationshipTag': RelationshipTag(),
            'LifecycleState': LifecycleState(),
            'TemporalArchetype': TemporalArchetype(),
            'CommitmentType': CommitmentType(),
            'CommitmentTriggerStatus': CommitmentTriggerStatus(),
            'ImplicitCommitmentStatus': ImplicitCommitmentStatus(),
            'PenaltyType': PenaltyType(),
            'LifecycleBinding': LifecycleBinding(),
        }

    @property
    def do_nothing_id(self):
        """Action index for 'Do Nothing', or None if the scenario has no such action."""
        if not hasattr(self, '_do_nothing_id_cache'):
            action_enum = self.enums['Action']
            if 'Do Nothing' in action_enum:
                self._do_nothing_id_cache = action_enum['Do Nothing']
            elif 'Do_Nothing' in action_enum:
                self._do_nothing_id_cache = action_enum['Do_Nothing']
            else:
                self._do_nothing_id_cache = None
        return self._do_nothing_id_cache

    def _init_temporal_layer(self, simulation_parameters: dict, scenario_config: dict,
                             actors: list):
        """
        Initialize Temporal Layer components.

        Creates the World State Timeline, parses temporal profiles from config,
        and initializes the pre-processor, reviews, and planning heuristic.

        Temporal profiles are per-actor: each actor can have different action
        durations, decay patterns, and lifecycle characteristics. Scenario-level
        profiles serve as shared defaults; per-actor overrides (from the actor
        payload's 'temporal_profiles' key) take precedence.

        When no temporal profiles are defined for any actor, the layer is
        inactive: all mechanisms return zero/passthrough and existing behavior
        is preserved.
        """
        # Parse shared defaults from scenario config (empty list = no profiles)
        # days_per_turn enables real-world-time conversion (Section 1.6)
        raw_shared_profiles = scenario_config.get('temporal_profiles', [])
        days_per_turn = scenario_config.get('days_per_turn', None)
        self.days_per_turn = days_per_turn
        shared_profiles = parse_temporal_profiles_from_config(
            raw_shared_profiles, days_per_turn=days_per_turn
        )

        # Per-actor temporal profiles: check actor data, fall back to shared.
        # Each actor can define different action durations and lifecycle patterns.
        #
        # Positional offset for per-actor lists that lack explicit coa_id/coa_index:
        # If the shared (scenario_config) profiles include key 0 (meaning the
        # playbook's action numbering starts at 0, i.e. no Do_Nothing offset),
        # per-actor positional lists should also start at 0.  When shared
        # profiles start at 1 (Do_Nothing occupies index 0 but is absent from
        # the profile list), the default offset=1 is correct.
        actor_positional_offset = 0 if (shared_profiles and 0 in shared_profiles) else 1
        self.temporal_profiles_by_actor = {}
        for actor in actors:
            actor_id = actor['actor_id']
            raw_actor_profiles = actor.pop('temporal_profiles', None)
            if raw_actor_profiles is not None:
                actor_profiles = parse_temporal_profiles_from_config(
                    raw_actor_profiles, days_per_turn=days_per_turn,
                    positional_offset=actor_positional_offset,
                )
            else:
                # Use shared scenario-level profiles as default
                actor_profiles = shared_profiles
            self.temporal_profiles_by_actor[actor_id] = actor_profiles
            # Store on actor dict for event.py merge path
            actor['Temporal-Profiles'] = actor_profiles

        # Layer is active if ANY actor has profiles
        self.temporal_layer_active = any(
            len(p) > 0 for p in self.temporal_profiles_by_actor.values()
        )

        # World State Timeline — persists across all turns
        self.world_state_timeline = WorldStateTimeline()

        # Temporal simulation parameters — extracted with defaults
        sim_params = simulation_parameters or {}
        self.temporal_params = {
            'perception_threshold': safe_get(sim_params, 'perception_threshold', 0.1),
            'expiry_threshold': safe_get(sim_params, 'expiry_threshold', 0.05),
            'sustaining_impact_factor': safe_get(sim_params, 'sustaining_impact_factor', 0.3),
            'sustaining_decay_exponent': safe_get(sim_params, 'sustaining_decay_exponent', 0.4),
            'max_sustaining_layers': safe_get(sim_params, 'max_sustaining_layers', 10),
            'temporal_discount_rate': safe_get(sim_params, 'temporal_discount_rate', 0.1),
            'withdrawal_reluctance_weight': safe_get(sim_params, 'withdrawal_reluctance_weight', 0.3),
            'cancellation_reluctance_weight': safe_get(sim_params, 'cancellation_reluctance_weight', 0.4),
            'anticipatory_weight': safe_get(sim_params, 'anticipatory_weight', 0.2),
            'duration_damping_rate': safe_get(sim_params, 'duration_damping_rate', 0.3),
            'ledger_lookback': safe_get(sim_params, 'ledger_lookback', 3),
            'novelty_decay_rate': safe_get(sim_params, 'novelty_decay_rate', 0.4),
            'sustaining_cost_weight': safe_get(sim_params, 'sustaining_cost_weight', 0.1),
        }

        # Store temporal params and layer-active flag in system profile for Event access.
        # Temporal-Profiles is NOT stored here — it's per-actor, on each actor dict.
        self.profile['Temporal-Params'] = self.temporal_params
        self.profile['Temporal-Layer-Active'] = self.temporal_layer_active

        # Initialize processing components
        self.temporal_preprocessor = TemporalPreProcessor(self.temporal_params)
        self.sustaining_review = SustainingReview(self.temporal_params)
        self.continuation_review = ContinuationReview(self.temporal_params)
        self.planning_heuristic = TemporalPlanningHeuristic(self.temporal_params)

    def _resolve_actor_temporal_defaults(self, actors: list):
        """
        Replace None per-actor temporal params with system-level defaults.
        Called once at init so values are always concrete at runtime.
        """
        defaults = {
            'Temporal-Discount-Rate': self.temporal_params.get('temporal_discount_rate', 0.1),
            'Withdrawal-Reluctance-Weight': self.temporal_params.get('withdrawal_reluctance_weight', 0.3),
            'Cancellation-Reluctance-Weight': self.temporal_params.get('cancellation_reluctance_weight', 0.4),
            'Anticipatory-Weight': self.temporal_params.get('anticipatory_weight', 0.2),
        }
        for actor in actors:
            for key, default_val in defaults.items():
                if actor.get(key) is None:
                    actor[key] = default_val

    def _resolve_actor_param_defaults(self, actors: list,
                                      simulation_parameters: dict,
                                      scenario_parameters: dict):
        """
        Resolve per-actor cognitive/strategic parameters from system-level defaults.

        Each actor may override cognitive/strategic tuning parameters in its
        own dict. For backward compatibility, legacy payloads that specify
        them in simulation_parameters or scenario_parameters still work:
        this method fills any missing actor values from those sources.

        Called once at init after Actor() construction so nothing is None at runtime.
        """
        sim = simulation_parameters or {}
        scn = scenario_parameters or {}

        # Inherent-Ambiguity-Vector and Objectives-Time-Horizon need array
        # conversion; the rest are scalars or dicts passed through directly.
        _raw_iav = sim.get('inherent_ambiguity_vector', None)
        iav_default = (
            _drop_pa_from_vector(_raw_iav).reshape((len(self.enums['Char']), 1))
            if _raw_iav is not None else None
        )
        _raw_oth = sim.get('objectives_time_horizon', None)
        oth_default = (
            np.array(_raw_oth).reshape((len(self.enums['Goal']), 1))
            if _raw_oth is not None else None
        )

        # Scalar/dict defaults: {actor_key: (source_dict_key, source_dict, default)}
        scalar_defaults = {
            'Surprise-Weight':                   ('surprise_weight', sim, None),
            'Signal-Strength-Weights':           ('signal_strength_weights', sim, None),
            'Urgency-Sensitivity':               ('urgency_sensitivity', sim, None),
            'Time-Horizon-Discount-Factor':      ('time_horizon_discount_factor', sim, None),
            'Desperation-Scaling-Factor':         ('desperation_scaling_factor', sim, 1.0),
            'Base-Risk-Scaling-Factor':           ('base_risk_scaling_factor', sim, 1.0),
            'Deescalation-Bonus-Value':           ('deescalation_bonus_value', sim, None),
            'Peer-Capability-Ratio':              ('peer_capability_ratio', sim, None),
            'Aversion-Factor-Value':              ('aversion_factor_value', sim, None),
            'Bias-Amplification-Parameter':       ('bias_amplification_parameter', sim, 1.0),
            'Severity-Activation-Threshold':      ('severity_activation_threshold', sim, 0.0),
            'Base-Decay-Rate':                    ('base_decay_rate', sim, 0.3),
            'Priority-Blending-Weight':           ('priority_blending_weight', sim, 0.5),
            'Alliance-Salience-Scaling-Factor':    ('alliance_salience_scaling_factor', sim, 0.0),
            'Competitive-Salience-Scaling-Factor': ('competitive_salience_scaling_factor', sim, 0.0),
            'Action-Efficacy-Discount':           ('action_efficacy_discount', sim,
                                                   safe_get(sim, 'effect_scaling_factor', 0.9)),
            'Vindictiveness-Parameter':           ('vindictiveness_parameter', sim, 0.0),
            'Diminishing-Returns-Rate':            ('diminishing_returns_rate', sim, 5.0),
            'Problem-Focus-Parameter':            ('problem_focus_parameter', sim, 1.0),
            'Crisis-Threshold':                   ('crisis_threshold', scn, None),
            'Risk-Reward-Blender-Parameter':      ('risk_reward_blender_parameter', sim, 0.0),
            # DEPRECATED: kept for checker schema compatibility; unused in 2-player pipeline.
            'Adversary-Threshold':                ('adversary_threshold', scn, -0.5),
            'Ally-Threshold':                     ('ally_threshold', scn, 0.5),
        }

        for actor in actors:
            # Scalar/dict parameters
            for actor_key, (source_key, source_dict, default) in scalar_defaults.items():
                if actor.get(actor_key) is None:
                    val = safe_get(source_dict, source_key, default)
                    if val is not None:
                        actor[actor_key] = val

            # Array parameters (need special handling for reshape)
            if actor.get('Inherent-Ambiguity-Vector') is None and iav_default is not None:
                actor['Inherent-Ambiguity-Vector'] = iav_default.copy()
            if actor.get('Objectives-Time-Horizon') is None and oth_default is not None:
                actor['Objectives-Time-Horizon'] = oth_default.copy()

    def _init_commitment_layer(self, simulation_parameters: dict, scenario_config: dict,
                               actors: list):
        """
        Initialize Commitment Register components.

        Parses support/cost sets, commitment-creating action metadata, and
        proposal response actions from scenario config with per-actor overrides.
        Extracts simulation parameters with defaults. Initializes per-actor
        CommitmentRegisters and PAPT states.

        All three commitment structures are per-actor: each actor can have
        different strategic trajectories (support/cost bundles), different
        commitment-creating actions, and different proposal response logic.
        Scenario-level definitions serve as shared defaults; per-actor overrides
        (from the actor payload) take precedence.

        When no commitment data is defined for any actor, the layer is inactive:
        all mechanisms return zero/passthrough and existing behavior is preserved.
        """
        # Parse shared defaults from scenario config
        raw_shared_support_cost = scenario_config.get('support_cost_sets', [])
        shared_support_cost = parse_support_cost_sets_from_config(raw_shared_support_cost)

        raw_shared_commitment_actions = scenario_config.get('commitment_creating_actions', [])
        shared_commitment_actions = parse_commitment_creating_actions_from_config(
            raw_shared_commitment_actions
        )

        raw_shared_proposal_responses = scenario_config.get('proposal_response_actions', [])
        shared_proposal_responses = parse_proposal_response_actions_from_config(
            raw_shared_proposal_responses
        )

        # Per-actor commitment structures: check actor data, fall back to shared.
        self.support_cost_sets_by_actor = {}
        self.commitment_creating_actions_by_actor = {}
        self.proposal_response_actions_by_actor = {}

        for actor in actors:
            actor_id = actor['actor_id']

            # Support-Cost-Sets
            # Accept DPM-native grouped format (support_cost_sets) or
            # MAGIC flat entry format (support_set_entries / cost_set_entries).
            raw_actor_sc = actor.pop('support_cost_sets', None)
            if raw_actor_sc is None:
                raw_support = actor.pop('support_set_entries', None)
                raw_cost = actor.pop('cost_set_entries', None)
                if raw_support or raw_cost:
                    raw_actor_sc = _adapt_magic_support_cost_sets(
                        raw_support, raw_cost, actor_id, self.enums['Action']
                    )
            if raw_actor_sc is not None:
                actor_sc = parse_support_cost_sets_from_config(raw_actor_sc)
            else:
                actor_sc = shared_support_cost
            self.support_cost_sets_by_actor[actor_id] = actor_sc
            actor['Support-Cost-Sets'] = actor_sc

            # Commitment-Creating-Actions
            raw_actor_cca = actor.pop('commitment_creating_actions', None)
            if raw_actor_cca is not None:
                actor_cca = parse_commitment_creating_actions_from_config(raw_actor_cca)
            else:
                actor_cca = shared_commitment_actions
            self.commitment_creating_actions_by_actor[actor_id] = actor_cca
            actor['Commitment-Creating-Actions'] = actor_cca

            # Proposal-Response-Actions
            raw_actor_pra = actor.pop('proposal_response_actions', None)
            if raw_actor_pra is not None:
                actor_pra = parse_proposal_response_actions_from_config(raw_actor_pra)
            else:
                actor_pra = shared_proposal_responses
            self.proposal_response_actions_by_actor[actor_id] = actor_pra
            actor['Proposal-Response-Actions'] = actor_pra

        # Layer is active if ANY actor has commitment data
        self.commitment_layer_active = any(
            len(self.support_cost_sets_by_actor.get(aid, {})) > 0
            or len(self.commitment_creating_actions_by_actor.get(aid, {})) > 0
            or len(self.proposal_response_actions_by_actor.get(aid, {})) > 0
            for aid in range(self.num_actors)
        )

        # Extract simulation parameters with defaults
        self.commitment_params = extract_commitment_params(simulation_parameters)

        # Store commitment params and layer-active flag in system profile for Event access.
        # Support-Cost-Sets, Commitment-Creating-Actions, and Proposal-Response-Actions
        # are NOT stored here — they're per-actor, on each actor dict.
        self.profile['Commitment-Params'] = self.commitment_params
        self.profile['Commitment-Layer-Active'] = self.commitment_layer_active

        # Initialize per-actor commitment registers
        self.commitment_registers = {}
        for actor_id in range(self.num_actors):
            self.commitment_registers[actor_id] = CommitmentRegister(actor_id)

        # Initialize per-actor PAPT states
        self.papt_states = {}
        for actor_id in range(self.num_actors):
            self.papt_states[actor_id] = PAPTState()

    def _resolve_actor_commitment_defaults(self, actors: list):
        """
        Initialize commitment-related fields on each actor to non-None defaults.
        Called once at init so values are always concrete at runtime.
        """
        for actor in actors:
            actor_id = actor['actor_id']
            # Persist serialized register state on actor data
            actor['Commitment-Register-State'] = (
                self.commitment_registers[actor_id].to_serializable()
            )
            # Persist PAPT state on actor data
            actor['PAPT-State'] = self.papt_states[actor_id].to_dict()

    def run_temporal_preprocessing(self, actor_id: int, actor_data: dict, system_data: dict):
        """
        Run the Temporal Pre-Processor for an actor's turn.

        Called from process_step before creating the Event. Modifies actor_data
        in-place (Self-Profile sustaining cost debits) and returns temporal
        metadata for the Event to consume.

        Note: Sustaining and continuation reviews have been relocated to
        Stage 3 inside event.py (stage_3_reviews_and_adjust_discrepancy)
        so they operate on the current turn's fresh discrepancy and use the
        correct Action-Utility-Matrix.

        When the temporal layer is inactive, returns empty structures.
        """
        if not self.temporal_layer_active:
            return {
                'observable_events': [],
                'transitioned_ids': set(),
            }

        current_turn = self.current_turn
        spv = actor_data['Self-Profile-Vector']

        # Run the 4-step pre-processor
        observable_events, transitioned_ids = self.temporal_preprocessor.process(
            self.world_state_timeline, current_turn, actor_id, spv
        )

        return {
            'observable_events': observable_events,
            'transitioned_ids': transitioned_ids,
        }

    def create_temporal_records(self, actor_id: int, chosen_sequence: list,
                                chosen_targets: list, current_turn: int,
                                system_data: dict):
        """
        Create World State Timeline records for newly chosen actions.
        Called after Stage 4 (action selection complete).

        Each chosen action gets a lifecycle record initialized to INITIATED
        (the pre-processor on the next turn will advance it).
        """
        if not self.temporal_layer_active:
            return

        chars_matrix = system_data.get('COA-Characteristics-Matrix')
        for i, coa_id in enumerate(chosen_sequence):
            # Skip "Do Nothing" (no timeline record)
            if self.do_nothing_id is not None and coa_id == self.do_nothing_id:
                continue

            target_id = chosen_targets[i] if chosen_targets and i < len(chosen_targets) else -1
            profile = self.temporal_profiles_by_actor[actor_id].get(coa_id)

            # Get characteristics vector for this action
            if chars_matrix is not None and coa_id < chars_matrix.shape[1]:
                chars = chars_matrix[:, coa_id].reshape((len(self.enums['Char']), 1))
            else:
                chars = np.zeros((len(self.enums['Char']), 1))

            # Skip if this actor already has an active instance of this action
            if self.world_state_timeline.has_active_action(actor_id, coa_id):
                continue

            self.world_state_timeline.create_record(
                actor_id=actor_id,
                coa_id=coa_id,
                target_id=target_id,
                lifecycle_state=LS_INITIATED,
                turn_initiated=current_turn,
                characteristics_vector=chars,
                temporal_profile=profile,
            )

    def create_implicit_commitment_records(
        self, actor_id: int, chosen_sequence: list, current_turn: int,
        system_data: dict,
    ):
        """
        Create implicit commitment records for newly chosen actions.
        Called after create_temporal_records in process_step.

        Each chosen action gets an implicit commitment record with
        initial_influence derived from its Clarity and Irreversibility.

        Lifecycle binding is ActiveOnly when a temporal record exists for
        the action (influence holds while the action is in progress),
        or Persistent when no temporal profile is defined (decay starts
        immediately from the turn after creation).

        Spec reference: Section 2.4.
        """
        if not self.commitment_layer_active:
            return

        chars_matrix = system_data.get('COA-Characteristics-Matrix')
        if chars_matrix is None:
            return

        register = self.commitment_registers[actor_id]
        params = self.commitment_params

        char_enum = self.enums['Char']
        clarity_idx = char_enum['Clarity']
        irreversibility_idx = char_enum['Irreversibility']

        for coa_id in chosen_sequence:
            # Skip "Do Nothing"
            if self.do_nothing_id is not None and coa_id == self.do_nothing_id:
                continue

            # Skip if there's already an active implicit record for this action
            if register.has_active_implicit_for_action(coa_id):
                continue

            # Extract characteristics
            if coa_id < chars_matrix.shape[1]:
                clarity = float(chars_matrix[clarity_idx, coa_id])
                irreversibility = float(chars_matrix[irreversibility_idx, coa_id])
            else:
                clarity = 0.0
                irreversibility = 0.0

            initial_influence = compute_initial_influence(
                clarity=clarity,
                irreversibility=irreversibility,
                influence_base=params['influence_base'],
                influence_clarity_weight=params['influence_clarity_weight'],
                influence_irreversibility_weight=params['influence_irreversibility_weight'],
            )

            # Determine lifecycle binding: ActiveOnly if temporal profile exists,
            # Persistent if no temporal profile (action has no lifecycle to bind to)
            has_temporal = coa_id in self.temporal_profiles_by_actor.get(actor_id, {})
            binding = LB_ACTIVE_ONLY if has_temporal else LB_PERSISTENT

            # Find the temporal record ID if one was just created
            action_record_id = -1
            if has_temporal and self.temporal_layer_active:
                # Look for the most recent record for this actor+action
                for rec in self.world_state_timeline.get_records_by_actor(actor_id):
                    if rec.coa_id == coa_id:
                        action_record_id = rec.record_id
                        break

            register.create_implicit_record(
                source_coa_id=coa_id,
                source_action_record_id=action_record_id,
                turn_created=current_turn,
                initial_influence=initial_influence,
                lifecycle_binding=binding,
            )

    def create_explicit_commitment_records(
        self, actor_id: int, chosen_sequence: list, current_turn: int,
        system_data: dict,
    ):
        """
        Create explicit commitment records for commitment-creating actions.

        When a commitment-creating action is taken, it produces an explicit
        commitment record in addition to the implicit record (dual record
        creation, spec Section 2.5). The explicit record has trigger conditions,
        a committed response, credibility stakes, and audience cost exposure.

        The trigger condition, response template, and expiry are taken from the
        CommitmentCreatingActionMeta defined in the scenario config.

        Audience cost exposure is derived from the action's Clarity (public
        actions create more audience cost exposure). Credibility stake is
        derived from the action's characteristics.

        Spec reference: Section 2.2, Section 2.5.
        """
        if not self.commitment_layer_active:
            return

        actor_commitment_actions = self.commitment_creating_actions_by_actor.get(actor_id, {})
        if not actor_commitment_actions:
            return

        chars_matrix = system_data.get('COA-Characteristics-Matrix')
        register = self.commitment_registers[actor_id]

        char_enum = self.enums['Char']
        clarity_idx = char_enum['Clarity']
        # Use Irreversibility as a proxy for credibility stake if no explicit
        # credibility characteristic is defined.
        if 'Credibility' in char_enum:
            credibility_idx = char_enum['Credibility']
        elif 'Irreversibility' in char_enum:
            credibility_idx = char_enum['Irreversibility']
        else:
            credibility_idx = None

        for coa_id in chosen_sequence:
            if self.do_nothing_id is not None and coa_id == self.do_nothing_id:
                continue

            meta = actor_commitment_actions.get(coa_id)
            if meta is None or not meta.is_commitment_creating:
                continue

            # Extract audience cost exposure from Clarity
            audience_cost_exposure = 0.0
            credibility_stake = 0.0
            if chars_matrix is not None and coa_id < chars_matrix.shape[1]:
                audience_cost_exposure = float(chars_matrix[clarity_idx, coa_id])
                if credibility_idx is not None:
                    credibility_stake = float(chars_matrix[credibility_idx, coa_id])

            # Find the temporal record ID for linking
            action_record_id = -1
            if self.temporal_layer_active:
                for rec in self.world_state_timeline.get_records_by_actor(actor_id):
                    if rec.coa_id == coa_id:
                        action_record_id = rec.record_id
                        break

            register.create_explicit_record(
                source_coa_id=coa_id,
                source_action_record_id=action_record_id,
                turn_created=current_turn,
                commitment_type=meta.commitment_type,
                trigger_condition=meta.trigger_template,
                committed_response=meta.response_template,
                expiry_turns=meta.default_expiry,
                audience_cost_exposure=audience_cost_exposure,
                credibility_stake=credibility_stake,
                proposal_type=meta.proposal_type,
            )

            # Toggle pair activation: when a commitment is made, the paired
            # withdrawal action becomes available (spec Section 2.2).
            # This is already handled by the existing toggle-pair mechanism
            # in stage_4 — no additional logic needed here.

    def resolve_proposals(self, actor_id: int, chosen_sequence: list,
                          current_turn: int, system_data: dict):
        """
        Resolve proposal outcomes based on the chosen action sequence.

        If the chosen action is an Accept or Reject for a pending proposal,
        resolve it: create mutual commitments (accept) or mark rejected.
        Cross-actor write: acceptance creates promise records in BOTH actors'
        registers.

        Called from process_step after action selection is finalized.

        Spec reference: Section 4.4.
        """
        if not self.commitment_layer_active:
            return []

        actor_proposal_responses = self.proposal_response_actions_by_actor.get(actor_id, {})
        if not actor_proposal_responses:
            return []

        resolutions = []
        adversary_id = 1 - actor_id  # 2-player assumption

        for coa_id in chosen_sequence:
            meta = actor_proposal_responses.get(coa_id)
            if meta is None:
                continue

            # Find the matching pending proposal in the adversary's register
            # (the adversary proposed, this actor is responding)
            adversary_register = self.commitment_registers[adversary_id]
            proposal_record = find_matching_proposal(
                adversary_register, meta.proposal_type
            )
            if proposal_record is None:
                continue

            if meta.response_type == "accept":
                result = resolve_proposal_acceptance(
                    proposer_register=adversary_register,
                    responder_register=self.commitment_registers[actor_id],
                    proposal_commitment_id=proposal_record.commitment_id,
                    accept_action_meta=meta,
                    current_turn=current_turn,
                    accept_coa_id=coa_id,
                    acceptance_credibility_boost=self.commitment_params.get(
                        "acceptance_credibility_boost",
                        0.15,
                    ),
                )
                if result is not None:
                    resolutions.append(result)

            elif meta.response_type == "reject":
                result = resolve_proposal_rejection(
                    proposer_register=adversary_register,
                    proposal_commitment_id=proposal_record.commitment_id,
                    current_turn=current_turn,
                    rejection_resolve_boost=self.commitment_params.get(
                        "rejection_resolve_boost",
                        0.1,
                    ),
                )
                if result is not None:
                    resolutions.append(result)

        return resolutions

    def run_commitment_preprocessing(self, actor_id: int, system_data: dict):
        """
        Run commitment decay, lifecycle binding sync, and expiry for an actor.
        Called from process_step before creating the Event, after temporal
        preprocessing.

        When the commitment layer is inactive, returns immediately.
        """
        if not self.commitment_layer_active:
            return

        register = self.commitment_registers[actor_id]
        params = self.commitment_params
        current_turn = self.current_turn

        # Step 1: Sync lifecycle bindings with temporal layer
        if self.temporal_layer_active:
            register.sync_lifecycle_bindings(
                self.world_state_timeline, current_turn
            )

        # Step 2: Decay and expire implicit commitments
        register.decay_implicit_commitments(
            current_turn=current_turn,
            commitment_decay_exponent=params['commitment_decay_exponent'],
            commitment_expiry_threshold=params['commitment_expiry_threshold'],
        )

    def save_to_dict(self) -> dict:
        """
        Saves the current state of the model to a dictionary.
        :return: A dictionary representing the current state of the model.
        """
        rng_state = self.rng.bit_generator.state if self.rng is not None else None
        return {
            "data": asdict(self.data),
            "rng": rng_state,
        }

    def eventdata_metadata(self):
        return self.event_data_checker.metadata()

    def process_event(self,
                      event_id: str,
                      actor_id: int,
                      actor_data: dict,
                      system_data: dict,
                      action_sequence: list,
                      ):
        """
        Processes an event given an actor and action sequence.
        :param event_id: A unique identifier for the event.
        :param actor_id: The ID of the actor processing the event.
        :param actor_data: The data of the actor processing the event.
        :param system_data: The current state of the system.
        :param action_sequence: A list of actions to be processed in this event.
        :return:
        """
        new_event = Event(
            event_data_checker=self.event_data_checker,
            event_data=EventData(
                event_id=event_id,
                acting_actor_id=actor_id,
                initial_actor_data=actor_data,
                initial_system_data=system_data,
                initial_action_sequence=action_sequence,
                event_data=None,
                resulting_action_sequence=None,
                resulting_actor_data=None,
                resulting_actor_impacts=None,
            ),
            enums=self.enums,
            rng=self.rng,
        )

        return new_event.process_event()

    def process_step(self,
                     step_id: str,
                     step_name: str = None,
                     turn_structure_override: list = None,
                     ):
        """
        Processes a step in the model, updating the turn and step counters.
        :param step_id: A unique identifier for the step.
        :param step_name: An optional name for the step.
        :param turn_structure_override: Optional turn structure to use instead of self.turn_structure
                                        (used by alternating initiative).
        """
        id_dict = tse_id_to_dict(step_id)
        turn_idx = id_dict['turn_id']
        step_idx = id_dict['step_id']

        if turn_idx >= len(self.data.turns):
            self.data.turns.append(
                TurnData(turn_id = f"t{turn_idx}", name = f"t{turn_idx}", steps = [])
            )
            self.current_turn = turn_idx
            self.current_step = 0

        if step_idx >= len(self.data.turns[turn_idx].steps):
            actors_data = self.data.actors_data_before(step_id)
            self.data.turns[turn_idx].steps.append(
                StepData(step_id = step_id,
                         name = step_name,
                         initial_actors_data = actors_data,
                         events = [],
                         resulting_action_sequence=None,
                         resulting_system_data=None,
                         resulting_actors_data=None,
                         )
            )
            self.current_step = step_idx

        if step_idx > 0:
            action_sequence = self.data.turns[turn_idx].steps[step_idx-1].resulting_action_sequence
        elif turn_idx > 0:
            action_sequence = self.data.turns[turn_idx-1].final_action_sequence()
        else:
            action_sequence = self.data.initial_action_sequence

        if action_sequence is None:
            raise ValueError(f"No action sequence available for turn {turn_idx}, step {step_idx}")

        # 2-Player Refactor: Inject exogenous events into the action sequence.
        # Exogenous events appear alongside player-generated actions in the
        # Observable Event Set and are processed through the standard pipeline.
        exogenous_sequences = getattr(self, '_current_turn_exogenous', [])
        if exogenous_sequences:
            action_sequence = list(action_sequence) + exogenous_sequences

        system_data = self.data.system_data_before(step_id)

        step_data = self.data.turns[turn_idx].steps[step_idx]

        effective_structure = turn_structure_override if turn_structure_override is not None else self.turn_structure
        for i, actor_id in enumerate(effective_structure[step_idx]):

            event_id = f"{step_id}e{i}"
            actor_data = step_data.initial_actors_data[actor_id]

            # Temporal Layer: Run pre-processor and reviews before Event creation.
            # This modifies actor_data in-place (sustaining cost debits) and
            # produces temporal metadata for the Event pipeline.
            temporal_context = self.run_temporal_preprocessing(
                actor_id, actor_data, system_data
            )

            # Inject temporal metadata into system_data for Event consumption.
            # Always present with defaults so the event data checker sees them.
            system_data_for_event = fast_deepcopy(system_data)
            system_data_for_event['Current-Turn'] = self.current_turn
            system_data_for_event['Temporal-Context'] = temporal_context
            system_data_for_event['World-State-Timeline'] = self.world_state_timeline
            if self.temporal_layer_active:
                system_data_for_event['Temporal-Planning-Heuristic'] = self.planning_heuristic

            # Inject review instances for Stage 3 consumption.
            # Reviews run inside event.py (stage_3_reviews_and_adjust_discrepancy)
            # using the current turn's fresh discrepancy from Stage 2.
            system_data_for_event['Sustaining-Review'] = self.sustaining_review
            system_data_for_event['Continuation-Review'] = self.continuation_review

            # Commitment Register: Run decay, lifecycle binding sync, and expiry
            # before Event creation so the landscape reflects current influence.
            self.run_commitment_preprocessing(actor_id, system_data)

            # Inject commitment state for Event consumption.
            # Always present with defaults so event_data_checker sees them.
            system_data_for_event['Commitment-Register-State'] = (
                self.commitment_registers[actor_id].to_serializable()
            )
            system_data_for_event['PAPT-State'] = self.papt_states[actor_id].to_dict()
            # Inject adversary's register for proposal response eligibility gating.
            # 2-player: adversary is always 1 - actor_id.
            adversary_id = 1 - actor_id
            system_data_for_event['Adversary-Commitment-Register-State'] = (
                self.commitment_registers[adversary_id].to_serializable()
            )
            # Proposal-Response-Actions is per-actor: carried on the actor dict
            # (set during _init_commitment_layer), so it flows through the
            # actor side of the event_data merge. No system-data injection needed.

            event_data = self.process_event(
                event_id = event_id,
                actor_id = actor_id,
                actor_data = actor_data,
                system_data = system_data_for_event,
                action_sequence = action_sequence,
            )

            # Temporal Layer: Create timeline records for newly chosen actions
            if self.temporal_layer_active and event_data.resulting_action_sequence is not None:
                chosen_seq = event_data.resulting_action_sequence.coa_id_list
                chosen_targets = event_data.event_data.get("Chosen-Adversary-Targets", [])
                self.create_temporal_records(
                    actor_id, chosen_seq, chosen_targets,
                    self.current_turn, system_data
                )

            # Commitment Register: Create implicit records for newly chosen actions
            if self.commitment_layer_active and event_data.resulting_action_sequence is not None:
                chosen_seq = event_data.resulting_action_sequence.coa_id_list
                self.create_implicit_commitment_records(
                    actor_id, chosen_seq,
                    self.current_turn, system_data
                )
                # Dual record creation: commitment-creating actions also
                # produce explicit commitment records (spec Section 2.5).
                self.create_explicit_commitment_records(
                    actor_id, chosen_seq,
                    self.current_turn, system_data
                )
                # Proposal resolution: if chosen action is an Accept/Reject,
                # resolve the matching proposal (cross-actor commitment creation).
                proposal_resolutions = self.resolve_proposals(
                    actor_id, chosen_seq,
                    self.current_turn, system_data
                )
                if proposal_resolutions:
                    event_data.event_data["Proposal-Resolutions"] = proposal_resolutions

            if i >= len(step_data.events):
                step_data.events.append(event_data)
            else:
                step_data.events[i] = event_data

        step_data.finalize_step()

        self.current_step += 1

        return step_data

    def get_turn_structure_for_turn(self, turn_idx):
        """
        Returns the turn structure for a given turn, accounting for
        alternating initiative in sequential mode.

        2-Player Refactor: When alternating_initiative is enabled and
        turn_mode is sequential, the actor who moves first alternates
        each turn (A→B on even turns, B→A on odd turns).
        """
        if (self.num_actors == 2 and
            getattr(self, 'alternating_initiative', False) and
            self.configuration_type == "sequential"):
            if turn_idx % 2 == 0:
                return TURN_STRUCTURE_SEQUENTIAL_AB
            else:
                return TURN_STRUCTURE_SEQUENTIAL_BA
        return self.turn_structure

    def evaluate_exogenous_events(self, turn_idx):
        """
        Evaluate exogenous event triggers for this turn and return
        triggered events as ActionSequenceData objects.

        See Multi-Actor Refactor Spec v0.1, Section 4.4.
        """
        if not hasattr(self, 'exogenous_event_defs') or not self.exogenous_event_defs:
            return []

        # Build simulation state snapshot for conditional trigger evaluation
        simulation_state = {}
        if len(self.data.turns) > 0 and turn_idx > 0:
            prev_turn = self.data.turns[turn_idx - 1]
            if prev_turn.final_system_data():
                simulation_state.update(prev_turn.final_system_data())

        triggered = evaluate_triggers(
            self.exogenous_event_defs,
            turn_number=turn_idx,
            simulation_state=simulation_state,
            rng=self.rng,
        )

        exogenous_sequences = []
        for event_def in triggered:
            seq = create_exogenous_action_sequence(event_def, self.enums)
            exogenous_sequences.append(seq)

        return exogenous_sequences

    def process_turn(self, turn_id: str, turn_name: str = None):
        """
        Processes a turn in the model, resetting the step counter and processing the initial action sequence.
        Moves through a turn using the automatically chosen actions.
        :param turn_id: A unique identifier for the turn.
        :param turn_name: An optional name for the turn.
        :return: A list of actions chosen by the actors at the end of the turn.
        """
        id_dict = tse_id_to_dict(turn_id)
        turn_idx = id_dict['turn_id']
        if turn_idx >= len(self.data.turns):
            self.data.turns.append(TurnData(turn_id = turn_id, name = turn_name, steps = []))
            self.current_turn = turn_idx
            self.current_step = 0

        # 2-Player Refactor: Evaluate exogenous event triggers for this turn.
        # Triggered events are injected into the action sequence alongside
        # player-generated actions, processed through the standard pipeline.
        self._current_turn_exogenous = self.evaluate_exogenous_events(turn_idx)

        turn_data = self.data.turns[turn_idx]

        # 2-Player Refactor: use turn-specific structure for alternating initiative
        effective_turn_structure = self.get_turn_structure_for_turn(turn_idx)

        for i in range(len(effective_turn_structure)):
            step_id = f"{turn_id}s{i}"
            step_data = self.process_step(step_id=step_id,
                                          turn_structure_override=effective_turn_structure)

            if i >= len(turn_data.steps):
                turn_data.steps.append(step_data)
            else:
                turn_data.steps[i] = step_data

        return turn_data

    def step_sim_forward(self):
        """
        Advances the simulation by one step.
        :return: The data of the newly created step.
        """
        effective_structure = self.get_turn_structure_for_turn(self.current_turn)

        # Evaluate exogenous events at the START of each new turn (step 0).
        # This mirrors the logic in process_turn() but works for the step-by-step
        # UI path (run_step / run_all_steps) which bypasses process_turn().
        if self.current_step == 0:
            self._current_turn_exogenous = self.evaluate_exogenous_events(self.current_turn)

        step_id = f"t{self.current_turn}s{self.current_step}"
        self.process_step(step_id=step_id, turn_structure_override=effective_structure)

        if self.current_step >= len(effective_structure):
            self.current_turn += 1
            self.current_step = 0

    def step_sim_to_end(self, from_step_id: str = None):
        """
        Advances the simulation to the end of the maximum number of turns.
        :return: The data of the final turn.
        """
        if from_step_id is not None:
            # reset sim to provided step
            id_dict = tse_id_to_dict(from_step_id)
            self.current_turn = id_dict["turn_id"]
            self.current_step = id_dict.get("step_id", 0)

        while self.current_turn < self.max_num_turns:
            self.step_sim_forward()

    def ontology(self):
        """
        Returns the ontology of the model as a dictionary.
        :return: A dictionary representing the ontology of the model.
        """
        impact_map = get_impact_to_profile_map(self.enums['Char'])
        char_members = self.enums['Char'].members()
        impact_dim_labels = [char_members[profile_idx] for profile_idx in sorted(impact_map.values())]
        return {
            "characteristics": char_members,
            "objectives": self.enums['Goal'].members(),
            "actions": self.enums['Action'].members(),
            "relationships": self.enums['Relationship'].members(),
            "parties": self.enums['Party'].members(),
            "TimeHorizon": self.enums['TimeHorizon'].members(),
            "resource_dimensions": impact_dim_labels,
        }

    def state(self):
        """
        Returns the current state of the model as a dictionary.
        Includes the live World-State-Timeline at the top level since
        resulting_system_data is json_excluded on StepData (too large
        with all static parameters).
        :return: A dictionary representing the current state of the model.
        """
        out = to_builtin(self.data)
        # Expose temporal / commitment state that would otherwise be lost
        # to json_exclude on resulting_system_data.
        out['world_state_timeline'] = to_builtin(self.world_state_timeline)
        out['current_turn'] = self.current_turn
        return out

    def update_resulting_action(self, event_id: str, new_action_sequence: list):
        """
        Updates the resulting action sequence of a specific event.
        :param event_id: The ID of the event to update.
        :param new_action_sequence: The new action sequence to set.
        """
        id_dict = tse_id_to_dict(event_id)
        turn_idx = id_dict['turn_id']
        step_idx = id_dict['step_id']
        event_idx = id_dict['event_id']

        if turn_idx >= len(self.data.turns) or step_idx >= len(self.data.turns[turn_idx].steps) or event_idx >= len(self.data.turns[turn_idx].steps[step_idx].events):
            raise ValueError(f"Event ID {event_id} does not exist in the model data.")

        event_data = self.data.turns[turn_idx].steps[step_idx].events[event_idx]
        updated_event = Event(
            event_data_checker=self.event_data_checker,
            event_data=event_data,
            rng=self.rng,
            enums=self.enums,
        )
        updated_event.update_chosen_action_sequence(new_action_sequence)

        step_data = self.data.turns[turn_idx].steps[step_idx]
        step_data.finalize_step()


def model_from_json(json_data: dict) -> Model:
    """
    Creates a Model instance from a JSON-like simulation init dictionary.

    This model is a brand new simulation initialized from the provided data,
    not loaded from a saved simulation.

    Provides sensible defaults for fields that raw MAGIC exports do not
    include (simulation_config, initial_action_sequence) so that payloads
    can be run without manual preprocessing.  These defaults match the
    values historically injected by the standalone_app and eucom_shim
    scripts.

    :param json_data: A dictionary containing model parameters and actor profiles.
    :return: An instance of the Model class.
    """
    # --- Provide defaults for fields absent from raw MAGIC exports ---
    # simulation_config: controls run parameters (turns, seed, etc.).
    # In production the frontend supplies these; for direct payload runs
    # we provide safe defaults.
    if "simulation_config" not in json_data:
        json_data["simulation_config"] = {
            "max_actions_per_turn": 2,
            "max_num_turns": 10,
            "num_actions_explored": 5,
            "outcomes_variance": 0,
            "random_distribution": "normal",
            "random_seed": 42,
        }

    # initial_action_sequence: the seed action(s) that bootstrap
    # interpretation at T0.  Default: second actor plays Do_Nothing (coa 0).
    if not json_data.get("initial_action_sequence"):
        num_actors = len(json_data.get("actor_profiles", []))
        json_data["initial_action_sequence"] = [
            {"actor_id": num_actors - 1, "coa_id_list": [0]}
        ]

    actor_profiles = json_data.get("actor_profiles", [])
    for profile in actor_profiles:
        profile['num_total_actors'] = len(actor_profiles)
    model_params = {k: v for k, v in json_data.items() if k != "actor_profiles"}
    if 'sim_id' not in model_params:
        model_params['sim_id'] = "default_sim_id"
    return Model(actor_profiles=actor_profiles, **model_params)

def model_from_saved_sim(saved_sim_data: dict) -> Model:
    """
    Creates a Model instance from saved simulation data.
    :param saved_sim_data: A dictionary containing saved simulation data.
    :return: An instance of the Model class.
    """
    return Model(
        sim_id = "",
        initial_action_sequence = [],
        actor_profiles = [],
        scenario_parameters = {},
        simulation_parameters = {},
        simulation_config = {},
        scenario_init_data_id = "",
        scenario_config = {},
        saved_sim_data = saved_sim_data,
    )


if __name__ == "__main__":
    # Example usage

    with open(
            "../sample_data/model_payload_US-Iraq_No-Fly_Zone_Enforcement_(1991-1993)_[2-Player]_20250911_114808.json") as f:
        model_data = json.load(f)

    model_data["max_num_turns"] = 4
    model = model_from_json(model_data)

    model.step_sim_to_end()
    # model.process_turn("t0")
    # model.process_turn("t1")

    # dump model data to json
    with open("sample_data/test_model_output.json", "w") as f:
        json.dump(to_builtin(model.data), f, indent=4)

