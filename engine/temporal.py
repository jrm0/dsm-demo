"""
Temporal Layer for the DSM (Deterrence Signaling Model).

Implements the Parallel Temporal Accounting System specified in
DSM_Temporal_Layer_Spec_v0.5. Actions persist across multiple turns
with lifecycle states, signal salience decays via power-law, novelty
decays exponentially, and sustaining/continuation reviews evaluate
whether to maintain or cancel active actions.

This module contains:
- ActionTemporalProfile: Per-action temporal metadata (13 fields)
- ActionLifecycleRecord: Runtime state for each action instance
- WorldStateTimeline: Container managing all lifecycle records
- TemporalPreProcessor: Pre-Stage-1 processing (Phase 2)
- Sustaining/Continuation review logic (Phase 3)
"""

import math
import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Callable, Union
from enums import (
    TemporalArchetype as _TemporalArchetypeEnum,
    NUM_IMPACT_DIMS, get_impact_to_profile_map, Char as _CharEnum,
)


# ---------------------------------------------------------------------------
# Constants: Default simulation parameters for the temporal layer.
# These are overridable via scenario/simulation config.
# ---------------------------------------------------------------------------

DEFAULT_PERCEPTION_THRESHOLD = 0.1
DEFAULT_EXPIRY_THRESHOLD = 0.05
DEFAULT_SUSTAINING_IMPACT_FACTOR = 0.3
DEFAULT_SUSTAINING_DECAY_EXPONENT = 0.4
DEFAULT_MAX_SUSTAINING_LAYERS = 10
DEFAULT_TEMPORAL_DISCOUNT_RATE = 0.1
DEFAULT_WITHDRAWAL_RELUCTANCE_WEIGHT = 0.3
DEFAULT_CANCELLATION_RELUCTANCE_WEIGHT = 0.4
DEFAULT_ANTICIPATORY_WEIGHT = 0.2
DEFAULT_DURATION_DAMPING_RATE = 0.3
DEFAULT_LEDGER_LOOKBACK = 3
DEFAULT_NOVELTY_DECAY_RATE = 0.4
DEFAULT_DAYS_PER_TURN = 3
MAX_DECAY_EXPONENT = 2.0  # Cap for sub-turn half-lives

NUM_CHARACTERISTICS = 7  # Matches Char enum length

# Impact-to-profile mapping for sustaining cost application.
_IMPACT_TO_PROFILE_MAP = get_impact_to_profile_map(_CharEnum())


# ---------------------------------------------------------------------------
# Data Structure: Action Prerequisite Binding
# ---------------------------------------------------------------------------

@dataclass
class PrerequisiteBinding:
    """
    Declares that an action requires another action to have reached a specific
    lifecycle state before it becomes available for selection.

    Fields:
        required_coa_id: The action that must be in the required state.
        required_state: Minimum lifecycle state (uses LS_* constants).
                        The check is >=, so LS_COMPLETED (2) also matches
                        LS_SUSTAINING (3) — a completed-and-sustaining action
                        satisfies a COMPLETED prerequisite.
        rationale: Human-readable explanation for payload documentation.
    """
    required_coa_id: int
    required_state: int  # LS_COMPLETED, LS_SUSTAINING, etc.
    rationale: str = ""


# ---------------------------------------------------------------------------
# Data Structure: Action Temporal Profile
# ---------------------------------------------------------------------------

@dataclass
class ActionTemporalProfile:
    """
    Temporal metadata attached to each action in the COA Playbook.
    Defines how the action behaves across time: execution duration,
    sustainment properties, signal characteristics, and lifecycle routing.

    All fields have defaults that produce v2.0-equivalent behavior
    (instantaneous, non-sustained, full salience, no partial impact).
    """
    execution_duration: int = 0
    is_sustained: bool = False
    sustaining_cost_vector: np.ndarray = field(
        default_factory=lambda: np.zeros((NUM_IMPACT_DIMS, 1))
    )
    signal_salience_initial: float = 1.0
    signal_salience_decay_exponent: float = 0.5
    signal_salience_sustained_modifier: float = 1.0
    initiation_visibility: Union[float, Callable[[float], float]] = 1.0
    in_progress_characteristics_modifier: np.ndarray = field(
        default_factory=lambda: np.ones((NUM_CHARACTERISTICS, 1))
    )
    in_progress_impact_fraction: float = 0.0
    tangible_impact_mode: int = 0  # 0 = OnCompletion, 1 = Recurring
    relationship_update_mode: int = 0  # 0 = OnStateChange, 1 = Continuous
    cancellation_cost_fraction: float = 0.5
    archetype_id: Optional[str] = None  # v0.5: canonical archetype identifier
    prerequisites: Optional[List['PrerequisiteBinding']] = None  # v0.8: temporal prerequisites

    def __post_init__(self):
        """Ensure vector fields are numpy arrays with correct shapes.
        sustaining_cost_vector: (NUM_IMPACT_DIMS, 1) — Capability and Resolve only.
        in_progress_characteristics_modifier: (NUM_CHARACTERISTICS, 1) — full Char vector.
        """
        if not isinstance(self.sustaining_cost_vector, np.ndarray):
            self.sustaining_cost_vector = np.array(
                self.sustaining_cost_vector, dtype=float
            )
        if self.sustaining_cost_vector.shape != (NUM_IMPACT_DIMS, 1):
            self.sustaining_cost_vector = self.sustaining_cost_vector.reshape(
                (NUM_IMPACT_DIMS, 1)
            )
        if not isinstance(self.in_progress_characteristics_modifier, np.ndarray):
            self.in_progress_characteristics_modifier = np.array(
                self.in_progress_characteristics_modifier, dtype=float
            )
        if self.in_progress_characteristics_modifier.shape != (NUM_CHARACTERISTICS, 1):
            self.in_progress_characteristics_modifier = (
                self.in_progress_characteristics_modifier.reshape(
                    (NUM_CHARACTERISTICS, 1)
                )
            )


# Tangible impact mode constants (stored as integers per convention)
TANGIBLE_IMPACT_ON_COMPLETION = 0
TANGIBLE_IMPACT_RECURRING = 1

# Relationship update mode constants
RELATIONSHIP_UPDATE_ON_STATE_CHANGE = 0
RELATIONSHIP_UPDATE_CONTINUOUS = 1


# ---------------------------------------------------------------------------
# Data Structure: Action Lifecycle Record
# ---------------------------------------------------------------------------

@dataclass
class ActionLifecycleRecord:
    """
    Runtime state for a single action instance in the World State Timeline.
    Tracks lifecycle progression, signal properties, and impact accounting.

    Created when an action is initiated (Stage 4 / World State Timeline
    management). Updated each turn by the Temporal Pre-Processor.
    """
    record_id: int
    actor_id: int
    coa_id: int
    target_id: int  # -1 for untargeted
    lifecycle_state: int  # LifecycleState enum value
    turn_initiated: int
    turn_completed: Optional[int] = None
    turn_cancelled: Optional[int] = None
    turns_sustained: int = 0
    current_signal_salience: float = 1.0
    current_novelty: float = 1.0
    current_characteristics_vector: np.ndarray = field(
        default_factory=lambda: np.zeros((NUM_CHARACTERISTICS, 1))
    )
    goal_impact_applied_on_turn: Optional[int] = None
    sustaining_layers_count: int = 0

    # Reference to the temporal profile for this action (not persisted in
    # serialization — looked up from the playbook at load time).
    _temporal_profile: Optional[ActionTemporalProfile] = field(
        default=None, repr=False
    )

    def __post_init__(self):
        """Ensure characteristics vector is a numpy array."""
        if not isinstance(self.current_characteristics_vector, np.ndarray):
            self.current_characteristics_vector = np.array(
                self.current_characteristics_vector, dtype=float
            ).reshape((NUM_CHARACTERISTICS, 1))

    @property
    def completion_proximity(self) -> float:
        """
        Fraction of execution completed. 0.0 at initiation, 1.0 at completion.
        Only meaningful for IN_PROGRESS actions with execution_duration > 0.
        """
        if self._temporal_profile is None:
            return 1.0
        duration = self._temporal_profile.execution_duration
        if duration <= 0:
            return 1.0
        turns_elapsed = self._current_turn - self.turn_initiated
        return min(1.0, turns_elapsed / duration)

    @property
    def _current_turn(self) -> int:
        """
        The current simulation turn. Set externally by the pre-processor
        each tick. Defaults to turn_initiated if not yet set.
        """
        return getattr(self, '_sim_current_turn', self.turn_initiated)

    @_current_turn.setter
    def _current_turn(self, value: int):
        self._sim_current_turn = value

    @property
    def turns_remaining(self) -> int:
        """Turns until execution completes. 0 if already completed."""
        if self._temporal_profile is None:
            return 0
        duration = self._temporal_profile.execution_duration
        elapsed = self._current_turn - self.turn_initiated
        return max(0, duration - elapsed)

    @property
    def effective_visibility(self) -> float:
        """
        Current visibility based on initiation_visibility and progress.
        Supports both scalar and function-based visibility.
        """
        if self._temporal_profile is None:
            return 1.0
        vis = self._temporal_profile.initiation_visibility
        if callable(vis):
            return float(vis(self.completion_proximity))
        return float(vis)

    def is_active(self) -> bool:
        """Whether this record is in an active (non-expired) state."""
        # LifecycleState.Expired = 5
        return self.lifecycle_state != 5

    def is_observable(self, perception_threshold: float = DEFAULT_PERCEPTION_THRESHOLD) -> bool:
        """Whether this record is currently observable by other actors."""
        # Expired records are never observable
        if not self.is_active():
            return False
        # Decaying records below perception threshold are not observable
        # LifecycleState.Decaying = 4
        if self.lifecycle_state == 4:
            return self.current_signal_salience >= perception_threshold
        return True


