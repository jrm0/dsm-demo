"""
Exogenous Event Mechanism — Pre-Processor

Evaluates exogenous event definitions against their trigger conditions at the
start of each turn. Triggered events are instantiated as action entries in the
Observable Event Set, processed through the standard 4-stage pipeline.

See Multi-Actor Refactor Spec v0.1, Section 4.

Three trigger types:
  - Scripted: fire on a specific turn number
  - Conditional: fire when simulation state meets defined criteria
  - Stochastic: fire with a defined probability each turn (within a window)
"""

import numpy as np
from data_classes import ActionSequenceData, ExogenousEventDefinition, EXOGENOUS_ACTOR_ID
from enums import ExogenousTriggerType, RelationshipTag


def evaluate_triggers(exogenous_event_defs, turn_number, simulation_state, rng=None):
    """
    Evaluate all exogenous event definitions and return those that trigger
    on this turn.

    Args:
        exogenous_event_defs: List of ExogenousEventDefinition objects
        turn_number: Current turn number (0-indexed)
        simulation_state: Dict containing current simulation state for
                          conditional trigger evaluation
        rng: numpy random generator for stochastic triggers (optional)

    Returns:
        List of ExogenousEventDefinition objects that triggered this turn
    """
    triggered = []

    for event_def in exogenous_event_defs:
        if _should_trigger(event_def, turn_number, simulation_state, rng):
            triggered.append(event_def)

    return triggered


def _should_trigger(event_def, turn_number, simulation_state, rng):
    """Evaluate whether a single exogenous event should trigger."""
    trigger_type = event_def.trigger_type
    config = event_def.trigger_config

    _trigger_enums = ExogenousTriggerType()
    if trigger_type == _trigger_enums['Scripted']:
        return turn_number == config.get("turn_number", -1)

    elif trigger_type == _trigger_enums['Conditional']:
        return _evaluate_conditions(config.get("conditions", []), simulation_state,
                                    config.get("fire_once", True), event_def)

    elif trigger_type == _trigger_enums['Stochastic']:
        return _evaluate_stochastic(config, turn_number, rng)

    return False


def _evaluate_conditions(conditions, simulation_state, fire_once, event_def):
    """
    Evaluate conditional trigger: all conditions must be met.

    Each condition is a dict with:
      - variable: string key into simulation_state
      - operator: ">" | "<" | ">=" | "<=" | "=="
      - threshold: numeric value

    If fire_once is True and the event has already fired (tracked via
    '_has_fired' attribute), returns False.
    """
    if fire_once and getattr(event_def, '_has_fired', False):
        return False

    for condition in conditions:
        variable = condition.get("variable", "")
        operator = condition.get("operator", ">")
        threshold = condition.get("threshold", 0)

        value = simulation_state.get(variable, 0)
        if isinstance(value, np.ndarray):
            value = float(np.max(value))

        if operator == ">" and not (value > threshold):
            return False
        elif operator == "<" and not (value < threshold):
            return False
        elif operator == ">=" and not (value >= threshold):
            return False
        elif operator == "<=" and not (value <= threshold):
            return False
        elif operator == "==" and not (value == threshold):
            return False

    # All conditions met — mark as fired for fire_once events
    if fire_once:
        event_def._has_fired = True
    return True


def _evaluate_stochastic(config, turn_number, rng):
    """
    Evaluate stochastic trigger: draw against probability within window.
    """
    probability = config.get("probability", 0.0)
    start_turn = config.get("start_turn", 0)
    end_turn = config.get("end_turn", None)

    if turn_number < start_turn:
        return False
    if end_turn is not None and turn_number > end_turn:
        return False

    if rng is not None:
        return rng.random() < probability
    else:
        # Deterministic mode: never fire stochastic events
        return False


def create_exogenous_action_sequence(event_def, enums):
    """
    Convert a triggered exogenous event into an ActionSequenceData that can
    be injected into the Observable Event Set.

    The characteristics_vector from the event definition is used directly
    as the action's characteristic profile.
    """
    num_chars = len(enums['Char'])
    raw_vec = np.array(event_def.characteristics_vector, dtype=float)
    # Legacy migration: drop PA (index 7) from 8-element vectors
    if raw_vec.size == 8 and num_chars == 7:
        raw_vec = np.delete(raw_vec, 7)
    char_vector = raw_vec.reshape((num_chars, 1))

    action_sequence = ActionSequenceData(
        actor_id=EXOGENOUS_ACTOR_ID,
        coa_id_list=[event_def.coa_id] if event_def.coa_id is not None else [-1],
        coa_characteristics_list=[char_vector],
    )

    # Attach metadata for downstream processing (Stage 2 relationship_modifier)
    action_sequence._relationship_tag = event_def.relationship_tag
    action_sequence._event_label = event_def.event_label
    action_sequence._source_actor_label = event_def.source_actor_label
    action_sequence._goal_impact_override = event_def.goal_impact_override
    action_sequence._affects_coalition = event_def.affects_coalition

    return action_sequence


def parse_exogenous_event_configs(raw_configs):
    """
    Parse raw exogenous event configuration dicts (from scenario JSON)
    into ExogenousEventDefinition objects.
    """
    _rel_tag_enum = RelationshipTag()
    _trigger_enum = ExogenousTriggerType()

    events = []
    for config in raw_configs:
        # Convert string tag/type from JSON to enum integer
        raw_tag = config.get("relationship_tag", "Neutral")
        if isinstance(raw_tag, str):
            # Accept both old lowercase ("ally") and new PascalCase ("Ally")
            tag_key = raw_tag.capitalize() if raw_tag[0].islower() else raw_tag
            rel_tag = _rel_tag_enum[tag_key] if tag_key in _rel_tag_enum.values else _rel_tag_enum['Neutral']
        else:
            rel_tag = int(raw_tag)

        raw_trigger = config.get("trigger_type", "Scripted")
        if isinstance(raw_trigger, str):
            trigger_key = raw_trigger.capitalize() if raw_trigger[0].islower() else raw_trigger
            trigger_val = _trigger_enum[trigger_key] if trigger_key in _trigger_enum.values else _trigger_enum['Scripted']
        else:
            trigger_val = int(raw_trigger)

        event = ExogenousEventDefinition(
            event_id=config.get("event_id", f"exo_{len(events)}"),
            event_label=config.get("event_label", ""),
            source_actor_label=config.get("source_actor_label", "Unknown"),
            relationship_tag=rel_tag,
            characteristics_vector=config.get("characteristics_vector", [0.0] * 7),
            trigger_type=trigger_val,
            trigger_config=config.get("trigger_config", {}),
            goal_impact_override=config.get("goal_impact_override", None),
            coa_id=config.get("coa_id", None),
            affects_coalition=config.get("affects_coalition", None),
        )
        events.append(event)
    return events
