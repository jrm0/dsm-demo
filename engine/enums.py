import math
import numpy as np

class Enumeration:
    def __init__(self, values: list=None, key_values: dict=None):
        if key_values is not None:
            self.values = list(key_values.keys())
            self.value_to_index = key_values
            self.index_to_value = {index: value for value, index in key_values.items()}
        elif values is not None:
            self.values = values
            self.value_to_index = {value: index for index, value in enumerate(values)}
            self.index_to_value = {index: value for index, value in enumerate(values)}
        else:
            raise ValueError("Either values or key_values must be provided.")

    def __len__(self):
        return len(self.values)

    def __getitem__(self, item):
        if isinstance(item, int):
            return self.index_to_value[item]
        elif isinstance(item, str):
            return self.value_to_index[item]
        else:
            raise KeyError("Item must be an integer index or string value.")

    def __contains__(self, item):
        if isinstance(item, str):
            return item in self.value_to_index
        if isinstance(item, int):
            return item in self.index_to_value
        return False

    def members(self):
        return self.values

class Char(Enumeration):
    """
    Enum for actor/action characteristics.
    """
    def __init__(self):
        values = [
            "Severity",
            "Clarity",
            "Irreversibility",
            "Resolve",
            "Credibility",
            "Capability",
            "Risk_Propensity",
        ]
        super().__init__(values=values)

# ---------------------------------------------------------------------------
# Tangible Impact Dimension Constants
# ---------------------------------------------------------------------------
# The tangible impact matrices (Self-Impact, Adversary-Impact) are reduced
# to two material state dimensions: Capability and Resolve. These constants
# define the column indices in the reduced impact matrices and provide the
# mapping back to the full Char profile vector.
#
# See: DSM_Tangible_Impact_and_Characteristic_Simplification_Spec_v0.2

IMPACT_DIM_CAPABILITY = 0
IMPACT_DIM_RESOLVE = 1
NUM_IMPACT_DIMS = 2


def get_impact_to_profile_map(char_enum):
    """
    Returns mapping from impact matrix column index to Char enum index.
    Used to route the reduced-dimension tangible impact values to the
    correct indices in the full Self-Profile-Vector.
    """
    return {
        IMPACT_DIM_CAPABILITY: char_enum['Capability'],
        IMPACT_DIM_RESOLVE: char_enum['Resolve'],
    }


# ---------------------------------------------------------------------------
# Cost Annotation Layer Constants
# ---------------------------------------------------------------------------
# Six dimensions of human-interpretable cost metadata carried through
# the simulation for analyst visibility.
#
# See: DSM_Cost_Representation_Upgrade_Spec_v0.2, Section 6

COST_ANNOTATION_DIMS = [
    'military_asset_cost',
    'military_casualties',
    'civilian_casualties',
    'economic_cost',
    'reputational_cost',
    'instability_risk',
]
NUM_COST_ANNOTATION_DIMS = 6

# Casualty categories → geometric mean of each range.
# Used for accumulation: convert categories to magnitudes, sum, re-categorize.
CASUALTY_GEOMETRIC_MEANS = {
    0: 0,       # None/Negligible
    1: 3,       # Ones (1-9)
    2: 31,      # Tens (10-99)
    3: 316,     # Hundreds (100-999)
    4: 3162,    # Thousands (1,000-9,999)
    5: 31623,   # Ten-thousands (10,000-99,999)
    6: 316228,  # Hundred-thousands (100,000+)
}


def categorical_to_magnitude(category):
    """Convert categorical casualty estimate to geometric mean of range."""
    return CASUALTY_GEOMETRIC_MEANS.get(int(category), 0)


def magnitude_to_category(magnitude):
    """Convert accumulated magnitude back to nearest order-of-magnitude category."""
    if magnitude <= 0:
        return 0
    log_val = math.log10(max(1, magnitude))
    return min(6, max(1, int(log_val) + 1))