# ---------------------------------------------------------------------------
# Data Structure: Observable Event
# ---------------------------------------------------------------------------

@dataclass
class ObservableEvent:
    """
    A processed event ready for Stage 1 consumption.
    Assembled by the Temporal Pre-Processor from lifecycle records.
    Carries all metadata needed for perception, interpretation, and decision.
    """
    record_id: int
    coa_id: int
    source_actor_id: int
    target_id: int
    characteristics_vector: np.ndarray
    signal_salience: float
    novelty: float
    lifecycle_state: int
    completion_proximity: float
    tangible_impact_mode: int
    relationship_update_mode: int
    in_progress_impact_fraction: float


# ---------------------------------------------------------------------------
# World State Timeline
# ---------------------------------------------------------------------------

class WorldStateTimeline:
    """
    Container for all Action Lifecycle Records across the simulation.
    Provides query and management methods for the Temporal Pre-Processor
    and decision engine.

    The timeline is the authoritative source for what actions exist in
    the world at any given turn.
    """

    def __init__(self):
        self._records: Dict[int, ActionLifecycleRecord] = {}
        self._next_record_id: int = 0

    @property
    def records(self) -> Dict[int, ActionLifecycleRecord]:
        """All records (active and expired)."""
        return self._records

    def create_record(
        self,
        actor_id: int,
        coa_id: int,
        target_id: int,
        lifecycle_state: int,
        turn_initiated: int,
        characteristics_vector: np.ndarray,
        temporal_profile: Optional[ActionTemporalProfile] = None,
    ) -> ActionLifecycleRecord:
        """
        Create and register a new lifecycle record.
        Called when an action is selected in Stage 3 / managed in Stage 4.

        Returns the created record.
        """
        record = ActionLifecycleRecord(
            record_id=self._next_record_id,
            actor_id=actor_id,
            coa_id=coa_id,
            target_id=target_id,
            lifecycle_state=lifecycle_state,
            turn_initiated=turn_initiated,
            current_signal_salience=(
                temporal_profile.signal_salience_initial
                if temporal_profile else 1.0
            ),
            current_novelty=1.0,
            current_characteristics_vector=characteristics_vector.copy(),
            _temporal_profile=temporal_profile,
        )
        self._records[self._next_record_id] = record
        self._next_record_id += 1
        return record

    def get_active_records(self) -> List[ActionLifecycleRecord]:
        """All non-expired records."""
        return [r for r in self._records.values() if r.is_active()]

    def get_records_by_actor(self, actor_id: int) -> List[ActionLifecycleRecord]:
        """All active records for a specific actor."""
        return [
            r for r in self._records.values()
            if r.actor_id == actor_id and r.is_active()
        ]

    def get_records_by_state(self, lifecycle_state: int) -> List[ActionLifecycleRecord]:
        """All active records in a specific lifecycle state."""
        return [
            r for r in self._records.values()
            if r.lifecycle_state == lifecycle_state and r.is_active()
        ]

    def get_sustaining_records_for_actor(self, actor_id: int) -> List[ActionLifecycleRecord]:
        """All SUSTAINING records belonging to a specific actor."""
        # LifecycleState.Sustaining = 3
        return [
            r for r in self._records.values()
            if r.actor_id == actor_id and r.lifecycle_state == 3
        ]

    def get_in_progress_records_for_actor(self, actor_id: int) -> List[ActionLifecycleRecord]:
        """All IN_PROGRESS records belonging to a specific actor."""
        # LifecycleState.InProgress = 1
        return [
            r for r in self._records.values()
            if r.actor_id == actor_id and r.lifecycle_state == 1
        ]

    def get_observable_records_for_actor(
        self,
        observer_id: int,
        perception_threshold: float = DEFAULT_PERCEPTION_THRESHOLD,
    ) -> List[ActionLifecycleRecord]:
        """
        All records observable by a specific actor (excludes own records,
        excludes expired, excludes decaying below threshold).
        """
        return [
            r for r in self._records.values()
            if r.actor_id != observer_id and r.is_observable(perception_threshold)
        ]

    def get_record(self, record_id: int) -> Optional[ActionLifecycleRecord]:
        """Look up a record by ID."""
        return self._records.get(record_id)

    def has_active_action(self, actor_id: int, coa_id: int) -> bool:
        """
        Check if an actor already has an active (non-expired, non-decaying)
        instance of a specific COA. Used for playbook filtering.
        """
        # Active means not Decaying (4) and not Expired (5)
        return any(
            r.actor_id == actor_id
            and r.coa_id == coa_id
            and r.lifecycle_state not in (4, 5)
            for r in self._records.values()
        )

    def record_count(self) -> int:
        """Total records (including expired)."""
        return len(self._records)

    def active_count(self) -> int:
        """Count of non-expired records."""
        return sum(1 for r in self._records.values() if r.is_active())

    def to_serializable(self) -> List[dict]:
        """
        Serialize all records for persistence. Excludes the _temporal_profile
        reference (re-linked at load time from playbook data).
        """
        serialized = []
        for record in self._records.values():
            serialized.append({
                'record_id': record.record_id,
                'actor_id': record.actor_id,
                'coa_id': record.coa_id,
                'target_id': record.target_id,
                'lifecycle_state': record.lifecycle_state,
                'turn_initiated': record.turn_initiated,
                'turn_completed': record.turn_completed,
                'turn_cancelled': record.turn_cancelled,
                'turns_sustained': record.turns_sustained,
                'current_signal_salience': record.current_signal_salience,
                'current_novelty': record.current_novelty,
                'current_characteristics_vector': (
                    record.current_characteristics_vector.tolist()
                ),
                'goal_impact_applied_on_turn': record.goal_impact_applied_on_turn,
                'sustaining_layers_count': record.sustaining_layers_count,
            })
        return serialized

    @classmethod
    def from_serializable(
        cls,
        data: List[dict],
        temporal_profiles: Optional[Dict[int, ActionTemporalProfile]] = None,
    ) -> 'WorldStateTimeline':
        """
        Reconstruct a WorldStateTimeline from serialized data.
        Optionally re-links temporal profiles by coa_id.
        """
        timeline = cls()
        for entry in data:
            record = ActionLifecycleRecord(
                record_id=entry['record_id'],
                actor_id=entry['actor_id'],
                coa_id=entry['coa_id'],
                target_id=entry['target_id'],
                lifecycle_state=entry['lifecycle_state'],
                turn_initiated=entry['turn_initiated'],
                turn_completed=entry.get('turn_completed'),
                turn_cancelled=entry.get('turn_cancelled'),
                turns_sustained=entry.get('turns_sustained', 0),
                current_signal_salience=entry.get('current_signal_salience', 1.0),
                current_novelty=entry.get('current_novelty', 1.0),
                current_characteristics_vector=np.array(
                    entry.get('current_characteristics_vector',
                              np.zeros((NUM_CHARACTERISTICS, 1)))
                ).reshape((NUM_CHARACTERISTICS, 1)),
                goal_impact_applied_on_turn=entry.get('goal_impact_applied_on_turn'),
                sustaining_layers_count=entry.get('sustaining_layers_count', 0),
            )
            # Re-link temporal profile if available
            if temporal_profiles and record.coa_id in temporal_profiles:
                record._temporal_profile = temporal_profiles[record.coa_id]

            timeline._records[record.record_id] = record
            timeline._next_record_id = max(
                timeline._next_record_id, record.record_id + 1
            )
        return timeline


# ---------------------------------------------------------------------------
# Temporal Profile Parsing Utilities
# ---------------------------------------------------------------------------

def _parse_prerequisites(
    raw_prereqs: Optional[List[dict]],
) -> Optional[List[PrerequisiteBinding]]:
    """
    Parse prerequisite bindings from scenario JSON.

    Expected format per entry:
        {
            "required_coa_id": int,
            "required_state": int,    # LS_* constant (2=COMPLETED, 3=SUSTAINING)
            "rationale": str          # optional
        }

    Returns None if no prerequisites are defined (preserving default behavior).
    """
    if not raw_prereqs:
        return None
    bindings = []
    for entry in raw_prereqs:
        bindings.append(PrerequisiteBinding(
            required_coa_id=int(entry['required_coa_id']),
            required_state=int(entry['required_state']),
            rationale=str(entry.get('rationale', '')),
        ))
    return bindings if bindings else None


