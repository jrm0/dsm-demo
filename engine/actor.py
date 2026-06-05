import numpy as np
from enums import NUM_IMPACT_DIMS, Char as _CharEnum
from helpers import coerce_enum_values


# Legacy PA index (was index 7 in the old 8-element Char enum)
_LEGACY_PA_INDEX = 7
_LEGACY_NUM_CHARS = 8


def _drop_pa_from_vector(vec):
    """
    Drop the Positional Advantage element from a legacy 8-element vector.
    Returns a 7-element array. If already 7 elements, returns as-is.
    """
    if len(vec) == _LEGACY_NUM_CHARS:
        return np.delete(np.asarray(vec, dtype=float), _LEGACY_PA_INDEX)
    return np.asarray(vec, dtype=float)


def _drop_pa_from_matrix(mat, axis):
    """
    Drop the PA dimension from a legacy matrix along the specified axis.
    axis=0: rows are chars (e.g., COA-Characteristics-Matrix is (chars, actions))
    axis=1: cols are chars (e.g., Action-Cost-Matrix is (actions, chars))
    """
    mat = np.asarray(mat, dtype=float)
    if mat.shape[axis] == _LEGACY_NUM_CHARS:
        return np.delete(mat, _LEGACY_PA_INDEX, axis=axis)
    return mat


def _extract_impact_columns(full_matrix, enums):
    """
    Extract Capability and Resolve columns from a full (num_actions, num_chars)
    matrix to produce a reduced (num_actions, NUM_IMPACT_DIMS) impact matrix.
    Handles both legacy 8-column and current 7-column formats.
    If the matrix is already NUM_IMPACT_DIMS columns wide, return as-is.
    """
    num_cols = full_matrix.shape[1]
    if num_cols == NUM_IMPACT_DIMS:
        return full_matrix  # Already reduced
    char_enum = _CharEnum()
    cap_idx = char_enum['Capability']
    res_idx = char_enum['Resolve']
    # For legacy 8-column data, PA was at index 7; Capability=5, Resolve=3
    # still work as long as indices < num_cols
    if cap_idx < num_cols and res_idx < num_cols:
        return full_matrix[:, [cap_idx, res_idx]]
    raise ValueError(
        f"Cannot extract impact columns: matrix has {num_cols} columns, "
        f"expected Capability at {cap_idx} and Resolve at {res_idx}"
    )