def init_cost_annotation_accumulator(num_actors):
    """
    Initialize a Cost Annotation Accumulator for all actors.
    Returns dict: actor_id → per-dimension accumulator state.
    """
    ADDITIVE_DIMS = ['military_asset_cost', 'economic_cost', 'instability_risk']
    CASUALTY_DIMS = ['military_casualties', 'civilian_casualties']

    accum = {}
    for actor_id in range(num_actors):
        actor_accum = {}
        for dim in ADDITIVE_DIMS:
            actor_accum[dim] = {
                'total_low': 0.0, 'total_expected': 0.0, 'total_high': 0.0,
                'turn_history': [],
            }
        for dim in CASUALTY_DIMS:
            actor_accum[dim] = {
                'total_magnitude_low': 0.0, 'total_magnitude_expected': 0.0,
                'total_magnitude_high': 0.0,
                'total_category_low': 0, 'total_category_expected': 0,
                'total_category_high': 0,
                'turn_history': [],
            }
        actor_accum['reputational_cost'] = {
            'accumulated_damage': 0.0,
            'accumulated_damage_low': 0.0,
            'accumulated_damage_high': 0.0,
            'turn_history': [],
        }
        accum[actor_id] = actor_accum
    return accum


def accumulate_cost_annotations(
    accumulator,
    chosen_sequence,
    annotation_matrix,
    turn_number,
):
    """
    Accumulate cost annotations for the chosen action sequence.
    Called once per actor per turn after action selection.
    Uses dimension-appropriate accumulation:
    - Additive: military_asset_cost, economic_cost, instability_risk
    - Magnitude conversion: military_casualties, civilian_casualties
    - Diminishing returns: reputational_cost
    """
    if not annotation_matrix:
        return

    ADDITIVE_DIMS = ['military_asset_cost', 'economic_cost', 'instability_risk']
    CASUALTY_DIMS = ['military_casualties', 'civilian_casualties']

    # Compute per-turn contribution for each dimension
    turn_contribution = {dim: [0.0, 0.0, 0.0] for dim in COST_ANNOTATION_DIMS}
    for action_id in chosen_sequence:
        annotation = annotation_matrix.get(action_id, {})
        for dim in COST_ANNOTATION_DIMS:
            values = annotation.get(dim, [0.0, 0.0, 0.0])
            turn_contribution[dim][0] += values[0]
            turn_contribution[dim][1] += values[1]
            turn_contribution[dim][2] += values[2]

    # Additive dimensions: simple sum
    for dim in ADDITIVE_DIMS:
        if dim not in accumulator:
            continue
        accumulator[dim]['total_low'] += turn_contribution[dim][0]
        accumulator[dim]['total_expected'] += turn_contribution[dim][1]
        accumulator[dim]['total_high'] += turn_contribution[dim][2]
        accumulator[dim]['turn_history'].append({
            'turn': turn_number,
            'low': turn_contribution[dim][0],
            'expected': turn_contribution[dim][1],
            'high': turn_contribution[dim][2],
        })

    # Casualty dimensions: convert categories to magnitudes, sum, re-categorize
    for dim in CASUALTY_DIMS:
        if dim not in accumulator:
            continue
        mag_low = sum(
            categorical_to_magnitude(
                annotation_matrix.get(aid, {}).get(dim, [0, 0, 0])[0]
            )
            for aid in chosen_sequence
        )
        mag_expected = sum(
            categorical_to_magnitude(
                annotation_matrix.get(aid, {}).get(dim, [0, 0, 0])[1]
            )
            for aid in chosen_sequence
        )
        mag_high = sum(
            categorical_to_magnitude(
                annotation_matrix.get(aid, {}).get(dim, [0, 0, 0])[2]
            )
            for aid in chosen_sequence
        )
        accumulator[dim]['total_magnitude_low'] += mag_low
        accumulator[dim]['total_magnitude_expected'] += mag_expected
        accumulator[dim]['total_magnitude_high'] += mag_high
        accumulator[dim]['total_category_low'] = magnitude_to_category(
            accumulator[dim]['total_magnitude_low']
        )
        accumulator[dim]['total_category_expected'] = magnitude_to_category(
            accumulator[dim]['total_magnitude_expected']
        )
        accumulator[dim]['total_category_high'] = magnitude_to_category(
            accumulator[dim]['total_magnitude_high']
        )
        accumulator[dim]['turn_history'].append({
            'turn': turn_number,
            'magnitude_low': mag_low,
            'magnitude_expected': mag_expected,
            'magnitude_high': mag_high,
        })

    # Reputational cost: diminishing returns
    # Each action's damage applies to remaining undamaged reputation
    if 'reputational_cost' in accumulator:
        for bound_idx, bound_key in enumerate([
            'accumulated_damage_low', 'accumulated_damage', 'accumulated_damage_high'
        ]):
            current = accumulator['reputational_cost'][bound_key]
            action_cost = turn_contribution['reputational_cost'][bound_idx]
            remaining = 1.0 - current
            incremental = action_cost * remaining
            accumulator['reputational_cost'][bound_key] = current + incremental

        accumulator['reputational_cost']['turn_history'].append({
            'turn': turn_number,
            'action_cost_low': turn_contribution['reputational_cost'][0],
            'action_cost_expected': turn_contribution['reputational_cost'][1],
            'action_cost_high': turn_contribution['reputational_cost'][2],
            'accumulated_after_low': accumulator['reputational_cost']['accumulated_damage_low'],
            'accumulated_after_expected': accumulator['reputational_cost']['accumulated_damage'],
            'accumulated_after_high': accumulator['reputational_cost']['accumulated_damage_high'],
        })