def parse_temporal_profile(raw: dict) -> ActionTemporalProfile:
    """
    Parse a temporal profile from scenario JSON into an ActionTemporalProfile.
    Accepts both full field names and abbreviated forms. Provides defaults
    for all missing fields, ensuring backwards compatibility.
    """
    # Parse vector fields with scalar-broadcast support:
    # If a scalar is provided instead of a list, broadcast to full vector.
    raw_cost = raw.get('sustaining_cost_vector', [0.0] * NUM_IMPACT_DIMS)
    if isinstance(raw_cost, (int, float)):
        raw_cost = [float(raw_cost)] * NUM_IMPACT_DIMS
    # Legacy migration: if an 8-element or 7-element vector is provided,
    # extract Capability and Resolve entries.
    if len(raw_cost) > NUM_IMPACT_DIMS:
        char_enum = _CharEnum()
        raw_cost = [raw_cost[char_enum['Capability']], raw_cost[char_enum['Resolve']]]

    raw_char_mod = raw.get('in_progress_characteristics_modifier',
                           [1.0] * NUM_CHARACTERISTICS)
    if isinstance(raw_char_mod, (int, float)):
        raw_char_mod = [float(raw_char_mod)] * NUM_CHARACTERISTICS
    # Legacy migration: drop PA (index 7) from 8-element vectors
    if len(raw_char_mod) == 8:
        raw_char_mod = [v for i, v in enumerate(raw_char_mod) if i != 7]

    return ActionTemporalProfile(
        execution_duration=int(raw.get('execution_duration', 0)),
        is_sustained=bool(raw.get('is_sustained', False)),
        sustaining_cost_vector=np.array(raw_cost, dtype=float).reshape(
            (NUM_IMPACT_DIMS, 1)
        ),
        signal_salience_initial=float(raw.get('signal_salience_initial', 1.0)),
        signal_salience_decay_exponent=float(
            raw.get('signal_salience_decay_exponent', 0.5)
        ),
        signal_salience_sustained_modifier=float(
            raw.get('signal_salience_sustained_modifier', 1.0)
        ),
        initiation_visibility=float(raw.get('initiation_visibility', 1.0)),
        in_progress_characteristics_modifier=np.array(
            raw_char_mod, dtype=float
        ).reshape((NUM_CHARACTERISTICS, 1)),
        in_progress_impact_fraction=float(
            raw.get('in_progress_impact_fraction', 0.0)
        ),
        tangible_impact_mode=int(raw.get('tangible_impact_mode', 0)),
        relationship_update_mode=int(raw.get('relationship_update_mode', 0)),
        cancellation_cost_fraction=float(
            raw.get('cancellation_cost_fraction', 0.5)
        ),
        archetype_id=raw.get('archetype_id', None),
        prerequisites=_parse_prerequisites(raw.get('prerequisites', None)),
    )


def parse_temporal_profiles_from_config(
    raw_profiles: List[dict],
    days_per_turn: Optional[float] = None,
    positional_offset: int = 1,
) -> Dict[int, ActionTemporalProfile]:
    """
    Parse a list of temporal profile definitions from scenario config.
    Returns a dict mapping coa_id -> ActionTemporalProfile.

    Action identification: each entry should have a 'coa_id' or 'coa_index'
    field. If neither is present, the list is treated as positionally ordered
    with coa_id = list_index + positional_offset. The default offset of 1
    accounts for Do_Nothing at index 0 being absent from per-actor profile
    lists. Scenario-config lists (which include Do_Nothing) should pass
    positional_offset=0 if they lack explicit keys.

    If days_per_turn is provided, real-world-time fields (duration_days,
    sustaining_cost_per_day, salience_half_life_days, etc.) are converted
    to turn-denominated values before constructing the profile.
    """
    if not raw_profiles:
        return {}

    # Detect whether entries have explicit action IDs
    first_has_key = ('coa_id' in raw_profiles[0] or 'coa_index' in raw_profiles[0])

    profiles = {}
    for i, entry in enumerate(raw_profiles):
        if first_has_key:
            coa_id = int(entry.get('coa_id', entry.get('coa_index', -1)))
        else:
            # Positionally ordered: assign coa_id from list position
            coa_id = i + positional_offset
        resolved = convert_realworld_profile(entry, days_per_turn) if days_per_turn else entry
        profiles[coa_id] = parse_temporal_profile(resolved)
    return profiles


# ---------------------------------------------------------------------------
# Real-World-Time Conversion Utilities (Spec Section 1.6)
# ---------------------------------------------------------------------------

def half_life_days_to_decay_exponent(
    half_life_days: float,
    days_per_turn: float,
) -> float:
    """
    Convert a signal salience half-life in days to a power-law decay exponent.

    Power-law decay: S(t) = S_init × t^(-d), where t is turns since
    active phase ended. Half-life is the number of turns at which
    S(t) = S_init / 2.

    Derivation: 0.5 = half_life_turns^(-d) → d = ln(2) / ln(half_life_turns)

    If half_life_turns <= 1.0, the action decays within a single turn
    and the exponent is capped at MAX_DECAY_EXPONENT.
    """
    half_life_turns = half_life_days / days_per_turn
    if half_life_turns <= 1.0:
        return MAX_DECAY_EXPONENT
    return math.log(2) / math.log(half_life_turns)


def half_life_days_to_novelty_rate(
    half_life_days: float,
    days_per_turn: float,
) -> float:
    """
    Convert a novelty half-life in days to an exponential decay rate.

    Novelty decay: N(t) = N(t-1) × (1 - rate). After half_life_turns
    turns, N = 0.5 × N(0).

    Derivation: (1 - rate)^half_life_turns = 0.5
                rate = 1 - 0.5^(1/half_life_turns)

    If half_life_turns <= 0, returns 1.0 (instant decay).
    """
    half_life_turns = half_life_days / days_per_turn
    if half_life_turns <= 0:
        return 1.0
    return 1.0 - 0.5 ** (1.0 / half_life_turns)


def convert_realworld_profile(
    raw: dict,
    days_per_turn: Optional[float] = None,
) -> dict:
    """
    Convert real-world-time fields in a raw profile dict to
    turn-denominated fields the engine expects.

    Real-world-time fields (from MAGIC):
      duration_days         → execution_duration (turns, ceiling)
      sustaining_cost_per_day → sustaining_cost_vector (per-turn)
      salience_half_life_days → signal_salience_decay_exponent
      novelty_half_life_days  → novelty_decay_rate (per profile; advisory)
      in_progress_impact_per_day → in_progress_impact_fraction (per-turn)

    If days_per_turn is None or a real-world field is absent, the
    corresponding turn-denominated field is left unchanged (backwards
    compatible). If both real-world and turn-denominated fields are
    present, the real-world field takes precedence.

    Returns a new dict suitable for parse_temporal_profile().
    """
    if days_per_turn is None:
        return raw

    result = dict(raw)
    dpt = float(days_per_turn)

    # Duration: days → turns (ceiling)
    if 'duration_days' in raw:
        result['execution_duration'] = int(math.ceil(
            float(raw['duration_days']) / dpt
        ))

    # Sustaining cost: per-day → per-turn (NUM_IMPACT_DIMS: Capability, Resolve)
    # Capped at 1.0 per dimension — a sustained action cannot drain more than
    # 100% of a resource dimension per turn.  Without this cap, short turn
    # intervals (days_per_turn=3) applied to moderate per-day costs (0.4/day)
    # produce per-turn costs >1.0 (1.2), which are physically impossible and
    # break the sustaining review's cost/benefit comparison.
    if 'sustaining_cost_per_day' in raw:
        cost_per_day = raw['sustaining_cost_per_day']
        if isinstance(cost_per_day, (int, float)):
            result['sustaining_cost_vector'] = [
                min(1.0, float(cost_per_day) * dpt)
            ] * NUM_IMPACT_DIMS
        else:
            # Flatten nested lists (e.g. [[0.6], [0.4]] → [0.6, 0.4]) and scale.
            flat = [c[0] if isinstance(c, list) else c for c in cost_per_day]
            result['sustaining_cost_vector'] = [
                min(1.0, float(c) * dpt) for c in flat
            ]

    # Signal salience decay: half-life days → power-law exponent
    if 'salience_half_life_days' in raw:
        result['signal_salience_decay_exponent'] = half_life_days_to_decay_exponent(
            float(raw['salience_half_life_days']), dpt
        )

    # In-progress impact: per-day → per-turn, capped at 1.0
    if 'in_progress_impact_per_day' in raw:
        result['in_progress_impact_fraction'] = min(
            1.0, float(raw['in_progress_impact_per_day']) * dpt
        )

    # Novelty half-life: stored as advisory metadata on the profile.
    # The simulation-level novelty_decay_rate may be overridden per-scenario
    # based on this value; the conversion is provided for reference.
    if 'novelty_half_life_days' in raw:
        result['_novelty_decay_rate'] = half_life_days_to_novelty_rate(
            float(raw['novelty_half_life_days']), dpt
        )

    return result


