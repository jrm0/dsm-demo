from event_data_checker import EventDataChecker
from data_classes import EventData, ActionSequenceData, EXOGENOUS_ACTOR_ID
from enums import NUM_IMPACT_DIMS, IMPACT_DIM_CAPABILITY, IMPACT_DIM_RESOLVE, accumulate_cost_annotations
from enums import get_impact_to_profile_map, Char as CharEnum
from helpers import fast_deepcopy
from temporal import (
    compute_temporal_benefit_modifier,
    compute_sustained_benefit_bonus,
    filter_playbook_for_temporal,
    screen_prerequisites,
    SustainingReview, ContinuationReview,
    LS_IN_PROGRESS, LS_SUSTAINING, LS_DECAYING, LS_COMPLETED,
    DEFAULT_SUSTAINING_IMPACT_FACTOR, DEFAULT_SUSTAINING_DECAY_EXPONENT,
)
from commitment import (
    CommitmentRegister, CommitmentLandscape, ScreeningFilter,
    PAPTState, PAPTComputer,
    ReconsiderationEvaluator, compute_reciprocity_modifier,
    compute_descriptive_weights,
    evaluate_trigger_conditions, compute_fulfillment_bonus,
    detect_violations, check_explicit_expiry, check_ultimatum_compliance,
    activate_proposal_responses, ProposalResponseActionMeta,
)

import numpy as np
from typing import List