class Relationship(Enumeration):
    def __init__(self):
        key_values = {
            "Ally": 1,
            "Neutral": 2,
            "Adversary": -1,
        }
        super().__init__(key_values=key_values)


class Party(Enumeration):
    def __init__(self):
        key_values = {
            "Self": 0,
            "Ally": 1,
            "Adversary": 2,
        }
        super().__init__(key_values=key_values)

class TimeHorizon(Enumeration):
    def __init__(self):
        key_values = {
            "Short": 0,
            "Medium": 1,
            "Long": 2,
        }
        super().__init__(key_values=key_values)

class ActionType(Enumeration):
    def __init__(self):
        values = [
            "Repeatable",
            "One-Off",
            "Toggle"
        ]
        super().__init__(values=values)

class ReferencePointType(Enumeration):
    """
    Reference point framing for Prospect Theory value function.
    Determines how the actor's neutral baseline is established.
    """
    def __init__(self):
        key_values = {
            "StatusQuo": 0,
            "Aspiration": 1,
            "Adaptive": 2,
        }
        super().__init__(key_values=key_values)


class TurnMode(Enumeration):
    """
    Turn structure mode for 2-player simulations.
    Replaces the arbitrary multi-step configuration_type system.
    """
    def __init__(self):
        key_values = {
            "Simultaneous": 0,
            "Sequential": 1,
        }
        super().__init__(key_values=key_values)


class ExogenousTriggerType(Enumeration):
    """
    Trigger types for the Exogenous Event Mechanism.
    Determines when third-party events fire during simulation.
    """
    def __init__(self):
        key_values = {
            "Scripted": 0,
            "Conditional": 1,
            "Stochastic": 2,
        }
        super().__init__(key_values=key_values)


class RelationshipTag(Enumeration):
    """
    Static relationship tag for exogenous event sources.
    Determines how the perceiving actor interprets the event's goal impact.
    Unlike the dynamic Relationship enum, these are fixed per-event definitions.
    """
    def __init__(self):
        key_values = {
            "Ally": 0,
            "Adversary": 1,
            "Neutral": 2,
        }
        super().__init__(key_values=key_values)


class LifecycleState(Enumeration):
    """
    Action lifecycle states for the Temporal Layer.
    Tracks an action's progression from initiation through expiry.
    """
    def __init__(self):
        key_values = {
            "Initiated": 0,
            "InProgress": 1,
            "Completed": 2,
            "Sustaining": 3,
            "Decaying": 4,
            "Expired": 5,
        }
        super().__init__(key_values=key_values)