# ---------------------------------------------------------------------------
# Archetype Template Defaults
# ---------------------------------------------------------------------------

_ARCHETYPE_ENUM = _TemporalArchetypeEnum()

# Archetype defaults keyed by TemporalArchetype enum integer values.
_ARCHETYPE_DEFAULTS: Dict[int, dict] = {
    _ARCHETYPE_ENUM['InstantSignal']: {
        'execution_duration': 0,
        'is_sustained': False,
        'signal_salience_initial': 0.7,
        'signal_salience_decay_exponent': 0.9,
        'tangible_impact_mode': TANGIBLE_IMPACT_ON_COMPLETION,
        'relationship_update_mode': RELATIONSHIP_UPDATE_ON_STATE_CHANGE,
        'archetype_id': 'instant_signal',
    },
    _ARCHETYPE_ENUM['OpeningMove']: {
        'execution_duration': 0,
        'is_sustained': False,
        'signal_salience_initial': 0.6,
        'signal_salience_decay_exponent': 0.5,
        'tangible_impact_mode': TANGIBLE_IMPACT_ON_COMPLETION,
        'relationship_update_mode': RELATIONSHIP_UPDATE_ON_STATE_CHANGE,
        'archetype_id': 'opening_move',
    },
    _ARCHETYPE_ENUM['ForceProjection']: {
        'execution_duration': 4,
        'is_sustained': True,
        'signal_salience_initial': 0.9,
        'signal_salience_decay_exponent': 0.3,
        'signal_salience_sustained_modifier': 0.95,
        'initiation_visibility': 0.7,
        'tangible_impact_mode': TANGIBLE_IMPACT_RECURRING,
        'relationship_update_mode': RELATIONSHIP_UPDATE_ON_STATE_CHANGE,
        'archetype_id': 'force_projection',
    },
    _ARCHETYPE_ENUM['SustainedPressure']: {
        'execution_duration': 0,
        'is_sustained': True,
        'signal_salience_initial': 0.7,
        'signal_salience_decay_exponent': 0.4,
        'signal_salience_sustained_modifier': 0.9,
        'tangible_impact_mode': TANGIBLE_IMPACT_ON_COMPLETION,
        'relationship_update_mode': RELATIONSHIP_UPDATE_CONTINUOUS,
        'archetype_id': 'sustained_pressure',
    },
    _ARCHETYPE_ENUM['EconomicCoercion']: {
        'execution_duration': 1,
        'is_sustained': True,
        'signal_salience_initial': 0.8,
        'signal_salience_decay_exponent': 0.4,
        'signal_salience_sustained_modifier': 0.85,
        'tangible_impact_mode': TANGIBLE_IMPACT_RECURRING,
        'relationship_update_mode': RELATIONSHIP_UPDATE_CONTINUOUS,
        'archetype_id': 'economic_coercion',
    },
    _ARCHETYPE_ENUM['CovertAction']: {
        'execution_duration': 3,
        'is_sustained': False,
        'signal_salience_initial': 0.4,
        'signal_salience_decay_exponent': 0.5,
        'initiation_visibility': 0.2,
        'in_progress_impact_fraction': 0.0,
        'tangible_impact_mode': TANGIBLE_IMPACT_ON_COMPLETION,
        'relationship_update_mode': RELATIONSHIP_UPDATE_ON_STATE_CHANGE,
        'archetype_id': 'covert_action',
    },
    _ARCHETYPE_ENUM['InstitutionalLegal']: {
        'execution_duration': 4,
        'is_sustained': False,
        'signal_salience_initial': 0.8,
        'signal_salience_decay_exponent': 0.25,
        'in_progress_impact_fraction': 0.15,
        'tangible_impact_mode': TANGIBLE_IMPACT_ON_COMPLETION,
        'relationship_update_mode': RELATIONSHIP_UPDATE_ON_STATE_CHANGE,
        'archetype_id': 'institutional_legal',
    },
    _ARCHETYPE_ENUM['Demonstration']: {
        'execution_duration': 1,
        'is_sustained': False,
        'signal_salience_initial': 0.85,
        'signal_salience_decay_exponent': 0.6,
        'tangible_impact_mode': TANGIBLE_IMPACT_ON_COMPLETION,
        'relationship_update_mode': RELATIONSHIP_UPDATE_ON_STATE_CHANGE,
        'archetype_id': 'demonstration',
    },
    _ARCHETYPE_ENUM['SubversionInfluence']: {
        'execution_duration': 3,
        'is_sustained': True,
        'signal_salience_initial': 0.4,
        'signal_salience_decay_exponent': 0.4,
        'signal_salience_sustained_modifier': 1.0,
        'initiation_visibility': 0.15,
        'in_progress_impact_fraction': 0.2,
        'tangible_impact_mode': TANGIBLE_IMPACT_RECURRING,
        'relationship_update_mode': RELATIONSHIP_UPDATE_CONTINUOUS,
        'cancellation_cost_fraction': 0.3,
        'archetype_id': 'subversion_influence',
    },
}


def get_archetype_defaults(archetype: int) -> dict:
    """
    Return default temporal profile field values for a given archetype.

    v0.5: Archetypes reorganized from domain-first to temporal-signature-first.
    Integer values match TemporalArchetype enum (enums.py).

    These defaults are used when generating temporal profiles from
    archetype assignments. SMEs override specific fields per-action.
    """
    return _ARCHETYPE_DEFAULTS.get(archetype, {})


# Canonical archetype identifiers derived from the TemporalArchetype enum
VALID_ARCHETYPE_IDS = set(_ARCHETYPE_ENUM.ID_TO_ENUM.keys())


# ---------------------------------------------------------------------------
# Lifecycle State Constants (mirror LifecycleState enum integer values)
# ---------------------------------------------------------------------------
# Using module-level constants avoids requiring enum dict lookups in hot paths.

LS_INITIATED = 0
LS_IN_PROGRESS = 1
LS_COMPLETED = 2
LS_SUSTAINING = 3
LS_DECAYING = 4
LS_EXPIRED = 5

# Lifecycle priority for observable event ordering (lower = higher priority)
_LIFECYCLE_ORDER = {
    LS_COMPLETED: 0,
    LS_IN_PROGRESS: 1,
    LS_SUSTAINING: 2,
    LS_DECAYING: 3,
}


# ---------------------------------------------------------------------------
# Temporal Pre-Processor
# ---------------------------------------------------------------------------