class Event:
    """
    Represents an event in the system, which is a complex action taken by an actor.
    The event is processed through several stages to determine the outcome.
    """

    def __init__(self,
                 event_data_checker: EventDataChecker,
                 event_data: EventData,
                 enums: dict,
                 rng: np.random.Generator = None,
                 ):
        """ Initializes an Event instance. Either pass in `init_data` which contains all
        necessary actor and system parameters, or pass in an `actor` instance and
        a `system_parameters` dictionary.
        :param event_data_checker: An instance of EventDataChecker to validate input and output data.
        :param event_data: An instance of EventData containing all necessary information for the event.

        """
        self.event_data_checker = event_data_checker
        self.enums = enums
        self.rng = rng

        self.data = event_data
        self.observer_id = event_data.acting_actor_id
        self._cached_do_nothing_id = None
        self._do_nothing_resolved = False

        # Collect necessary data for processing from the actor_data and system parameters
        if self.data.event_data is None:
            if self.data.initial_actor_data is None or self.data.initial_system_data is None:
                raise ValueError("Event data must be pre-populated or both initial_actor_data and initial_system_data must be provided.")
            self.data.event_data = fast_deepcopy(self.data.initial_actor_data)
            self.data.event_data.update(fast_deepcopy(self.data.initial_system_data))

        self.data.event_data["Action-Sequence"] = self.data.initial_action_sequence

    def _do_nothing_id(self):
        """Return the Action enum index for 'Do Nothing' / 'Do_Nothing', or None
        if the scenario has no such action."""
        if not self._do_nothing_resolved:
            action_enum = self.enums['Action']
            if 'Do Nothing' in action_enum:
                self._cached_do_nothing_id = action_enum['Do Nothing']
            elif 'Do_Nothing' in action_enum:
                self._cached_do_nothing_id = action_enum['Do_Nothing']
            self._do_nothing_resolved = True
        return self._cached_do_nothing_id

    def _lowest_severity_repeatable(self, data):
        """Return the action ID of the lowest-severity Repeatable action
        that is currently available, or None if none exist.

        Used as a behavioural no-op fallback when Do_Nothing is absent
        and TPS is below the action-discrepancy threshold.
        """
        action_type_vector = data.get("Action-Type-Vector")
        playbook = data.get("Current-Available-Playbook")
        ccm = data.get("COA-Characteristics-Matrix")
        if action_type_vector is None or ccm is None:
            return None
        severity_idx = self.enums['Char']['Severity']
        best_id, best_sev = None, float('inf')
        for aid in range(action_type_vector.shape[0]):
            if action_type_vector[aid, 0] != self.enums['ActionType']['Repeatable']:
                continue
            if playbook is not None and playbook[aid, 0] == 0:
                continue
            sev = float(ccm[severity_idx, aid])
            if sev < best_sev:
                best_sev = sev
                best_id = aid
        return best_id

    def initialize_reference_point_for_turn(self, data):
        """
        Freeze the active PT reference point for this event before any new impacts
        are folded into the Goal Ledger.

        The active reference drives Stage 3 framing. Stage 4 then updates the
        persisted reference state for the next turn.
        """
        if not data.get("PT-Enabled", True):
            return

        ref_type = data.get("Reference-Point-Type", self.enums['ReferencePointType']['StatusQuo'])
        num_goals = len(self.enums['Goal'])

        if ref_type == self.enums['ReferencePointType']['StatusQuo']:
            starting_goal_ledger = data.get("Goal-Ledger", np.zeros((num_goals, 1)))
            data["Reference-Point-Vector"] = starting_goal_ledger.copy()

        elif ref_type == self.enums['ReferencePointType']['Aspiration']:
            baseline_priority = data.get("Baseline-Priority-Vector", np.zeros((num_goals, 1)))
            data["Reference-Point-Vector"] = -baseline_priority.copy()

        elif ref_type == self.enums['ReferencePointType']['Adaptive']:
            current_ref = data.get("Reference-Point-Vector", np.zeros((num_goals, 1)))
            data["Reference-Point-Vector"] = current_ref.copy()


    def stage_1(self, data):
        """
        Process a raw actions through the actor's perceptual filters.

        Loops through the action sequence and processes each action vector.
        """
        # 2-Player Dimension Reduction: Other-Profile-Vector replaces APV-Tensor
        other_profile_vector = data["Other-Profile-Vector"]
        self_profile_vector = data["Self-Profile-Vector"]

        perceived_signal_strengths = []
        base_input_vectors = []
        base_input_action_ids = []   # Action ids aligned to Base-Input-Vectors
        uncertainty_vectors = []

        k = data.get("Sigmoid-Slope-K", 4.0)
        tau = data.get("Sigmoid-Midpoint-Tau", 0.1)

        # Bias Amplification: 1.0 = linear/rational,
        # > 1.0 = small relationship shifts produce large bias,
        # < 1.0 = dampened (even enemies given benefit of the doubt).
        bias_amp = data.get("Bias-Amplification-Parameter", 1.0)

        # 2-Player Refactor: Track exogenous relationship tags for Stage 2
        exogenous_relationship_tags = {}
        exogenous_goal_impact_overrides = {}
        base_input_counter = 0

        for action_sequence in data["Action-Sequence"]:
            actor_index = action_sequence.actor_id
            action_vectors = action_sequence.coa_characteristics_list

            action_ids = action_sequence.coa_id_list

            # 2-Player Refactor: Check if this is an exogenous event source
            is_exogenous = (actor_index == EXOGENOUS_ACTOR_ID)

            for j, action_vector in enumerate(action_vectors):
                action_id = action_ids[j] if action_ids is not None else None

                if is_exogenous:
                    # Exogenous events: no APV entry. Use a neutral prior (0.5 across all chars).
                    # The characteristics come directly from the event definition.
                    apv = np.full((len(self.enums['Char']), 1), 0.5)
                    # Use a static relationship score based on the tag
                    tag = getattr(action_sequence, '_relationship_tag', self.enums['RelationshipTag']['Neutral'])
                    if tag == self.enums['RelationshipTag']['Adversary']:
                        rel_score = -0.8  # Strong adversarial bias
                    elif tag == self.enums['RelationshipTag']['Ally']:
                        rel_score = 0.8   # Strong allied bias
                    else:
                        rel_score = 0.0   # Neutral
                    # Track for Stage 2
                    exogenous_relationship_tags[base_input_counter] = tag
                    goal_override = getattr(action_sequence, '_goal_impact_override', None)
                    if goal_override is not None:
                        exogenous_goal_impact_overrides[base_input_counter] = goal_override
                else:
                    # 2-Player: use Other-Profile-Vector for the other player,
                    # Self-Profile-Vector if observing self
                    if actor_index == self.observer_id:
                        apv = self_profile_vector.reshape((len(self.enums['Char']), 1))
                    else:
                        apv = other_profile_vector.reshape((len(self.enums['Char']), 1))
                    # 2-Player: Relationship-Score is a per-actor scalar
                    rel_score = data["Relationship-Score"]

                # Generate 'true distribution' of the action from its clarity
                mean_estimate = action_vector
                stdev_estimate = (data["Max-Ambiguity-SD"] *
                                  (1 - action_vector[self.enums['Char']['Clarity'], 0]) *
                                  data["Inherent-Ambiguity-Vector"])

                # Calculate the perceived distribution using the observer's analytical competence
                analytical_competence = data["Analytical-Competence"]
                perceived_mean = mean_estimate
                perceived_stdev = stdev_estimate / analytical_competence

                # 1. Calculate raw linear bias (0.0 to 1.0) where 0.5 is Neutral
                raw_bias = 0.5 * (1 - rel_score)

                # 2. Apply Amplification centered on 0.5
                # We calculate the distance from neutrality (-0.5 to 0.5)
                dist_from_center = raw_bias - 0.5
                
                # We scale this to (-1.0 to 1.0) for the power function
                scaled_dist = dist_from_center * 2.0
                
                # Apply power function while preserving sign
                # If bias_amp > 1.0, we take the Nth root (making curve steeper near 0)
                # If bias_amp < 1.0, we power it (making curve flatter near 0)
                # Note: To amplify sensitivity, we actually want a root function (power < 1)
                # or we can invert the logic: exponent = 1 / bias_amp
                
                exponent = 1.0 / max(0.1, bias_amp) 
                
                amplified_dist = np.sign(scaled_dist) * (np.abs(scaled_dist) ** exponent)
                
                # Descale back to bias range (0.0 to 1.0)
                threat_perception_bias = 0.5 + (amplified_dist / 2.0)
                
                z_score_range = data["Z-Score-Range"]
                point_observation = perceived_mean + (
                (threat_perception_bias-0.5) * z_score_range * perceived_stdev
                )

                # Calculate the Uncertainty Vector
                # Ambiguity uses perceived_stdev (uncertainty), not perceived_mean (signal).
                ambiguity_score = perceived_stdev
                surprise_scaling_factor = data["Surprise-Scaling-Factor"]
                surprise_score = surprise_scaling_factor * np.square(point_observation - apv)

                surprise_weight = data["Surprise-Weight"]
                ambiguity_weight = 1 - surprise_weight
                uncertainty_vector = (surprise_weight * surprise_score) + (ambiguity_weight * ambiguity_score)

                # Calculate signal strength and perceived signal strength
                c1 = data["Signal-Strength-Weights"]["c1"]
                c2 = data["Signal-Strength-Weights"]["c2"]
                c3 = data["Signal-Strength-Weights"]["c3"]
                signal_strength = (
                    (c1 * point_observation[self.enums['Char']['Clarity'], 0]) +
                    (c2 * point_observation[self.enums['Char']['Severity'], 0]) +
                    (c3 * point_observation[self.enums['Char']['Irreversibility'], 0])
                )

                # Temporal Layer: Apply signal salience as pre-multiplier.
                # When temporal context is active, each observable event carries
                # a salience value [0,1] that modulates signal strength.
                # Default 1.0 preserves existing behavior.
                temporal_context = data.get("Temporal-Context")
                if temporal_context and base_input_counter < len(temporal_context.get('observable_events', [])):
                    obs_event = temporal_context['observable_events'][base_input_counter]
                    signal_strength *= obs_event.signal_salience

                belief_update_bias = data["Belief-Update-Bias"]
                perceived_signal_strength = signal_strength / belief_update_bias

                # Calculate final weights and base input vector
                # Final Weights
                weight_min = data["Action-Weight-Range"]["min"]
                weight_max = data["Action-Weight-Range"]["max"]

                # Sigmoid function to map perceived signal strength to [0,1]
                signal = 1.0 / (1.0 + np.exp(-k * (perceived_signal_strength - tau)))

                w_a = weight_min + (signal * (weight_max - weight_min))
                w_m = 1 - w_a
                # Base Input Vector
                base_input_vector = (w_a * point_observation) + (w_m * apv)

                # Store the perceived signal strength, base input vector and uncertainty vector
                perceived_signal_strengths.append((actor_index, perceived_signal_strength))
                base_input_vectors.append((actor_index, base_input_vector))
                base_input_action_ids.append(action_id)

                uncertainty_vectors.append((actor_index, uncertainty_vector))
                base_input_counter += 1

        data["Perceived-Signal-Strengths"] = perceived_signal_strengths
        data["Base-Input-Vectors"] = base_input_vectors
        data["Base-Input-Action-IDs"] = base_input_action_ids
        data["Uncertainty-Vectors"] = uncertainty_vectors

        # 2-Player Refactor: Pass exogenous metadata to Stage 2
        if exogenous_relationship_tags:
            data["Exogenous-Relationship-Tags"] = exogenous_relationship_tags
        if exogenous_goal_impact_overrides:
            data["Exogenous-Goal-Impact-Overrides"] = exogenous_goal_impact_overrides

        # Temporal Layer: Pass temporal metadata through for downstream stages.
        # Observable events carry lifecycle_state, novelty, completion_proximity,
        # tangible_impact_mode, and relationship_update_mode.
        # Always set with defaults so the event data checker sees them.
        temporal_context = data.get("Temporal-Context", {})
        data["Temporal-Observable-Events"] = temporal_context.get('observable_events', [])
        data["Temporal-Transitioned-IDs"] = temporal_context.get('transitioned_ids', set())

        return data

    def update_papt(self, data):
        """
        Update the Perceived Adversary Posture Trend after Stage 1.

        Extracts the highest-Severity adversary action from the Base Input
        Vectors, runs the 6-step PAPT computation, and persists the updated
        state back into event data.

        When no adversary actions are observed (e.g., first turn or
        single-actor step), the PAPT state is preserved unchanged.

        Spec reference (commitment spec v0.2): Section 9.2.2.
        """
        if not data.get("Commitment-Layer-Active", False):
            return data

        base_input_vectors = data.get("Base-Input-Vectors", [])
        commitment_params = data.get("Commitment-Params", {})
        papt_dict = data.get("PAPT-State", {})
        papt_state = PAPTState.from_dict(papt_dict)

        # Extract adversary characteristics (max Severity action)
        adversary_chars = PAPTComputer.extract_adversary_characteristics(
            base_input_vectors, self.observer_id, self.enums['Char']
        )

        if adversary_chars is None:
            # No adversary actions observed; preserve current state
            data["PAPT-State"] = papt_state.to_dict()
            return data

        perceived_severity, perceived_clarity, perceived_irreversibility = adversary_chars

        # Run the 6-step PAPT computation
        updated_papt = PAPTComputer.update(
            papt_state=papt_state,
            perceived_severity=perceived_severity,
            perceived_clarity=perceived_clarity,
            perceived_irreversibility=perceived_irreversibility,
            posture_smoothing_weight=commitment_params.get("posture_smoothing_weight", 0.4),
            posture_clarity_weight=commitment_params.get("posture_clarity_weight", 0.6),
            posture_irreversibility_weight=commitment_params.get("posture_irreversibility_weight", 0.4),
            visibility_floor=commitment_params.get("visibility_floor", 0.2),
            posture_trend_smoothing=commitment_params.get("posture_trend_smoothing", 0.5),
            trend_confidence_scaling=commitment_params.get("trend_confidence_scaling", 2.0),
        )

        data["PAPT-State"] = updated_papt.to_dict()
        return data

    def evaluate_explicit_triggers(self, data):
        """
        Evaluate trigger conditions for explicit commitments.

        Runs after perception and interpretation are complete, using post-bias
        perceived action characteristics from Stage 1. Also checks for
        explicit commitment expiry (untriggered commitments past expiry_turns).

        Perception biases can cause premature trigger (paranoid actor perceives
        a redline crossed when it wasn't) or missed trigger (complacent actor
        fails to register a genuine crossing).

        Results are stored in data for use by the fulfillment bonus (Stage 3.B)
        and screening filter.

        Spec reference (commitment spec v0.2): Section 3.1, Section 3.6.
        """
        if not data.get("Commitment-Layer-Active", False):
            data["Triggered-Commitment-IDs"] = []
            data["Expired-Commitment-IDs"] = []
            data["Compliance-Results"] = []
            return data

        register_state = data.get("Commitment-Register-State", {})
        if not register_state:
            data["Triggered-Commitment-IDs"] = []
            data["Expired-Commitment-IDs"] = []
            data["Compliance-Results"] = []
            return data

        register = CommitmentRegister.from_serializable(register_state)
        base_input_vectors = data.get("Base-Input-Vectors", [])
        current_turn = data.get("Current-Turn", 0)

        # Step 1: Check ultimatum compliance before trigger evaluation
        adversary_coa_ids = []
        for seq in data.get("Action-Sequence", []):
            if seq.actor_id != self.observer_id and seq.actor_id != EXOGENOUS_ACTOR_ID:
                adversary_coa_ids.extend(seq.coa_id_list)
        compliance_results = check_ultimatum_compliance(
            register=register,
            adversary_coa_ids=adversary_coa_ids,
            current_turn=current_turn,
        )

        # Step 2: Evaluate trigger conditions against perceived characteristics
        newly_triggered = evaluate_trigger_conditions(
            register=register,
            base_input_vectors=base_input_vectors,
            observer_id=self.observer_id,
            current_turn=current_turn,
            char_enum=self.enums.get('Char'),
        )

        # Step 3: Check for explicit commitment expiry
        # Ultimatums whose deadline passed are triggered, not expired
        newly_expired, triggered_via_expiry = check_explicit_expiry(
            register, current_turn
        )
        newly_triggered.extend(triggered_via_expiry)

        # Persist updated register state
        data["Commitment-Register-State"] = register.to_serializable()
        data["Triggered-Commitment-IDs"] = newly_triggered
        data["Expired-Commitment-IDs"] = newly_expired
        data["Compliance-Results"] = compliance_results

        return data

    def activate_proposal_response_actions(self, data):
        """
        Activate pre-authored Accept/Reject actions for pending proposals.

        Checks the adversary's register for pending proposals, then activates
        matching Accept/Reject actions in the Current-Available-Playbook.
        Actions are pre-authored by MAGIC; the DPM only handles eligibility
        gating.

        Runs before Stage 3 so activated response actions participate in
        the normal utility evaluation alongside the rest of the action menu.

        Spec reference (commitment spec v0.2): Section 4.3 (revised: MAGIC-owned action generation).
        """
        if not data.get("Commitment-Layer-Active", False):
            data["Activated-Proposal-Responses"] = []
            return data

        raw_response_actions = data.get("Proposal-Response-Actions", {})
        if not raw_response_actions:
            data["Activated-Proposal-Responses"] = []
            return data

        # Deserialize: values may be dicts (from JSON) or already objects
        proposal_response_actions = {}
        for coa_id, meta in raw_response_actions.items():
            coa_id_int = int(coa_id)
            if isinstance(meta, ProposalResponseActionMeta):
                proposal_response_actions[coa_id_int] = meta
            else:
                proposal_response_actions[coa_id_int] = (
                    ProposalResponseActionMeta.from_dict(meta)
                )

        # Get the adversary's register to check for pending proposals.
        # In a 2-player game, the adversary's proposals are what we respond to.
        adversary_register_state = data.get(
            "Adversary-Commitment-Register-State", {}
        )
        if not adversary_register_state:
            data["Activated-Proposal-Responses"] = []
            return data

        adversary_register = CommitmentRegister.from_serializable(
            adversary_register_state
        )

        activated_coa_ids = activate_proposal_responses(
            register=adversary_register,
            proposal_response_actions=proposal_response_actions,
        )

        # Activate these COA IDs in the Current-Available-Playbook
        if activated_coa_ids:
            playbook = data.get("Current-Available-Playbook")
            if playbook is not None:
                for coa_id in activated_coa_ids:
                    if coa_id < playbook.shape[0]:
                        playbook[coa_id, 0] = 1
                # Re-apply exclusions: proposals cannot override per-actor
                # action exclusions (e.g. alliance-specific actions).
                for excl_id in data.get('excluded_actions', []):
                    if 0 <= excl_id < playbook.shape[0]:
                        playbook[excl_id, 0] = 0

        data["Activated-Proposal-Responses"] = activated_coa_ids

        return data

    # =========================================================================
    # Stage 2: Unified Interpretation Stage
    # (Replaces old Stage 2: Strategic Impact Assessment + Stage 3: Problem Definition)
    # =========================================================================

    def stage_interpretation(self, data):
        """
        Unified Interpretation Stage (Phase 2 Refactor).

        Performs one coherent cognitive process:
          Step 2.1: Goal Impact Assessment — assess action impacts on goals via Goal Impact Tensor
          Step 2.2: Goal Ledger Update — decay prior state, add new impacts
          Step 2.3: Urgency and Priority Calculation — blended cumulative + spike urgency
          Step 2.4: Discrepancy Calculation — gap between Goal Ledger position and Desired State
          Step 2.5: Aggregation and Problem Definition — salience-weighted final discrepancy
        """

        # ---- Step 2.1: Goal Impact Assessment ----
        strategic_impact_vectors = []
        persistence_metadata = []

        severity_activation_threshold = data.get("Severity-Activation-Threshold", 0.0)

        base_inputs = data["Base-Input-Vectors"]
        base_action_ids = data.get("Base-Input-Action-IDs", [None] * len(base_inputs))

        if len(base_action_ids) != len(base_inputs):
            raise ValueError("Base-Input-Action-IDs length does not match Base-Input-Vectors")

        num_goals = len(self.enums['Goal'])
        num_actions = len(self.enums['Action'])

        # 2-Player Refactor: relationship modifiers for exogenous events
        # When an exogenous event carries a non-adversary relationship tag,
        # the adversary-baselined GIT is scaled by these modifiers instead
        # of selecting a separate tensor slice.
        rel_modifier_map = {
            self.enums['RelationshipTag']['Ally']: data.get("Relationship-Modifier-Ally", -0.3),
            self.enums['RelationshipTag']['Neutral']: data.get("Relationship-Modifier-Neutral", 0.3),
            self.enums['RelationshipTag']['Adversary']: data.get("Relationship-Modifier-Adversary", 1.0),
        }

        # Track which base_inputs came from exogenous sources (tagged by Stage 1)
        exogenous_tags = data.get("Exogenous-Relationship-Tags", {})

        for k, (actor_index, base_input_vector) in enumerate(base_inputs):
            action_id = base_action_ids[k]

            # Check if this input is from an exogenous event source
            is_exogenous = actor_index == EXOGENOUS_ACTOR_ID
            exo_tag = exogenous_tags.get(k, None)

            if is_exogenous and exo_tag is not None:
                # Exogenous event: use relationship_modifier to scale the matrix
                relationship_modifier = rel_modifier_map.get(exo_tag, 1.0)
            else:
                # 2-Player: Continuous relationship modifier derived from scalar score.
                # Relationship-Score ranges from -1 (adversary) to +1 (ally).
                # The Goal-Impact-Matrix is adversary-baselined, so:
                #   score = -1 (full adversary)  → modifier = 1.0  (full impact)
                #   score =  0 (neutral)         → modifier = 0.0  (no adversarial signal)
                #   score = +1 (full ally)        → modifier = -1.0 (inverted impact)
                #
                # This continuous mapping replaces the discrete threshold system
                # (Ally/Neutral/Adversary buckets). Relationship fluidity near
                # boundaries produces proportionally ambiguous strategic signals,
                # which is the analytically correct behavior.
                relationship_modifier = -data["Relationship-Score"]

            # 2-Player Dimension Reduction: Goal-Impact-Matrix is (num_goals, num_actions)
            # No relationship axis — adversary-baselined, scaled by relationship_modifier
            goal_impact_matrix = data["Goal-Impact-Matrix"]  # shape: (num_goals, num_actions)

            # Extract perceived severity (sole intensity modifier)
            perceived_severity = float(base_input_vector[self.enums['Char']['Severity'], 0])

            # Apply Severity Activation Threshold (noise gate)
            if perceived_severity < severity_activation_threshold:
                perceived_severity = 0.0

            # Calculate Strategic Impact Vector
            # Impact = Goal-Impact-Matrix × severity × relationship_modifier
            # The matrix is adversary-baselined; modifier adjusts for relationship state.
            if action_id is not None and action_id < num_actions:
                impact_profile = goal_impact_matrix[:, action_id].reshape((num_goals, 1))
                strategic_impact_vector = impact_profile * perceived_severity * relationship_modifier
            elif is_exogenous:
                # Exogenous event with goal_impact_override (no coa_id mapping)
                goal_impact_override = data.get("Exogenous-Goal-Impact-Overrides", {}).get(k, None)
                if goal_impact_override is not None:
                    impact_profile = np.array(goal_impact_override).reshape((num_goals, 1))
                    strategic_impact_vector = impact_profile * perceived_severity * relationship_modifier
                else:
                    strategic_impact_vector = np.zeros((num_goals, 1))
            else:
                strategic_impact_vector = np.zeros((num_goals, 1))

            # Apply gain scaling and clamp (preserved from v2.5)
            goal_impact_gain_scale = data.get("Goal-Impact-Gain-Scale", 2.0)
            strategic_impact_vector = np.clip(strategic_impact_vector * goal_impact_gain_scale, -5.0, 5.0)

            # Temporal Layer: Route goal impacts by lifecycle state.
            # COMPLETED (goal_impact_applied_on_turn = null): full impact (default v2.0 behavior)
            # IN_PROGRESS (in_progress_impact_fraction > 0): partial impact per turn
            # IN_PROGRESS (in_progress_impact_fraction = 0): zero vector (for index alignment)
            # SUSTAINING: diminishing per-turn impact
            # DECAYING: no new goal impact
            temporal_obs_events = data.get("Temporal-Observable-Events", [])
            temporal_impact_fraction = 1.0  # Default: full impact (v2.0 behavior)
            temporal_decay_factor = None  # None = use irreversibility-driven decay

            if k < len(temporal_obs_events):
                obs_event = temporal_obs_events[k]
                ls = obs_event.lifecycle_state

                if ls == LS_IN_PROGRESS:
                    temporal_impact_fraction = obs_event.in_progress_impact_fraction
                    if temporal_impact_fraction > 0:
                        temporal_decay_factor = 1.0  # In-progress layers don't decay
                elif ls == LS_SUSTAINING:
                    # Diminishing returns handled via temporal_impact_fraction
                    # Look up sustaining_layers_count from the timeline record
                    timeline = data.get("World-State-Timeline")
                    temporal_params = data.get("Temporal-Params", {})
                    sif = temporal_params.get('sustaining_impact_factor', 0.3)
                    sde = temporal_params.get('sustaining_decay_exponent', 0.4)
                    max_layers = temporal_params.get('max_sustaining_layers', 10)
                    if timeline:
                        record = timeline.get_record(obs_event.record_id)
                        if record and record.sustaining_layers_count < max_layers:
                            n = record.sustaining_layers_count
                            temporal_impact_fraction = sif * ((n + 1) ** (-sde))
                            temporal_decay_factor = 1.0  # Sustaining layers hold until withdrawal
                            record.sustaining_layers_count += 1
                        else:
                            temporal_impact_fraction = 0.0  # Ceiling reached
                    else:
                        temporal_impact_fraction = 0.0
                elif ls == LS_DECAYING:
                    # Default: no new goal impact for decaying actions.
                    # Exception: instantaneous actions (execution_duration=0) transition
                    # INITIATED → COMPLETED → DECAYING in a single pre-processor pass.
                    # When that happens, the observing actor never sees the COMPLETED
                    # state and the completion impact is never applied. Use the
                    # goal_impact_applied_on_turn flag to detect this case and grant
                    # full impact on first observation, then stamp the flag so it
                    # only fires once.
                    timeline_for_decay = data.get("World-State-Timeline")
                    if timeline_for_decay:
                        record = timeline_for_decay.get_record(obs_event.record_id)
                        if record and record.goal_impact_applied_on_turn is None:
                            temporal_impact_fraction = 1.0  # First observation
                            record.goal_impact_applied_on_turn = data.get("Current-Turn", 0)
                        else:
                            temporal_impact_fraction = 0.0  # Already applied
                    else:
                        temporal_impact_fraction = 0.0

                # Gate completion impact: only apply once (goal_impact_applied_on_turn)
                if ls == LS_COMPLETED:
                    # COMPLETED is transient and should not normally appear in obs events,
                    # but handle defensively
                    if timeline:
                        record = timeline.get_record(obs_event.record_id)
                        if record and record.goal_impact_applied_on_turn is not None:
                            temporal_impact_fraction = 0.0  # Already applied

            strategic_impact_vector = strategic_impact_vector * temporal_impact_fraction

            strategic_impact_vectors.append((actor_index, strategic_impact_vector))

            # Tag with persistence metadata (Irreversibility for Goal Ledger decay)
            irreversibility = float(base_input_vector[self.enums['Char']['Irreversibility'], 0])
            # Temporal Layer: Override decay factor for in-progress/sustaining layers
            if temporal_decay_factor is not None:
                persistence_metadata.append((actor_index, irreversibility, temporal_decay_factor))
            else:
                persistence_metadata.append((actor_index, irreversibility))

        # Store Step 2.1 outputs
        data["Strategic-Impact-Vectors"] = strategic_impact_vectors
        data["Persistence-Metadata"] = persistence_metadata

        # ---- Step 2.2: Goal Ledger Update ----
        self.update_goal_ledger(data)

        # ---- Step 2.3: Urgency and Priority Calculation ----
        discrepancy_vectors = []

        val = data.get("Priority-Blending-Weight", 0.5)
        priority_blending_weight = max(0.0, min(1.0, val))

        # Auto-normalize priorities (adaptive scaling)
        baseline_priority_vector_scaled = data["Baseline-Priority-Vector"].copy()
        max_priority = np.max(baseline_priority_vector_scaled)
        if max_priority > 1.0:
            baseline_priority_vector_scaled = baseline_priority_vector_scaled / max_priority

        urgency_sensitivity = data["Urgency-Sensitivity"]
        problem_focus_parameter = data["Problem-Focus-Parameter"]
        urgency_blending_weight = data.get("Urgency-Blending-Weight", 0.5)
        # Goal-Ledger is always available here: update_goal_ledger() (Step 2.2) runs
        # before this point and initializes it from scratch on the first turn.
        goal_ledger = data.get("Goal-Ledger", np.zeros((num_goals, 1)))

        # Compute cumulative urgency (from persistent Goal Ledger position) — computed once
        cumulative_abs = np.abs(goal_ledger) / urgency_sensitivity
        cumulative_focused = np.power(cumulative_abs, problem_focus_parameter)
        cumulative_urgency = 1 + np.tanh(cumulative_focused)
        # Only negative ledger positions (deterioration) drive urgency
        cumulative_urgency[goal_ledger >= 0] = 1

        for (actor_index, strategic_impact_vector) in strategic_impact_vectors:
            # Spike urgency: from this turn's new impact (v2.5 formula)
            x = np.abs(strategic_impact_vector) / urgency_sensitivity
            x = np.power(x, problem_focus_parameter)
            spike_urgency = 1 + np.tanh(x)
            spike_urgency[strategic_impact_vector >= 0] = 1

            # Blend cumulative and spike urgency
            effective_urgency = (urgency_blending_weight * cumulative_urgency) + \
                                ((1 - urgency_blending_weight) * spike_urgency)

            # Calculate situational priority
            situational_priority_raw = baseline_priority_vector_scaled * effective_urgency
            situational_priority_norm = situational_priority_raw / (np.sum(situational_priority_raw) + 1e-9)
            situational_priority = (priority_blending_weight * situational_priority_raw) + \
                                   ((1 - priority_blending_weight) * situational_priority_norm)

            # Apply time horizon discount
            actor_time_horizon = data["Actor-Time-Horizon"]
            objectives_time_horizon = data["Objectives-Time-Horizon"]
            time_horizon_discount_factor = data["Time-Horizon-Discount-Factor"]
            if actor_time_horizon == self.enums['TimeHorizon']['Short']:
                situational_priority[objectives_time_horizon == self.enums['TimeHorizon']['Long']] *= time_horizon_discount_factor

            desired_state_vector = situational_priority

            # ---- Step 2.4: Discrepancy Calculation ----
            # Discrepancy = Goal Ledger position minus Desired State
            discrepancy_vector = goal_ledger - desired_state_vector

            discrepancy_vectors.append((actor_index, discrepancy_vector))

        # ---- Step 2.5: Aggregation and Problem Definition ----
        # 2-Player simplification: single-level salience aggregation.
        #
        # In the N-player model (v2.5), aggregation had two levels:
        #   1. Group discrepancy vectors by source actor, apply geometric decay
        #      within each actor's action set.
        #   2. Rank actors by max signal strength, apply geometric decay across
        #      actors.
        #
        # In the 2-player model, there is only one other player (plus possible
        # exogenous sources). The two-level grouping is unnecessary and produced
        # artifacts: exogenous events were treated as a separate "actor group"
        # with its own between-group decay, which could underweight strategically
        # significant third-party events relative to adversary actions.
        #
        # The simplified approach:
        #   - Pair each discrepancy vector with its perceived signal strength
        #   - Sort by signal strength (strongest signal first)
        #   - Apply a single level of geometric decay
        #
        # This means a high-severity exogenous event (e.g., Taiwan sovereignty
        # address) competes on equal footing with adversary actions for salience,
        # which is the correct behavior: the observer's problem definition should
        # be driven by what matters most, not by who did it.

        weighting_multiplier = data["Salience-Decay-Multiplier"]
        perceived_signal_strengths = data["Perceived-Signal-Strengths"]

        # Build paired list: (signal_strength, discrepancy_vector, actor_index)
        # Signal strengths and discrepancy vectors are aligned by index (both
        # derived from the same base_input_vectors iteration).
        paired = []
        for idx, (actor_index, disc_vec) in enumerate(discrepancy_vectors):
            if idx < len(perceived_signal_strengths):
                signal = perceived_signal_strengths[idx][1]
            else:
                signal = 0.0
            paired.append((signal, disc_vec, actor_index))

        # Sort by signal strength, strongest first
        paired.sort(key=lambda x: x[0], reverse=True)

        # Single-level geometric decay aggregation
        final_discrepancy_vector = np.zeros(discrepancy_vectors[0][1].shape)
        for i, (signal, disc_vec, actor_index) in enumerate(paired):
            final_discrepancy_vector += disc_vec * (weighting_multiplier ** i)

        # Actor-Discrepancy-Vectors: still needed by calculate_primary_adversary
        # and calculate_action_sequence_targets. In the 2-player model, this is
        # a dict with at most two keys: the other player and EXOGENOUS_ACTOR_ID.
        # We sum each actor's discrepancy contributions (unweighted) for targeting.
        actor_level_discrepancy_vectors = {}
        for (actor_index, disc_vec) in discrepancy_vectors:
            if actor_index not in actor_level_discrepancy_vectors:
                actor_level_discrepancy_vectors[actor_index] = np.zeros(disc_vec.shape)
            actor_level_discrepancy_vectors[actor_index] += disc_vec

        data["Actor-Discrepancy-Vectors"] = actor_level_discrepancy_vectors
        data["Final-Discrepancy-Vector"] = final_discrepancy_vector

        return data

    def update_goal_ledger(self, data):
        """
        Step 2.2: Update the Goal Ledger — persistent cross-turn strategic position.

        The ledger uses a per-impact layer model: each impact event carries its own
        magnitude and decay rate (driven by Irreversibility). Layers decay independently,
        new impacts are added as new layers, and the goal's total ledger value is the
        sum of all active layers.
        """
        base_decay_rate = data.get("Base-Decay-Rate", 0.3)
        num_goals = len(self.enums['Goal'])

        goal_ledger_layers = data.get("Goal-Ledger-Layers", [])

        # Step 1: Decay all existing layers
        for layer in goal_ledger_layers:
            layer["magnitude"] = layer["magnitude"] * layer["decay_factor"]

        # Step 2: Prune negligible layers (all |magnitude| < 1e-6)
        goal_ledger_layers = [
            layer for layer in goal_ledger_layers
            if np.max(np.abs(layer["magnitude"])) > 1e-6
        ]

        # Step 3: Add new impact layers from this turn
        strategic_impact_vectors = data["Strategic-Impact-Vectors"]
        persistence_metadata = data.get("Persistence-Metadata", [])
        base_action_ids = data.get("Base-Input-Action-IDs", [None] * len(strategic_impact_vectors))

        # Determine current turn number: count how many turns have elapsed
        # by counting how many layers already existed before this turn (proxy for age)
        existing_turn_numbers = [layer.get("turn", 0) for layer in goal_ledger_layers]
        current_turn = max(existing_turn_numbers, default=0) + 1 if len(goal_ledger_layers) > 0 else 1

        for idx, (actor_index, siv) in enumerate(strategic_impact_vectors):
            # Get irreversibility for this action
            explicit_decay = None
            if idx < len(persistence_metadata):
                meta = persistence_metadata[idx]
                irreversibility = meta[1]
                # Temporal Layer: explicit decay factor override (3rd element)
                if len(meta) > 2:
                    explicit_decay = meta[2]
            else:
                irreversibility = 0.0

            # Decay factor: explicit override (from temporal layer) or
            # irreversibility-driven: 1 - (Base_Decay_Rate × (1 - Irreversibility))
            if explicit_decay is not None:
                decay_factor = explicit_decay
            else:
                decay_factor = 1.0 - (base_decay_rate * (1.0 - irreversibility))

            # Get the action ID for labeling
            action_id = base_action_ids[idx] if idx < len(base_action_ids) else None

            layer = {
                "magnitude": siv.copy(),
                "irreversibility": irreversibility,
                "decay_factor": decay_factor,
                "action_id": int(action_id) if action_id is not None else None,
                "actor_index": int(actor_index),
                "turn": current_turn,
            }
            goal_ledger_layers.append(layer)

        # Step 4: Sum all layers to compute current goal ledger position
        goal_ledger = np.zeros((num_goals, 1))
        for layer in goal_ledger_layers:
            goal_ledger += layer["magnitude"]

        # Store updated structures
        data["Goal-Ledger"] = goal_ledger
        data["Goal-Ledger-Layers"] = goal_ledger_layers

        return data

    def update_reference_point(self, data):
        """
        Update the persisted PT reference state for the next turn.

        Reference point type determines update rule:
          - status_quo: anchors to the actor's ending strategic position
          - aspiration: anchored to current goals (-Final_Priority)
          - adaptive: exponential moving average toward recent strategic position
        """
        if not data.get("PT-Enabled", True):
            return

        ref_type = data.get("Reference-Point-Type", self.enums['ReferencePointType']['StatusQuo'])
        num_goals = len(self.enums['Goal'])

        if ref_type == self.enums['ReferencePointType']['StatusQuo']:
            ending_goal_ledger = data.get("Goal-Ledger", np.zeros((num_goals, 1)))
            data["Reference-Point-Vector"] = ending_goal_ledger.copy()

        elif ref_type == self.enums['ReferencePointType']['Aspiration']:
            # Actor measures gains/losses relative to their goal state
            final_priority = data.get("Baseline-Priority-Vector", np.zeros((num_goals, 1)))
            data["Reference-Point-Vector"] = -final_priority.copy()

        elif ref_type == self.enums['ReferencePointType']['Adaptive']:
            r = data.get("Reference-Adaptation-Rate", 0.3)
            current_ref = data.get("Reference-Point-Vector", np.zeros((num_goals, 1)))
            outcome = data.get("Goal-Ledger", np.zeros((num_goals, 1)))
            data["Reference-Point-Vector"] = (1 - r) * current_ref + r * outcome

    def calculate_commitment_estimate(self, data):
        """
        Calculate Commitment Estimate for the other player.

        2-Player Dimension Reduction: Uses Other-Profile-Vector instead of APV-Tensor.
        Synthesizes multiple signaling characteristics into a composite, forward-looking
        assessment of adversary commitment. Diagnostic only for Phase 2.

        Commitment_Estimate = w_res × Believed_Resolve + w_irr × Believed_Irreversibility
                            + w_cred × Believed_Credibility + w_cap × Believed_Capability
                            + w_risk × Believed_Risk_Propensity
        """
        other_profile = data.get("Other-Profile-Vector-New", data.get("Other-Profile-Vector"))
        commitment_weights = data.get("Commitment-Weights", np.array([0.20, 0.20, 0.20, 0.20, 0.20]))

        # Indices into the Char enum for the 5 signaling characteristics
        char_indices = [
            self.enums['Char']['Resolve'],
            self.enums['Char']['Irreversibility'],
            self.enums['Char']['Credibility'],
            self.enums['Char']['Capability'],
            self.enums['Char']['Risk_Propensity'],
        ]

        believed_values = np.array([
            float(other_profile[ci, 0]) for ci in char_indices
        ])
        estimate = float(np.dot(commitment_weights, believed_values))
        other_id = 1 - self.observer_id
        commitment_estimates = {other_id: np.clip(estimate, 0.0, 1.0)}

        data["Commitment-Estimates"] = commitment_estimates

        return data

    def stage_3_reviews_and_adjust_discrepancy(self, data):
        """
        Stage 3.0: Sustaining & Continuation Reviews + Adjusted Discrepancy.

        Runs at the start of Stage 3 (Assessment & Response) using the current
        turn's fresh Final-Discrepancy-Vector from Stage 2 and the
        Action-Utility-Matrix (how actor's own actions affect own goals).

        1. Sustaining review: evaluate SUSTAINING actions for withdrawal.
        2. Execute withdrawals.
        3. Continuation review: evaluate IN_PROGRESS actions for cancellation.
        4. Execute cancellations.
        5. Compute Expected Sustained Contribution from surviving sustained actions.
        6. Compute Adjusted Discrepancy Vector = Final Discrepancy - Expected Contribution.

        The Adjusted Discrepancy feeds into TPS (3.A) and PROMETHEE (3.B),
        reducing redundant escalation pressure from actions already sustained.

        When the temporal layer is inactive, this is a no-op: Adjusted Discrepancy
        equals Final Discrepancy, and Expected Sustained Contribution is zeros.
        """
        final_discrepancy = data["Final-Discrepancy-Vector"]
        temporal_layer_active = data.get("Temporal-Layer-Active", False)

        if not temporal_layer_active:
            # Always-present-with-defaults: identity pass-through
            data["Adjusted-Discrepancy-Vector"] = final_discrepancy.copy()
            data["Expected-Sustained-Contribution"] = np.zeros_like(final_discrepancy)
            data["Sustaining-Review-Results"] = {'withdraw_list_coa_ids': [], 'forced_withdrawals': []}
            data["Continuation-Review-Results"] = {'cancel_list_coa_ids': []}
            data["Sustaining-Forced-Withdrawals"] = []
            return data

        # Retrieve review instances and shared data
        sustaining_review = data.get("Sustaining-Review")
        continuation_review = data.get("Continuation-Review")
        timeline = data.get("World-State-Timeline")
        action_utility_matrix = data["Action-Utility-Matrix"]
        cost_vector = data.get("Base-Cost-Vector")
        actor_id = self.observer_id
        current_turn = data.get("Current-Turn", 0)
        is_prescriptive = data.get("Is-Prescriptive", False)
        spv = data.get("Self-Profile-Vector")
        actor_data_ref = data  # Reviews may write diagnostics into event data

        # --- Sustaining Review ---
        withdraw_list = []
        if sustaining_review is not None and timeline is not None:
            feasibility_gate_threshold = data.get("Feasibility-Gate-Threshold", -0.1)
            withdraw_list = sustaining_review.review(
                timeline, actor_id,
                action_utility_matrix, final_discrepancy, is_prescriptive,
                actor_data=actor_data_ref,
                self_profile_vector=spv,
                feasibility_gate_threshold=feasibility_gate_threshold,
            )
            for record in withdraw_list:
                SustainingReview.execute_withdrawal(record, current_turn)

        # --- Continuation Review ---
        cancel_list = []
        if continuation_review is not None and timeline is not None:
            cancel_list = continuation_review.review(
                timeline, actor_id, current_turn,
                action_utility_matrix, final_discrepancy, cost_vector,
                is_prescriptive, actor_data=actor_data_ref,
            )
            for record in cancel_list:
                ContinuationReview.execute_cancellation(record, current_turn)

        # --- Compute Expected Sustained Contribution ---
        # For each surviving SUSTAINING action, compute expected next-turn
        # contribution using AUM and diminishing returns curve.
        expected_contribution = np.zeros_like(final_discrepancy)

        if timeline is not None:
            # Get temporal parameters from the sustaining review instance
            sustaining_impact_factor = (
                sustaining_review.sustaining_impact_factor
                if sustaining_review is not None
                else DEFAULT_SUSTAINING_IMPACT_FACTOR
            )
            sustaining_decay_exponent = (
                sustaining_review.sustaining_decay_exponent
                if sustaining_review is not None
                else DEFAULT_SUSTAINING_DECAY_EXPONENT
            )
            max_sustaining_layers = (
                sustaining_review.max_sustaining_layers
                if sustaining_review is not None
                else 10
            )

            withdrawn_coa_ids = {r.coa_id for r in withdraw_list}
            sustaining_records = timeline.get_sustaining_records_for_actor(actor_id)

            for record in sustaining_records:
                # Skip records that were just withdrawn
                if record.coa_id in withdrawn_coa_ids:
                    continue

                n = record.sustaining_layers_count
                if n >= max_sustaining_layers:
                    continue  # No further benefit expected

                # Diminishing returns: impact_factor × (n+1)^(-decay_exponent)
                diminishing_factor = (n + 1) ** (-sustaining_decay_exponent)

                # Per-goal contribution from this action
                num_actions = action_utility_matrix.shape[1]
                if record.coa_id < num_actions:
                    action_column = action_utility_matrix[:, record.coa_id].reshape(-1, 1)
                    expected_contribution += (
                        action_column * sustaining_impact_factor * diminishing_factor
                    )

        # --- Compute Adjusted Discrepancy ---
        # No clamping: negative adjusted discrepancy correctly signals overcoverage.
        adjusted_discrepancy = final_discrepancy - expected_contribution

        # Store results
        data["Adjusted-Discrepancy-Vector"] = adjusted_discrepancy
        data["Expected-Sustained-Contribution"] = expected_contribution
        data["Sustaining-Review-Results"] = {
            'withdraw_list_coa_ids': [r.coa_id for r in withdraw_list],
            'forced_withdrawals': data.get("Sustaining-Forced-Withdrawals", []),
        }
        data["Continuation-Review-Results"] = {
            'cancel_list_coa_ids': [r.coa_id for r in cancel_list],
        }

        return data

    def stage_3(self, data):
        """
        Stage 3: Assessment & Response (was Stage 4 in DSM 2.5)

        The decision-making stage where the observer creates a ranked list of
        possible responses. Composed of four sub-stages.
        """
        # Stage 3.0: Sustaining/Continuation Reviews + Adjusted Discrepancy
        self.stage_3_reviews_and_adjust_discrepancy(data)

        # Sub-stages
        self.stage_3_a(data)
        self.stage_3_b(data)
        # Check to see if "Do Nothing" is the chosen action
        if data["Chosen-Action-Vectors"] is not None:
            data["Commitment-Violations"] = []
            data["Proposal-Resolutions"] = []
            return data

        self.stage_3_c(data)
        self.stage_3_d(data)

        # Post-Stage-3: Detect violations and fulfillment of triggered
        # explicit commitments based on the chosen action sequence.
        # Spec reference (commitment spec v0.2): Section 3.3.
        commitment_violations = []
        if data.get("Commitment-Layer-Active", False):
            register_state_vd = data.get("Commitment-Register-State", {})
            commitment_params_vd = data.get("Commitment-Params", {})
            chosen_sequence = data.get("Chosen-Action-Sequence", [])
            current_turn = data.get("Current-Turn", 0)
            if register_state_vd and chosen_sequence:
                register_vd = CommitmentRegister.from_serializable(register_state_vd)
                commitment_violations = detect_violations(
                    register=register_vd,
                    chosen_sequence=chosen_sequence,
                    current_turn=current_turn,
                    credibility_cost_weight=commitment_params_vd.get(
                        "credibility_cost_weight", 1.0),
                    coalition_support_low_threshold=commitment_params_vd.get(
                        "coalition_support_low_threshold", 0.3),
                )
                # Persist updated register state with fulfillment/violation marks
                data["Commitment-Register-State"] = register_vd.to_serializable()
        data["Commitment-Violations"] = commitment_violations
        # Proposal-Resolutions is populated by model.py after event processing.
        # Initialize here so event_data_checker sees it on output validation.
        if "Proposal-Resolutions" not in data:
            data["Proposal-Resolutions"] = []

        return data

    def calculate_primary_adversary(self, num_actors):
        """
        Identify the primary adversary for targeting decisions.

        2-Player: The primary adversary is always the other player.
        """
        if num_actors == 2:
            return 1 - self.observer_id

        # DEPRECATED: N-player fallback — would need relationship data not available here.
        return 0 if self.observer_id != 0 else 1

    def stage_3_a(self, data):
        """
        The actor assesses the situation and its own psychological state.
        """
        # Total Uncertainty Score
        uncertainty_vectors = data["Uncertainty-Vectors"]
        U_total = np.sum([np.sum(uncertainty_vector) for (_, uncertainty_vector) in uncertainty_vectors])
        U_total /= len(uncertainty_vectors) * uncertainty_vectors[0][1].shape[0]  # Average the total uncertainty score
        data["Total-Uncertainty-Score"] = U_total

        # --- REVISED TOTAL PROBLEM SCORE CALCULATION ---
        # Use Adjusted Discrepancy (accounts for expected sustained contributions)
        # so TPS reflects the actor's net strategic pressure after crediting
        # ongoing sustained actions.
        adjusted_discrepancy_vector = data["Adjusted-Discrepancy-Vector"]

        # 1. Retrieve and Normalize Priorities (0.0 - 1.0)
        # We normalize by Max Priority so the "Most Important Thing" has a weight of 1.0.
        baseline_priority = data.get("Baseline-Priority-Vector", np.ones_like(adjusted_discrepancy_vector)).flatten()
        max_p = np.max(baseline_priority)
        if max_p > 0:
            baseline_priority = baseline_priority / max_p

        # 2. Calculate Weighted Discrepancy Vector
        # Element-wise multiplication: High Priority goals retain full signal, Low Priority goals get muted.
        weighted_discrepancies = (adjusted_discrepancy_vector).flatten() * baseline_priority
        
        # 3. Calculate "Weighted Energy" (L2 Norm)
        # Instead of Max (Peak), we take the Norm. This allows multiple medium-sized problems 
        # (e.g. an entire Archetype being threatened) to stack up and break the threshold.
        total_problem_score = np.linalg.norm(weighted_discrepancies)

        data["Total-Problem-Score"] = total_problem_score
        # --- END REVISED CALCULATION ---

        # PT Reference Point and Domain Classification
        # The reference point is an EWMA-anchored baseline representing the actor's
        # "normal" strategic position. On Turn 0, it is initialized to the starting TPS.
        # On subsequent turns, it drifts slowly via: ref_t = ρ * ref_{t-1} + (1-ρ) * TPS_{t-1}
        # Domain is determined by comparing current TPS against this persistent reference.
        reference_point = data.get("PT-Reference-Point", None)
        rho = data.get("PT-Reference-Persistence", 0.95)

        if reference_point is None:
            # Turn 0: initialize reference to starting TPS, no domain classification
            data["PT-Reference-Point"] = total_problem_score
            data["PT-TPS-Delta"] = 0.0
            data["PT-TPS-Previous-Used"] = 0.0
            data["PT-Domain"] = "neutral"
        else:
            # Turn t > 0: classify domain against persistent EWMA reference
            tps_delta = total_problem_score - reference_point
            data["PT-TPS-Delta"] = tps_delta
            data["PT-TPS-Previous-Used"] = reference_point

            domain_threshold = 0.01  # noise floor
            if tps_delta > domain_threshold:
                data["PT-Domain"] = "losses"
            elif tps_delta < -domain_threshold:
                data["PT-Domain"] = "gains"
            else:
                data["PT-Domain"] = "neutral"

        # Conflict Aversion Factor
        catastrophic_conflict_aversion_factor = 1.0
        actor_discrepancy_vectors = data["Actor-Discrepancy-Vectors"]
        primary_adversary = self.calculate_primary_adversary(self.event_data_checker.num_actors)
        if primary_adversary is not None:
            nuclear_powers = data["Nuclear-Powers"]
            is_adversary_nuclear = nuclear_powers[primary_adversary, 0] == 1
            self_capability = data["Self-Profile-Vector"][self.enums['Char']['Capability'], 0]
            # 2-Player: Other-Profile-Vector replaces APV-Tensor indexing
            perceived_adversary_capability = data["Other-Profile-Vector"][self.enums['Char']['Capability'], 0]

            peer_capability_ratio = data["Peer-Capability-Ratio"]
            is_peer = perceived_adversary_capability > self_capability * peer_capability_ratio
            is_high_risk = is_peer or is_adversary_nuclear

            if is_high_risk:
                escalatory_severity_threshold = data["Escalatory-Severity-Threshold"]
                base_input_vectors = data["Base-Input-Vectors"]
                adversary_action_severity = [vec[self.enums['Char']['Severity'], 0] for (idx, vec) in base_input_vectors if idx == primary_adversary]
                if len(adversary_action_severity) > 0 and max(adversary_action_severity) > escalatory_severity_threshold:
                    is_escalatory_action = True
                    catastrophic_conflict_aversion_factor = data["Aversion-Factor-Value"]


        # Uncertainty Factor
        uncertainty_sensitivity_multiplier = data["Uncertainty-Sensitivity-Multiplier"]
        uncertainty_factor = 1 - (uncertainty_sensitivity_multiplier * U_total)

        # Desperation Factor
        # When PT is enabled, the value function's convexity in the loss domain
        # replaces the Desperation Factor's role. Desperation Factor is only active
        # in the v2.5 fallback path (PT_Enabled = False).
        pt_enabled = data.get("PT-Enabled", True)

        if pt_enabled:
            desperation_factor = 1.0
        else:
            raw_sensitivity = data["Desperation-Sensitivity"]
            global_scaler = data.get("Desperation-Scaling-Factor", 1.0)
            effective_sensitivity = raw_sensitivity * global_scaler
            desperation_factor = 1 + (effective_sensitivity * total_problem_score)

        # Effective Risk Propensity
        raw_base_risk = data["Base-Risk-Propensity"]
        risk_scaler = data.get("Base-Risk-Scaling-Factor", 1.0)

        adjusted_base_risk = raw_base_risk * risk_scaler

        effective_risk_propensity = adjusted_base_risk * uncertainty_factor * desperation_factor * catastrophic_conflict_aversion_factor
        data["Effective-Risk-Propensity"] = effective_risk_propensity

        return data

    def gen_sequences_from_initial_action(self, initial_action: int, max_actions_per_turn: int, disallowed_actions: List[int] = None):
        """
            Generate all sequences starting with `initial_action`, using distinct values from available actions,,
            with maximum length `max_actions_per_turn`. Sequences stop early only if 'Do_Nothing' appears.
            """
        # If the first value is Do_Nothing, it must be the only element.
        _do_nothing_id = self._do_nothing_id()
        if _do_nothing_id is not None and initial_action == _do_nothing_id:
            return [[_do_nothing_id]]

        domain = set(range(len(self.enums['Action'])))

        if disallowed_actions is not None:
            domain -= set(disallowed_actions)
        used = {initial_action}
        remaining_slots = max_actions_per_turn - 1
        results: List[List[int]] = []

        def backtrack(prefix: List[int], available: set, slots_left: int):
            if slots_left == 0:
                results.append(prefix)
                return
            # Try all unused next values in sorted order for determinism
            for v in sorted(available):
                if _do_nothing_id is not None and v == _do_nothing_id:
                    # If Do_Nothing is chosen, sequence ends immediately.
                    results.append(prefix + [_do_nothing_id])
                else:
                    if slots_left == 1:
                        results.append(prefix + [v])
                    else:
                        backtrack(prefix + [v], available - {v}, slots_left - 1)

        backtrack([initial_action], domain - used, remaining_slots)
        return results
    
    def stage_3_b(self, data):
        """
        Stage 3.B: Assign a benefit score to each course of action.
        """
        # Assess need for action
        total_problem_score = data["Total-Problem-Score"]
        action_discrepancy_threshold = data["Action-Discrepancy-Threshold"]
        if total_problem_score < action_discrepancy_threshold:
            data["Chosen-Action-Vectors"] = [np.zeros((len(self.enums['Char']),1))]
            _dn = self._do_nothing_id()
            # Use Do_Nothing if available; otherwise use the lowest-severity
            # available Repeatable action as a pass-through.  The original
            # sentinel of -1 crashed downstream playbook-update and
            # usage-count logic (toggle-pair KeyError), and an empty
            # sequence causes an IndexError in the next turn's perception
            # stage.  Choosing a low-severity Repeatable action is a safe
            # behavioural no-op that keeps the pipeline intact.
            if _dn is not None:
                data["Chosen-Action-Sequence"] = [_dn]
            else:
                fallback = self._lowest_severity_repeatable(data)
                data["Chosen-Action-Sequence"] = [fallback if fallback is not None else 0]
            data["Chosen-Adversary-Targets"] = [ -1 ]
            data["COA-Benefits"] = np.zeros((len(self.enums['Action']),1))
            data["Candidate-Action-Sequences"] = []
            data["Final-Cost-Vector"] = np.zeros((len(self.enums['Action']),1))
            data["Provisional-Utility-Vector"] = np.zeros((len(self.enums['Action']),1))
            data["Provisional-Utility-Vector-Normalized"] = np.zeros((len(self.enums['Action']),1))
            data["Ranked-Response-List"] = []
            data["Situational-Confidence"] = 1.0
            data["Goal-Improvement-Matrix"] = np.zeros((len(self.enums['Goal']), len(self.enums['Action'])))
            data["Culmination-Index"] = 0.0
            data["Culmination-Index-Raw"] = 0
            data["Culmination-Index-Total"] = 0
            data["Commitment-Landscape"] = {}
            data["Screened-COA-List"] = []
            data["Reconsideration-Active"] = False
            data["Reciprocity-Modifier"] = 1.0
            data["Fulfillment-Bonus"] = {}
            data["Triggered-Commitment-IDs"] = []
            data["Expired-Commitment-IDs"] = []
            data["Compliance-Results"] = []
            data["Commitment-Violations"] = []
            data["Proposal-Resolutions"] = []
            # Feasibility / culmination defaults for below-threshold early exit
            data["Surplus-Deficit-Matrix"] = np.zeros((len(self.enums['Action']), NUM_IMPACT_DIMS))
            data["Feasibility-Gate"] = np.ones((len(self.enums['Action']),))
            data["Dimension-Feasibility-Profile"] = {}
            data["Culmination-Diagnostic"] = {
                'dimension_profile': {},
                'culmination_severity': 0.0,
                'constraining_dimension': None,
                'constraining_ratio': 0.0,
                'top_problem_goal_index': 0,
                'top_problem_severity': 0.0,
                'total_infeasible_preferred': 0,
                'total_preferred': 0,
            }
            # Commitment scoring defaults
            data["Commitment-Support-Bonus"] = {}
            data["Commitment-Cost-Penalty"] = {}
            data["Commitment-Penalty-Propensity-Used"] = 1.0
            return data
        else:
            data["Chosen-Action-Vectors"] = None

        # Create COA Shortlist
        coa_playbook = data["COA-Playbook"]
        # 2-Player: Action-Utility-Matrix — how actor's own actions affect own goals
        action_utility_matrix = data["Action-Utility-Matrix"]
        # Use Adjusted Discrepancy (accounts for expected sustained contributions)
        final_discrepancy_vector = data["Adjusted-Discrepancy-Vector"]
        current_available_playbook = data["Current-Available-Playbook"]

        # Defense-in-depth: re-zero excluded actions.  Prior stages
        # (toggle re-enables, proposal activation, temporal filter)
        # can inadvertently set an excluded action back to 1.
        for excl_id in data.get('excluded_actions', []):
            if 0 <= excl_id < current_available_playbook.shape[0]:
                current_available_playbook[excl_id, 0] = 0

        # Salience parameters: how much an actor weights ally benefit and adversary harm.
        # Both are scaled by their respective scaling factors (default 0 = dormant).
        # These become active when the CDL provides non-zero ally_benefit / adversary_harm.
        alliance_salience = data["Alliance-Salience"] * data.get("Alliance-Salience-Scaling-Factor", 0)
        competitive_salience = data["Competitive-Salience"] * data.get("Competitive-Salience-Scaling-Factor", 0)

        # Action-Efficacy-Discount: self-efficacy discount on projected action effects.
        # 1.0 = full confidence; < 1.0 = actor discounts own ability to deliver benefits.
        action_efficacy_discount = data.get("Action-Efficacy-Discount", 0.9)

        # 2-Player: Self-effects from dedicated matrix (no Party axis)
        effects_self = action_utility_matrix  # (num_goals, num_actions)
        effect_scale = action_efficacy_discount
  
        ########################################################################
        d = final_discrepancy_vector                    # (G,1)
        E = effects_self * effect_scale                 # (G,A)
        D_after = d + E                                 # (G,A)

        # loss per goal (choose one)
        loss_before = np.abs(d)                         # (G,1)
        loss_after  = np.abs(D_after)                   # (G,A)

        # per-goal improvement: positive is good
        goal_improvement = loss_before - loss_after     # (G,A)

        data["Goal-Improvement-Matrix"] = goal_improvement  # (G,A) — exposed for UI heatmap
        
        def promethee_net_flows(perf: np.ndarray,
                        weights: np.ndarray,
                        indifference: np.ndarray,
                        preference: np.ndarray,
                        veto: np.ndarray | None = None) -> np.ndarray:
            """
            perf: (G,A) higher is better (e.g., goal_improvement)
            weights: (G,) nonnegative, sum doesn't need to be 1
            indifference q: (G,) below this diff ~ no preference
            preference p: (G,) above this diff ~ full preference
            veto: (G,) if provided, a is vetoed if b-a > veto[g] on any g
            Returns: net flow score per action (A,) higher is better
            """
            G, A = perf.shape
            w = np.maximum(weights, 0.0)
            w = w / (np.sum(w) + 1e-12)

            # pairwise diffs: diff[g,a,b] = perf[g,a] - perf[g,b]
            diff = perf[:, :, None] - perf[:, None, :]  # (G,A,A)

            # preference function (piecewise linear)
            q = indifference.reshape((G,1,1))
            p = preference.reshape((G,1,1))
            P = np.clip((diff - q) / (p - q + 1e-12), 0.0, 1.0)  # (G,A,A)

            # veto (discordance)
            if veto is not None:
                v = veto.reshape((G,1,1))
                veto_mask = np.any((-diff) > v, axis=0)          # (A,A) True if b beats a too much on some goal
                P[:, veto_mask] = 0.0

            # aggregate preferences
            pi = np.sum(w.reshape((G,1,1)) * P, axis=0)          # (A,A)
            # net flows
            phi_plus  = np.mean(pi, axis=1)                      # (A,)
            phi_minus = np.mean(pi, axis=0)                      # (A,)
            return phi_plus - phi_minus

        baseline_priority_vector = data["Baseline-Priority-Vector"].flatten() # (G,)
        weights = baseline_priority_vector / (np.sum(baseline_priority_vector) + 1e-12) # (G,)
        
        # thresholds (tune / store per goal)
        q = data.get("Outranking-Indifference-Threshold", 0.01) * np.ones_like(weights)
        p = data.get("Outranking-Preference-Threshold", 0.05) * np.ones_like(weights)
        veto = data.get("Goal-Veto-Thresholds", None)  # e.g., 0.20 on “red-line” goals, None otherwise

        net_flow = promethee_net_flows(goal_improvement, weights, q, p, veto)  # (A,)
        
        # Convert to a benefit-like vector
        my_benefit = net_flow.reshape((len(self.enums["Action"]), 1))

        # ---- CDL-routed components ----
        # All four non-self components of the benefit formula are routed through
        # CDL stubs. Until the CDL is implemented, stubs return zeros and only
        # the self-effects (PROMETHEE) drive the benefit calculation.
        #
        # Benefit = self_effects
        #         + (alliance_salience × ally_benefit)       ← CDL: how does my action help allies?
        #         + (competitive_salience × adversary_harm)  ← CDL: how does my action hurt adversary?
        #         − (coalition_cost_weight × coalition_cost)  ← CDL: domestic faction displeasure
        #         − (network_cost_weight × network_cost)      ← CDL: alliance obligation violations

        from cdl_stub import (compute_domestic_coalition_cost, compute_network_cost,
                              compute_adversary_impact, compute_ally_benefit)
        num_actions = len(self.enums['Action'])

        # Ally benefit: "how does MY action help my ALLIES' goals?"
        # Weighted by alliance_salience — actors who value allies highly
        # will prefer actions that benefit their coalition partners.
        ally_benefit = compute_ally_benefit(data, num_actions)
        ally_component = (ally_benefit * alliance_salience) * coa_playbook[:,self.enums['Party']['Ally']].reshape((num_actions, 1))

        # Adversary harm: "how does MY action hurt the ADVERSARY's goals?"
        # Weighted by competitive_salience, modulated by vindictiveness.
        adversary_harm = compute_adversary_impact(data, num_actions)
        vindictiveness_param = data.get("Vindictiveness-Parameter", 0.0)
        dynamic_competitive_salience = competitive_salience * (1.0 + (vindictiveness_param * total_problem_score))
        adversary_component = (adversary_harm * dynamic_competitive_salience) * coa_playbook[:,self.enums['Party']['Adversary']].reshape((num_actions, 1))

        # Coalition and network costs
        coalition_cost_weight = data.get("Coalition-Cost-Weight", 0.0)
        network_cost_weight = data.get("Network-Cost-Weight", 0.0)
        domestic_coalition_cost = compute_domestic_coalition_cost(data, None, num_actions)
        network_cost = compute_network_cost(data, None, num_actions)

        my_component = my_benefit
        coa_benefits = (my_component + ally_component + adversary_component
                        - (coalition_cost_weight * domestic_coalition_cost)
                        - (network_cost_weight * network_cost))
        coa_benefits = coa_benefits.reshape((len(self.enums['Action']), 1))


        # Adjust benefits if in crisis
        # Step 3.B.4: De-escalation bonus, now modulated by PAPT reciprocity.
        # Spec reference (commitment spec v0.2): Section 9.3.1.
        crisis_threshold = data["Crisis-Threshold"]
        reciprocity_modifier_value = 1.0
        if total_problem_score > crisis_threshold:
            deescalation_bonus_value = data["Deescalation-Bonus-Value"]
            coa_deescalation_flag_vector = data["COA-Deescalation-Flag-Vector"]

            # Scale bonus proportionally to current max benefit
            current_max_benefit = np.max(coa_benefits)
            base_scaled_bonus = deescalation_bonus_value * max(0.1, current_max_benefit)

            # Commitment Layer: Reciprocity modifier from PAPT.
            # Amplifies bonus when adversary de-escalating; suppresses when escalating.
            if data.get("Commitment-Layer-Active", False):
                papt_dict = data.get("PAPT-State", {})
                papt_state = PAPTState.from_dict(papt_dict)
                commitment_params = data.get("Commitment-Params", {})
                reciprocity_modifier_value = compute_reciprocity_modifier(
                    posture_trend=papt_state.posture_trend,
                    trend_confidence=papt_state.trend_confidence,
                    reciprocity_sensitivity=commitment_params.get("reciprocity_sensitivity", 1.5),
                    reciprocity_floor=commitment_params.get("reciprocity_floor", 0.3),
                )
                scaled_bonus = base_scaled_bonus * reciprocity_modifier_value
            else:
                scaled_bonus = base_scaled_bonus

            deescalation_bonus = coa_deescalation_flag_vector * scaled_bonus
            coa_benefits += deescalation_bonus
        data["Reciprocity-Modifier"] = reciprocity_modifier_value

        # Diminishing returns: penalize repeated action selection
        diminishing_returns_rate = data.get("Diminishing-Returns-Rate", 5.0)

        if "Action-Usage-Counts" not in data:
            data["Action-Usage-Counts"] = np.zeros((len(self.enums['Action']), 1))
        action_usage_counts = data["Action-Usage-Counts"]

        # Penalty applied to benefits so repetition cost is visible to Stage 4c (sequencing)
        repetition_penalty = action_usage_counts * diminishing_returns_rate
        coa_benefits = coa_benefits - repetition_penalty

        # Step 3.B.5a [Commitment Layer]: Fulfillment bonus for triggered
        # explicit commitments. Committed responses receive a bonus proportional
        # to credibility_stake × audience_cost_exposure.
        # Spec reference (commitment spec v0.2): Section 3.2.
        fulfillment_bonus_dict = {}
        commitment_layer_active_fb = data.get("Commitment-Layer-Active", False)
        if commitment_layer_active_fb:
            register_state_fb = data.get("Commitment-Register-State", {})
            commitment_params_fb = data.get("Commitment-Params", {})
            if register_state_fb:
                register_fb = CommitmentRegister.from_serializable(register_state_fb)
                candidate_ids_fb = list(range(num_actions))
                fulfillment_bonus_dict = compute_fulfillment_bonus(
                    register=register_fb,
                    candidate_coa_ids=candidate_ids_fb,
                    fulfillment_bonus_weight=commitment_params_fb.get(
                        "fulfillment_bonus_weight", 1.0),
                )
                for coa_id, bonus in fulfillment_bonus_dict.items():
                    coa_benefits[coa_id, 0] += bonus
        data["Fulfillment-Bonus"] = fulfillment_bonus_dict

        # Step 3.B.5a' [Commitment Layer]: Reconsideration evaluation.
        # Evaluate the five reconsideration trigger conditions to determine
        # whether implicit commitment influence should be dampened this turn.
        # Spec reference (commitment spec v0.2): Section 7.2.
        reconsideration_active = False
        dampening_factor = 1.0
        commitment_layer_active = data.get("Commitment-Layer-Active", False)
        if commitment_layer_active:
            commitment_params = data.get("Commitment-Params", {})
            papt_dict = data.get("PAPT-State", {})
            papt_state_current = PAPTState.from_dict(papt_dict) if papt_dict else None
            # Previous PAPT state is stored as a nested dict inside PAPT-State
            papt_state_previous = None
            if papt_dict and papt_dict.get("previous_state"):
                papt_state_previous = PAPTState.from_dict(papt_dict["previous_state"])

            # Commitment Estimate promotion (commitment spec v0.2, Section 3.7):
            # Extract the current commitment estimate for the adversary.
            # The Commitment-Estimates dict stores {adversary_id: scalar}.
            adversary_id = 1 - self.observer_id
            commitment_estimates = data.get("Commitment-Estimates", {})
            current_ce = commitment_estimates.get(adversary_id)
            previous_ce = data.get("Previous-Commitment-Estimate")

            # Pending proposals for reconsideration Trigger 4.
            # Check the adversary's register for pending proposals directed at us.
            pending_proposals_list = None
            adversary_reg_state = data.get("Adversary-Commitment-Register-State", {})
            if adversary_reg_state:
                adversary_reg = CommitmentRegister.from_serializable(adversary_reg_state)
                pending = adversary_reg.get_pending_proposals()
                if pending:
                    pending_proposals_list = [p.commitment_id for p in pending]

            reconsideration_result = ReconsiderationEvaluator.evaluate(
                current_discrepancy=data.get("Final-Discrepancy-Vector"),
                previous_discrepancy=data.get("Previous-Discrepancy-Vector"),
                reconsideration_ledger_threshold=commitment_params.get(
                    "reconsideration_ledger_threshold", 0.15),
                papt_state_current=papt_state_current,
                papt_state_previous=papt_state_previous,
                current_commitment_estimate=current_ce,
                previous_commitment_estimate=previous_ce,
                reconsideration_commitment_threshold=commitment_params.get(
                    "reconsideration_commitment_threshold", 0.2),
                posture_trend_reversal_threshold=commitment_params.get(
                    "posture_trend_reversal_threshold", 0.1),
                posture_trend_confidence_threshold=commitment_params.get(
                    "posture_trend_confidence_threshold", 0.3),
                transitioned_ids=data.get("Temporal-Transitioned-IDs"),
                pending_proposals=pending_proposals_list,
                goal_ledger_history=data.get("Goal-Ledger-History"),
            )
            reconsideration_active = reconsideration_result["reconsideration_active"]
            dampening_factor = reconsideration_result["dampening_factor"]
        data["Reconsideration-Active"] = reconsideration_active

        # Step 3.B.5b-5c [Commitment Layer]: Implicit commitment adjustments.
        # Assemble the Commitment Landscape from active implicit commitments
        # and apply support bonuses (5b) and cost penalties (5c) to COA_Benefits.
        # Spec reference (commitment spec v0.2): Section 8.1, Steps 3.B.5b and 3.B.5c.
        commitment_landscape = None
        # Always-present-with-defaults: commitment diagnostic keys.
        # Overwritten inside the conditional when the layer is active.
        data.setdefault("Commitment-Support-Bonus", {})
        data.setdefault("Commitment-Cost-Penalty", {})
        data.setdefault("Commitment-Penalty-Propensity-Used", 1.0)
        if commitment_layer_active:
            register_state = data.get("Commitment-Register-State", {})
            support_cost_sets = data.get("Support-Cost-Sets", {})

            if register_state:
                register = CommitmentRegister.from_serializable(register_state)
                candidate_ids = list(range(num_actions))

                # Descriptive mode overlays (commitment spec v0.2, Section 8.4):
                # In prescriptive mode, sunk_cost_bias=0 and status_quo_bias=0,
                # so weights pass through unchanged. In descriptive mode,
                # cognitive biases amplify trajectory persistence.
                base_support_w = commitment_params.get("support_bonus_weight", 1.0)
                base_cost_w = commitment_params.get("cost_penalty_weight", 1.0)
                is_prescriptive = data.get("Is-Prescriptive", False)
                if is_prescriptive:
                    effective_support_w = base_support_w
                    effective_cost_w = base_cost_w
                else:
                    effective_support_w, effective_cost_w = compute_descriptive_weights(
                        support_bonus_weight=base_support_w,
                        cost_penalty_weight=base_cost_w,
                        cumulative_trajectory_investment=register.cumulative_trajectory_investment(),
                        sunk_cost_bias=commitment_params.get("sunk_cost_bias", 0.3),
                        status_quo_bias=commitment_params.get("status_quo_bias", 0.15),
                    )

                commitment_landscape = CommitmentLandscape.assemble(
                    register=register,
                    support_cost_sets=support_cost_sets,
                    actor_id=self.observer_id,
                    candidate_coa_ids=candidate_ids,
                    support_bonus_weight=effective_support_w,
                    cost_penalty_weight=effective_cost_w,
                    hard_constraint_threshold=commitment_params.get("hard_constraint_threshold", 0.3),
                    dampening_factor=dampening_factor,
                )

                # Apply commitment adjustments to COA_Benefits
                # Cost penalties are modulated by risk propensity: desperate actors
                # discount commitment costs, cautious actors weight them more heavily.
                # Support bonuses are NOT modulated — the strategic pull of fulfilling
                # a commitment is constant regardless of desperation.
                safe_commit_propensity = max(
                    0.1, data.get("Effective-Risk-Propensity", 1.0)
                )
                commitment_support_bonus = {}
                commitment_cost_penalty = {}
                for coa_id in candidate_ids:
                    support = commitment_landscape.support_bonus(coa_id)
                    penalty = commitment_landscape.cost_penalty(coa_id)
                    modulated_adj = support - (penalty / safe_commit_propensity)
                    coa_benefits[coa_id, 0] += modulated_adj
                    commitment_support_bonus[coa_id] = support
                    commitment_cost_penalty[coa_id] = penalty

                data["Commitment-Support-Bonus"] = commitment_support_bonus
                data["Commitment-Cost-Penalty"] = commitment_cost_penalty
                data["Commitment-Penalty-Propensity-Used"] = safe_commit_propensity

        data["Commitment-Landscape"] = (
            commitment_landscape.to_dict() if commitment_landscape else {}
        )

        # Temporal Layer: Apply temporal benefit modifiers per action.
        # These adjustments go after PROMETHEE and existing bonuses/penalties
        # but before the PT value function (per v0.8 Handoff Context).
        temporal_profiles = data.get("Temporal-Profiles", {})
        temporal_params = data.get("Temporal-Params", {})
        if temporal_profiles:
            # Per-actor temporal discount rate (resolved to system default at setup)
            discount_rate = data.get("Temporal-Discount-Rate", temporal_params.get('temporal_discount_rate', 0.1))
            sif = temporal_params.get('sustaining_impact_factor', 0.3)
            sde = temporal_params.get('sustaining_decay_exponent', 0.4)

            for coa_id, profile in temporal_profiles.items():
                if coa_id >= num_actions:
                    continue
                # Temporal discount for delayed benefit
                modifier = compute_temporal_benefit_modifier(
                    profile.execution_duration, discount_rate
                )
                coa_benefits[coa_id, 0] *= modifier

                # Sustained benefit bonus (additive)
                if profile.is_sustained:
                    base_b = float(coa_benefits[coa_id, 0])
                    bonus = compute_sustained_benefit_bonus(
                        base_b, sif, sde, discount_factor=0.9, effective_horizon=10
                    )
                    coa_benefits[coa_id, 0] += bonus

            # Anticipatory initiation bonus
            planning_heuristic = data.get("Temporal-Planning-Heuristic")
            goal_ledger_history = data.get("Goal-Ledger-History", [])
            if planning_heuristic and len(goal_ledger_history) >= 2:
                velocity = planning_heuristic.compute_ledger_velocity(goal_ledger_history)
                goal_dim = goal_ledger_history[-1].shape[0] if len(goal_ledger_history) > 0 else 1
                bpv = data.get("Baseline-Priority-Vector", np.ones((goal_dim, 1)))
                for coa_id, profile in temporal_profiles.items():
                    if coa_id >= num_actions or profile.execution_duration <= 0:
                        continue
                    antic_bonus = planning_heuristic.compute_anticipatory_bonus(
                        base_benefit=float(coa_benefits[coa_id, 0]),
                        execution_duration=profile.execution_duration,
                        current_problem_score=total_problem_score,
                        ledger_velocity=velocity,
                        goal_weights=bpv,
                        actor_data=data,
                    )
                    coa_benefits[coa_id, 0] += antic_bonus

        data["COA-Benefits"] = coa_benefits

        # Cost Horizon Weight: create per-turn working copies of cost matrices.
        # The originals are static scenario data and must NOT be mutated.
        action_cost_matrix = data["Action-Cost-Matrix"].copy()
        base_cost_vector = data["Base-Cost-Vector"].copy()
        cost_horizon_weight = data.get("Cost-Horizon-Weight", 0.5)

        # Calculate individual final cost - move the objective "sticker price" (Base Cost) to its subjective cost
        # 1) Surplus/Deficit Matrix — computed against IMMEDIATE cost only.
        # ACM is (num_actions, NUM_IMPACT_DIMS). Compare against the matching
        # resource dimensions of the Self-Profile-Vector.
        self_profile_vector = data["Self-Profile-Vector"]
        impact_to_profile = get_impact_to_profile_map(CharEnum())
        resource_profile_dims = sorted(impact_to_profile.values())  # [Capability_idx, Resolve_idx]
        self_profile_resource = self_profile_vector[resource_profile_dims, :]  # (2, 1)

        # 1.5) Min-Dimension Feasibility Gate
        # Hard-screen based on IMMEDIATE execution cost only.  The feasibility
        # gate answers "can this actor execute this action right now?" — which
        # is a question about immediate resource surplus, not projected total
        # cost of ownership.  Sustained actions' ongoing costs are a forward-
        # looking concern handled by the utility calculation (via Base-Cost-
        # Vector), not a binary feasibility screen.
        immediate_surplus = (-1 * action_cost_matrix) + self_profile_resource.T
        feasibility_gate_threshold = data.get("Feasibility-Gate-Threshold", -0.1)
        min_dimension_surplus = np.min(immediate_surplus, axis=1)  # (num_actions,)
        feasibility_gate = (min_dimension_surplus >= feasibility_gate_threshold)  # boolean (num_actions,)

        for action_id in range(num_actions):
            if not feasibility_gate[action_id]:
                current_available_playbook[action_id, 0] = 0

        data["Feasibility-Gate"] = feasibility_gate

        # Now add projected sustaining costs to the cost matrices for the
        # utility-side calculations.  This inflates the cost signal for
        # sustained actions in the benefit/cost tradeoff (making them more
        # expensive to justify) without excluding them from consideration
        # at the feasibility gate.
        if temporal_profiles and cost_horizon_weight > 0:
            temporal_params_chw = data.get("Temporal-Params", {})
            decay_rate = 1.0 - temporal_params_chw.get('temporal_discount_rate', 0.1)
            for coa_id, profile in temporal_profiles.items():
                if coa_id >= num_actions or not profile.is_sustained:
                    continue
                max_layers = getattr(profile, 'max_sustaining_layers', 10)
                discount_sum = sum(
                    decay_rate ** k for k in range(1, max_layers + 1)
                )
                sustaining_cost = profile.sustaining_cost_vector.flatten()
                for impact_dim in range(min(NUM_IMPACT_DIMS, len(sustaining_cost))):
                    action_cost_matrix[coa_id, impact_dim] += (
                        cost_horizon_weight * discount_sum
                        * sustaining_cost[impact_dim]
                    )
                sustaining_base_cost = float(np.sum(profile.sustaining_cost_vector))
                base_cost_vector[coa_id, 0] += (
                    cost_horizon_weight * discount_sum * sustaining_base_cost
                )

        # Surplus/Deficit Matrix — includes projected sustaining costs for
        # the utility-side cost scoring and feasibility penalty exponent.
        surplus_deficit_matrix = (-1 * action_cost_matrix) + self_profile_resource.T
        data["Surplus-Deficit-Matrix"] = surplus_deficit_matrix

        # 2) Total Feasibility Score
        # Feasibility cliff: exponent > 1.0 punishes deficits exponentially.
        penalty_exponent = data.get("Feasibility-Penalty-Exponent", 1.0)
        
        # Separate surpluses (positive) from deficits (negative)
        surpluses = np.maximum(0, surplus_deficit_matrix)
        deficits = np.minimum(0, surplus_deficit_matrix)
        
        # Apply exponent to deficits to increase their "weight"
        # We take absolute value, power it, and re-apply the negative sign
        weighted_deficits = -1 * (np.power(np.abs(deficits), penalty_exponent))
        
        # Sum surpluses and weighted deficits
        total_feasibility_score = np.sum(surpluses + weighted_deficits, axis=1).reshape((len(self.enums['Action']), 1))
        
        # 3) Final Cost Vector
        feasibility_scaling_weight = data["Feasibility-Scaling-Weight"]
        # base_cost_vector already set as working copy above (with cost horizon applied)

        # Auto-normalize costs to [0,1] to match the benefit scale.
        max_cost = np.max(base_cost_vector)
        if max_cost > 1.0:
            base_cost_vector = base_cost_vector / max_cost

        # Calculate final subjective cost (clamp divisor to prevent div-by-zero)
        raw_feasibility_adjustment = 1 + (feasibility_scaling_weight * total_feasibility_score)
        adjusted_feasibility_score = np.maximum(0.1, raw_feasibility_adjustment)
        
        # Use the normalized 'base_cost_vector' here
        final_cost_vector = base_cost_vector / adjusted_feasibility_score
        data["Final-Cost-Vector"] = final_cost_vector

        # Calculate provisional utility
        effective_risk_propensity = data["Effective-Risk-Propensity"]

        # Utility = Benefit - (Cost / Risk Propensity).
        # Higher propensity reduces penalty ("gambling for salvation" under desperation).
        safe_propensity = max(1e-6, effective_risk_propensity)

        # PT Phase 1: Apply value function to individual action benefits
        # This distorts perceived benefit based on the actor's overall strategic
        # trajectory (TPS-delta). In the domain of losses, high-benefit actions
        # get relatively boosted (risk-seeking). In the domain of gains, they get
        # compressed (risk-averse). See docs/prospect-theory-integration.md.
        pt_enabled = data.get("PT-Enabled", True)

        if pt_enabled:
            alpha = data.get("PT-Alpha", 0.88)
            lambda_loss = data.get("PT-Lambda", 2.25)

            pt_adjusted_benefits = self.pt_value_function(
                coa_benefits.flatten(), alpha, lambda_loss
            ).reshape(coa_benefits.shape)

            data["PT-Adjusted-Benefits"] = pt_adjusted_benefits
            data["PT-Alpha-Used"] = alpha
            data["PT-Lambda-Used"] = lambda_loss
            benefits_for_utility = pt_adjusted_benefits
        else:
            benefits_for_utility = coa_benefits

        # Calculate utility using PT-adjusted benefits (or raw if PT disabled)
        provisional_utility_vector = benefits_for_utility - (final_cost_vector / safe_propensity)

            
        # Normalize provisional utility between -1 and 1
        min_utility = np.min(provisional_utility_vector)
        max_utility = np.max(provisional_utility_vector)
        provisional_utility_vector_normalized = 2 * (provisional_utility_vector - min_utility) / (max_utility - min_utility) - 1

        # Temporal Layer: Filter playbook for temporal exclusions.
        # In-progress and sustaining actions are excluded (toggle withdrawal preserved).
        timeline = data.get("World-State-Timeline")
        if timeline and data.get("Temporal-Layer-Active", False):
            current_available_playbook = filter_playbook_for_temporal(
                current_available_playbook, timeline, self.observer_id,
                data.get("Action-Type-Vector"),
                data.get("Action-Toggle-Pair-Map"),
                self.enums,
            )

            # Temporal Layer: Screen for unmet prerequisites.
            # Actions with prerequisite bindings are blocked until the required
            # actions have reached the specified lifecycle state.
            temporal_profiles = data.get("Temporal-Profiles", {})
            if temporal_profiles:
                current_available_playbook = screen_prerequisites(
                    current_available_playbook, timeline, self.observer_id,
                    temporal_profiles,
                )

        # Commitment Layer: Screening filter.
        # Apply hard constraint filtering from the commitment landscape.
        # Runs AFTER temporal exclusion (Condition 2 is already handled above).
        # Condition 3 (explicit commitment protection) prevents screening of
        # committed_response actions for high-stakes triggered commitments.
        # Spec reference (commitment spec v0.2): Section 6.2, Conditions 1 and 3.
        triggered_commitments_for_screen = []
        if commitment_layer_active:
            register_state_sc = data.get("Commitment-Register-State", {})
            if register_state_sc:
                register_sc = CommitmentRegister.from_serializable(register_state_sc)
                triggered_commitments_for_screen = register_sc.get_triggered_explicit()
        if commitment_landscape is not None:
            ScreeningFilter.apply_to_playbook(
                current_available_playbook,
                commitment_landscape,
                reconsideration_active=reconsideration_active,
                triggered_commitments=triggered_commitments_for_screen,
                explicit_violation_threshold=commitment_params.get(
                    "explicit_commitment_violation_threshold", 0.5)
                    if commitment_layer_active else 0.5,
            )
        data["Screened-COA-List"] = np.where(
            current_available_playbook.flatten() > 0
        )[0].tolist()

        # Give a provisional utility of -1,000,000 to unavailable actions
        provisional_utility_vector[current_available_playbook == 0] = -1000000
        provisional_utility_vector_normalized[current_available_playbook == 0] = -1000000
        data["Provisional-Utility-Vector"] = provisional_utility_vector
        data["Provisional-Utility-Vector-Normalized"] = provisional_utility_vector_normalized


        # Select top actions based on provisional utility
        num_actions_explored = data["Num-Actions-Explored"]
        num_allowed_actions = np.sum(current_available_playbook)
        num_actions_explored = min(num_actions_explored, int(num_allowed_actions))
        top_actions = np.argsort(provisional_utility_vector.flatten())[-num_actions_explored:][::-1].tolist()

        # Per-Dimension Feasibility Profile and Enriched Culmination Diagnostic
        # Reference set: all actions with positive gross benefit (before cost subtraction).
        # Gross benefit is the right measure of "want" — cost is what the gate measures.
        positive_benefit_actions = [
            aid for aid in range(num_actions) if coa_benefits[aid, 0] > 0
        ]
        num_preferred = len(positive_benefit_actions)

        # Per-dimension feasibility profile (resource dimensions only)
        char_enum = self.enums['Char']
        _impact_to_profile_diag = get_impact_to_profile_map(char_enum)
        dimension_feasibility_profile = {}
        for acm_col_idx, (impact_dim, profile_dim) in enumerate(
            sorted(_impact_to_profile_diag.items(), key=lambda x: x[1])
        ):
            dim_name = char_enum.index_to_value[profile_dim]
            dim_surplus = surplus_deficit_matrix[:, acm_col_idx]
            infeasible_ids = []
            for action_id in positive_benefit_actions:
                if dim_surplus[action_id] < feasibility_gate_threshold:
                    infeasible_ids.append(action_id)
            dimension_feasibility_profile[dim_name] = {
                'infeasible_count': len(infeasible_ids),
                'infeasible_ratio': len(infeasible_ids) / max(1, num_preferred),
                'infeasible_action_ids': infeasible_ids,
                'actor_resource_level': float(self_profile_vector[profile_dim, 0]),
            }
        data["Dimension-Feasibility-Profile"] = dimension_feasibility_profile

        # Culmination severity: benefit-weighted fraction of infeasible preferred actions
        total_benefit_of_preferred = sum(
            max(0, coa_benefits[aid, 0]) for aid in positive_benefit_actions
        )
        any_dim_infeasible = set()
        for profile in dimension_feasibility_profile.values():
            any_dim_infeasible.update(profile['infeasible_action_ids'])

        benefit_of_infeasible = sum(
            max(0, coa_benefits[aid, 0]) for aid in any_dim_infeasible
        )
        culmination_severity = float(np.clip(
            benefit_of_infeasible / max(1e-6, total_benefit_of_preferred), 0, 1
        ))

        # Problem-action alignment: identify top problem and constraining dimension
        # Use Adjusted Discrepancy so sustained actions reduce apparent problem severity.
        baseline_priority_vector = data.get(
            "Baseline-Priority-Vector",
            np.ones_like(data["Adjusted-Discrepancy-Vector"])
        )
        weighted_discrepancy = data["Adjusted-Discrepancy-Vector"] * baseline_priority_vector
        top_problem_idx = int(np.argmax(np.abs(weighted_discrepancy)))
        top_problem_severity = float(weighted_discrepancy[top_problem_idx, 0])

        constraining_dimension = max(
            dimension_feasibility_profile.keys(),
            key=lambda d: dimension_feasibility_profile[d]['infeasible_ratio']
        ) if dimension_feasibility_profile else None
        constraining_ratio = (
            dimension_feasibility_profile[constraining_dimension]['infeasible_ratio']
            if constraining_dimension else 0.0
        )

        culmination_diagnostic = {
            'dimension_profile': dimension_feasibility_profile,
            'culmination_severity': culmination_severity,
            'constraining_dimension': constraining_dimension,
            'constraining_ratio': constraining_ratio,
            'top_problem_goal_index': top_problem_idx,
            'top_problem_severity': top_problem_severity,
            'total_infeasible_preferred': len(any_dim_infeasible),
            'total_preferred': num_preferred,
        }
        data["Culmination-Diagnostic"] = culmination_diagnostic

        # Backwards compatibility
        data["Culmination-Index"] = culmination_severity
        data["Culmination-Index-Raw"] = len(any_dim_infeasible)
        data["Culmination-Index-Total"] = num_preferred

        # generate candidate action sequences
        # disallowed actions have a 0 in the current available playbook
        disallowed_actions = np.where(current_available_playbook.flatten() == 0)[0].tolist()
        max_actions_per_turn = data["Max-Actions-Per-Turn"]
        candidate_action_sequences = [
            {"sequence": seq}
            for action in top_actions
            for seq in self.gen_sequences_from_initial_action(action, max_actions_per_turn, disallowed_actions)
        ]
        data["Candidate-Action-Sequences"] = candidate_action_sequences



        return data


    def stage_3_c(self, data):
        """
        Stage 3.C: Determine subjective final costs and benefits of each course of action.
        """
        candidate_action_sequences = data["Candidate-Action-Sequences"]

        # Calculate total sequence benefit for each candidate sequence
        for candidate in candidate_action_sequences:
            sequence = candidate["sequence"]

            benefit_total, cost_total, benefit_list, cost_list = self.calculate_sequence_cost_benefit(data, sequence)

            # Add the total benefit and cost to the candidate
            candidate["benefit_list"] = benefit_list
            candidate["cost_list"] = cost_list
            candidate["total_benefit"] = benefit_total
            candidate["total_cost"] = cost_total

        data["Candidate-Action-Sequences"] = candidate_action_sequences

        return data

    def calculate_sequence_cost_benefit(self, data, sequence):
        coa_benefits = data["COA-Benefits"]
        final_cost_vector = data["Final-Cost-Vector"]
        coa_conflict_matrix = data["COA-Conflict-Matrix"]

        total_uncertainty_score = data["Total-Uncertainty-Score"]
        clarity_preference_scalar = data["Clarity-Preference-Scalar"]
        coa_clarity_score_vector = data["COA-Clarity-Score-Vector"]
        action_uncertainty_reduction_benefit = coa_clarity_score_vector * clarity_preference_scalar * total_uncertainty_score

        benefit_list = []
        cost_list = []
        for i in range(len(sequence)):
            action = sequence[i]
            # Calculate action benefit as effect benefit and uncertainty reduction benefit
            benefit_list.append(coa_benefits[action, 0] + action_uncertainty_reduction_benefit[action, 0])
            # Calculate the action cost as the final cost plus the cost of any conflicts with the next action
            conflict_cost = coa_conflict_matrix[action, sequence[i + 1]] if i < len(sequence) - 1 else 0
            cost_list.append(final_cost_vector[action, 0] + conflict_cost)

        return sum(benefit_list), sum(cost_list), benefit_list, cost_list

    def calculate_utility_distribution(self, candidate, outcome_uncertainty,
                                       coa_volatility_vector, effective_risk_propensity):
        sequence = candidate["sequence"]
        benefit_list = candidate["benefit_list"]
        cost_list = candidate["cost_list"]
        total_benefit = candidate["total_benefit"]
        total_cost = candidate["total_cost"]

        benefit_stdev = 0.0
        cost_stdev = 0.0
        for i in range(len(sequence)):
            action = sequence[i]
            volatility = coa_volatility_vector[action, 0]
            # Calculate the standard deviation of the benefit and cost for this action
            benefit_stdev += np.square(benefit_list[i] * outcome_uncertainty * volatility)
            cost_stdev += np.square(cost_list[i] * outcome_uncertainty * volatility)

        benefit_stdev = np.sqrt(benefit_stdev)
        cost_stdev = np.sqrt(cost_stdev)

        # Utility = Benefit - (Cost / Propensity). Higher propensity reduces penalty.
        safe_propensity = max(1e-6, effective_risk_propensity)

        utility_mean = total_benefit - (total_cost / safe_propensity)

        # Standard deviation propagation for division: Var(A - B/c) = Var(A) + (1/c)^2 * Var(B)
        utility_stdev = np.sqrt(np.square(benefit_stdev) + np.square(cost_stdev / safe_propensity))

        candidate["utility_mean"] = utility_mean
        candidate["utility_stdev"] = utility_stdev

    def calculate_action_sequence_targets(self, sequence, coa_playbook, num_actors):
        primary_adversary_target = self.calculate_primary_adversary(num_actors)

        adversary_targets = []
        for action in sequence:
            # Determine possible target actor types for this action
            playbook = coa_playbook[action, :].reshape((len(self.enums['Relationship']),))
            if playbook[self.enums['Relationship']['Adversary']] > 0:
                adversary_targets.append(primary_adversary_target)
            else:
                adversary_targets.append(-1)

        return adversary_targets




    # =========================================================================
    # Stage 3.PT: Prospect Valuation (Prospect Theory sub-stage)
    # Inserted between 3.C and 3.D. Transforms raw benefit/cost into
    # subjective prospect values using a per-goal PT value function.
    # =========================================================================

    @staticmethod
    def pt_value_function(x, alpha, lambda_loss):
        """
        Prospect Theory value function (Kahneman & Tversky 1992).
        Applied element-wise. x can be scalar or array.
        """
        x = np.asarray(x, dtype=float)
        result = np.where(
            x >= 0,
            np.power(np.maximum(x, 0), alpha),
            -lambda_loss * np.power(np.maximum(-x, 0), alpha)
        )
        return result

    @staticmethod
    def prelec_weight(p, gamma):
        """
        Prelec (1998) probability weighting function.
        Handles boundary cases: w(0)=0, w(1)=1.
        """
        p = np.clip(p, 1e-12, 1.0 - 1e-12)
        return np.exp(-np.power(-np.log(p), gamma))

    def cpt_weighted_value(self, prospect_mean, prospect_stdev, alpha, lambda_loss, gamma, n_bins=7):
        """
        Cumulative Prospect Theory weighted value using rank-dependent
        probability weighting (Tversky & Kahneman 1992).

        Discretises the prospect distribution into `n_bins` equally-spaced
        bins spanning ±3 standard deviations around the mean. Each bin is
        weighted via the Prelec (1998) weighting function applied cumulatively,
        following the CPT dual-weighting scheme:
          - Gains are weighted by overweighting small upper-tail probabilities
          - Losses are weighted by overweighting small lower-tail probabilities

        Returns a single scalar: the CPT-weighted subjective value.
        """
        from math import erfc, sqrt

        # Normal CDF via complementary error function (avoids scipy dependency)
        def _norm_cdf(x, mu, sigma):
            return 0.5 * erfc(-(x - mu) / (sigma * sqrt(2)))

        # Degenerate case: no variance → just apply value function to the mean
        if prospect_stdev < 1e-9:
            return float(self.pt_value_function(prospect_mean, alpha, lambda_loss))

        # Build bin edges at ±3σ
        lo = prospect_mean - 3.0 * prospect_stdev
        hi = prospect_mean + 3.0 * prospect_stdev
        edges = np.linspace(lo, hi, n_bins + 1)
        midpoints = 0.5 * (edges[:-1] + edges[1:])

        # Raw cumulative probabilities at each edge
        cum_probs = np.array([_norm_cdf(e, prospect_mean, prospect_stdev) for e in edges])
        bin_probs = np.diff(cum_probs)
        bin_probs = np.maximum(bin_probs, 1e-15)
        # Renormalise to sum to 1 (truncation at ±3σ drops ~0.3%)
        bin_probs /= bin_probs.sum()

        # Apply value function to each bin midpoint
        v_bins = self.pt_value_function(midpoints, alpha, lambda_loss)

        # Partition into gains and losses relative to zero
        gain_mask = midpoints >= 0
        loss_mask = ~gain_mask

        # CPT decision weights (dual cumulative weighting)
        decision_weights = np.zeros(n_bins)

        # --- Gains: rank from best to worst (descending value) ---
        if np.any(gain_mask):
            gain_idx = np.where(gain_mask)[0]
            # Sort gains descending by midpoint value
            sorted_gain = gain_idx[np.argsort(-midpoints[gain_idx])]
            cum_p = 0.0
            for idx in sorted_gain:
                cum_p_new = cum_p + bin_probs[idx]
                w_new = self.prelec_weight(cum_p_new, gamma)
                w_old = self.prelec_weight(cum_p, gamma) if cum_p > 1e-12 else 0.0
                decision_weights[idx] = w_new - w_old
                cum_p = cum_p_new

        # --- Losses: rank from worst to best (ascending value, i.e. most negative first) ---
        if np.any(loss_mask):
            loss_idx = np.where(loss_mask)[0]
            # Sort losses ascending by midpoint (most negative first)
            sorted_loss = loss_idx[np.argsort(midpoints[loss_idx])]
            cum_p = 0.0
            for idx in sorted_loss:
                cum_p_new = cum_p + bin_probs[idx]
                w_new = self.prelec_weight(cum_p_new, gamma)
                w_old = self.prelec_weight(cum_p, gamma) if cum_p > 1e-12 else 0.0
                decision_weights[idx] = w_new - w_old
                cum_p = cum_p_new

        # Weighted subjective value
        cpt_value = float(np.dot(decision_weights, v_bins))
        return cpt_value

    def stage_3_pt(self, data):
        """
        Stage 3.PT: Prospect Valuation.

        For each candidate action sequence, transforms raw benefit/cost
        into a subjective prospect value using:
          1. Per-goal outcome framing relative to the reference point
          2. PT value function applied per goal, then priority-weighted aggregation
          3. Prospect variance via local slope scaling
        """
        candidate_action_sequences = data["Candidate-Action-Sequences"]
        effective_risk_propensity = data["Effective-Risk-Propensity"]
        safe_propensity = max(1e-6, effective_risk_propensity)

        # PT parameters (per-actor, with KT92/Prelec98 defaults)
        alpha = data.get("PT-Alpha", 0.88)
        lambda_loss = data.get("PT-Lambda", 2.25)
        reference_point_vector = data.get("Reference-Point-Vector",
                                          np.zeros_like(data["Final-Discrepancy-Vector"]))

        # Priority weights for goal-level aggregation
        baseline_priority = data.get("Baseline-Priority-Vector",
                                     np.ones_like(data["Final-Discrepancy-Vector"]))
        priority_sum = np.sum(baseline_priority) + 1e-9
        priority_norm = baseline_priority.flatten() / priority_sum

        # Per-goal outcome decomposition from PROMETHEE
        # Goal-Improvement-Matrix: (G, A) — how much each action improves each goal
        goal_improvement_matrix = data.get("Goal-Improvement-Matrix")
        coa_benefits = data["COA-Benefits"]
        final_cost_vector = data["Final-Cost-Vector"]
        num_goals = len(self.enums['Goal'])

        for candidate in candidate_action_sequences:
            sequence = candidate["sequence"]
            benefit_list = candidate["benefit_list"]
            cost_list = candidate["cost_list"]

            # Compute per-goal outcome for this sequence
            # Sum per-goal improvements across actions in the sequence
            if goal_improvement_matrix is not None:
                goal_outcome = np.zeros((num_goals,))
                for i, action in enumerate(sequence):
                    goal_outcome += goal_improvement_matrix[:, action]

                # Subtract per-goal cost share (distribute cost proportionally)
                total_cost = candidate["total_cost"]
                goal_cost_share = (total_cost / safe_propensity) * priority_norm
                goal_outcome_net = goal_outcome - goal_cost_share
            else:
                # Fallback: distribute scalar net outcome across goals by priority
                net_scalar = candidate["total_benefit"] - (candidate["total_cost"] / safe_propensity)
                goal_outcome_net = np.full((num_goals,), net_scalar) * priority_norm

            # Frame relative to reference point (per goal)
            ref_flat = reference_point_vector.flatten()
            prospect_vector = goal_outcome_net - ref_flat

            # Apply value function per goal
            v_vector = self.pt_value_function(prospect_vector, alpha, lambda_loss)

            # Priority-weighted aggregation
            V_s = float(np.dot(priority_norm, v_vector))
            candidate["prospect_value"] = V_s
            candidate["prospect_vector"] = prospect_vector.copy()
            candidate["value_vector"] = v_vector.copy()
            candidate["goal_outcome_net"] = goal_outcome_net.copy()

            # Prospect variance via local slope scaling
            # Local slope of v(x) at each goal's prospect value
            epsilon = 0.001
            abs_prospect = np.maximum(np.abs(prospect_vector), epsilon)
            slope = np.where(
                prospect_vector >= 0,
                alpha * np.power(abs_prospect, alpha - 1),
                lambda_loss * alpha * np.power(abs_prospect, alpha - 1)
            )

            # Inherit per-action uncertainty from utility_stdev (already computed in 3.D path)
            # We approximate per-goal variance from the sequence-level stdev
            utility_stdev = candidate.get("utility_stdev", 0.0)
            per_goal_var = np.square(utility_stdev * slope)
            prospect_stdev = float(np.sqrt(np.sum(np.square(priority_norm) * per_goal_var)))
            candidate["prospect_stdev"] = prospect_stdev

        # Store PT outputs for inspection
        data["PT-Prospect-Values"] = [c["prospect_value"] for c in candidate_action_sequences]
        data["PT-Alpha-Used"] = alpha
        data["PT-Lambda-Used"] = lambda_loss
        data["PT-Reference-Point"] = reference_point_vector.flatten().tolist()
        data["PT-Priority-Weights"] = priority_norm.tolist()

        return data

    def stage_3_d(self, data):
        """
        Stage 3.D: Final Utility Calculation and Decision

        """
        effective_risk_propensity = data["Effective-Risk-Propensity"]
        total_uncertainty_score = data["Total-Uncertainty-Score"]
        uncertainty_sensitivity_multiplier = data["Uncertainty-Sensitivity-Multiplier"]
        candidate_action_sequences = data["Candidate-Action-Sequences"]
        coa_volatility_vector = data["COA-Volatility-Vector"]
        stdev_spread_parameter = data["StDev-Spread-Parameter"]

        # Risk-Reward Blender: > 0.0 rewards volatility, < 0.0 penalizes it
        risk_reward_param = data.get("Risk-Reward-Blender-Parameter", 0.0)

        # Calculate situational confidence and outcome uncertainty factor
        situational_confidence = 1 - (total_uncertainty_score * uncertainty_sensitivity_multiplier)
        outcome_uncertainty_factor = stdev_spread_parameter * (1 - situational_confidence)

        # Save situational confidence for output data
        data["Situational-Confidence"] = situational_confidence

        # Calculate the utility distribution for each candidate sequence
        for candidate in candidate_action_sequences:
            self.calculate_utility_distribution(
                candidate,
                outcome_uncertainty_factor,
                coa_volatility_vector,
                effective_risk_propensity)

        # Calculate adversary targets for each candidate sequence
        coa_playbook = data["COA-Playbook"]
        for candidate in candidate_action_sequences:
            candidate["adversary_targets"] = self.calculate_action_sequence_targets(
                candidate["sequence"],
                coa_playbook,
                self.event_data_checker.num_actors)

        # Scoring: linear composite with Risk-Reward Blender
        # PT distortion has already been applied upstream to individual action
        # benefits in stage_3_b (Phase 1 architecture). Sequence-level PT
        # (stage_3_pt + CPT weighting) is dormant until Phase 2.
        for candidate in candidate_action_sequences:
            mean = candidate["utility_mean"]
            stdev = candidate["utility_stdev"]
            candidate["composite_score"] = mean + (risk_reward_param * stdev)

        # Sort by composite score
        candidate_action_sequences.sort(
            key=lambda x: x["composite_score"],
            reverse=True
        )

        data["Ranked-Response-List"] = candidate_action_sequences

        if len(candidate_action_sequences) == 0:
            raise ValueError("No candidate action sequences generated.")
        # Select the top candidate as the chosen action sequence
        chosen_sequence = candidate_action_sequences[0]["sequence"]

        # Store the chosen action vectors
        data["Chosen-Action-Sequence"] = chosen_sequence
        data["Chosen-Action-Vectors"] = self.calculate_sequence_action_vectors(data, chosen_sequence)
        data["Chosen-Adversary-Targets"] = candidate_action_sequences[0]["adversary_targets"]

        return data

    def calculate_sequence_action_vectors(self, data, sequence):
        coa_characteristics_matrix = data["COA-Characteristics-Matrix"]

        action_vectors = [coa_characteristics_matrix[:, action].reshape((len(self.enums['Char']), 1)) for action in
                                 sequence]
        return action_vectors

    def calculate_tangible_impact(self,
                                  use_stochasticity,
                                  action_slice,
                                  impact_matrix,
                                  impact_stdev_matrix=None,
                                  outcomes_variance=None,
                                  outcomes_distribution=None
                                  ):
        """
        Calculate tangible impact for a single action.
        Returns (NUM_IMPACT_DIMS, 1) vector: [Capability impact, Resolve impact].

        Impact matrices are (num_actions, NUM_IMPACT_DIMS) with only Capability
        and Resolve columns. The caller selects the appropriate matrix
        (Self-Impact-Matrix or Adversary-Impact-Matrix).
        """
        num_impact_dims = impact_matrix.shape[1]  # Should be NUM_IMPACT_DIMS (2)
        if not use_stochasticity:
            return impact_matrix[action_slice, :].reshape((num_impact_dims, 1))
        else:
            if impact_stdev_matrix is None or outcomes_variance is None or outcomes_distribution is None:
                raise ValueError("impact_stdev_matrix, outcomes_variance, and outcomes_distribution must be provided when use_stochasticity is True.")
            mean = impact_matrix[action_slice, :].reshape((num_impact_dims, 1))
            stdev = impact_stdev_matrix[action_slice, :].reshape((num_impact_dims, 1)) * outcomes_variance
            if outcomes_distribution == "normal":
                return self.rng.normal(loc=mean, scale=stdev, size=(num_impact_dims, 1))
            elif outcomes_distribution == "uniform":
                return self.rng.uniform(low=mean - stdev, high=mean + stdev, size=(num_impact_dims, 1))
            elif outcomes_distribution == "triangular":
                return self.rng.triangular(left=mean - stdev, mode=mean, right=mean + stdev, size=(num_impact_dims, 1))
            else:
                raise ValueError(f"Unknown outcomes distribution: {outcomes_distribution}")

    def stage_4(self, data):
        """
        Stage 4: Learning (was Stage 5 in DSM 2.5)
        This final stage represents the learning that occurs after an action-response cycle is complete.
        The model processes the consequences of the turn's events to update each actor's profile for the
        next round.
        """

        # Calculate Tangible Impacts
        # Impact matrices are (num_actions, NUM_IMPACT_DIMS).
        chosen_sequence = data["Chosen-Action-Sequence"]
        chosen_adversary_targets = data["Chosen-Adversary-Targets"]
        self_impact_matrix = data["Self-Impact-Matrix"]  # (num_actions, NUM_IMPACT_DIMS)
        adversary_impact_matrix = data["Adversary-Impact-Matrix"]  # (num_actions, NUM_IMPACT_DIMS)
        self_impact_stdev_matrix = data["Self-Impact-StDev-Matrix"]
        adversary_impact_stdev_matrix = data["Adversary-Impact-StDev-Matrix"]
        outcomes_variance = data["Outcomes-Variance"]
        use_stochasticity = data["Use-Stochasticity"]
        if use_stochasticity:
            outcomes_distribution = data["Random-Distribution"]

        tangible_impacts = np.zeros((self.event_data_checker.num_actors, NUM_IMPACT_DIMS, 1))
        num_actions = len(self.enums['Action'])

        for i, action in enumerate(chosen_sequence):
            # Guard: skip invalid action IDs (e.g. legacy -1 sentinel)
            if action < 0 or action >= num_actions:
                continue
            # self impacts
            self_impact = self.calculate_tangible_impact(
                use_stochasticity,
                action_slice=action,
                impact_matrix=self_impact_matrix,
                impact_stdev_matrix=self_impact_stdev_matrix,
                outcomes_variance=outcomes_variance,
                outcomes_distribution=outcomes_distribution if use_stochasticity else None
            )
            tangible_impacts[self.observer_id, :, :] += self_impact

            # adversary impacts
            if chosen_adversary_targets is not None and chosen_adversary_targets[i] != -1:
                adversary_target = chosen_adversary_targets[i]
                adversary_impact = self.calculate_tangible_impact(
                    use_stochasticity,
                    action_slice=action,
                    impact_matrix=adversary_impact_matrix,
                    impact_stdev_matrix=adversary_impact_stdev_matrix,
                    outcomes_variance=outcomes_variance,
                    outcomes_distribution=outcomes_distribution if use_stochasticity else None
                )
                tangible_impacts[adversary_target, :, :] += adversary_impact

            # 2-Player: Ally impacts removed. CDL handles ally dynamics.

        data["Tangible-Impacts"] = tangible_impacts

        # Cost Annotation Accumulation (post-decision)
        # 1) Accumulate annotations for newly chosen actions
        annotation_matrix = data.get("Cost-Annotation-Matrix", {})
        annotation_accumulator = data.get("Cost-Annotation-Accumulator", {})
        actor_accumulator = annotation_accumulator.get(self.observer_id)
        current_turn = data.get("Current-Turn", 0)
        if actor_accumulator and annotation_matrix:
            accumulate_cost_annotations(
                actor_accumulator, chosen_sequence,
                annotation_matrix, current_turn,
            )

        # 2) Accumulate diminished annotations for already-sustaining actions
        # sustaining_annotation_fraction × (n+1)^(-sustaining_decay_exponent)
        timeline = data.get("World-State-Timeline")
        if actor_accumulator and annotation_matrix and timeline:
            temporal_params_ann = data.get("Temporal-Params", {})
            sde_ann = temporal_params_ann.get('sustaining_decay_exponent', 0.4)
            sustaining_records = timeline.get_sustaining_records_for_actor(
                self.observer_id
            )
            sustaining_sequence = []
            sustaining_fractions = {}
            for record in sustaining_records:
                coa_id = record.coa_id
                if coa_id not in annotation_matrix:
                    continue
                n = record.sustaining_layers_count
                # Default sustaining annotation fraction: 0.3
                saf = 0.3
                diminishing = saf * ((n + 1) ** (-sde_ann))
                sustaining_fractions[coa_id] = diminishing
                sustaining_sequence.append(coa_id)

            if sustaining_sequence:
                # Build a scaled annotation matrix for sustaining actions
                scaled_annotations = {}
                for coa_id in sustaining_sequence:
                    frac = sustaining_fractions[coa_id]
                    base = annotation_matrix[coa_id]
                    scaled_annotations[coa_id] = {
                        dim: [v * frac for v in vals]
                        for dim, vals in base.items()
                    }
                accumulate_cost_annotations(
                    actor_accumulator, sustaining_sequence,
                    scaled_annotations, current_turn,
                )

        # Update actors who ACTED this turn
        chosen_action_vectors = data["Chosen-Action-Vectors"]
        # Sum the chosen action vectors
        summed_action_vector = np.zeros_like(chosen_action_vectors[0])
        for action_vector in chosen_action_vectors:
            summed_action_vector += action_vector


        # Update actors who OBSERVED this turn
        base_input_vectors = data["Base-Input-Vectors"]
        strategic_impact_vectors = data["Strategic-Impact-Vectors"]
        # 2-Player Dimension Reduction: Other-Profile-Vector replaces APV-Tensor
        other_profile_vector = data["Other-Profile-Vector"]
        learning_rate = data["Learning-Rate"]
        relationship_update_sensitivity = data["Relationship-Update-Sensitivity"]
        relationship_score = data["Relationship-Score"]
        total_problem_score = data["Total-Problem-Score"]
        long_horizon_threshold = data["Long-Horizon-Threshold"]
        short_horizon_threshold = data["Short-Horizon-Threshold"]

        other_profile_vector_new = other_profile_vector.copy()
        # Temporal Layer: Get observable events for novelty gating
        temporal_obs_events = data.get("Temporal-Observable-Events", [])

        # Update beliefs about the other player
        for k, (actor_index, base_input_vector) in enumerate(base_input_vectors):
            # Skip exogenous event sources and self-observations
            if actor_index == EXOGENOUS_ACTOR_ID:
                continue
            if actor_index == self.observer_id:
                continue

            # Temporal Layer: Scale belief update weight by novelty.
            # A sustained action with low novelty produces weaker belief updates,
            # preventing the Other-Profile-Vector from over-anchoring on
            # long-running postures. Default novelty = 1.0 (full update).
            effective_learning_rate = learning_rate
            if k < len(temporal_obs_events):
                effective_learning_rate = learning_rate * temporal_obs_events[k].novelty

            # 2-Player: Only one other player, so update Other-Profile-Vector directly
            other_profile_vector_new = (
                    (effective_learning_rate * base_input_vector) +
                    ((1-effective_learning_rate) * other_profile_vector)
            )

        # Update relationship score
        # 2-Player: Relationship-Score is a single scalar in [-1, 1].
        # Accumulate net strategic impact from the other player's actions,
        # then update the score with relationship_update_sensitivity.
        relationship_update = 0.0
        for k, (actor_index, strategic_impact_vector) in enumerate(strategic_impact_vectors):
            if actor_index == EXOGENOUS_ACTOR_ID:
                continue
            if actor_index == self.observer_id:
                continue

            # Temporal Layer: Gate relationship updates by mode and novelty.
            # on_state_change (default): updates fire only on lifecycle transitions (novelty=1.0)
            # continuous: updates fire each turn, scaled by novelty
            should_update = True
            novelty_scale = 1.0
            if k < len(temporal_obs_events):
                obs_event = temporal_obs_events[k]
                # RELATIONSHIP_UPDATE_ON_STATE_CHANGE = 0
                if obs_event.relationship_update_mode == 0:
                    # Only update on state transitions (novelty == 1.0)
                    if obs_event.novelty < 1.0:
                        should_update = False
                else:
                    # Continuous: scale by novelty
                    novelty_scale = obs_event.novelty

            if should_update:
                net_impact = np.sum(strategic_impact_vector)
                relationship_update += relationship_update_sensitivity * net_impact * novelty_scale

        relationship_score_new = float(np.clip(
            relationship_score + relationship_update, -1.0, 1.0
        ))

        # Update actor time horizon
        actor_time_horizon_new = self.enums['TimeHorizon']['Medium']
        if total_problem_score > short_horizon_threshold:
            actor_time_horizon_new = self.enums['TimeHorizon']['Short']
        elif total_problem_score < long_horizon_threshold:
            actor_time_horizon_new = self.enums['TimeHorizon']['Long']

        # Update the actor's current available playbook for next turn
        new_playbook = fast_deepcopy(data["Current-Available-Playbook"])
        action_type_vector = data["Action-Type-Vector"]
        action_toggle_pair_map = data["Action-Toggle-Pair-Map"]
        num_actions = len(self.enums['Action'])
        for action in chosen_sequence:
            # Guard: skip invalid action IDs (e.g. legacy -1 sentinel)
            if action < 0 or action >= num_actions:
                continue
            if action_type_vector[action, 0] == self.enums['ActionType']['Repeatable']:
                continue
            elif action_type_vector[action, 0] == self.enums['ActionType']['Toggle']:
                # Toggle off the selected action
                new_playbook[action, 0] = 0
                # Toggle on the paired action
                paired_action = int(action_toggle_pair_map[str(action)])
                new_playbook[paired_action, 0] = 1
            elif action_type_vector[action, 0] == self.enums['ActionType']['One-Off']:
                # Remove the action from the playbook
                new_playbook[action, 0] = 0

        # Re-apply per-actor exclusions after toggle re-enables.
        # Toggle processing (above) sets paired_action=1, which can
        # override an initial exclusion.  Exclusions are authoritative.
        for excl_id in data.get('excluded_actions', []):
            if 0 <= excl_id < new_playbook.shape[0]:
                new_playbook[excl_id, 0] = 0

        # Update action usage counts for diminishing-returns tracking
        if "Action-Usage-Counts" not in data:
             action_usage_counts_new = np.zeros((len(self.enums['Action']), 1))
        else:
            action_usage_counts_new = data["Action-Usage-Counts"].copy()
        
        # Increment the count for every action taken in this turn's sequence
        for action in chosen_sequence:
            if action < 0 or action >= num_actions:
                continue
            action_usage_counts_new[action, 0] += 1
            
        data["Action-Usage-Counts-New"] = action_usage_counts_new

        # Commitment Layer: Accumulate credibility effects from violations/fulfillments.
        # Violations degrade the acting actor's own credibility (observed by the
        # adversary next turn via the perception pipeline). Fulfillments boost it.
        # The delta is stored in event data and applied to the acting actor's
        # Self-Profile-Vector during finalize_step().
        # Spec reference: Section 4, Step 4.5.
        self_credibility_delta = 0.0
        commitment_violations = data.get("Commitment-Violations", [])
        commitment_params_s4 = data.get("Commitment-Params", {})
        if commitment_violations and 'Char' in self.enums:
            char_enum = self.enums['Char']
            credibility_idx = char_enum['Credibility'] if 'Credibility' in char_enum else None
            if credibility_idx is not None:
                for viol in commitment_violations:
                    if viol["outcome"] == "violated":
                        self_credibility_delta -= viol["credibility_cost"]
                    elif viol["outcome"] == "fulfilled":
                        boost = commitment_params_s4.get("fulfillment_credibility_boost", 0.1)
                        self_credibility_delta += boost
        data["Self-Credibility-Delta"] = self_credibility_delta

        # Store the updated data
        data["Other-Profile-Vector-New"] = other_profile_vector_new
        data["Relationship-Score-New"] = relationship_score_new
        data["Actor-Time-Horizon-New"] = actor_time_horizon_new
        data["Current-Available-Playbook-New"] = new_playbook

        # Calculate Commitment Estimates (diagnostic — Phase 2)
        self.calculate_commitment_estimate(data)

        # NOTE: update_reference_point() removed.
        # PT Phase 1 uses TPS-delta computed in stage_3_a instead of
        # per-goal reference vectors. See docs/prospect-theory-integration.md.

        # 2-Player Refactor: CDL coalition state update (stub)
        # When CDL is implemented, this processes rally effects, friction,
        # erosion, and coalition health updates per CDL Spec v0.2 Section 6.
        from cdl_stub import update_coalition_state
        exogenous_coalition_effects = data.get("Exogenous-Coalition-Effects", None)
        update_coalition_state(data, data.get("Strategic-Impact-Vectors", []),
                              chosen_sequence, exogenous_coalition_effects)

        return data

    def update_final_event_data(self):
        self.data.resulting_actor_data = fast_deepcopy(self.data.initial_actor_data)

        # 2-Player Dimension Reduction: persist Other-Profile-Vector
        other_profile_vector_new = self.data.event_data["Other-Profile-Vector-New"]
        actor_time_horizon_new = self.data.event_data["Actor-Time-Horizon-New"]
        current_available_playbook_new = self.data.event_data["Current-Available-Playbook-New"]

        self.data.resulting_actor_data['Other-Profile-Vector'] = other_profile_vector_new
        self.data.resulting_actor_data['Relationship-Score'] = self.data.event_data["Relationship-Score-New"]
        self.data.resulting_actor_data['Actor-Time-Horizon'] = actor_time_horizon_new
        self.data.resulting_actor_data['Current-Available-Playbook'] = current_available_playbook_new

        # Persist Action Usage Counts
        action_usage_counts_new = self.data.event_data.get("Action-Usage-Counts-New")
        if action_usage_counts_new is not None:
            self.data.resulting_actor_data['Action-Usage-Counts'] = action_usage_counts_new

        # Persist discrepancy for next turn's reconsideration Trigger 1.
        final_discrepancy = self.data.event_data.get("Final-Discrepancy-Vector")
        if final_discrepancy is not None:
            self.data.resulting_actor_data['Previous-Discrepancy-Vector'] = final_discrepancy.copy()

        # Persist Goal Ledger across turns
        goal_ledger = self.data.event_data.get("Goal-Ledger")
        if goal_ledger is not None:
            self.data.resulting_actor_data['Goal-Ledger'] = goal_ledger
        goal_ledger_layers = self.data.event_data.get("Goal-Ledger-Layers")
        if goal_ledger_layers is not None:
            self.data.resulting_actor_data['Goal-Ledger-Layers'] = goal_ledger_layers

        # Temporal Layer: Persist Goal Ledger history for planning heuristic.
        # Maintains a rolling window of recent ledger snapshots for velocity calculation.
        if goal_ledger is not None:
            history = self.data.resulting_actor_data.get('Goal-Ledger-History', [])
            history.append(goal_ledger.copy())
            # Keep only the last N+1 entries (N = ledger_lookback, default 3)
            max_history = self.data.event_data.get("Temporal-Params", {}).get('ledger_lookback', 3) + 1
            if len(history) > max_history:
                history = history[-max_history:]
            self.data.resulting_actor_data['Goal-Ledger-History'] = history

        # Persist Commitment Estimates (decision-affecting, commitment spec v0.2 Section 3.7).
        # Store both the full dict and a scalar for next turn's reconsideration
        # Trigger 2a (commitment estimate shift detection).
        commitment_estimates = self.data.event_data.get("Commitment-Estimates")
        if commitment_estimates is not None:
            self.data.resulting_actor_data['Commitment-Estimates'] = commitment_estimates
            # Store the adversary's estimate as a scalar for next-turn comparison
            adversary_id = 1 - self.observer_id
            if adversary_id in commitment_estimates:
                self.data.resulting_actor_data['Previous-Commitment-Estimate'] = float(
                    commitment_estimates[adversary_id]
                )

        # Persist EWMA reference point for next turn's PT domain classification.
        # ref_t = ρ * ref_{t-1} + (1 - ρ) * TPS_t
        total_problem_score = self.data.event_data.get("Total-Problem-Score", 0.0)
        current_ref = self.data.event_data.get("PT-Reference-Point", total_problem_score)
        rho = self.data.event_data.get("PT-Reference-Persistence", 0.95)
        new_ref = rho * current_ref + (1 - rho) * total_problem_score
        self.data.resulting_actor_data['PT-Reference-Point'] = new_ref
        # Also persist raw TPS for backward compat / diagnostics
        self.data.resulting_actor_data['PT-TPS-Previous'] = total_problem_score
        
        chosen_action_sequence = self.data.event_data["Chosen-Action-Sequence"]
        chosen_action_vectors = self.data.event_data["Chosen-Action-Vectors"]

        final_action_sequence = ActionSequenceData(self.observer_id, chosen_action_sequence, chosen_action_vectors)
        self.data.resulting_action_sequence = final_action_sequence

        self.data.resulting_actor_impacts = self.data.event_data["Tangible-Impacts"]

    def process_event(self):
        """
        Process the event through all stages and return the final data.

        DSM 3.0 Four-Stage Cybernetic Loop:
          Stage 1: Perception — observe and filter incoming signals
          Stage 2: Interpretation — assess goal impact, update strategic position, define problem
          Stage 3: Assessment & Response — evaluate options, rank sequences, choose action
          Stage 4: Learning — update beliefs, apply tangible impacts, update relationships
        """
        self.event_data_checker.check_data(self.data.event_data, input=True)

        # NOTE: initialize_reference_point_for_turn() removed.
        # PT Phase 1 uses TPS-delta computed in stage_3_a instead of
        # per-goal reference vectors. See docs/prospect-theory-integration.md.

        # Stage 1: Perception
        self.stage_1(self.data.event_data)

        # Post-Stage-1: Update Perceived Adversary Posture Trend (PAPT).
        # Runs after perception is complete so it operates on post-bias
        # perceived characteristics. Spec reference (commitment spec v0.2): Section 9.2.2.
        self.update_papt(self.data.event_data)

        # Stage 2: Interpretation (unified — replaces old Stages 2+3)
        self.stage_interpretation(self.data.event_data)

        # Pre-Stage-3: Evaluate explicit commitment triggers.
        # Runs after perception and interpretation so trigger conditions
        # are checked against the observer's perceived values, not actual
        # broadcast values. Spec reference (commitment spec v0.2): Section 3.1.
        self.evaluate_explicit_triggers(self.data.event_data)

        # Pre-Stage-3: Activate Accept/Reject actions for pending proposals.
        # Runs after trigger evaluation so the responding actor's action menu
        # includes proposal response options. Spec reference (commitment spec v0.2): Section 4.3.
        self.activate_proposal_response_actions(self.data.event_data)

        # Stage 3: Assessment & Response (was Stage 4)
        self.stage_3(self.data.event_data)

        # Stage 4: Learning (was Stage 5)
        self.stage_4(self.data.event_data)

        self.event_data_checker.check_data(self.data.event_data, input=False)

        self.update_final_event_data()

        return self.data

    def update_chosen_action_sequence(self, new_sequence: List[int]):
        # The chosen action sequence has been updated externally, so we need to recalculate
        self.data.event_data["Chosen-Action-Sequence"] = new_sequence

        # Action Vectors
        chosen_action_vectors = self.calculate_sequence_action_vectors(self.data.event_data, new_sequence)
        self.data.event_data["Chosen-Action-Vectors"] = chosen_action_vectors

        # Action Targets
        self.data.event_data["Chosen-Adversary-Targets"] = self.calculate_action_sequence_targets(
            new_sequence,
            self.data.event_data["COA-Playbook"],
            self.event_data_checker.num_actors)

        self.stage_4(self.data.event_data)
        self.update_final_event_data()
        self.event_data_checker.check_data(self.data.event_data, input=False)

        return self.data