def Actor(
        actor_id: int,
        num_total_actors: int,
        enums: dict,

        goal_veto_thresholds: list = None,
        apv_tensor: list = None,  # DEPRECATED: use other_profile_vector
        other_profile_vector: list = None,  # 2-Player: (num_chars, 1)
        action_discrepancy_threshold: float = None,
        actor_time_horizon: float = None,
        adversary_threshold: float = None,
        alliance_salience: float = None,
        ally_threshold: float = None,
        analytical_competence: float = None,
        base_risk_propensity: float = None,
        baseline_priority_vector: list = None,
        belief_update_bias: float = None,
        coa_clarity_score_vector: list = None,
        action_utility_matrix: list = None,              # 2-Player: (num_goals, num_actions)
        perceived_action_effects_matrix: list = None,  # DEPRECATED: use action_utility_matrix
        coa_self_effects_matrix: list = None,          # DEPRECATED: use action_utility_matrix
        coa_effects_tensor: list = None,               # DEPRECATED: use action_utility_matrix
        clarity_preference_scalar: float = None,
        competitive_salience: float = None,
        desperation_sensitivity: float = None,
        learning_rate: float = None,
        long_horizon_threshold: float = None,
        relationship_update_sensitivity: float = None,
        goal_impact_matrix: list = None,       # 2-Player: (num_goals, num_actions)
        goal_impact_tensor: list = None,       # DEPRECATED: use goal_impact_matrix
        self_profile_vector: list = None,
        short_horizon_threshold: float = None,
        # 2-Player: Direct impact matrices (num_actions × NUM_IMPACT_DIMS or wider).
        # Preferred over tangible_impact_tensor for new payloads.
        self_impact_matrix: list = None,
        adversary_impact_matrix: list = None,
        self_impact_stdev_matrix: list = None,
        adversary_impact_stdev_matrix: list = None,
        # DEPRECATED: use self_impact_matrix / adversary_impact_matrix
        tangible_impact_tensor: list = None,
        tangible_impact_stdev_tensor: list = None,
        uncertainty_sensitivity_multiplier: float = None,
        escalatory_severity_threshold: float = None,
        urgency_blending_weight: float = None,
        commitment_weights: list = None,
        # Prospect Theory parameters
        pt_enabled: bool = None,
        reference_point_type: str = None,        # DEPRECATED: retained for backward compat
        reference_adaptation_rate: float = None,  # DEPRECATED: retained for backward compat
        pt_alpha: float = None,
        pt_lambda: float = None,
        pt_gamma: float = None,
        reference_persistence: float = None,
        # 2-Player Refactor: CDL stub parameters
        coalition_cost_weight: float = None,
        network_cost_weight: float = None,
        # Temporal Layer: per-actor behavioral parameters
        temporal_discount_rate: float = None,
        withdrawal_reluctance_weight: float = None,
        cancellation_reluctance_weight: float = None,
        anticipatory_weight: float = None,
        # Per-actor cognitive/strategic parameters
        # (moved from system profile to enable per-actor personality differentiation)
        surprise_weight: float = None,
        signal_strength_weights: dict = None,
        urgency_sensitivity: float = None,
        time_horizon_discount_factor: float = None,
        desperation_scaling_factor: float = None,
        base_risk_scaling_factor: float = None,
        inherent_ambiguity_vector: list = None,
        objectives_time_horizon: list = None,
        deescalation_bonus_value: float = None,
        peer_capability_ratio: float = None,
        aversion_factor_value: float = None,
        bias_amplification_parameter: float = None,
        severity_activation_threshold: float = None,
        base_decay_rate: float = None,
        priority_blending_weight: float = None,
        alliance_salience_scaling_factor: float = None,
        competitive_salience_scaling_factor: float = None,
        action_efficacy_discount: float = None,
        effect_scaling_factor: float = None,  # DEPRECATED alias
        vindictiveness_parameter: float = None,
        diminishing_returns_rate: float = None,
        problem_focus_parameter: float = None,
        crisis_threshold: float = None,
        risk_reward_blender_parameter: float = None,
        risk_reward_blender: float = None,  # MAGIC alias
        # 2-Player: per-actor relationship scalar
        relationship_score: float = None,
        # Goal Ledger initialization: optional pre-set strategic position
        initial_goal_ledger: list = None,
        # Display metadata (passed through for UI)
        actor_name: str = None,
        actor_role: str = None,
        # Accept (and ignore) unknown keys so MAGIC payloads with new fields
        # don't crash Actor(); model.py pops them after construction.
        **kwargs,
        ):
    """
    Initializes Actor data with various parameters defining its characteristics and actions.

    Converts lists to numpy arrays and reshapes them as needed.
    """
    profile = {}

    profile['actor_id'] = actor_id
    if actor_name is not None:
        profile['Actor-Name'] = actor_name
    if actor_role is not None:
        profile['Actor-Role'] = actor_role

    if goal_veto_thresholds is not None and len(goal_veto_thresholds) > 0:
        profile['Goal-Veto-Thresholds'] = np.array(goal_veto_thresholds).reshape((len(enums['Goal']), 1))

    # 2-Player Dimension Reduction: APV-Tensor → Other-Profile-Vector
    # In the 2-player model, each actor only tracks beliefs about one other player,
    # so the N-player tensor (num_actors, num_chars, 1) collapses to (num_chars, 1).
    if other_profile_vector is not None:
        profile['Other-Profile-Vector'] = _drop_pa_from_vector(other_profile_vector).reshape((len(enums['Char']), 1))
    elif apv_tensor is not None:
        # DEPRECATED: legacy N-player path. Migrate to Other-Profile-Vector.
        apv_flat = np.array(apv_tensor, dtype=float).flatten()
        chars_in_data = apv_flat.size // num_total_actors
        apv_arr = apv_flat.reshape((num_total_actors, chars_in_data, 1))
        # Extract the other player's profile (the one that isn't self)
        other_id = 1 - actor_id if num_total_actors == 2 else 0
        other_vec = apv_arr[other_id, :, 0].copy()
        profile['Other-Profile-Vector'] = _drop_pa_from_vector(other_vec).reshape((len(enums['Char']), 1))
    if action_discrepancy_threshold is not None:
        profile['Action-Discrepancy-Threshold'] = action_discrepancy_threshold
    if actor_time_horizon is not None:
        profile['Actor-Time-Horizon'] = actor_time_horizon
    if adversary_threshold is not None:
        profile['Adversary-Threshold'] = adversary_threshold
    if alliance_salience is not None:
        profile['Alliance-Salience'] = alliance_salience
    if ally_threshold is not None:
        profile['Ally-Threshold'] = ally_threshold
    if analytical_competence is not None:
        profile['Analytical-Competence'] = analytical_competence
    if base_risk_propensity is not None:
        profile['Base-Risk-Propensity'] = base_risk_propensity
    if baseline_priority_vector is not None:
        profile['Baseline-Priority-Vector'] = np.array(baseline_priority_vector).reshape((len(enums['Goal']), 1))
    if belief_update_bias is not None:
        profile['Belief-Update-Bias'] = belief_update_bias
    if coa_clarity_score_vector is not None:
        profile['COA-Clarity-Score-Vector'] = np.array(coa_clarity_score_vector).reshape((len(enums['Action']), 1))
    # 2-Player: Action-Utility-Matrix (num_goals, num_actions)
    # How the actor's OWN actions affect their OWN goals.
    # Direct 2D input from MAGIC. Feeds Stage 3B cost/benefit analysis.
    _aum_source = action_utility_matrix or perceived_action_effects_matrix or coa_self_effects_matrix  # DEPRECATED aliases
    if _aum_source is not None:
        profile['Action-Utility-Matrix'] = np.array(_aum_source).reshape((len(enums['Goal']), len(enums['Action'])))
    elif coa_effects_tensor is not None:
        # DEPRECATED: legacy 3D tensor path. Extracts self-effects slice only.
        coa_arr = np.array(coa_effects_tensor)
        if coa_arr.ndim == 3 or (coa_arr.ndim == 1 and coa_arr.size == len(enums['Goal']) * len(enums['Action']) * len(enums['Relationship'])):
            coa_3d = coa_arr.reshape((len(enums['Goal']), len(enums['Action']), len(enums['Relationship'])))
            self_party_idx = enums['Party']['Self']
            profile['Action-Utility-Matrix'] = coa_3d[:, :, self_party_idx].reshape((len(enums['Goal']), len(enums['Action'])))
            # Also extract adversary slice for Goal-Impact-Matrix when not
            # provided explicitly via goal_impact_matrix / goal_impact_tensor.
            if goal_impact_matrix is None and goal_impact_tensor is None:
                adversary_party_idx = enums['Party']['Adversary']
                profile['Goal-Impact-Matrix'] = coa_3d[:, :, adversary_party_idx].reshape((len(enums['Goal']), len(enums['Action'])))
        else:
            profile['Action-Utility-Matrix'] = coa_arr.reshape((len(enums['Goal']), len(enums['Action'])))
    if clarity_preference_scalar is not None:
        profile['Clarity-Preference-Scalar'] = clarity_preference_scalar
    if competitive_salience is not None:
        profile['Competitive-Salience'] = competitive_salience
    if desperation_sensitivity is not None:
        profile['Desperation-Sensitivity'] = desperation_sensitivity
    if learning_rate is not None:
        profile['Learning-Rate'] = learning_rate
    if long_horizon_threshold is not None:
        profile['Long-Horizon-Threshold'] = long_horizon_threshold
    if relationship_update_sensitivity is not None:
        profile['Relationship-Update-Sensitivity'] = relationship_update_sensitivity
    # 2-Player: Relationship-Score is a per-actor scalar in [-1, 1].
    # When provided directly in the payload, it takes priority over the
    # legacy relationship_score_matrix extraction in model.py.
    if relationship_score is not None:
        profile['Relationship-Score'] = float(relationship_score)
    # 2-Player: Goal-Impact-Matrix (num_goals, num_actions)
    # Direct LLM-scored action-level impact on goals.
    if goal_impact_matrix is not None:
        profile['Goal-Impact-Matrix'] = np.array(goal_impact_matrix).reshape((len(enums['Goal']), len(enums['Action'])))
    elif goal_impact_tensor is not None:
        # DEPRECATED: legacy 3D tensor path. Extracts adversary slice only.
        git_arr = np.array(goal_impact_tensor)
        if git_arr.ndim == 3 or (git_arr.ndim == 1 and git_arr.size == len(enums['Relationship']) * len(enums['Goal']) * len(enums['Action'])):
            git_3d = git_arr.reshape((len(enums['Relationship']), len(enums['Goal']), len(enums['Action'])))
            adversary_idx = enums['Relationship']['Adversary']
            profile['Goal-Impact-Matrix'] = git_3d[adversary_idx, :, :].reshape((len(enums['Goal']), len(enums['Action'])))
        else:
            profile['Goal-Impact-Matrix'] = git_arr.reshape((len(enums['Goal']), len(enums['Action'])))
    if self_profile_vector is not None:
        profile['Self-Profile-Vector'] = _drop_pa_from_vector(self_profile_vector).reshape((len(enums['Char']), 1))
    if short_horizon_threshold is not None:
        profile['Short-Horizon-Threshold'] = short_horizon_threshold

    # Tangible impact matrices: (num_actions × NUM_IMPACT_DIMS) resource impacts.
    #
    # 2-Player path (preferred): Direct 2D matrices per party.
    # Accepts (num_actions × NUM_IMPACT_DIMS) directly, or wider matrices
    # (num_actions × num_chars) from which Capability and Resolve columns
    # are extracted via _extract_impact_columns.
    #
    # Legacy path (backward compat): tangible_impact_tensor is a 3D tensor
    # (parties × actions × chars) that gets split and reduced.
    if self_impact_matrix is not None or adversary_impact_matrix is not None:
        if self_impact_matrix is not None:
            sim_arr = np.array(self_impact_matrix).reshape((len(enums['Action']), -1))
            profile['Self-Impact-Matrix'] = _extract_impact_columns(sim_arr, enums)
        else:
            profile['Self-Impact-Matrix'] = np.zeros((len(enums['Action']), NUM_IMPACT_DIMS))
        if adversary_impact_matrix is not None:
            aim_arr = np.array(adversary_impact_matrix).reshape((len(enums['Action']), -1))
            profile['Adversary-Impact-Matrix'] = _extract_impact_columns(aim_arr, enums)
        else:
            profile['Adversary-Impact-Matrix'] = np.zeros((len(enums['Action']), NUM_IMPACT_DIMS))
    elif tangible_impact_tensor is not None:
        # DEPRECATED: Legacy 3D tensor path.
        ti_arr = np.array(tangible_impact_tensor)
        num_chars_in_data = ti_arr.shape[-1] if ti_arr.ndim >= 2 else len(enums['Char'])
        if ti_arr.ndim == 3 or (ti_arr.ndim == 1 and ti_arr.size >= len(enums['Party']) * len(enums['Action']) * 2):
            num_chars_legacy = ti_arr.size // (len(enums['Party']) * len(enums['Action']))
            ti_3d = ti_arr.reshape((len(enums['Party']), len(enums['Action']), num_chars_legacy))
            self_full = ti_3d[enums['Party']['Self'], :, :]
            adv_full = ti_3d[enums['Party']['Adversary'], :, :]
            profile['Self-Impact-Matrix'] = _extract_impact_columns(self_full, enums)
            profile['Adversary-Impact-Matrix'] = _extract_impact_columns(adv_full, enums)
        else:
            full_matrix = ti_arr.reshape((len(enums['Action']), -1))
            profile['Self-Impact-Matrix'] = _extract_impact_columns(full_matrix, enums)
            profile['Adversary-Impact-Matrix'] = np.zeros((len(enums['Action']), NUM_IMPACT_DIMS))

    if self_impact_stdev_matrix is not None or adversary_impact_stdev_matrix is not None:
        if self_impact_stdev_matrix is not None:
            ssd_arr = np.array(self_impact_stdev_matrix).reshape((len(enums['Action']), -1))
            profile['Self-Impact-StDev-Matrix'] = _extract_impact_columns(ssd_arr, enums)
        else:
            profile['Self-Impact-StDev-Matrix'] = np.zeros((len(enums['Action']), NUM_IMPACT_DIMS))
        if adversary_impact_stdev_matrix is not None:
            asd_arr = np.array(adversary_impact_stdev_matrix).reshape((len(enums['Action']), -1))
            profile['Adversary-Impact-StDev-Matrix'] = _extract_impact_columns(asd_arr, enums)
        else:
            profile['Adversary-Impact-StDev-Matrix'] = np.zeros((len(enums['Action']), NUM_IMPACT_DIMS))
    elif tangible_impact_stdev_tensor is not None:
        # DEPRECATED: Legacy 3D tensor path.
        tis_arr = np.array(tangible_impact_stdev_tensor)
        if tis_arr.ndim == 3 or (tis_arr.ndim == 1 and tis_arr.size >= len(enums['Party']) * len(enums['Action']) * 2):
            num_chars_legacy = tis_arr.size // (len(enums['Party']) * len(enums['Action']))
            tis_3d = tis_arr.reshape((len(enums['Party']), len(enums['Action']), num_chars_legacy))
            self_full = tis_3d[enums['Party']['Self'], :, :]
            adv_full = tis_3d[enums['Party']['Adversary'], :, :]
            profile['Self-Impact-StDev-Matrix'] = _extract_impact_columns(self_full, enums)
            profile['Adversary-Impact-StDev-Matrix'] = _extract_impact_columns(adv_full, enums)
        else:
            full_matrix = tis_arr.reshape((len(enums['Action']), -1))
            profile['Self-Impact-StDev-Matrix'] = _extract_impact_columns(full_matrix, enums)
            profile['Adversary-Impact-StDev-Matrix'] = np.zeros((len(enums['Action']), NUM_IMPACT_DIMS))
    if uncertainty_sensitivity_multiplier is not None:
        profile['Uncertainty-Sensitivity-Multiplier'] = uncertainty_sensitivity_multiplier
    if escalatory_severity_threshold is not None:
        profile['Escalatory-Severity-Threshold'] = escalatory_severity_threshold
    if urgency_blending_weight is not None:
        profile['Urgency-Blending-Weight'] = urgency_blending_weight
    if commitment_weights is not None:
        profile['Commitment-Weights'] = np.array(commitment_weights).reshape((5,))

    # Phase 2: New defaults
    profile['Urgency-Blending-Weight'] = profile.get('Urgency-Blending-Weight', 0.5)
    profile['Commitment-Weights'] = profile.get('Commitment-Weights', np.array([0.20, 0.20, 0.20, 0.20, 0.20]))
    profile['Commitment-Estimate'] = 0.0

    # Goal Ledger: persistent cross-turn strategic position.
    # initial_goal_ledger (from payload JSON) seeds the starting position
    # to approximate gain-seeking behavior in the reactive architecture.
    if initial_goal_ledger is not None:
        profile['Goal-Ledger'] = np.array(initial_goal_ledger, dtype=float).reshape((len(enums['Goal']), 1))
    else:
        profile['Goal-Ledger'] = profile.get('Goal-Ledger', np.zeros((len(enums['Goal']), 1)))
    profile['Goal-Ledger-Layers'] = profile.get('Goal-Ledger-Layers', [])

    # Prospect Theory: per-actor behavioral distortion parameters
    # Defaults from Kahneman & Tversky (1992) and Prelec (1998)
    # Phase 1: PT operates on individual action benefits using a single TPS-delta
    # reference point (see docs/prospect-theory-integration.md)
    profile['PT-Enabled'] = pt_enabled if pt_enabled is not None else profile.get('PT-Enabled', True)
    profile['PT-Alpha'] = pt_alpha if pt_alpha is not None else profile.get('PT-Alpha', 0.88)
    profile['PT-Lambda'] = pt_lambda if pt_lambda is not None else profile.get('PT-Lambda', 2.25)
    profile['PT-Gamma'] = pt_gamma if pt_gamma is not None else profile.get('PT-Gamma', 0.65)
    profile['PT-TPS-Previous'] = profile.get('PT-TPS-Previous', 0.0)
    profile['PT-Reference-Persistence'] = reference_persistence if reference_persistence is not None else profile.get('PT-Reference-Persistence', 0.95)
    # EWMA reference point: None signals Turn 0 (will be initialized to first TPS)
    profile['PT-Reference-Point'] = profile.get('PT-Reference-Point', None)

    # DEPRECATED: per-goal reference point infrastructure (retained for backward compat,
    # ignored by current pipeline). Will be removed once Phase 2 confirms no regression.
    if reference_point_type is not None:
        profile['Reference-Point-Type'] = reference_point_type
    if reference_adaptation_rate is not None:
        profile['Reference-Adaptation-Rate'] = reference_adaptation_rate

    # 2-Player Refactor: CDL stub parameters
    # These will be wired to the Coalition Dynamics Layer when implemented.
    # For now they default to 0.0 (no coalition/network cost influence).
    profile['Coalition-Cost-Weight'] = coalition_cost_weight if coalition_cost_weight is not None else profile.get('Coalition-Cost-Weight', 0.0)
    profile['Network-Cost-Weight'] = network_cost_weight if network_cost_weight is not None else profile.get('Network-Cost-Weight', 0.0)

    # Temporal Layer: per-actor behavioral parameters
    # These control how individual actors evaluate temporal trade-offs.
    # Only set when explicitly provided; Model.__init__ resolves missing
    # keys to system defaults after _init_temporal_layer.
    if temporal_discount_rate is not None:
        profile['Temporal-Discount-Rate'] = temporal_discount_rate
    if withdrawal_reluctance_weight is not None:
        profile['Withdrawal-Reluctance-Weight'] = withdrawal_reluctance_weight
    if cancellation_reluctance_weight is not None:
        profile['Cancellation-Reluctance-Weight'] = cancellation_reluctance_weight
    if anticipatory_weight is not None:
        profile['Anticipatory-Weight'] = anticipatory_weight

    # Per-actor cognitive/strategic parameters.
    # Values may be None; Model._resolve_actor_param_defaults() fills them
    # from simulation_parameters for backward compatibility.
    if surprise_weight is not None:
        profile['Surprise-Weight'] = surprise_weight
    if signal_strength_weights is not None:
        profile['Signal-Strength-Weights'] = signal_strength_weights
    if urgency_sensitivity is not None:
        profile['Urgency-Sensitivity'] = urgency_sensitivity
    if time_horizon_discount_factor is not None:
        profile['Time-Horizon-Discount-Factor'] = time_horizon_discount_factor
    if desperation_scaling_factor is not None:
        profile['Desperation-Scaling-Factor'] = desperation_scaling_factor
    if base_risk_scaling_factor is not None:
        profile['Base-Risk-Scaling-Factor'] = base_risk_scaling_factor
    if inherent_ambiguity_vector is not None:
        profile['Inherent-Ambiguity-Vector'] = _drop_pa_from_vector(inherent_ambiguity_vector).reshape((len(enums['Char']), 1))
    if objectives_time_horizon is not None:
        profile['Objectives-Time-Horizon'] = np.array(
            coerce_enum_values(objectives_time_horizon, enums['TimeHorizon'])
        ).reshape((len(enums['Goal']), 1))
    if deescalation_bonus_value is not None:
        profile['Deescalation-Bonus-Value'] = deescalation_bonus_value
    if peer_capability_ratio is not None:
        profile['Peer-Capability-Ratio'] = peer_capability_ratio
    if aversion_factor_value is not None:
        profile['Aversion-Factor-Value'] = aversion_factor_value
    if bias_amplification_parameter is not None:
        profile['Bias-Amplification-Parameter'] = bias_amplification_parameter
    if severity_activation_threshold is not None:
        profile['Severity-Activation-Threshold'] = severity_activation_threshold
    if base_decay_rate is not None:
        profile['Base-Decay-Rate'] = base_decay_rate
    if priority_blending_weight is not None:
        profile['Priority-Blending-Weight'] = priority_blending_weight
    if alliance_salience_scaling_factor is not None:
        profile['Alliance-Salience-Scaling-Factor'] = alliance_salience_scaling_factor
    if competitive_salience_scaling_factor is not None:
        profile['Competitive-Salience-Scaling-Factor'] = competitive_salience_scaling_factor
    _aed = action_efficacy_discount if action_efficacy_discount is not None else effect_scaling_factor
    if _aed is not None:
        profile['Action-Efficacy-Discount'] = _aed
    if vindictiveness_parameter is not None:
        profile['Vindictiveness-Parameter'] = vindictiveness_parameter
    if diminishing_returns_rate is not None:
        profile['Diminishing-Returns-Rate'] = diminishing_returns_rate
    if problem_focus_parameter is not None:
        profile['Problem-Focus-Parameter'] = problem_focus_parameter
    if crisis_threshold is not None:
        profile['Crisis-Threshold'] = crisis_threshold
    _rrb = risk_reward_blender_parameter if risk_reward_blender_parameter is not None else risk_reward_blender
    if _rrb is not None:
        profile['Risk-Reward-Blender-Parameter'] = _rrb

    # Pass through unrecognized keys so that model.py can pop them
    # after Actor() returns (e.g. temporal_profiles, support_set_entries).
    for k, v in kwargs.items():
        if k not in profile:
            profile[k] = v

    # Per-actor cognitive/strategic parameters
    # These were moved from system profile to enable per-actor personality
    # differentiation. Values may be None; Model._resolve_actor_param_defaults()
    # fills them from simulation_parameters for backward compatibility.
    if surprise_weight is not None:
        profile['Surprise-Weight'] = surprise_weight
    if signal_strength_weights is not None:
        profile['Signal-Strength-Weights'] = signal_strength_weights
    if urgency_sensitivity is not None:
        profile['Urgency-Sensitivity'] = urgency_sensitivity
    if time_horizon_discount_factor is not None:
        profile['Time-Horizon-Discount-Factor'] = time_horizon_discount_factor
    if desperation_scaling_factor is not None:
        profile['Desperation-Scaling-Factor'] = desperation_scaling_factor
    if base_risk_scaling_factor is not None:
        profile['Base-Risk-Scaling-Factor'] = base_risk_scaling_factor
    if inherent_ambiguity_vector is not None:
        profile['Inherent-Ambiguity-Vector'] = _drop_pa_from_vector(inherent_ambiguity_vector).reshape((len(enums['Char']), 1))
    if objectives_time_horizon is not None:
        profile['Objectives-Time-Horizon'] = np.array(objectives_time_horizon).reshape((len(enums['Goal']), 1))
    if deescalation_bonus_value is not None:
        profile['Deescalation-Bonus-Value'] = deescalation_bonus_value
    if peer_capability_ratio is not None:
        profile['Peer-Capability-Ratio'] = peer_capability_ratio
    if aversion_factor_value is not None:
        profile['Aversion-Factor-Value'] = aversion_factor_value
    if bias_amplification_parameter is not None:
        profile['bias_amplification_parameter'] = bias_amplification_parameter
    if severity_activation_threshold is not None:
        profile['Severity-Activation-Threshold'] = severity_activation_threshold
    if base_decay_rate is not None:
        profile['Base-Decay-Rate'] = base_decay_rate
    if priority_blending_weight is not None:
        profile['priority_blending_weight'] = priority_blending_weight
    if alliance_salience_scaling_factor is not None:
        profile['alliance_salience_scaling_factor'] = alliance_salience_scaling_factor
    if competitive_salience_scaling_factor is not None:
        profile['competitive_salience_scaling_factor'] = competitive_salience_scaling_factor
    if effect_scaling_factor is not None:
        profile['effect_scaling_factor'] = effect_scaling_factor
    if vindictiveness_parameter is not None:
        profile['vindictiveness_parameter'] = vindictiveness_parameter
    if diminishing_returns_rate is not None:
        profile['diminishing_returns_rate'] = diminishing_returns_rate
    if problem_focus_parameter is not None:
        profile['Problem-Focus-Parameter'] = problem_focus_parameter
    if crisis_threshold is not None:
        profile['Crisis-Threshold'] = crisis_threshold

    return profile