class TemporalPreProcessor:
    """
    Runs at the start of each turn before Stage 1 fires.

    Performs four steps in a single pass:
      0.1  Advance lifecycle states (transitions)
      0.2  Update signal salience and novelty
      0.3  Debit sustaining costs against acting actor's Self-Profile
      0.4  Assemble and order the observable event set for the acting actor

    The pre-processor operates on the WorldStateTimeline and returns the
    enriched observable event set that Stage 1 will consume.

    Spec reference: DSM_Temporal_Layer_Spec_v0.4.2, Section 3.
    """

    def __init__(self, temporal_params: Optional[dict] = None):
        """
        Initialize with simulation-level temporal parameters.

        :param temporal_params: Dict of temporal simulation parameters.
            All have defaults matching spec Section 8.3.
        """
        p = temporal_params or {}
        self.perception_threshold = p.get(
            'perception_threshold', DEFAULT_PERCEPTION_THRESHOLD
        )
        self.expiry_threshold = p.get(
            'expiry_threshold', DEFAULT_EXPIRY_THRESHOLD
        )
        self.novelty_decay_rate = p.get(
            'novelty_decay_rate', DEFAULT_NOVELTY_DECAY_RATE
        )

    def process(
        self,
        timeline: WorldStateTimeline,
        current_turn: int,
        acting_actor_id: int,
        actor_self_profile: np.ndarray,
    ) -> tuple:
        """
        Execute the full pre-processor pass for a single actor's turn.

        :param timeline: The World State Timeline (modified in-place).
        :param current_turn: The current simulation turn number.
        :param acting_actor_id: ID of the actor about to decide.
        :param actor_self_profile: The acting actor's Self-Profile-Vector
            (8x1 ndarray). Modified in-place by sustaining cost debits.
        :returns: Tuple of (observable_events, transitioned_record_ids)
            - observable_events: List[ObservableEvent] ordered per spec
            - transitioned_record_ids: Set[int] of records that changed
              state this pass (used downstream for novelty-gated updates)
        """
        # Update current_turn on all active records (used by completion_proximity)
        for record in timeline.get_active_records():
            record._current_turn = current_turn

        # Step 0.1: Advance lifecycle states
        transitioned_ids = self._advance_lifecycle_states(
            timeline, current_turn
        )

        # Step 0.2: Update signal salience and novelty
        self._update_salience_and_novelty(
            timeline, current_turn, transitioned_ids
        )

        # Step 0.3: Debit sustaining costs
        self._debit_sustaining_costs(
            timeline, acting_actor_id, actor_self_profile
        )

        # Step 0.4: Assemble and order observable event set
        observable_events = self._assemble_observable_events(
            timeline, acting_actor_id
        )

        return observable_events, transitioned_ids

    # -------------------------------------------------------------------
    # Step 0.1: Advance Lifecycle States
    # -------------------------------------------------------------------

    def _advance_lifecycle_states(
        self,
        timeline: WorldStateTimeline,
        current_turn: int,
    ) -> set:
        """
        Scan every active record and apply state transitions.

        Transitions handled:
        - IN_PROGRESS → COMPLETED: when execution duration elapsed
        - COMPLETED → SUSTAINING: for sustained actions (immediate)
        - COMPLETED → DECAYING: for non-sustained actions (immediate)
        - DECAYING → EXPIRED: when salience below expiry_threshold

        Also handles instantaneous actions: INITIATED → COMPLETED
        within the same pass (execution_duration = 0).

        Returns set of record_ids that transitioned this pass.

        Spec reference: Section 3.2, Step 0.1.
        """
        transitioned = set()

        for record in timeline.get_active_records():
            profile = record._temporal_profile

            # --- INITIATED state (transient within single pass) ---
            if record.lifecycle_state == LS_INITIATED:
                if profile is None or profile.execution_duration == 0:
                    # Instantaneous: INITIATED → COMPLETED
                    record.lifecycle_state = LS_COMPLETED
                    record.turn_completed = current_turn
                    record.goal_impact_applied_on_turn = None
                    record.current_novelty = 1.0
                    transitioned.add(record.record_id)

                    # Immediately route: COMPLETED → SUSTAINING or DECAYING
                    if profile and profile.is_sustained:
                        record.lifecycle_state = LS_SUSTAINING
                        # Novelty stays 1.0 (just transitioned)
                    else:
                        record.lifecycle_state = LS_DECAYING
                        # Novelty stays 1.0
                else:
                    # Multi-turn: INITIATED → IN_PROGRESS
                    record.lifecycle_state = LS_IN_PROGRESS
                    record.current_novelty = 1.0
                    transitioned.add(record.record_id)

            # --- IN_PROGRESS: check if execution duration elapsed ---
            elif record.lifecycle_state == LS_IN_PROGRESS:
                if profile is not None:
                    elapsed = current_turn - record.turn_initiated
                    if elapsed >= profile.execution_duration:
                        record.lifecycle_state = LS_COMPLETED
                        record.turn_completed = current_turn
                        record.goal_impact_applied_on_turn = None
                        record.current_novelty = 1.0
                        transitioned.add(record.record_id)

                        # Immediately route: COMPLETED → SUSTAINING or DECAYING
                        if profile.is_sustained:
                            record.lifecycle_state = LS_SUSTAINING
                        else:
                            record.lifecycle_state = LS_DECAYING

            # --- DECAYING: check if salience below expiry threshold ---
            elif record.lifecycle_state == LS_DECAYING:
                if record.current_signal_salience < self.expiry_threshold:
                    record.lifecycle_state = LS_EXPIRED
                    transitioned.add(record.record_id)

        return transitioned

    # -------------------------------------------------------------------
    # Step 0.2: Update Signal Salience and Novelty
    # -------------------------------------------------------------------

    def _update_salience_and_novelty(
        self,
        timeline: WorldStateTimeline,
        current_turn: int,
        transitioned_ids: set,
    ):
        """
        Update signal salience and novelty for every active record.

        Salience rules by state:
        - IN_PROGRESS: holds at initial × effective_visibility
        - COMPLETED (this turn): set to signal_salience_initial
        - SUSTAINING: multiplicative modifier per turn
        - DECAYING: power-law decay from peak

        Novelty rules:
        - Records that transitioned this pass: already 1.0 (set in Step 0.1)
        - Stable-state records: exponential decay per turn

        Spec reference: Section 3.2, Step 0.2.
        """
        for record in timeline.get_active_records():
            profile = record._temporal_profile

            # --- Signal Salience ---
            if record.lifecycle_state == LS_IN_PROGRESS:
                if profile:
                    record.current_signal_salience = (
                        profile.signal_salience_initial
                        * record.effective_visibility
                    )
                    # Update characteristics with in-progress modifier
                    # (base characteristics × modifier)
                    if hasattr(record, '_base_characteristics'):
                        record.current_characteristics_vector = (
                            record._base_characteristics
                            * profile.in_progress_characteristics_modifier
                        )

            elif record.lifecycle_state == LS_SUSTAINING:
                if profile:
                    record.current_signal_salience = np.clip(
                        record.current_signal_salience
                        * profile.signal_salience_sustained_modifier,
                        0.0, 1.0
                    )

            elif record.lifecycle_state == LS_DECAYING:
                if profile and profile.signal_salience_decay_exponent > 0:
                    # Power-law decay: S(t) = S_initial × t^(-d)
                    # t_since_peak = turns since the action left its active phase
                    t_since_peak = self._turns_since_peak(record, current_turn)
                    if t_since_peak > 0:
                        record.current_signal_salience = (
                            profile.signal_salience_initial
                            * (t_since_peak ** (-profile.signal_salience_decay_exponent))
                        )
                    else:
                        record.current_signal_salience = (
                            profile.signal_salience_initial
                        )

            # COMPLETED records that just transitioned have salience set to
            # initial by the transition logic. But COMPLETED is transient
            # (immediately routes to SUSTAINING or DECAYING), so we don't
            # need a separate COMPLETED salience branch here.

            # --- Novelty ---
            if record.record_id not in transitioned_ids:
                # Stable state: exponential decay
                record.current_novelty = (
                    record.current_novelty * (1.0 - self.novelty_decay_rate)
                )
            # Transitioned records keep novelty = 1.0 (set in Step 0.1)

    @staticmethod
    def _turns_since_peak(
        record: ActionLifecycleRecord,
        current_turn: int,
    ) -> int:
        """
        Calculate turns elapsed since the action's peak salience moment.
        For cancelled actions, peak is the cancellation turn.
        For completed-then-decaying, peak is the completion turn.
        For actions that went through sustaining, peak is when sustaining ended
        (approximated as current_turn - turns at completion - turns_sustained).
        """
        if record.turn_cancelled is not None:
            return max(1, current_turn - record.turn_cancelled)
        if record.turn_completed is not None:
            # Account for any sustaining period
            peak_turn = record.turn_completed + record.turns_sustained
            return max(1, current_turn - peak_turn)
        # Fallback: decay from initiation
        return max(1, current_turn - record.turn_initiated)

    # -------------------------------------------------------------------
    # Step 0.3: Debit Sustaining Costs
    # -------------------------------------------------------------------

    @staticmethod
    def _debit_sustaining_costs(
        timeline: WorldStateTimeline,
        acting_actor_id: int,
        actor_self_profile: np.ndarray,
    ):
        """
        For each SUSTAINING record belonging to the acting actor,
        apply per-turn resource drain to the Self-Profile-Vector.

        sustaining_cost_vector is (NUM_IMPACT_DIMS, 1) covering Capability
        and Resolve. Uses IMPACT_TO_PROFILE_MAP to route cost debits to the
        correct Char indices in the full profile vector.

        Formula: New_SPV[profile_dim] = Current × (1 - cost[impact_dim])
        Clamped to [0, 1].

        Also increments turns_sustained counter.

        Spec reference: Section 3.2, Step 0.3.
        """
        sustaining_records = timeline.get_sustaining_records_for_actor(
            acting_actor_id
        )
        for record in sustaining_records:
            profile = record._temporal_profile
            if profile is not None:
                cost = profile.sustaining_cost_vector
                if np.any(cost > 0):
                    for impact_dim, profile_dim in _IMPACT_TO_PROFILE_MAP.items():
                        actor_self_profile[profile_dim, 0] = np.clip(
                            actor_self_profile[profile_dim, 0] * (1.0 - cost[impact_dim, 0]),
                            0.0, 1.0
                        )
            # Increment sustained turn counter
            record.turns_sustained += 1

    # -------------------------------------------------------------------
    # Step 0.4: Assemble and Order Observable Event Set
    # -------------------------------------------------------------------

    def _assemble_observable_events(
        self,
        timeline: WorldStateTimeline,
        observer_id: int,
    ) -> List[ObservableEvent]:
        """
        Assemble the observable event set for the acting actor and order it
        using the four-tier policy from the spec.

        Ordering:
          1. State-change events first (novelty = 1.0)
          2. Lifecycle priority: COMPLETED > IN_PROGRESS > SUSTAINING > DECAYING
          3. Effective signal strength: descending (salience × novelty)
          4. Tie-break: deterministic by record_id

        Spec reference: Section 3.2, Step 0.4.
        """
        observable_records = timeline.get_observable_records_for_actor(
            observer_id, self.perception_threshold
        )

        # Build ObservableEvent objects
        events = []
        for record in observable_records:
            profile = record._temporal_profile
            events.append(ObservableEvent(
                record_id=record.record_id,
                coa_id=record.coa_id,
                source_actor_id=record.actor_id,
                target_id=record.target_id,
                characteristics_vector=record.current_characteristics_vector.copy(),
                signal_salience=record.current_signal_salience,
                novelty=record.current_novelty,
                lifecycle_state=record.lifecycle_state,
                completion_proximity=record.completion_proximity,
                tangible_impact_mode=(
                    profile.tangible_impact_mode if profile else TANGIBLE_IMPACT_ON_COMPLETION
                ),
                relationship_update_mode=(
                    profile.relationship_update_mode if profile else RELATIONSHIP_UPDATE_ON_STATE_CHANGE
                ),
                in_progress_impact_fraction=(
                    profile.in_progress_impact_fraction if profile else 0.0
                ),
            ))

        # Sort using four-tier ordering
        events.sort(key=lambda e: self._event_sort_key(e))
        return events

    @staticmethod
    def _event_sort_key(event: ObservableEvent) -> tuple:
        """
        Generate a sort key implementing the four-tier ordering policy.
        Lower values sort first.

        Tier 1: State-change (novelty == 1.0) sorts before stable
        Tier 2: Lifecycle priority (COMPLETED=0 > IN_PROGRESS=1 > ...)
        Tier 3: Effective signal strength (descending, so negate)
        Tier 4: record_id (ascending, deterministic tie-break)
        """
        is_state_change = 0 if event.novelty >= 1.0 else 1
        lifecycle_priority = _LIFECYCLE_ORDER.get(event.lifecycle_state, 99)
        effective_strength = -(event.signal_salience * event.novelty)
        return (is_state_change, lifecycle_priority, effective_strength, event.record_id)