class TemporalArchetype(Enumeration):
    """
    Archetype templates for action temporal profiles.
    Each archetype defines default temporal parameters for a category of actions.
    v0.5: Reorganized from domain-first to temporal-signature-first naming.
    Integer values preserved for backwards compatibility with v0.4.2 scenarios.

    v0.4.2 -> v0.5 name migration reference (for scenario auto-migration):
        DiplomaticInstant    -> InstantSignal
        DiplomaticOffer      -> OpeningMove
        MilitaryDeployment   -> ForceProjection
        SustainedPosture     -> SustainedPressure
        SanctionsEconomic    -> EconomicCoercion
        CovertOperation      -> CovertAction
        TreatyInstitutional  -> InstitutionalLegal
        ExerciseDemonstration -> Demonstration
        (SubversionInfluence is new in v0.5)
    """
    def __init__(self):
        key_values = {
            "InstantSignal": 0,
            "OpeningMove": 1,
            "ForceProjection": 2,
            "SustainedPressure": 3,
            "EconomicCoercion": 4,
            "CovertAction": 5,
            "InstitutionalLegal": 6,
            "Demonstration": 7,
            "SubversionInfluence": 8,
        }
        super().__init__(key_values=key_values)

    # String identifier mapping (used by archetype_id field in temporal profiles)
    ID_TO_ENUM = {
        "instant_signal": "InstantSignal",
        "opening_move": "OpeningMove",
        "force_projection": "ForceProjection",
        "sustained_pressure": "SustainedPressure",
        "economic_coercion": "EconomicCoercion",
        "covert_action": "CovertAction",
        "institutional_legal": "InstitutionalLegal",
        "demonstration": "Demonstration",
        "subversion_influence": "SubversionInfluence",
    }


# ---------------------------------------------------------------------------
# Commitment Register Enums
# ---------------------------------------------------------------------------

class CommitmentType(Enumeration):
    """
    Types of commitment records in the Commitment Register.
    Implicit = trajectory commitment from any action.
    Explicit types = speech acts with trigger conditions and committed responses.
    """
    def __init__(self):
        key_values = {
            "Implicit": 0,
            "Threat": 1,
            "Promise": 2,
            "Proposal": 3,
            "Redline": 4,
            "Ultimatum": 5,
        }
        super().__init__(key_values=key_values)


class CommitmentTriggerStatus(Enumeration):
    """
    Lifecycle status for explicit commitment records.
    Tracks progression from creation through resolution.
    """
    def __init__(self):
        key_values = {
            "Untriggered": 0,
            "Triggered": 1,
            "Fulfilled": 2,
            "Violated": 3,
            "Expired": 4,
            "Withdrawn": 5,
            "PendingResponse": 6,
            "Rejected": 7,
            "Complied": 8,
        }
        super().__init__(key_values=key_values)


class ImplicitCommitmentStatus(Enumeration):
    """
    Lifecycle status for implicit commitment records.
    Simpler than explicit: active influence, decaying influence, or expired.
    """
    def __init__(self):
        key_values = {
            "Active": 0,
            "Decaying": 1,
            "Expired": 2,
        }
        super().__init__(key_values=key_values)


class PenaltyType(Enumeration):
    """
    Classification of cost set entries.
    Determines how the screening filter treats the penalty.
    """
    def __init__(self):
        key_values = {
            "Redundancy": 0,
            "Contradiction": 1,
            "Incoherence": 2,
        }
        super().__init__(key_values=key_values)


class LifecycleBinding(Enumeration):
    """
    How an implicit commitment's influence relates to the source action's
    temporal lifecycle state.
    ActiveOnly: full weight while IN_PROGRESS/SUSTAINING; decays when action decays.
    Persistent: decays independently of the source action's lifecycle.
    """
    def __init__(self):
        key_values = {
            "ActiveOnly": 0,
            "Persistent": 1,
        }
        super().__init__(key_values=key_values)