# ===========================================================================
# Stage 3 Decision Logic: Reviews, Modifiers, and Playbook Filtering
# ===========================================================================


# ---------------------------------------------------------------------------
# Sustaining Review
# ---------------------------------------------------------------------------

class SustainingReview:
    """
    Evaluates whether each SUSTAINING action should be maintained or withdrawn.

    Two pathways:
    - Descriptive: includes withdrawal reluctance (escalation-of-commitment bias)
    - Prescriptive: pure forward-looking marginal analysis

    Called at the start of Stage 3 (Assessment & Response) each turn for
    the acting actor's sustained actions. Uses the current turn's fresh
    discrepancy from Stage 2 and the Action-Utility-Matrix.

    Spec reference: DSM_Review_Relocation_and_Adjusted_Discrepancy_Spec_v0.1.
    """

    def __init__(self, temporal_params: Optional[dict] = None):
        p = temporal_params or {}
        self.sustaining_impact_factor = p.get(
            'sustaining_impact_factor', DEFAULT_SUSTAINING_IMPACT_FACTOR
        )
        self.sustaining_decay_exponent = p.get(
            'sustaining_decay_exponent', DEFAULT_SUSTAINING_DECAY_EXPONENT
        )
        self.withdrawal_reluctance_weight = p.get(
            'withdrawal_reluctance_weight', DEFAULT_WITHDRAWAL_RELUCTANCE_WEIGHT
        )
        self.max_sustaining_layers = p.get(
            'max_sustaining_layers', DEFAULT_MAX_SUSTAINING_LAYERS
        )
        # Scaling weight for sustaining cost in the benefit/cost comparison.
        # The sustaining cost (sum of per-dimension resource drains) and the
        # forward benefit (AUM × discrepancy × SIF × diminishing) can be on
        # different scales.  This weight scales the cost side to bring it into
        # the same magnitude as the benefit side, making the review's
        # sustain/withdraw decision sensitive to calibration.
        # Default 0.1: a sustaining cost sum of 1.0 contributes 0.1 to the
        # cost side, which is comparable to typical SIF-scaled benefit values.
        self.sustaining_cost_weight = p.get(
            'sustaining_cost_weight', 0.1
        )

    def _get_withdrawal_reluctance(self, actor_data: Optional[dict] = None) -> float:
        """
        Get effective withdrawal reluctance weight from actor data.
        Falls back to system default if actor_data not provided.
        """
        if actor_data is not None:
            return float(actor_data.get('Withdrawal-Reluctance-Weight', self.withdrawal_reluctance_weight))
        return self.withdrawal_reluctance_weight

    def review(
        self,
        timeline: WorldStateTimeline,
        actor_id: int,
        action_utility_matrix: np.ndarray,
        discrepancy_vector: np.ndarray,
        is_prescriptive: bool = False,
        actor_data: Optional[dict] = None,
        self_profile_vector: Optional[np.ndarray] = None,
        feasibility_gate_threshold: float = -0.1,
    ) -> List[ActionLifecycleRecord]:
        """
        Evaluate all SUSTAINING actions for the given actor.

        :param timeline: World State Timeline.
        :param actor_id: The actor whose sustaining actions to review.
        :param action_utility_matrix: (num_goals × num_actions) how actor's own
            actions affect own goals. Used to compute forward marginal benefit.
        :param discrepancy_vector: (num_goals × 1) current goal discrepancy.
        :param is_prescriptive: If True, use prescriptive pathway (no reluctance).
        :param actor_data: Actor profile dict. If provided, per-actor temporal
            params (e.g., Withdrawal-Reluctance-Weight) override system defaults.
        :param self_profile_vector: (num_chars × 1) actor resource profile
            (post-debit). If provided, enables feasibility gate on sustained
            actions — forced withdrawal when any dimension is depleted.
        :param feasibility_gate_threshold: Minimum per-dimension surplus allowed
            before an action is force-withdrawn (default: -0.1).
        :returns: List of records flagged for withdrawal.
        """
        withdrawal_reluctance = self._get_withdrawal_reluctance(actor_data)
        withdraw_list = []
        resource_forced_withdrawals = []
        sustaining_records = timeline.get_sustaining_records_for_actor(actor_id)

        for record in sustaining_records:
            profile = record._temporal_profile
            if profile is None:
                continue

            # Feasibility gate: check if actor can still afford sustaining cost
            # in every dimension. Forced immediate withdrawal if not.
            if self_profile_vector is not None:
                sustaining_cost = profile.sustaining_cost_vector
                num_dims = min(sustaining_cost.shape[0], self_profile_vector.shape[0])
                forced = False
                for dim_idx in range(num_dims):
                    dim_surplus = (
                        self_profile_vector[dim_idx, 0]
                        - sustaining_cost[dim_idx, 0]
                    )
                    if dim_surplus < feasibility_gate_threshold:
                        resource_forced_withdrawals.append({
                            'coa_id': record.coa_id,
                            'constraining_dimension': dim_idx,
                            'actor_level': float(self_profile_vector[dim_idx, 0]),
                            'sustaining_cost': float(sustaining_cost[dim_idx, 0]),
                            'deficit': float(dim_surplus),
                        })
                        withdraw_list.append(record)
                        forced = True
                        break
                if forced:
                    continue  # skip benefit-cost comparison

            # Forward marginal benefit: projected next-turn sustaining impact
            n = record.sustaining_layers_count
            if n >= self.max_sustaining_layers:
                # Hard ceiling reached — no further benefit
                forward_benefit = 0.0
            else:
                # Diminishing returns: impact_factor × (n+1)^(-decay_exponent)
                diminishing_factor = (n + 1) ** (-self.sustaining_decay_exponent)
                # Use the action's goal impact score against current discrepancy
                action_impact = self._compute_action_relevance(
                    record.coa_id, action_utility_matrix, discrepancy_vector
                )
                forward_benefit = (
                    action_impact * self.sustaining_impact_factor * diminishing_factor
                )
                # Add signal value: ongoing salience has strategic worth
                forward_benefit += record.current_signal_salience * 0.1

            # Forward marginal cost: sustaining cost magnitude, scaled by
            # sustaining_cost_weight to match the benefit scale.
            raw_cost = float(np.sum(profile.sustaining_cost_vector))
            forward_cost = raw_cost * self.sustaining_cost_weight

            if is_prescriptive:
                # Prescriptive: pure forward marginal
                if forward_benefit < forward_cost:
                    withdraw_list.append(record)
            else:
                # Descriptive: apply withdrawal reluctance
                # effective_withdrawal_cost = base × (1 + w × ln(turns_sustained + 1))
                effective_cost = forward_cost * (
                    1.0 + withdrawal_reluctance
                    * np.log(record.turns_sustained + 1)
                )
                if forward_benefit + effective_cost < forward_cost:
                    # Reluctance makes it harder to withdraw — benefit must
                    # exceed cost even with the reluctance "bonus" on the
                    # sustain side. Rearranged: sustain if
                    # benefit + reluctance_bonus > cost
                    # i.e., withdraw if benefit < cost - reluctance_bonus
                    # But spec says: sustain if benefit + reluctance > cost
                    # So withdraw if benefit + reluctance < cost
                    withdraw_list.append(record)

        # Store forced withdrawal diagnostics for analyst visibility
        if actor_data is not None:
            actor_data["Sustaining-Forced-Withdrawals"] = resource_forced_withdrawals

        return withdraw_list

    @staticmethod
    def execute_withdrawal(
        record: ActionLifecycleRecord,
        current_turn: int,
    ):
        """
        Execute withdrawal: transition SUSTAINING → DECAYING.
        Sets novelty to 1.0 (withdrawal is observable).
        """
        record.lifecycle_state = LS_DECAYING
        record.current_novelty = 1.0

    @staticmethod
    def _compute_action_relevance(
        coa_id: int,
        action_utility_matrix: np.ndarray,
        discrepancy_vector: np.ndarray,
    ) -> float:
        """
        Compute a scalar relevance score for an action against the current
        goal discrepancy. Uses the absolute discrepancy-weighted impact.

        :param action_utility_matrix: (num_goals × num_actions) how actor's
            own actions affect own goals.
        """
        if action_utility_matrix is None or discrepancy_vector is None:
            return 0.0
        num_actions = action_utility_matrix.shape[1]
        if coa_id >= num_actions:
            return 0.0
        action_impact = action_utility_matrix[:, coa_id].reshape(-1, 1)
        relevance = float(np.sum(np.abs(discrepancy_vector) * np.abs(action_impact)))
        return relevance


# ---------------------------------------------------------------------------
# In-Progress Continuation Review
# ---------------------------------------------------------------------------

class ContinuationReview:
    """
    Evaluates whether each IN_PROGRESS action should continue or be cancelled.

    Uses Projected Completion Impact (PCI) against the current Goal Ledger.
    Cancellation incurs sunk cost proportional to completion proximity.

    Two pathways:
    - Descriptive: includes continuation reluctance (sunk-cost bias near finish)
    - Prescriptive: pure forward-looking, sunk costs irrelevant

    Spec reference: Section 6.2.3.
    """

    def __init__(self, temporal_params: Optional[dict] = None):
        p = temporal_params or {}
        self.cancellation_reluctance_weight = p.get(
            'cancellation_reluctance_weight', DEFAULT_CANCELLATION_RELUCTANCE_WEIGHT
        )

    def _get_cancellation_reluctance(self, actor_data: Optional[dict] = None) -> float:
        """
        Get effective cancellation reluctance weight from actor data.
        Falls back to system default if actor_data not provided.
        """
        if actor_data is not None:
            return float(actor_data.get('Cancellation-Reluctance-Weight', self.cancellation_reluctance_weight))
        return self.cancellation_reluctance_weight

    def review(
        self,
        timeline: WorldStateTimeline,
        actor_id: int,
        current_turn: int,
        action_utility_matrix: np.ndarray,
        discrepancy_vector: np.ndarray,
        cost_vector: np.ndarray,
        is_prescriptive: bool = False,
        actor_data: Optional[dict] = None,
    ) -> List[ActionLifecycleRecord]:
        """
        Evaluate all IN_PROGRESS actions for the given actor.

        :param timeline: World State Timeline.
        :param actor_id: The actor whose in-progress actions to review.
        :param current_turn: Current simulation turn.
        :param action_utility_matrix: (num_goals × num_actions) how actor's own
            actions affect own goals. Used to compute projected completion impact.
        :param discrepancy_vector: (num_goals × 1) current goal discrepancy.
        :param cost_vector: (num_actions × 1) base action costs.
        :param is_prescriptive: If True, no sunk-cost bias.
        :param actor_data: Actor profile dict. If provided, per-actor temporal
            params (e.g., Cancellation-Reluctance-Weight) override system defaults.
        :returns: List of records flagged for cancellation.
        """
        cancellation_reluctance = self._get_cancellation_reluctance(actor_data)
        cancel_list = []
        in_progress_records = timeline.get_in_progress_records_for_actor(actor_id)

        # Normalize the cost vector to [0, 1] so that marginal-cost and
        # PCI-derived benefit are on comparable scales.  The Base-Cost-Vector
        # from MAGIC payloads can be on a 0–100 scale while PCI scores are
        # typically 0–2; without normalization, cost always dominates and
        # every in-progress action gets cancelled.
        if cost_vector is not None:
            max_cost = float(np.max(cost_vector))
            cost_scale = max_cost if max_cost > 1.0 else 1.0
        else:
            cost_scale = 1.0

        for record in in_progress_records:
            profile = record._temporal_profile
            if profile is None:
                continue

            # Ensure current turn is set for completion_proximity
            record._current_turn = current_turn
            cp = record.completion_proximity

            # --- Forward marginal benefit of completion ---
            # PCI re-evaluated against current discrepancy
            pci = SustainingReview._compute_action_relevance(
                record.coa_id, action_utility_matrix, discrepancy_vector
            )

            # Scale by completion proximity inverse: near-completion actions
            # deliver benefit in fewer remaining turns
            # Guard against division by zero at cp=1.0 (shouldn't happen for
            # IN_PROGRESS, but defensive)
            cp_clamped = min(cp, 0.99)
            continuation_benefit = pci * (1.0 / (1.0 - cp_clamped))

            # --- Cancellation cost ---
            # Sunk cost: resources already spent, non-recoverable
            base_cost = 0.0
            if cost_vector is not None and record.coa_id < len(cost_vector):
                base_cost = float(np.squeeze(cost_vector[record.coa_id])) / cost_scale
            sunk_cost = base_cost * profile.cancellation_cost_fraction * cp

            # Marginal cost of continued execution (remaining turns × per-turn cost)
            remaining_turns = record.turns_remaining
            marginal_execution_cost = base_cost * (remaining_turns / max(1, profile.execution_duration))

            if is_prescriptive:
                # Prescriptive: forward-looking only. Sunk cost irrelevant.
                # Cancel if the benefit of completion < cost of continued execution
                if continuation_benefit < marginal_execution_cost:
                    cancel_list.append(record)
            else:
                # Descriptive: apply continuation reluctance
                # Reluctance increases with completion proximity (the "almost there" effect)
                effective_cancellation_cost = sunk_cost * (
                    1.0 + cancellation_reluctance * cp
                )
                # Total cost to cancel = sunk cost (amplified by reluctance)
                # Actor sustains if benefit + reluctance cost > execution cost
                # i.e., cancels if benefit < execution cost - reluctance adjustment
                # Rearranged from spec: cancel if forward benefit < marginal cost
                # AND the reluctance doesn't override
                if continuation_benefit < marginal_execution_cost - effective_cancellation_cost:
                    cancel_list.append(record)

        return cancel_list

    @staticmethod
    def execute_cancellation(
        record: ActionLifecycleRecord,
        current_turn: int,
    ):
        """
        Execute cancellation: transition IN_PROGRESS → DECAYING.

        Effects:
        1. State → DECAYING, turn_cancelled set, novelty reset to 1.0
        2. No completion-phase goal impact (goal_impact_applied_on_turn stays None)
        3. Any in_progress_impact_fraction effects cease
        4. Cancellation signal enters observable event set next turn

        Spec reference: Section 6.2.3, Cancellation execution.
        """
        record.lifecycle_state = LS_DECAYING
        record.turn_cancelled = current_turn
        record.current_novelty = 1.0
        # goal_impact_applied_on_turn remains None — no completion impact


# ---------------------------------------------------------------------------
# Temporal Benefit Modifiers (Stage 3.B adjustments)
# ---------------------------------------------------------------------------

def compute_temporal_benefit_modifier(
    execution_duration: int,
    temporal_discount_rate: float = DEFAULT_TEMPORAL_DISCOUNT_RATE,
) -> float:
    """
    Discount factor for actions with delayed benefit due to execution duration.

    Formula: 1.0 / (1.0 + temporal_discount_rate × execution_duration)

    Instantaneous actions (duration=0) get modifier = 1.0 (no discount).
    A 4-turn action at rate 0.1 gets modifier ≈ 0.71.

    Spec reference: Section 6.3.2.
    """
    return 1.0 / (1.0 + temporal_discount_rate * execution_duration)


def compute_sustained_benefit_bonus(
    base_benefit: float,
    sustaining_impact_factor: float = DEFAULT_SUSTAINING_IMPACT_FACTOR,
    sustaining_decay_exponent: float = DEFAULT_SUSTAINING_DECAY_EXPONENT,
    discount_factor: float = 0.9,
    effective_horizon: int = 10,
) -> float:
    """
    Bonus benefit for actions that will produce sustained effects after completion.

    Formula: Sum over k=1..H of:
        sustaining_impact_factor × (k+1)^(-decay_exponent) × benefit × delta^k

    Captures the forward-looking value of sustained strategic effects,
    discounted by the actor's time preference.

    Spec reference: Section 6.3.3.
    """
    bonus = 0.0
    for k in range(1, effective_horizon + 1):
        diminishing = sustaining_impact_factor * ((k + 1) ** (-sustaining_decay_exponent))
        discounted = diminishing * base_benefit * (discount_factor ** k)
        bonus += discounted
    return bonus


def compute_temporal_cost_projection(
    immediate_cost: float,
    sustaining_cost_magnitude: float,
    discount_factor: float = 0.9,
    effective_horizon: int = 10,
) -> float:
    """
    Total projected cost including future sustaining costs.

    Formula: Immediate_Cost + Sum over k=1..H of:
        sustaining_cost_magnitude × delta^k

    Spec reference: Section 6.4.
    """
    projected = immediate_cost
    for k in range(1, effective_horizon + 1):
        projected += sustaining_cost_magnitude * (discount_factor ** k)
    return projected


# ---------------------------------------------------------------------------
# Temporal Planning Heuristic
# ---------------------------------------------------------------------------

class TemporalPlanningHeuristic:
    """
    Provides forward-looking initiation-timing intelligence based on
    Goal Ledger trajectory projection.

    The heuristic projects future goal ledger state using recent velocity
    and provides an anticipatory bonus for actions that address projected
    problems — offset by duration damping for long-duration actions where
    the projection is less reliable.

    Spec reference: Section 6.5.
    """

    def __init__(self, temporal_params: Optional[dict] = None):
        p = temporal_params or {}
        self.anticipatory_weight = min(
            p.get('anticipatory_weight', DEFAULT_ANTICIPATORY_WEIGHT),
            0.3  # Hard cap per spec Section 6.5.3
        )
        self.duration_damping_rate = p.get(
            'duration_damping_rate', DEFAULT_DURATION_DAMPING_RATE
        )
        self.ledger_lookback = p.get(
            'ledger_lookback', DEFAULT_LEDGER_LOOKBACK
        )

    def _get_anticipatory_weight(self, actor_data: Optional[dict] = None) -> float:
        """
        Get effective anticipatory weight from actor data.
        Falls back to system default if actor_data not provided.
        Hard cap at 0.3 per spec Section 6.5.3.
        """
        if actor_data is not None:
            return min(float(actor_data.get('Anticipatory-Weight', self.anticipatory_weight)), 0.3)
        return self.anticipatory_weight

    def compute_ledger_velocity(
        self,
        goal_ledger_history: List[np.ndarray],
    ) -> np.ndarray:
        """
        Average per-turn Goal Ledger change over the lookback window.

        :param goal_ledger_history: List of Goal Ledger snapshots, most recent last.
            Each element is (num_goals × 1) ndarray.
        :returns: (num_goals × 1) velocity vector.

        Spec reference: Section 6.5.1.
        """
        if len(goal_ledger_history) < 2:
            return np.zeros_like(goal_ledger_history[0]) if goal_ledger_history else np.zeros((1, 1))

        # Use up to ledger_lookback turns of history
        window = goal_ledger_history[-min(len(goal_ledger_history), self.ledger_lookback + 1):]
        if len(window) < 2:
            return np.zeros_like(window[0])

        total_change = window[-1] - window[0]
        num_turns = len(window) - 1
        return total_change / num_turns

    def compute_anticipatory_bonus(
        self,
        base_benefit: float,
        execution_duration: int,
        current_problem_score: float,
        ledger_velocity: np.ndarray,
        goal_weights: np.ndarray,
        actor_data: Optional[dict] = None,
    ) -> float:
        """
        Anticipatory initiation bonus for a single action.

        Positive only when trajectory projects worsening conditions.
        Damped by execution duration (long projections are unreliable).

        Formula:
            max(0, Projected_Problem − Current_Problem)
            × anticipatory_weight × benefit × Duration_Damping(duration)

        :param actor_data: Actor profile dict. If provided, per-actor
            Anticipatory-Weight overrides system default.

        Spec reference: Section 6.5.2.
        """
        if execution_duration <= 0:
            return 0.0

        anticipatory_weight = self._get_anticipatory_weight(actor_data)

        # Project problem score at completion
        # Problem score is sum of weighted absolute discrepancies
        projected_delta = float(np.sum(np.abs(ledger_velocity * goal_weights))) * execution_duration
        projected_problem = current_problem_score + projected_delta

        worsening = max(0.0, projected_problem - current_problem_score)
        if worsening <= 0:
            return 0.0

        duration_damping = self._duration_damping(execution_duration)
        return worsening * anticipatory_weight * base_benefit * duration_damping

    def _duration_damping(self, execution_duration: int) -> float:
        """
        Damping factor reducing anticipatory bonus for long-duration actions.

        Formula: 1.0 / (1.0 + duration_damping_rate × duration)

        Spec reference: Section 6.5.2.
        """
        return 1.0 / (1.0 + self.duration_damping_rate * execution_duration)


# ---------------------------------------------------------------------------
# Playbook Filtering
# ---------------------------------------------------------------------------

def filter_playbook_for_temporal(
    available_playbook: np.ndarray,
    timeline: WorldStateTimeline,
    actor_id: int,
    action_type_vector: np.ndarray,
    toggle_pair_map: Optional[dict] = None,
    enums: Optional[dict] = None,
) -> np.ndarray:
    """
    Filter the available playbook based on temporal state.

    Rules:
    - IN_PROGRESS actions are excluded (cannot re-initiate during execution)
    - SUSTAINING actions are excluded EXCEPT:
      - Toggle actions: the withdrawal toggle remains available
    - INITIATED actions are excluded (transient, but defensive)

    :param available_playbook: (num_actions × 1) binary availability vector.
    :param timeline: World State Timeline.
    :param actor_id: The acting actor.
    :param action_type_vector: (num_actions × 1) ActionType enum values.
    :param toggle_pair_map: Dict mapping action_id -> toggle_pair_id.
    :param enums: Enum dict for ActionType lookups.
    :returns: Modified copy of available_playbook with temporal exclusions.

    Spec reference: Section 6.3.1.
    """
    filtered = available_playbook.copy()
    toggle_type = enums['ActionType']['Toggle'] if enums else 2

    active_records = timeline.get_records_by_actor(actor_id)
    for record in active_records:
        if record.lifecycle_state in (LS_INITIATED, LS_IN_PROGRESS):
            # Cannot re-initiate an action that's already executing
            if record.coa_id < len(filtered):
                filtered[record.coa_id] = 0

        elif record.lifecycle_state == LS_SUSTAINING:
            # Sustaining actions excluded from normal selection
            if record.coa_id < len(filtered):
                filtered[record.coa_id] = 0

            # But toggle withdrawal remains available
            if (toggle_pair_map is not None
                    and action_type_vector is not None
                    and record.coa_id < len(action_type_vector)):
                if int(np.squeeze(action_type_vector[record.coa_id])) == toggle_type:
                    pair_id = toggle_pair_map.get(str(record.coa_id))
                    if pair_id is not None and int(pair_id) < len(filtered):
                        filtered[int(pair_id)] = 1

    return filtered


def screen_prerequisites(
    available_playbook: np.ndarray,
    timeline: 'WorldStateTimeline',
    actor_id: int,
    temporal_profiles: Dict[int, ActionTemporalProfile],
) -> np.ndarray:
    """
    Screen the available playbook for unmet temporal prerequisites.

    For each action with a ``prerequisites`` list in its temporal profile,
    verify that every required action has been executed by this actor and
    has reached (at minimum) the specified lifecycle state.  The check
    uses ``>=`` so that a SUSTAINING action (state 3) satisfies a
    COMPLETED (state 2) prerequisite — this is intentional, since
    sustaining implies completion.

    Actions whose prerequisites are not fully met are zeroed out in the
    returned playbook.  Actions without prerequisites are unaffected.

    :param available_playbook: (num_actions,) or (num_actions, 1) availability vector.
    :param timeline: World State Timeline with lifecycle records.
    :param actor_id: The acting actor.
    :param temporal_profiles: Dict mapping coa_id -> ActionTemporalProfile.
    :returns: Modified copy of available_playbook with prerequisite-blocked
              actions zeroed out.
    """
    filtered = available_playbook.copy()

    for coa_id, profile in temporal_profiles.items():
        if profile.prerequisites is None:
            continue
        if coa_id >= len(filtered):
            continue
        if filtered[coa_id] == 0:
            continue  # already excluded by prior filtering

        # Check each prerequisite binding
        for prereq in profile.prerequisites:
            # Search actor's records for the required action at the required state
            satisfied = False
            for record in timeline.get_records_by_actor(actor_id):
                if (record.coa_id == prereq.required_coa_id
                        and record.lifecycle_state >= prereq.required_state):
                    satisfied = True
                    break
            if not satisfied:
                filtered[coa_id] = 0
                break  # one unmet prerequisite is enough to block

    return filtered


# ---------------------------------------------------------------------------
# Diminishing Returns Utility (shared by sustaining impact and tangible impact)
# ---------------------------------------------------------------------------

def diminishing_returns(
    base_value: float,
    n: int,
    sustaining_impact_factor: float = DEFAULT_SUSTAINING_IMPACT_FACTOR,
    decay_exponent: float = DEFAULT_SUSTAINING_DECAY_EXPONENT,
) -> float:
    """
    Compute the diminishing-returns impact for the nth sustaining turn.

    Formula: base_value × sustaining_impact_factor × (n + 1)^(-decay_exponent)

    Used for both goal impact (Section 5.2) and tangible impact (Section 5.3)
    during the SUSTAINING phase.

    :param base_value: The full (completion-phase) impact magnitude.
    :param n: Number of sustaining layers already applied (0-indexed).
    :param sustaining_impact_factor: Base fraction of original impact.
    :param decay_exponent: Power-law decay exponent.
    :returns: Diminished impact for this turn.
    """
    return base_value * sustaining_impact_factor * ((n + 1) ** (-decay_exponent))
