"""
Commitment Register for the DSM (Deterrence Signaling Model).

Implements the Commitment Dynamics and Portfolio-Aware Utility specified in
DSM_Commitment_and_Portfolio_Utility_Spec_v0.2.2. Tracks both implicit
commitments (trajectory pressure from any action) and explicit commitments
(speech acts with trigger conditions and committed responses).

This module contains:
- CommitmentRecord: Unified record for explicit and implicit commitments
- SupportSetEntry / CostSetEntry: Authored strategic relationships between actions
- CommitmentRegister: Per-actor persistent container with lifecycle management
- PAPTState: Perceived Adversary Posture Trend tracking state

Phase 1: Data structures, enums, scenario ingestion, serialization.
Subsequent phases add mechanics (decay, landscape, screening, triggers, etc.).
"""

import math
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple
from enums import (
    CommitmentType as _CommitmentTypeEnum,
    CommitmentTriggerStatus as _CommitmentTriggerStatusEnum,
    ImplicitCommitmentStatus as _ImplicitCommitmentStatusEnum,
    PenaltyType as _PenaltyTypeEnum,
    LifecycleBinding as _LifecycleBindingEnum,
)
from temporal import LS_IN_PROGRESS, LS_SUSTAINING, LS_DECAYING, LS_EXPIRED
from data_classes import EXOGENOUS_ACTOR_ID


# ---------------------------------------------------------------------------
# Named constants for enum integer values.
# Used in comparisons throughout the module per GM's convention:
# never compare against bare integers in application code.
# ---------------------------------------------------------------------------

# CommitmentType
CT_IMPLICIT = 0
CT_THREAT = 1
CT_PROMISE = 2
CT_PROPOSAL = 3
CT_REDLINE = 4
CT_ULTIMATUM = 5

# CommitmentTriggerStatus (explicit commitments)
CTS_UNTRIGGERED = 0
CTS_TRIGGERED = 1
CTS_FULFILLED = 2
CTS_VIOLATED = 3
CTS_EXPIRED = 4
CTS_WITHDRAWN = 5
CTS_PENDING_RESPONSE = 6
CTS_REJECTED = 7
CTS_COMPLIED = 8

# ImplicitCommitmentStatus
ICS_ACTIVE = 0
ICS_DECAYING = 1
ICS_EXPIRED = 2

# PenaltyType
PT_REDUNDANCY = 0
PT_CONTRADICTION = 1
PT_INCOHERENCE = 2

# LifecycleBinding
LB_ACTIVE_ONLY = 0
LB_PERSISTENT = 1


# ---------------------------------------------------------------------------
# Default simulation parameters for the commitment layer.
# All overridable via simulation_parameters at init time.
# ---------------------------------------------------------------------------

DEFAULT_INFLUENCE_BASE = 0.1
DEFAULT_INFLUENCE_CLARITY_WEIGHT = 0.4
DEFAULT_INFLUENCE_IRREVERSIBILITY_WEIGHT = 0.4
DEFAULT_COMMITMENT_DECAY_EXPONENT = 0.5
DEFAULT_COMMITMENT_EXPIRY_THRESHOLD = 0.05
DEFAULT_SUPPORT_BONUS_WEIGHT = 1.0
DEFAULT_COST_PENALTY_WEIGHT = 1.0
DEFAULT_HARD_CONSTRAINT_THRESHOLD = 0.3
DEFAULT_RECONSIDERATION_LEDGER_THRESHOLD = 0.2
DEFAULT_RECONSIDERATION_COMMITMENT_THRESHOLD = 0.15
DEFAULT_RECONSIDERATION_DAMPENING_FACTOR = 0.5
DEFAULT_SUNK_COST_BIAS = 0.3
DEFAULT_STATUS_QUO_BIAS = 0.15
DEFAULT_FULFILLMENT_BONUS_WEIGHT = 1.0
DEFAULT_CREDIBILITY_COST_WEIGHT = 1.0
DEFAULT_FULFILLMENT_CREDIBILITY_BOOST = 0.1
DEFAULT_WITHDRAWAL_COST_FRACTION = 0.4
DEFAULT_PROPOSAL_EXPIRY_DEFAULT = 3
DEFAULT_COALITION_SUPPORT_LOW_THRESHOLD = 0.3
DEFAULT_EXPLICIT_VIOLATION_THRESHOLD = 0.5
DEFAULT_POSTURE_SMOOTHING_WEIGHT = 0.4
DEFAULT_POSTURE_CLARITY_WEIGHT = 0.6
DEFAULT_POSTURE_IRREVERSIBILITY_WEIGHT = 0.4
DEFAULT_VISIBILITY_FLOOR = 0.2
DEFAULT_POSTURE_TREND_SMOOTHING = 0.5
DEFAULT_TREND_CONFIDENCE_SCALING = 2.0
DEFAULT_RECIPROCITY_SENSITIVITY = 1.5
DEFAULT_RECIPROCITY_FLOOR = 0.3
DEFAULT_POSTURE_TREND_REVERSAL_THRESHOLD = 0.15
DEFAULT_POSTURE_TREND_CONFIDENCE_THRESHOLD = 0.3
DEFAULT_ACCEPTANCE_CREDIBILITY_BOOST = 0.15
DEFAULT_REJECTION_RESOLVE_BOOST = 0.1
DEFAULT_COMPLIANCE_CREDIBILITY_BOOST = 0.7


# ---------------------------------------------------------------------------
# String-to-enum mapping tables for scenario JSON ingestion.
# Accept both PascalCase enum names and lowercase/snake_case identifiers.
# ---------------------------------------------------------------------------

COMMITMENT_TYPE_MAP = {
    "implicit": CT_IMPLICIT,
    "threat": CT_THREAT,
    "promise": CT_PROMISE,
    "proposal": CT_PROPOSAL,
    "redline": CT_REDLINE,
    "ultimatum": CT_ULTIMATUM,
    # MAGIC vocabulary aliases — MAGIC agents emit richer commitment type
    # labels that map to the DPM's canonical enum values.  Adding them here
    # (rather than in an external shim) lets the engine accept raw MAGIC
    # exports without manual preprocessing.
    "self_binding_declaration": CT_PROMISE,
    "private_warning": CT_THREAT,
    "allied_commitment": CT_PROMISE,
    "conditional_threat": CT_THREAT,
    "declaratory_limit": CT_REDLINE,
    "compellent_demand": CT_ULTIMATUM,
    "collective_defense": CT_REDLINE,
    "economic_opening": CT_PROPOSAL,
    "tiered_sanctions": CT_THREAT,
    "operational_pause": CT_PROPOSAL,
    "off_ramp": CT_PROPOSAL,
    "coalition_solidarity": CT_PROPOSAL,
}

PENALTY_TYPE_MAP = {
    "redundancy": PT_REDUNDANCY,
    "contradiction": PT_CONTRADICTION,
    "incoherence": PT_INCOHERENCE,
}

LIFECYCLE_BINDING_MAP = {
    "active_only": LB_ACTIVE_ONLY,
    "activeonly": LB_ACTIVE_ONLY,
    "persistent": LB_PERSISTENT,
}


def _resolve_enum_value(raw_value, mapping: dict, enum_name: str) -> int:
    """
    Resolve a raw value (string or int) to an integer enum value.
    Accepts both string names (case-insensitive) and integer values.
    """
    if isinstance(raw_value, int):
        return raw_value
    if isinstance(raw_value, str):
        key = raw_value.lower().replace("-", "_").replace(" ", "_")
        if key in mapping:
            return mapping[key]
        # Try PascalCase direct match
        for name, val in mapping.items():
            if name.lower() == key:
                return val
    raise ValueError(
        f"Invalid {enum_name} value: {raw_value!r}. "
        f"Valid values: {list(mapping.keys())} or their integer equivalents."
    )


# ---------------------------------------------------------------------------
# Data Structure: Support/Cost Set Entries
# ---------------------------------------------------------------------------

@dataclass
class SupportSetEntry:
    """
    A single support relationship between two actions.
    When source_coa_id's implicit commitment is active, supported_coa_id
    receives a positive bonus in the commitment landscape.

    Spec reference: Section 2.3, Support Set Entry table.
    """
    source_coa_id: int
    supported_coa_id: int
    bonus_strength: float  # [0, 1]
    rationale: str = ""

    def to_dict(self) -> dict:
        return {
            "source_coa_id": self.source_coa_id,
            "supported_coa_id": self.supported_coa_id,
            "bonus_strength": self.bonus_strength,
            "rationale": self.rationale,
        }

    @staticmethod
    def from_dict(d: dict) -> "SupportSetEntry":
        return SupportSetEntry(
            source_coa_id=int(d["source_coa_id"]),
            supported_coa_id=int(d["supported_coa_id"]),
            bonus_strength=float(d["bonus_strength"]),
            rationale=str(d.get("rationale", "")),
        )


@dataclass
class CostSetEntry:
    """
    A single cost/penalty relationship between two actions.
    When source_coa_id's implicit commitment is active, penalized_coa_id
    receives a negative penalty in the commitment landscape.

    Spec reference: Section 2.3, Cost Set Entry table.
    """
    source_coa_id: int
    penalized_coa_id: int
    penalty_strength: float  # [0, 1]
    penalty_type: int  # PenaltyType enum value
    is_hard_constraint: bool = False
    rationale: str = ""

    def to_dict(self) -> dict:
        return {
            "source_coa_id": self.source_coa_id,
            "penalized_coa_id": self.penalized_coa_id,
            "penalty_strength": self.penalty_strength,
            "penalty_type": self.penalty_type,
            "is_hard_constraint": self.is_hard_constraint,
            "rationale": self.rationale,
        }

    @staticmethod
    def from_dict(d: dict) -> "CostSetEntry":
        raw_pt = d.get("penalty_type", PT_REDUNDANCY)
        penalty_type = _resolve_enum_value(raw_pt, PENALTY_TYPE_MAP, "PenaltyType")
        return CostSetEntry(
            source_coa_id=int(d["source_coa_id"]),
            penalized_coa_id=int(d["penalized_coa_id"]),
            penalty_strength=float(d["penalty_strength"]),
            penalty_type=penalty_type,
            is_hard_constraint=bool(d.get("is_hard_constraint", False)),
            rationale=str(d.get("rationale", "")),
        )


# ---------------------------------------------------------------------------
# Data Structure: Trigger Condition (for explicit commitments)
# ---------------------------------------------------------------------------

@dataclass
class TriggerCondition:
    """
    Defines when an explicit commitment activates.
    Evaluated against perceived (post-Stage-1) action characteristics.

    Spec reference: Section 2.1, trigger_condition field.
    """
    domain: str = ""  # Domain ID (e.g., "Military", "Economic")
    characteristic: str = ""  # Characteristic name from Char enum
    operator: str = ">"  # Comparison operator: ">", "<", ">=", "<=", "=="
    threshold: float = 0.0
    source: str = "adversary"  # "adversary" or "any"

    def to_dict(self) -> dict:
        return {
            "domain": self.domain,
            "characteristic": self.characteristic,
            "operator": self.operator,
            "threshold": self.threshold,
            "source": self.source,
        }

    @staticmethod
    def from_dict(d: dict) -> "TriggerCondition":
        if d is None:
            return TriggerCondition()
        return TriggerCondition(
            domain=str(d.get("domain", "")),
            characteristic=str(d.get("characteristic", "")),
            operator=str(d.get("operator", ">")),
            threshold=float(d.get("threshold", 0.0)),
            source=str(d.get("source", "adversary")),
        )


# ---------------------------------------------------------------------------
# Data Structure: Commitment-Creating Action Metadata
# ---------------------------------------------------------------------------

@dataclass
class CommitmentCreatingActionMeta:
    """
    Metadata attached to actions in the COA Playbook that create explicit
    commitment records when taken.

    Spec reference: Section 2.2, Commitment-Creating Actions table.
    """
    coa_id: int
    is_commitment_creating: bool = False
    commitment_type: int = CT_THREAT  # CommitmentType enum value
    trigger_template: TriggerCondition = field(
        default_factory=TriggerCondition
    )
    response_template: str = ""  # COA ID, COA class, or string reference
    default_expiry: int = -1  # -1 = persists indefinitely
    proposal_type: str = ""  # For proposals: type identifier for matching responses
    compliance_actions: List[int] = field(default_factory=list)  # Ultimatums: adversary COA IDs that satisfy the demand

    def to_dict(self) -> dict:
        return {
            "coa_id": self.coa_id,
            "is_commitment_creating": self.is_commitment_creating,
            "commitment_type": self.commitment_type,
            "trigger_template": self.trigger_template.to_dict(),
            "response_template": self.response_template,
            "default_expiry": self.default_expiry,
            "proposal_type": self.proposal_type,
            "compliance_actions": self.compliance_actions,
        }

    @staticmethod
    def from_dict(d: dict) -> "CommitmentCreatingActionMeta":
        raw_ct = d.get("commitment_type", CT_THREAT)
        commitment_type = _resolve_enum_value(
            raw_ct, COMMITMENT_TYPE_MAP, "CommitmentType"
        )
        raw_compliance = d.get("compliance_actions", [])
        compliance_actions = [int(x) for x in raw_compliance] if raw_compliance else []
        return CommitmentCreatingActionMeta(
            coa_id=int(d["coa_id"]),
            is_commitment_creating=bool(d.get("is_commitment_creating", True)),
            commitment_type=commitment_type,
            trigger_template=TriggerCondition.from_dict(
                d.get("trigger_template", None)
            ),
            response_template=str(d.get("response_template", "")),
            default_expiry=int(d.get("default_expiry", -1)),
            proposal_type=str(d.get("proposal_type", "")),
            compliance_actions=compliance_actions,
        )


# ---------------------------------------------------------------------------
# Data Structure: Proposal Response Action Metadata
# ---------------------------------------------------------------------------

@dataclass
class ProposalResponseActionMeta:
    """
    Metadata for pre-authored Accept/Reject actions in the COA Playbook.

    These actions are normally ineligible. When a pending proposal of a
    matching proposal_type exists, the DPM activates them in the
    Current-Available-Playbook for the responding actor's turn only.

    Action generation is MAGIC's responsibility. The DPM handles:
    - Eligibility gating (activate when matching proposal is pending)
    - Commitment record mechanics (mutual promises on acceptance)

    Spec reference: Section 4.3 (revised: MAGIC-owned action generation).
    """
    coa_id: int
    proposal_type: str = ""  # Matches proposal's proposal_type (e.g., "ceasefire")
    response_type: str = "accept"  # "accept" or "reject"
    # For accept actions: the mutual commitment terms both parties take on.
    # Each TriggerCondition defines when the agreement is violated.
    mutual_trigger_template: TriggerCondition = field(
        default_factory=TriggerCondition
    )
    mutual_commitment_expiry: int = -1  # -1 = persists indefinitely
    # Credibility/audience cost parameters for the mutual promise commitments
    mutual_credibility_stake: float = 0.5
    mutual_audience_cost_exposure: float = 0.5

    def to_dict(self) -> dict:
        return {
            "coa_id": self.coa_id,
            "proposal_type": self.proposal_type,
            "response_type": self.response_type,
            "mutual_trigger_template": self.mutual_trigger_template.to_dict(),
            "mutual_commitment_expiry": self.mutual_commitment_expiry,
            "mutual_credibility_stake": self.mutual_credibility_stake,
            "mutual_audience_cost_exposure": self.mutual_audience_cost_exposure,
        }

    @staticmethod
    def from_dict(d: dict) -> "ProposalResponseActionMeta":
        return ProposalResponseActionMeta(
            coa_id=int(d["coa_id"]),
            proposal_type=str(d.get("proposal_type", "")),
            response_type=str(d.get("response_type", "accept")).lower(),
            mutual_trigger_template=TriggerCondition.from_dict(
                d.get("mutual_trigger_template", None)
            ),
            mutual_commitment_expiry=int(
                d.get("mutual_commitment_expiry", -1)
            ),
            mutual_credibility_stake=float(
                d.get("mutual_credibility_stake", 0.5)
            ),
            mutual_audience_cost_exposure=float(
                d.get("mutual_audience_cost_exposure", 0.5)
            ),
        )


# ---------------------------------------------------------------------------
# Data Structure: Commitment Record (Unified)
# ---------------------------------------------------------------------------

@dataclass
class CommitmentRecord:
    """
    A single entry in the Commitment Register. Stores both explicit and
    implicit commitment records using a shared schema.

    Fields marked [explicit only] or [implicit only] are populated only
    for their respective type; others hold defaults.

    Spec reference: Section 2.1, Commitment Record Schema table.
    """
    # --- Shared fields ---
    commitment_id: int
    committing_actor: int  # Actor ID
    commitment_type: int  # CommitmentType enum value
    source_coa_id: int  # The action that created this commitment
    source_action_record_id: int = -1  # Link to WorldStateTimeline record
    turn_created: int = 0
    turn_resolved: int = -1  # -1 = unresolved

    # --- Explicit commitment fields ---
    trigger_condition: TriggerCondition = field(
        default_factory=TriggerCondition
    )
    committed_response: str = ""  # COA ID or COA Class reference
    expiry_turns: int = -1  # -1 = persists indefinitely
    audience_cost_exposure: float = 0.0  # [0, 1], from Clarity
    credibility_stake: float = 0.0  # [0, 1], from Credibility Stake char
    coalition_alignment_at_creation: float = 0.0
    trigger_status: int = CTS_UNTRIGGERED  # CommitmentTriggerStatus enum
    turn_triggered: int = -1  # -1 = not yet triggered
    proposal_type: str = ""  # For proposals: type identifier for matching responses
    compliance_actions: List[int] = field(default_factory=list)  # Ultimatums: adversary COA IDs that satisfy the demand

    # --- Implicit commitment fields ---
    influence_weight: float = 0.0  # Current influence [0, 1]
    initial_influence: float = 0.0  # Influence at creation (for decay calc)
    lifecycle_binding: int = LB_ACTIVE_ONLY  # LifecycleBinding enum
    implicit_status: int = ICS_ACTIVE  # ImplicitCommitmentStatus enum
    turn_decay_started: int = -1  # -1 = not yet decaying

    def is_implicit(self) -> bool:
        """Whether this is an implicit commitment record."""
        return self.commitment_type == CT_IMPLICIT

    def is_explicit(self) -> bool:
        """Whether this is an explicit commitment record."""
        return self.commitment_type != CT_IMPLICIT

    def is_active(self) -> bool:
        """Whether this commitment is still active (not resolved/expired)."""
        if self.is_implicit():
            return self.implicit_status != ICS_EXPIRED
        else:
            return self.trigger_status not in (
                CTS_FULFILLED, CTS_VIOLATED, CTS_EXPIRED, CTS_WITHDRAWN,
                CTS_REJECTED, CTS_COMPLIED,
            )

    def is_triggered(self) -> bool:
        """Whether this explicit commitment has been triggered."""
        return self.is_explicit() and self.trigger_status == CTS_TRIGGERED

    def to_dict(self) -> dict:
        """Serialize to a plain dict for persistence."""
        return {
            "commitment_id": self.commitment_id,
            "committing_actor": self.committing_actor,
            "commitment_type": self.commitment_type,
            "source_coa_id": self.source_coa_id,
            "source_action_record_id": self.source_action_record_id,
            "turn_created": self.turn_created,
            "turn_resolved": self.turn_resolved,
            "trigger_condition": self.trigger_condition.to_dict(),
            "committed_response": self.committed_response,
            "expiry_turns": self.expiry_turns,
            "audience_cost_exposure": self.audience_cost_exposure,
            "credibility_stake": self.credibility_stake,
            "coalition_alignment_at_creation": self.coalition_alignment_at_creation,
            "trigger_status": self.trigger_status,
            "turn_triggered": self.turn_triggered,
            "proposal_type": self.proposal_type,
            "compliance_actions": self.compliance_actions,
            "influence_weight": self.influence_weight,
            "initial_influence": self.initial_influence,
            "lifecycle_binding": self.lifecycle_binding,
            "implicit_status": self.implicit_status,
            "turn_decay_started": self.turn_decay_started,
        }

    @staticmethod
    def from_dict(d: dict) -> "CommitmentRecord":
        """Deserialize from a plain dict."""
        return CommitmentRecord(
            commitment_id=int(d["commitment_id"]),
            committing_actor=int(d["committing_actor"]),
            commitment_type=int(d["commitment_type"]),
            source_coa_id=int(d["source_coa_id"]),
            source_action_record_id=int(d.get("source_action_record_id", -1)),
            turn_created=int(d.get("turn_created", 0)),
            turn_resolved=int(d.get("turn_resolved", -1)),
            trigger_condition=TriggerCondition.from_dict(
                d.get("trigger_condition", None)
            ),
            committed_response=str(d.get("committed_response", "")),
            expiry_turns=int(d.get("expiry_turns", -1)),
            audience_cost_exposure=float(d.get("audience_cost_exposure", 0.0)),
            credibility_stake=float(d.get("credibility_stake", 0.0)),
            coalition_alignment_at_creation=float(
                d.get("coalition_alignment_at_creation", 0.0)
            ),
            trigger_status=int(d.get("trigger_status", CTS_UNTRIGGERED)),
            turn_triggered=int(d.get("turn_triggered", -1)),
            proposal_type=str(d.get("proposal_type", "")),
            compliance_actions=[int(x) for x in d.get("compliance_actions", [])],
            influence_weight=float(d.get("influence_weight", 0.0)),
            initial_influence=float(d.get("initial_influence", 0.0)),
            lifecycle_binding=int(d.get("lifecycle_binding", LB_ACTIVE_ONLY)),
            implicit_status=int(d.get("implicit_status", ICS_ACTIVE)),
            turn_decay_started=int(d.get("turn_decay_started", -1)),
        )


# ---------------------------------------------------------------------------
# Data Structure: PAPT State
# ---------------------------------------------------------------------------

@dataclass
class PAPTState:
    """
    Perceived Adversary Posture Trend state.
    Maintained per actor, updated post-Stage-1 each turn.

    Tracks the direction and rate of change in the adversary's recent
    action severity as perceived by this actor.

    Spec reference: Section 9.2.1.
    """
    posture_trend: float = 0.0  # [-1, 1]; positive = escalating
    severity_running_average: float = 0.5  # Neutral initial
    trend_confidence: float = 0.0  # [0, 1]

    def to_dict(self) -> dict:
        return {
            "posture_trend": self.posture_trend,
            "severity_running_average": self.severity_running_average,
            "trend_confidence": self.trend_confidence,
        }

    @staticmethod
    def from_dict(d: dict) -> "PAPTState":
        if d is None:
            return PAPTState()
        return PAPTState(
            posture_trend=float(d.get("posture_trend", 0.0)),
            severity_running_average=float(
                d.get("severity_running_average", 0.5)
            ),
            trend_confidence=float(d.get("trend_confidence", 0.0)),
        )


# ---------------------------------------------------------------------------
# PAPT Computer: Perceived Adversary Posture Trend
# ---------------------------------------------------------------------------

class PAPTComputer:
    """
    Computes the Perceived Adversary Posture Trend (PAPT) update each turn.

    The PAPT tracks the direction and rate of change in the adversary's
    recent action severity as perceived by the actor. It answers:
    "Is the adversary ratcheting up or easing off?"

    Called post-Stage-1 in the event pipeline, after perception is complete.

    Spec reference: Section 9.2.2.
    """

    @staticmethod
    def update(
        papt_state: PAPTState,
        perceived_severity: float,
        perceived_clarity: float,
        perceived_irreversibility: float,
        posture_smoothing_weight: float = DEFAULT_POSTURE_SMOOTHING_WEIGHT,
        posture_clarity_weight: float = DEFAULT_POSTURE_CLARITY_WEIGHT,
        posture_irreversibility_weight: float = DEFAULT_POSTURE_IRREVERSIBILITY_WEIGHT,
        visibility_floor: float = DEFAULT_VISIBILITY_FLOOR,
        posture_trend_smoothing: float = DEFAULT_POSTURE_TREND_SMOOTHING,
        trend_confidence_scaling: float = DEFAULT_TREND_CONFIDENCE_SCALING,
    ) -> PAPTState:
        """
        Execute the 6-step PAPT computation and return updated state.

        Args:
            papt_state: Current PAPT state (will not be mutated; returns new).
            perceived_severity: Max perceived Severity from adversary actions
                this turn (post-Stage-1 Base Input Vector).
            perceived_clarity: Perceived Clarity of the adversary's action.
            perceived_irreversibility: Perceived Irreversibility of the
                adversary's action.
            posture_smoothing_weight: Exponential smoothing weight for
                severity running average (default 0.4).
            posture_clarity_weight: Weight of Clarity in visibility (default 0.6).
            posture_irreversibility_weight: Weight of Irreversibility in
                visibility (default 0.4).
            visibility_floor: Minimum visibility weight (default 0.2).
            posture_trend_smoothing: Smoothing weight for posture trend
                (default 0.5).
            trend_confidence_scaling: Scaling factor for confidence
                computation (default 2.0).

        Returns:
            New PAPTState with updated values.
        """
        # Step 1: perceived_severity is already extracted (passed as argument).
        # When multiple adversary actions observed, caller passes the max.

        # Step 2: Update the running average via exponential smoothing.
        severity_running_average_new = (
            posture_smoothing_weight * perceived_severity
            + (1.0 - posture_smoothing_weight) * papt_state.severity_running_average
        )

        # Step 3: Compute raw posture trend.
        # Positive = current more severe than average (escalating).
        # Negative = current less severe than average (de-escalating).
        raw_trend = perceived_severity - severity_running_average_new

        # Step 4: Apply visibility weighting.
        # Loud, visible signals register more strongly in the trend.
        visibility_weight = (
            posture_clarity_weight * perceived_clarity
            + posture_irreversibility_weight * perceived_irreversibility
        )
        weighted_trend = raw_trend * max(visibility_floor, visibility_weight)

        # Step 5: Smooth the posture trend.
        posture_trend_new = (
            posture_trend_smoothing * weighted_trend
            + (1.0 - posture_trend_smoothing) * papt_state.posture_trend
        )
        # Clamp to [-1, 1]
        posture_trend_new = max(-1.0, min(1.0, posture_trend_new))

        # Step 6: Compute trend confidence.
        trend_confidence_new = min(
            1.0,
            abs(posture_trend_new) * visibility_weight * trend_confidence_scaling,
        )

        return PAPTState(
            posture_trend=posture_trend_new,
            severity_running_average=severity_running_average_new,
            trend_confidence=trend_confidence_new,
        )

    @staticmethod
    def extract_adversary_characteristics(
        base_input_vectors: list,
        observer_id: int,
        char_enum,
    ) -> tuple:
        """
        Extract the perceived Severity, Clarity, and Irreversibility of
        adversary actions from the Stage 1 Base Input Vectors.

        When multiple adversary actions are observed this turn, returns
        the characteristics of the action with the maximum Severity
        (spec Step 1: "use the maximum perceived Severity").

        Args:
            base_input_vectors: List of (actor_index, base_input_vector) tuples
                from Stage 1 output.
            observer_id: The acting actor's ID.
            char_enum: The Char enumeration for index lookup.

        Returns:
            (perceived_severity, perceived_clarity, perceived_irreversibility)
            or None if no adversary actions observed this turn.
        """
        severity_idx = char_enum['Severity']
        clarity_idx = char_enum['Clarity']
        irreversibility_idx = char_enum['Irreversibility']

        best_severity = -1.0
        best_clarity = 0.0
        best_irreversibility = 0.0
        found_adversary = False

        for actor_index, biv in base_input_vectors:
            if actor_index == observer_id:
                continue  # Skip own actions
            if actor_index == EXOGENOUS_ACTOR_ID:
                continue  # PAPT tracks adversary player only, not third-party events
            severity = float(biv[severity_idx, 0])
            if severity > best_severity:
                best_severity = severity
                best_clarity = float(biv[clarity_idx, 0])
                best_irreversibility = float(biv[irreversibility_idx, 0])
                found_adversary = True

        if not found_adversary:
            return None

        return (best_severity, best_clarity, best_irreversibility)


# ---------------------------------------------------------------------------
# Reciprocity Modifier
# ---------------------------------------------------------------------------

def compute_reciprocity_modifier(
    posture_trend: float,
    trend_confidence: float,
    reciprocity_sensitivity: float = DEFAULT_RECIPROCITY_SENSITIVITY,
    reciprocity_floor: float = DEFAULT_RECIPROCITY_FLOOR,
) -> float:
    """
    Compute the reciprocity modifier on the de-escalation bonus.

    reciprocity_modifier = 1.0 + (reciprocity_sensitivity × posture_trend
                                   × trend_confidence × −1)

    Note the sign inversion: negative posture_trend (adversary de-escalating)
    produces a positive modifier (amplified bonus); positive posture_trend
    (adversary escalating) suppresses the bonus.

    Clamped to [reciprocity_floor, ∞).

    Spec reference: Section 9.3.1.

    Args:
        posture_trend: Current PAPT posture_trend [-1, 1].
        trend_confidence: Current PAPT trend_confidence [0, 1].
        reciprocity_sensitivity: How strongly adversary posture affects
            the bonus (default 1.5).
        reciprocity_floor: Minimum modifier value (default 0.3). Ensures
            de-escalation bonus never drops below 30% of base.

    Returns:
        The reciprocity modifier (≥ reciprocity_floor).
    """
    modifier = 1.0 + (reciprocity_sensitivity * posture_trend * trend_confidence * -1.0)
    return max(reciprocity_floor, modifier)


def compute_descriptive_weights(
    support_bonus_weight: float,
    cost_penalty_weight: float,
    cumulative_trajectory_investment: float,
    sunk_cost_bias: float = DEFAULT_SUNK_COST_BIAS,
    status_quo_bias: float = DEFAULT_STATUS_QUO_BIAS,
) -> tuple:
    """
    Compute descriptive mode adjustments to landscape weights.

    In prescriptive mode (sunk_cost_bias=0, status_quo_bias=0), the
    weights pass through unchanged. In descriptive mode, two cognitive
    biases amplify trajectory persistence:

    Sunk-cost amplification (Staw 1976):
        descriptive_cost_penalty_weight = cost_penalty_weight
            × (1 + sunk_cost_bias × ln(1 + cumulative_trajectory_investment))

    Status quo bias (Samuelson & Zeckhauser 1988):
        descriptive_support_bonus_weight = support_bonus_weight
            × (1 + status_quo_bias)

    Args:
        support_bonus_weight: Base support bonus weight.
        cost_penalty_weight: Base cost penalty weight.
        cumulative_trajectory_investment: Sum of initial_influence for
            active implicit commitments. Proxy for trajectory investment.
        sunk_cost_bias: Strength of escalation-of-commitment effect
            (default 0.3). Set to 0 for prescriptive mode.
        status_quo_bias: Strength of continuation preference
            (default 0.15). Set to 0 for prescriptive mode.

    Returns:
        (descriptive_support_bonus_weight, descriptive_cost_penalty_weight)

    Spec reference: Section 8.4.
    """
    desc_support = support_bonus_weight * (1.0 + status_quo_bias)
    desc_cost = cost_penalty_weight * (
        1.0 + sunk_cost_bias * math.log(1.0 + cumulative_trajectory_investment)
    )
    return desc_support, desc_cost


# ---------------------------------------------------------------------------
# Reconsideration Evaluator
# ---------------------------------------------------------------------------

class ReconsiderationEvaluator:
    """
    Evaluates the five reconsideration trigger conditions.

    When any trigger fires, implicit commitment influence is dampened and
    hard constraints are relaxed for the current turn, allowing strategic
    pivots when conditions change.

    Spec reference: Section 7.2.
    """

    @staticmethod
    def evaluate(
        # Trigger 1: Goal Ledger shock
        current_discrepancy=None,
        previous_discrepancy=None,
        reconsideration_ledger_threshold: float = DEFAULT_RECONSIDERATION_LEDGER_THRESHOLD,
        # Trigger 2: Adversary posture reversal / commitment shift
        papt_state_current: PAPTState = None,
        papt_state_previous: PAPTState = None,
        current_commitment_estimate: float = None,
        previous_commitment_estimate: float = None,
        reconsideration_commitment_threshold: float = DEFAULT_RECONSIDERATION_COMMITMENT_THRESHOLD,
        posture_trend_reversal_threshold: float = DEFAULT_POSTURE_TREND_REVERSAL_THRESHOLD,
        posture_trend_confidence_threshold: float = DEFAULT_POSTURE_TREND_CONFIDENCE_THRESHOLD,
        # Trigger 3: In-progress action completion/cancellation
        transitioned_ids: set = None,
        # Trigger 4: Pending proposal received
        pending_proposals: list = None,
        # Trigger 5: Goal Ledger trajectory reversal
        goal_ledger_history: list = None,
    ) -> dict:
        """
        Evaluate all five reconsideration triggers.

        Returns a dict with:
            - 'reconsideration_active': bool — True if any trigger fired
            - 'triggers_fired': list of str — which triggers activated
            - 'dampening_factor': float — always DEFAULT_RECONSIDERATION_DAMPENING_FACTOR
              when active, else 1.0

        All inputs are optional. When a trigger's required data is not
        available (None), that trigger is skipped (not fired).
        """
        triggers_fired = []

        # Trigger 1: Goal Ledger Shock
        # |ΔGoal_Ledger_Discrepancy| > threshold
        if current_discrepancy is not None and previous_discrepancy is not None:
            import numpy as _np
            delta = _np.linalg.norm(current_discrepancy - previous_discrepancy)
            if delta > reconsideration_ledger_threshold:
                triggers_fired.append("goal_ledger_shock")

        # Trigger 2: Adversary Posture Reversal or Commitment Shift
        # (a) |ΔCommitment_Estimate| > threshold
        if (current_commitment_estimate is not None
                and previous_commitment_estimate is not None):
            delta_ce = abs(current_commitment_estimate - previous_commitment_estimate)
            if delta_ce > reconsideration_commitment_threshold:
                triggers_fired.append("commitment_estimate_shift")

        # (b) sign(posture_trend_current) ≠ sign(posture_trend_previous)
        #     AND |posture_trend_current| > reversal_threshold
        #     AND trend_confidence > confidence_threshold
        if papt_state_current is not None and papt_state_previous is not None:
            prev_sign = (1 if papt_state_previous.posture_trend > 0
                         else (-1 if papt_state_previous.posture_trend < 0 else 0))
            curr_sign = (1 if papt_state_current.posture_trend > 0
                         else (-1 if papt_state_current.posture_trend < 0 else 0))

            if (prev_sign != curr_sign
                    and prev_sign != 0  # only fire on actual reversals
                    and abs(papt_state_current.posture_trend) > posture_trend_reversal_threshold
                    and papt_state_current.trend_confidence > posture_trend_confidence_threshold):
                triggers_fired.append("posture_reversal")

        # Trigger 3: In-Progress Action Completion or Cancellation
        # Any action transitioned to COMPLETED or DECAYING this turn
        if transitioned_ids and len(transitioned_ids) > 0:
            triggers_fired.append("action_completion")

        # Trigger 4: Explicit Proposal Received
        # A pending proposal from the adversary exists
        if pending_proposals and len(pending_proposals) > 0:
            triggers_fired.append("proposal_received")

        # Trigger 5: Goal Ledger Trajectory Reversal
        # sign(velocity_current) ≠ sign(velocity_previous)
        if goal_ledger_history is not None and len(goal_ledger_history) >= 3:
            import numpy as _np
            # Compute velocity as difference between consecutive entries
            recent = goal_ledger_history[-1]
            mid = goal_ledger_history[-2]
            old = goal_ledger_history[-3]

            velocity_current = _np.sum(recent - mid)
            velocity_previous = _np.sum(mid - old)

            if velocity_current * velocity_previous < 0:  # sign change
                triggers_fired.append("ledger_trajectory_reversal")

        reconsideration_active = len(triggers_fired) > 0

        return {
            "reconsideration_active": reconsideration_active,
            "triggers_fired": triggers_fired,
            "dampening_factor": (
                DEFAULT_RECONSIDERATION_DAMPENING_FACTOR
                if reconsideration_active else 1.0
            ),
        }


# ---------------------------------------------------------------------------
# Explicit Commitment Mechanics
# ---------------------------------------------------------------------------

def evaluate_trigger_conditions(
    register: "CommitmentRegister",
    base_input_vectors: list,
    observer_id: int,
    current_turn: int,
    char_enum: dict = None,
) -> List[int]:
    """
    Evaluate trigger conditions for all untriggered explicit commitments.

    Checks each untriggered explicit commitment against perceived (post-Stage-1)
    adversary action characteristics. Trigger conditions are evaluated against
    the observer's perception, not the broadcaster's actual values — this means
    perception biases can cause premature or missed triggers.

    Args:
        register: The actor's CommitmentRegister.
        base_input_vectors: List of (actor_id, biv_vector) tuples from Stage 1.
        observer_id: The observer's actor ID.
        current_turn: Current simulation turn.
        char_enum: The Char enum for resolving characteristic names to indices.

    Returns:
        List of commitment IDs that were newly triggered.

    Spec reference: Section 3.1.
    """
    newly_triggered = []
    untriggered = [
        r for r in register.get_active_explicit()
        if r.trigger_status == CTS_UNTRIGGERED
    ]

    if not untriggered or not base_input_vectors:
        return newly_triggered

    # Collect adversary observations (excluding self and exogenous)
    adversary_observations = []
    for actor_id, biv in base_input_vectors:
        if actor_id == observer_id or actor_id < 0:
            continue
        adversary_observations.append(biv)

    if not adversary_observations:
        return newly_triggered

    for record in untriggered:
        tc = record.trigger_condition
        if not tc.characteristic or char_enum is None:
            continue

        # Resolve characteristic name to index
        try:
            char_idx = char_enum[tc.characteristic]
        except (KeyError, TypeError):
            continue

        # Check each adversary observation
        for biv in adversary_observations:
            perceived_value = float(biv[char_idx, 0])
            triggered = _evaluate_operator(perceived_value, tc.operator, tc.threshold)
            if triggered:
                record.trigger_status = CTS_TRIGGERED
                record.turn_triggered = current_turn
                newly_triggered.append(record.commitment_id)
                break  # One trigger is enough

    return newly_triggered


def _evaluate_operator(value: float, operator: str, threshold: float) -> bool:
    """Evaluate a comparison operator against a threshold."""
    if operator == ">":
        return value > threshold
    elif operator == ">=":
        return value >= threshold
    elif operator == "<":
        return value < threshold
    elif operator == "<=":
        return value <= threshold
    elif operator == "==":
        return abs(value - threshold) < 1e-9
    return False


def compute_fulfillment_bonus(
    register: "CommitmentRegister",
    candidate_coa_ids: list,
    fulfillment_bonus_weight: float = DEFAULT_FULFILLMENT_BONUS_WEIGHT,
) -> Dict[int, float]:
    """
    Compute per-action fulfillment bonuses from triggered explicit commitments.

    When an actor has triggered commitments, each candidate action is checked
    against the committed_response field. Matching actions receive a bonus
    proportional to the commitment's credibility stake and audience cost exposure.

    Multiple triggered commitments pointing to the same response stack their
    bonuses. Different responses each get their own bonus.

    Args:
        register: The actor's CommitmentRegister.
        candidate_coa_ids: List of candidate action IDs.
        fulfillment_bonus_weight: Global scaling weight for fulfillment bonus.

    Returns:
        Dict of {coa_id: bonus_value} for actions that receive a bonus.

    Spec reference: Section 3.2.
    """
    bonuses = {}
    triggered = register.get_triggered_explicit()

    if not triggered:
        return bonuses

    for record in triggered:
        committed_response = record.committed_response
        if not committed_response:
            continue

        # Match by string or integer COA ID
        try:
            committed_coa_id = int(committed_response)
        except (ValueError, TypeError):
            # String reference — skip if we can't resolve it
            continue

        if committed_coa_id in candidate_coa_ids:
            bonus = (
                record.credibility_stake
                * record.audience_cost_exposure
                * fulfillment_bonus_weight
            )
            bonuses[committed_coa_id] = bonuses.get(committed_coa_id, 0.0) + bonus

    return bonuses


def detect_violations(
    register: "CommitmentRegister",
    chosen_sequence: list,
    current_turn: int,
    credibility_cost_weight: float = DEFAULT_CREDIBILITY_COST_WEIGHT,
    coalition_support_low_threshold: float = DEFAULT_COALITION_SUPPORT_LOW_THRESHOLD,
) -> List[dict]:
    """
    Post-Stage-3 violation detection: check if triggered commitments are
    fulfilled or violated by the chosen action sequence.

    For each triggered commitment:
    - If committed_response is in the chosen sequence → fulfilled
    - Otherwise → violated

    Returns violation/fulfillment records for Stage 4 processing.

    Args:
        register: The actor's CommitmentRegister.
        chosen_sequence: The chosen action sequence (list of COA IDs).
        current_turn: Current simulation turn.
        credibility_cost_weight: Scaling weight for credibility cost.
        coalition_support_low_threshold: Threshold for low coalition alignment.

    Returns:
        List of dicts with keys: commitment_id, outcome ('fulfilled' or 'violated'),
        credibility_cost, audience_cost, credibility_boost.

    Spec reference: Section 3.3.
    """
    results = []
    triggered = register.get_triggered_explicit()

    for record in triggered:
        committed_response = record.committed_response
        try:
            committed_coa_id = int(committed_response)
        except (ValueError, TypeError):
            continue

        if committed_coa_id in chosen_sequence:
            # Fulfilled
            record.trigger_status = CTS_FULFILLED
            record.turn_resolved = current_turn
            results.append({
                "commitment_id": record.commitment_id,
                "outcome": "fulfilled",
                "credibility_cost": 0.0,
                "audience_cost": 0.0,
                "credibility_boost": record.audience_cost_exposure * 0.5,
            })
        else:
            # Violated
            record.trigger_status = CTS_VIOLATED
            record.turn_resolved = current_turn

            # Coalition support modifier
            coalition_modifier = 1.0
            if record.coalition_alignment_at_creation < coalition_support_low_threshold:
                coalition_modifier = 0.5

            audience_cost = record.audience_cost_exposure * coalition_modifier
            credibility_cost = record.credibility_stake * credibility_cost_weight

            results.append({
                "commitment_id": record.commitment_id,
                "outcome": "violated",
                "credibility_cost": credibility_cost,
                "audience_cost": audience_cost,
                "credibility_boost": 0.0,
            })

    return results


def check_ultimatum_compliance(
    register: "CommitmentRegister",
    adversary_coa_ids: List[int],
    current_turn: int,
    compliance_credibility_boost: float = DEFAULT_COMPLIANCE_CREDIBILITY_BOOST,
) -> List[dict]:
    """
    Check whether any active ultimatums have been satisfied by adversary
    compliance actions taken this turn. Must run BEFORE
    evaluate_trigger_conditions() and check_explicit_expiry().

    Resolves matching ultimatums as CTS_COMPLIED — the committed response
    does NOT fire, and the issuer receives a credibility boost.

    Args:
        register: The issuing actor's CommitmentRegister.
        adversary_coa_ids: List of COA IDs the adversary selected this turn.
        current_turn: Current simulation turn.
        compliance_credibility_boost: Credibility boost for the issuer (default 0.70).

    Returns:
        List of dicts with keys: commitment_id, outcome ('complied'),
        credibility_boost. Empty list if no compliance detected.
    """
    results = []
    if not adversary_coa_ids:
        return results

    adversary_set = set(adversary_coa_ids)

    for record in register.get_active_explicit():
        if record.commitment_type != CT_ULTIMATUM:
            continue
        if record.trigger_status != CTS_UNTRIGGERED:
            continue
        if not record.compliance_actions:
            continue

        if adversary_set.intersection(record.compliance_actions):
            record.trigger_status = CTS_COMPLIED
            record.turn_resolved = current_turn
            results.append({
                "commitment_id": record.commitment_id,
                "outcome": "complied",
                "credibility_boost": compliance_credibility_boost,
            })

    return results


def check_explicit_expiry(
    register: "CommitmentRegister",
    current_turn: int,
) -> Tuple[List[int], List[int]]:
    """
    Expire untriggered explicit commitments that have exceeded their expiry_turns.

    For most commitment types (threats, warnings), expiry means the commitment
    provided deterrent value but was never tested — no credibility cost or
    benefit.

    For ultimatums, expiry IS the trigger: the deadline passed without
    adversary compliance, so the committed response must fire. These are
    marked CTS_TRIGGERED (not CTS_EXPIRED) and returned separately so the
    caller can merge them into Triggered-Commitment-IDs for downstream
    fulfillment and screening logic.

    Args:
        register: The actor's CommitmentRegister.
        current_turn: Current simulation turn.

    Returns:
        Tuple of (expired_ids, triggered_via_expiry_ids):
            expired_ids: Commitments that expired without being tested.
            triggered_via_expiry_ids: Ultimatums whose deadline passed,
                now marked CTS_TRIGGERED for committed response enqueuing.

    Spec reference: Section 3.6.
    """
    expired_ids = []
    triggered_via_expiry_ids = []

    for record in register.get_active_explicit():
        if record.trigger_status != CTS_UNTRIGGERED:
            continue
        if record.expiry_turns < 0:
            continue  # -1 = persists indefinitely
        if current_turn - record.turn_created >= record.expiry_turns:
            if record.commitment_type == CT_ULTIMATUM:
                # Ultimatum expiry = deadline passed = trigger the
                # committed response. The downstream fulfillment bonus
                # and screening filter already handle CTS_TRIGGERED.
                record.trigger_status = CTS_TRIGGERED
                record.turn_resolved = current_turn
                triggered_via_expiry_ids.append(record.commitment_id)
            else:
                record.trigger_status = CTS_EXPIRED
                record.turn_resolved = current_turn
                expired_ids.append(record.commitment_id)

    return expired_ids, triggered_via_expiry_ids


def resolve_withdrawal(
    register: "CommitmentRegister",
    commitment_id: int,
    current_turn: int,
    withdrawal_cost_fraction: float = DEFAULT_WITHDRAWAL_COST_FRACTION,
    credibility_cost_weight: float = DEFAULT_CREDIBILITY_COST_WEIGHT,
    coalition_support_low_threshold: float = DEFAULT_COALITION_SUPPORT_LOW_THRESHOLD,
) -> Optional[dict]:
    """
    Mark a commitment as withdrawn with reduced costs.

    Withdrawal is less damaging than outright violation but still carries
    audience and credibility costs, scaled by withdrawal_cost_fraction.

    Args:
        register: The actor's CommitmentRegister.
        commitment_id: ID of the commitment to withdraw.
        current_turn: Current simulation turn.
        withdrawal_cost_fraction: Fraction of full violation cost (default 0.4).
        credibility_cost_weight: Scaling weight for credibility cost.
        coalition_support_low_threshold: Threshold for low coalition alignment.

    Returns:
        Dict with withdrawal costs, or None if commitment not found/not active.

    Spec reference: Section 3.6.
    """
    record = register.get_record(commitment_id)
    if record is None or not record.is_explicit() or not record.is_active():
        return None

    record.trigger_status = CTS_WITHDRAWN
    record.turn_resolved = current_turn

    coalition_modifier = 1.0
    if record.coalition_alignment_at_creation < coalition_support_low_threshold:
        coalition_modifier = 0.5

    full_audience_cost = record.audience_cost_exposure * coalition_modifier
    full_credibility_cost = record.credibility_stake * credibility_cost_weight

    return {
        "commitment_id": commitment_id,
        "outcome": "withdrawn",
        "credibility_cost": full_credibility_cost * withdrawal_cost_fraction,
        "audience_cost": full_audience_cost * withdrawal_cost_fraction,
        "credibility_boost": 0.0,
    }


# ---------------------------------------------------------------------------
# Proposal-Response Mechanism: Eligibility Gating and Resolution
# ---------------------------------------------------------------------------


def activate_proposal_responses(
    register: "CommitmentRegister",
    proposal_response_actions: Dict[int, "ProposalResponseActionMeta"],
) -> List[int]:
    """
    Determine which pre-authored Accept/Reject actions should be activated
    for the current turn based on pending proposals in the register.

    For each pending proposal (trigger_status == PendingResponse), find
    Accept/Reject actions whose proposal_type matches the proposal's
    proposal_type. Return the COA IDs that should be made eligible.

    This is the DPM's eligibility gating role. Action generation is
    MAGIC's responsibility — these actions are pre-authored in the Playbook.

    Args:
        register: The responding actor's CommitmentRegister (contains
            pending proposals from the adversary's perspective — but the
            pending proposals are stored in the proposer's register).
            NOTE: In practice, we pass the OTHER actor's register here,
            since the proposer owns the proposal record.
        proposal_response_actions: Dict of coa_id -> ProposalResponseActionMeta
            for all pre-authored Accept/Reject actions.

    Returns:
        List of COA IDs to activate in Current-Available-Playbook.

    Spec reference: Section 4.3 (revised: MAGIC-owned action generation).
    """
    if not proposal_response_actions:
        return []

    pending = register.get_pending_proposals()
    if not pending:
        return []

    # Collect the set of proposal_types with pending proposals
    pending_types = set()
    for proposal in pending:
        if proposal.proposal_type:
            pending_types.add(proposal.proposal_type)

    if not pending_types:
        return []

    # Activate response actions whose proposal_type matches a pending proposal
    activated = []
    for coa_id, meta in proposal_response_actions.items():
        if meta.proposal_type in pending_types:
            activated.append(coa_id)

    return activated


def resolve_proposal_acceptance(
    proposer_register: "CommitmentRegister",
    responder_register: "CommitmentRegister",
    proposal_commitment_id: int,
    accept_action_meta: "ProposalResponseActionMeta",
    current_turn: int,
    accept_coa_id: int,
    acceptance_credibility_boost: float = DEFAULT_ACCEPTANCE_CREDIBILITY_BOOST,
) -> Optional[dict]:
    """
    Resolve proposal acceptance: mark the proposal as fulfilled, create
    mutual promise commitments for both actors.

    When Actor B selects an Accept action:
    1. The proposer's proposal commitment is marked Fulfilled
    2. Both actors receive new Promise-type commitment records with
       trigger conditions from the accept action's mutual_trigger_template
    3. The proposer gets a credibility boost (their proposal was accepted)

    Args:
        proposer_register: The proposing actor's CommitmentRegister.
        responder_register: The responding (accepting) actor's CommitmentRegister.
        proposal_commitment_id: ID of the proposal commitment in proposer's register.
        accept_action_meta: ProposalResponseActionMeta for the Accept action.
        current_turn: Current simulation turn.
        accept_coa_id: COA ID of the Accept action (for source linking).
        acceptance_credibility_boost: Credibility boost for the proposer.

    Returns:
        Dict with resolution details, or None if proposal not found.

    Spec reference: Section 4.4, Section 4.5.
    """
    proposal_record = proposer_register.get_record(proposal_commitment_id)
    if proposal_record is None:
        return None
    if proposal_record.trigger_status != CTS_PENDING_RESPONSE:
        return None

    # Mark the proposal as fulfilled
    proposal_record.trigger_status = CTS_FULFILLED
    proposal_record.turn_resolved = current_turn

    # Create mutual promise commitments for both actors.
    # Both get the same trigger condition (violation terms) and expiry.
    mutual_tc = accept_action_meta.mutual_trigger_template
    mutual_expiry = accept_action_meta.mutual_commitment_expiry
    mutual_cred = accept_action_meta.mutual_credibility_stake
    mutual_aud = accept_action_meta.mutual_audience_cost_exposure

    # Proposer's promise commitment (in proposer's register)
    proposer_promise = proposer_register.create_explicit_record(
        source_coa_id=proposal_record.source_coa_id,
        source_action_record_id=proposal_record.source_action_record_id,
        turn_created=current_turn,
        commitment_type=CT_PROMISE,
        trigger_condition=mutual_tc,
        committed_response="abide_by_agreement",
        expiry_turns=mutual_expiry,
        audience_cost_exposure=mutual_aud,
        credibility_stake=mutual_cred,
        proposal_type=accept_action_meta.proposal_type,
    )

    # Responder's promise commitment (in responder's register)
    responder_promise = responder_register.create_explicit_record(
        source_coa_id=accept_coa_id,
        source_action_record_id=-1,
        turn_created=current_turn,
        commitment_type=CT_PROMISE,
        trigger_condition=mutual_tc,
        committed_response="abide_by_agreement",
        expiry_turns=mutual_expiry,
        audience_cost_exposure=mutual_aud,
        credibility_stake=mutual_cred,
        proposal_type=accept_action_meta.proposal_type,
    )

    return {
        "proposal_commitment_id": proposal_commitment_id,
        "outcome": "accepted",
        "proposer_promise_id": proposer_promise.commitment_id,
        "responder_promise_id": responder_promise.commitment_id,
        "proposer_credibility_boost": acceptance_credibility_boost,
        "proposal_type": accept_action_meta.proposal_type,
    }


def resolve_proposal_rejection(
    proposer_register: "CommitmentRegister",
    proposal_commitment_id: int,
    current_turn: int,
    rejection_resolve_boost: float = DEFAULT_REJECTION_RESOLVE_BOOST,
) -> Optional[dict]:
    """
    Resolve proposal rejection: mark the proposal as rejected.

    When Actor B selects a Reject action, the proposer's proposal commitment
    is marked Rejected. The proposer perceives the rejection signal through
    normal Stage 1, and updates beliefs about the rejector's Resolve.

    No credibility or audience costs for rejection — the proposer put
    themselves forward, the rejector merely declined.

    Args:
        proposer_register: The proposing actor's CommitmentRegister.
        proposal_commitment_id: ID of the proposal commitment.
        current_turn: Current simulation turn.
        rejection_resolve_boost: How much the rejector's perceived Resolve
            increases in the proposer's belief model.

    Returns:
        Dict with rejection details, or None if proposal not found.

    Spec reference: Section 4.4.
    """
    proposal_record = proposer_register.get_record(proposal_commitment_id)
    if proposal_record is None:
        return None
    if proposal_record.trigger_status != CTS_PENDING_RESPONSE:
        return None

    proposal_record.trigger_status = CTS_REJECTED
    proposal_record.turn_resolved = current_turn

    return {
        "proposal_commitment_id": proposal_commitment_id,
        "outcome": "rejected",
        "rejection_resolve_boost": rejection_resolve_boost,
        "proposal_type": proposal_record.proposal_type,
    }


def find_matching_proposal(
    proposer_register: "CommitmentRegister",
    proposal_type: str,
) -> Optional[CommitmentRecord]:
    """
    Find the most recent pending proposal of a given type.

    When multiple proposals of the same type are pending (unlikely but
    possible), return the most recently created one.

    Args:
        proposer_register: The proposing actor's CommitmentRegister.
        proposal_type: The proposal type to match.

    Returns:
        The matching CommitmentRecord, or None if no pending proposal matches.
    """
    pending = proposer_register.get_pending_proposals()
    matching = [
        p for p in pending
        if p.proposal_type == proposal_type
    ]
    if not matching:
        return None
    # Return most recently created
    return max(matching, key=lambda p: p.turn_created)


# ---------------------------------------------------------------------------
# Commitment Register: Per-Actor Container
# ---------------------------------------------------------------------------

class CommitmentRegister:
    """
    Per-actor persistent log of all commitment records (explicit and implicit).
    Provides creation, query, and lifecycle management methods.

    The register is the authoritative source for what commitments an actor
    has made and their current status.
    """

    def __init__(self, actor_id: int):
        self.actor_id = actor_id
        self._records: Dict[int, CommitmentRecord] = {}
        self._next_id: int = 0

    @property
    def records(self) -> Dict[int, CommitmentRecord]:
        """All records (active and resolved)."""
        return self._records

    def create_implicit_record(
        self,
        source_coa_id: int,
        source_action_record_id: int,
        turn_created: int,
        initial_influence: float,
        lifecycle_binding: int = LB_ACTIVE_ONLY,
    ) -> CommitmentRecord:
        """
        Create a new implicit commitment record.
        Called when any action is executed (Stage 4 / record creation).

        Args:
            source_coa_id: The action that created this commitment.
            source_action_record_id: Link to WorldStateTimeline record.
            turn_created: Current simulation turn.
            initial_influence: Computed from Clarity and Irreversibility.
            lifecycle_binding: ActiveOnly or Persistent.

        Returns:
            The newly created CommitmentRecord.
        """
        record = CommitmentRecord(
            commitment_id=self._next_id,
            committing_actor=self.actor_id,
            commitment_type=CT_IMPLICIT,
            source_coa_id=source_coa_id,
            source_action_record_id=source_action_record_id,
            turn_created=turn_created,
            influence_weight=initial_influence,
            initial_influence=initial_influence,
            lifecycle_binding=lifecycle_binding,
            implicit_status=ICS_ACTIVE,
            # Explicit fields stay at defaults (not used for implicit)
        )
        self._records[self._next_id] = record
        self._next_id += 1
        return record

    def create_explicit_record(
        self,
        source_coa_id: int,
        source_action_record_id: int,
        turn_created: int,
        commitment_type: int,
        trigger_condition: TriggerCondition,
        committed_response: str,
        expiry_turns: int,
        audience_cost_exposure: float,
        credibility_stake: float,
        coalition_alignment_at_creation: float = 0.0,
        proposal_type: str = "",
        compliance_actions: List[int] = None,
    ) -> CommitmentRecord:
        """
        Create a new explicit commitment record.
        Called when a commitment-creating action is executed (Stage 4).

        Returns:
            The newly created CommitmentRecord.
        """
        # Proposals start as PendingResponse; others start Untriggered
        initial_status = (
            CTS_PENDING_RESPONSE if commitment_type == CT_PROPOSAL
            else CTS_UNTRIGGERED
        )
        record = CommitmentRecord(
            commitment_id=self._next_id,
            committing_actor=self.actor_id,
            commitment_type=commitment_type,
            source_coa_id=source_coa_id,
            source_action_record_id=source_action_record_id,
            turn_created=turn_created,
            trigger_condition=trigger_condition,
            committed_response=committed_response,
            expiry_turns=expiry_turns,
            audience_cost_exposure=audience_cost_exposure,
            credibility_stake=credibility_stake,
            coalition_alignment_at_creation=coalition_alignment_at_creation,
            trigger_status=initial_status,
            proposal_type=proposal_type,
            compliance_actions=compliance_actions if compliance_actions else [],
            # Implicit fields stay at defaults (not used for explicit)
        )
        self._records[self._next_id] = record
        self._next_id += 1
        return record

    # --- Query methods ---

    def get_active_records(self) -> List[CommitmentRecord]:
        """All currently active (unresolved) records."""
        return [r for r in self._records.values() if r.is_active()]

    def get_active_implicit(self) -> List[CommitmentRecord]:
        """All active implicit commitment records."""
        return [
            r for r in self._records.values()
            if r.is_implicit() and r.is_active()
        ]

    def get_active_explicit(self) -> List[CommitmentRecord]:
        """All active explicit commitment records."""
        return [
            r for r in self._records.values()
            if r.is_explicit() and r.is_active()
        ]

    def get_triggered_explicit(self) -> List[CommitmentRecord]:
        """All triggered (awaiting fulfillment/violation) explicit records."""
        return [
            r for r in self._records.values()
            if r.is_explicit() and r.trigger_status == CTS_TRIGGERED
        ]

    def get_pending_proposals(self) -> List[CommitmentRecord]:
        """All proposals awaiting response."""
        return [
            r for r in self._records.values()
            if r.commitment_type == CT_PROPOSAL
            and r.trigger_status == CTS_PENDING_RESPONSE
        ]

    def get_record(self, commitment_id: int) -> Optional[CommitmentRecord]:
        """Get a specific record by ID."""
        return self._records.get(commitment_id)

    def has_active_implicit_for_action(self, coa_id: int) -> bool:
        """Check if there's an active implicit record for a given action."""
        return any(
            r.source_coa_id == coa_id and r.is_implicit() and r.is_active()
            for r in self._records.values()
        )

    def cumulative_trajectory_investment(self) -> float:
        """
        Sum of initial_influence for all active implicit commitments.

        Proxy for "how much has the actor invested in the current trajectory."
        Used in descriptive mode sunk-cost amplification (spec Section 8.4).

        Returns:
            Non-negative float. Zero when no active implicit commitments.
        """
        return sum(
            r.initial_influence
            for r in self._records.values()
            if r.is_implicit() and r.is_active()
        )

    # --- Implicit commitment lifecycle methods ---

    def sync_lifecycle_bindings(self, world_state_timeline, current_turn: int):
        """
        Synchronize lifecycle binding for active_only implicit commitments.

        For each active implicit commitment with lifecycle_binding == ActiveOnly:
        - If the source action's temporal record is IN_PROGRESS or SUSTAINING,
          the commitment stays Active with influence_weight held at initial_influence.
        - If the source action has entered DECAYING or EXPIRED (or has no
          active temporal record), transition the commitment to Decaying and
          record turn_decay_started.

        Must be called each turn BEFORE decay_implicit_commitments().

        Args:
            world_state_timeline: The WorldStateTimeline instance for looking
                up the source action's lifecycle state.
            current_turn: Current simulation turn number.
        """
        for record in self.get_active_implicit():
            if record.lifecycle_binding != LB_ACTIVE_ONLY:
                continue
            if record.implicit_status != ICS_ACTIVE:
                # Already decaying; skip
                continue

            # Look up the source action's current lifecycle state
            source_record_id = record.source_action_record_id
            if source_record_id < 0:
                # No linked temporal record; treat as persistent
                continue

            timeline_record = world_state_timeline.get_record(source_record_id)
            if timeline_record is None:
                # Timeline record was removed or never existed; start decay
                record.implicit_status = ICS_DECAYING
                record.turn_decay_started = current_turn
                continue

            lifecycle_state = timeline_record.lifecycle_state
            if lifecycle_state in (LS_IN_PROGRESS, LS_SUSTAINING):
                # Source action still active; hold influence at initial
                record.influence_weight = record.initial_influence
            elif lifecycle_state in (LS_DECAYING, LS_EXPIRED):
                # Source action winding down; start commitment decay
                record.implicit_status = ICS_DECAYING
                record.turn_decay_started = current_turn

    def decay_implicit_commitments(
        self,
        current_turn: int,
        commitment_decay_exponent: float = DEFAULT_COMMITMENT_DECAY_EXPONENT,
        commitment_expiry_threshold: float = DEFAULT_COMMITMENT_EXPIRY_THRESHOLD,
    ):
        """
        Update influence_weight for all decaying implicit commitments.

        Decay formula (power-law):
            influence_weight(t) = initial_influence × t_elapsed^(-decay_exponent)

        where t_elapsed is the number of turns since decay started (minimum 1).

        Records whose influence_weight drops below the expiry threshold are
        marked Expired and excluded from future landscape calculations.

        For Active records with Persistent binding that haven't been explicitly
        transitioned, this method initiates their decay from the turn after
        creation (persistent bindings decay independently of temporal lifecycle).

        Spec reference: Section 2.4, Influence Decay.

        Args:
            current_turn: Current simulation turn number.
            commitment_decay_exponent: Power-law exponent (default 0.5).
            commitment_expiry_threshold: Influence floor for expiry (default 0.05).
        """
        for record in self.get_active_implicit():
            # Active-only + still Active status: influence held at initial
            # (lifecycle sync handles the transition to Decaying)
            if (record.lifecycle_binding == LB_ACTIVE_ONLY
                    and record.implicit_status == ICS_ACTIVE):
                continue

            # Persistent binding: auto-start decay from the turn after creation
            if (record.lifecycle_binding == LB_PERSISTENT
                    and record.implicit_status == ICS_ACTIVE):
                record.implicit_status = ICS_DECAYING
                # Decay starts the turn after creation
                record.turn_decay_started = record.turn_created + 1

            # Now handle all Decaying records
            if record.implicit_status != ICS_DECAYING:
                continue

            t_elapsed = current_turn - record.turn_decay_started
            if t_elapsed <= 0:
                # Decay hasn't started yet (same turn as transition)
                record.influence_weight = record.initial_influence
                continue

            # Power-law decay: initial_influence × t^(-exponent)
            record.influence_weight = (
                record.initial_influence * math.pow(t_elapsed, -commitment_decay_exponent)
            )

            # Expiry check
            if record.influence_weight < commitment_expiry_threshold:
                record.implicit_status = ICS_EXPIRED
                record.influence_weight = 0.0
                record.turn_resolved = current_turn

    # --- Serialization ---

    def to_serializable(self) -> dict:
        """Serialize the register state for persistence."""
        return {
            "actor_id": self.actor_id,
            "next_id": self._next_id,
            "records": {
                str(k): v.to_dict() for k, v in self._records.items()
            },
        }

    @staticmethod
    def from_serializable(data: dict) -> "CommitmentRegister":
        """Deserialize from a persisted dict."""
        register = CommitmentRegister(actor_id=int(data["actor_id"]))
        register._next_id = int(data.get("next_id", 0))
        for k, v in data.get("records", {}).items():
            record = CommitmentRecord.from_dict(v)
            register._records[int(k)] = record
        return register


# ---------------------------------------------------------------------------
# Commitment Landscape: Per-Turn Aggregation
# ---------------------------------------------------------------------------

class CommitmentLandscape:
    """
    Transient per-turn structure that aggregates active implicit commitment
    influence into support bonuses and cost penalties for each candidate action.

    Assembled before Stage 3 and consumed by both the screening filter and
    the compensatory utility calculation.

    Spec reference: Section 5.2.
    """

    def __init__(self):
        # candidate_coa_id -> float
        self._support_bonuses = {}
        self._cost_penalties = {}
        self._hard_constraints = {}  # candidate_coa_id -> bool

    @staticmethod
    def assemble(
        register: CommitmentRegister,
        support_cost_sets: dict,
        actor_id: int,
        candidate_coa_ids: list,
        support_bonus_weight: float = DEFAULT_SUPPORT_BONUS_WEIGHT,
        cost_penalty_weight: float = DEFAULT_COST_PENALTY_WEIGHT,
        hard_constraint_threshold: float = DEFAULT_HARD_CONSTRAINT_THRESHOLD,
        dampening_factor: float = 1.0,
    ) -> "CommitmentLandscape":
        """
        Assemble the commitment landscape for a given actor and set of
        candidate actions.

        Args:
            register: The actor's CommitmentRegister.
            support_cost_sets: The actor's parsed support/cost set definitions
                (actor_id -> coa_id -> (support_entries, cost_entries)).
            actor_id: The acting actor's ID.
            candidate_coa_ids: List of candidate action IDs to evaluate.
            support_bonus_weight: Global scaling factor for support bonuses.
            cost_penalty_weight: Global scaling factor for cost penalties.
            hard_constraint_threshold: Minimum influence for hard constraint
                activation.
            dampening_factor: Multiplier on influence_weight for reconsideration
                dampening (1.0 = no dampening).

        Returns:
            A populated CommitmentLandscape instance.
        """
        landscape = CommitmentLandscape()

        # Get actor's support/cost set definitions
        actor_sets = support_cost_sets.get(actor_id, {})
        if not actor_sets:
            # No support/cost sets for this actor; all zeros
            for coa_id in candidate_coa_ids:
                landscape._support_bonuses[coa_id] = 0.0
                landscape._cost_penalties[coa_id] = 0.0
                landscape._hard_constraints[coa_id] = False
            return landscape

        # Initialize all candidates to zero
        for coa_id in candidate_coa_ids:
            landscape._support_bonuses[coa_id] = 0.0
            landscape._cost_penalties[coa_id] = 0.0
            landscape._hard_constraints[coa_id] = False

        # Iterate over all active implicit commitments
        active_implicit = register.get_active_implicit()
        for commitment in active_implicit:
            source_coa = commitment.source_coa_id
            effective_influence = commitment.influence_weight * dampening_factor

            # Look up support/cost sets for this commitment's source action
            sets = actor_sets.get(source_coa)
            if sets is None:
                continue
            support_entries, cost_entries = sets

            # Accumulate support bonuses
            for entry in support_entries:
                target = entry.supported_coa_id
                if target in landscape._support_bonuses:
                    landscape._support_bonuses[target] += (
                        effective_influence
                        * entry.bonus_strength
                        * support_bonus_weight
                    )

            # Accumulate cost penalties
            for entry in cost_entries:
                target = entry.penalized_coa_id
                if target in landscape._cost_penalties:
                    landscape._cost_penalties[target] += (
                        effective_influence
                        * entry.penalty_strength
                        * cost_penalty_weight
                    )
                    # Check hard constraint
                    if (entry.is_hard_constraint
                            and effective_influence >= hard_constraint_threshold):
                        landscape._hard_constraints[target] = True

        return landscape

    def support_bonus(self, coa_id: int) -> float:
        """Get the support bonus for a candidate action."""
        return self._support_bonuses.get(coa_id, 0.0)

    def cost_penalty(self, coa_id: int) -> float:
        """Get the cost penalty for a candidate action."""
        return self._cost_penalties.get(coa_id, 0.0)

    def commitment_adjustment(self, coa_id: int) -> float:
        """
        Net commitment adjustment for a candidate action.
        commitment_adjustment(k) = support_bonus(k) - cost_penalty(k)
        """
        return self.support_bonus(coa_id) - self.cost_penalty(coa_id)

    def is_hard_constrained(self, coa_id: int) -> bool:
        """Whether a candidate action is blocked by a hard constraint."""
        return self._hard_constraints.get(coa_id, False)

    def to_dict(self) -> dict:
        """Serialize for event data persistence."""
        return {
            "support_bonuses": dict(self._support_bonuses),
            "cost_penalties": dict(self._cost_penalties),
            "hard_constraints": {
                str(k): v for k, v in self._hard_constraints.items()
            },
        }


# ---------------------------------------------------------------------------
# Screening Filter: Non-Compensatory Pre-Stage-3 Filter
# ---------------------------------------------------------------------------

class ScreeningFilter:
    """
    Non-compensatory filter implementing the Poliheuristic (Mintz 2004)
    two-stage decision structure.

    Eliminates candidate actions that violate hard constraints before the
    compensatory utility calculation runs. Three filter conditions:

    Condition 1: Hard contradiction with active implicit commitment.
    Condition 2: Temporal exclusion (handled by existing temporal layer).
    Condition 3: Active explicit commitment protection — committed responses
                 for high-stakes triggered commitments are preserved even if
                 Condition 1 would otherwise screen them.

    Spec reference: Section 6.2.
    """

    @staticmethod
    def _get_protected_coa_ids(
        triggered_commitments: list,
        explicit_violation_threshold: float = DEFAULT_EXPLICIT_VIOLATION_THRESHOLD,
    ) -> set:
        """
        Compute set of COA IDs protected by Condition 3.

        A committed_response is protected when the potential violation cost
        (credibility_stake × audience_cost_exposure) exceeds the threshold.
        This prevents Condition 1 from accidentally screening an action the
        actor has a high-stakes obligation to perform.
        """
        protected = set()
        for record in triggered_commitments:
            violation_cost = record.credibility_stake * record.audience_cost_exposure
            if violation_cost >= explicit_violation_threshold:
                try:
                    coa_id = int(record.committed_response)
                    protected.add(coa_id)
                except (ValueError, TypeError):
                    pass
        return protected

    @staticmethod
    def screen(
        landscape: CommitmentLandscape,
        candidate_coa_ids: list,
        reconsideration_active: bool = False,
        triggered_commitments: list = None,
        explicit_violation_threshold: float = DEFAULT_EXPLICIT_VIOLATION_THRESHOLD,
    ) -> list:
        """
        Apply the screening filter to a set of candidate actions.

        Returns the subset of candidate_coa_ids that pass all filter
        conditions (the Screened COA List).

        Args:
            landscape: The assembled CommitmentLandscape for this turn.
            candidate_coa_ids: List of candidate action IDs to filter.
            reconsideration_active: If True, Condition 1 (implicit hard
                constraints) is suspended per spec Section 7.3.
            triggered_commitments: List of triggered explicit CommitmentRecords.
                Used for Condition 3 protection.
            explicit_violation_threshold: Minimum violation cost for
                Condition 3 protection to activate.

        Returns:
            List of action IDs that pass screening.
        """
        protected = set()
        if triggered_commitments:
            protected = ScreeningFilter._get_protected_coa_ids(
                triggered_commitments, explicit_violation_threshold
            )

        screened = []
        for coa_id in candidate_coa_ids:
            # Condition 3: Explicit commitment protection.
            # If this action is the committed_response of a high-stakes
            # triggered commitment, it cannot be screened by Condition 1.
            if coa_id in protected:
                screened.append(coa_id)
                continue

            # Condition 1: Hard contradiction with active implicit commitment
            # Suspended during reconsideration (spec Section 7.3)
            if not reconsideration_active and landscape.is_hard_constrained(coa_id):
                continue

            # Condition 2: Temporal exclusion
            # Already handled by filter_playbook_for_temporal() in the
            # existing pipeline — current_available_playbook is zeroed
            # for in-progress/sustaining actions before screening runs.
            # No additional logic needed here.

            screened.append(coa_id)

        return screened

    @staticmethod
    def apply_to_playbook(
        available_playbook,
        landscape: CommitmentLandscape,
        reconsideration_active: bool = False,
        triggered_commitments: list = None,
        explicit_violation_threshold: float = DEFAULT_EXPLICIT_VIOLATION_THRESHOLD,
    ):
        """
        Modify the available playbook in-place to zero out hard-constrained
        actions. This integrates with the existing playbook-based filtering
        approach used by the temporal layer.

        Condition 3 (explicit commitment protection) prevents screening of
        committed_response actions for high-stakes triggered commitments.

        Args:
            available_playbook: numpy array of shape (num_actions, 1) with
                1 for available actions, 0 for unavailable.
            landscape: The assembled CommitmentLandscape for this turn.
            reconsideration_active: If True, implicit hard constraints
                are suspended.
            triggered_commitments: List of triggered explicit CommitmentRecords.
            explicit_violation_threshold: Minimum violation cost for protection.

        Returns:
            The modified playbook (same object, modified in-place).
        """
        if reconsideration_active:
            return available_playbook

        protected = set()
        if triggered_commitments:
            protected = ScreeningFilter._get_protected_coa_ids(
                triggered_commitments, explicit_violation_threshold
            )

        num_actions = available_playbook.shape[0]
        for coa_id in range(num_actions):
            if coa_id in protected:
                continue  # Condition 3: explicit commitment protection
            if landscape.is_hard_constrained(coa_id):
                available_playbook[coa_id] = 0

        return available_playbook


# ---------------------------------------------------------------------------
# Scenario Ingestion: Parse support/cost sets and commitment metadata
# ---------------------------------------------------------------------------

def parse_support_cost_sets_from_config(
    raw_sets: list,
) -> Dict[int, Dict[int, Tuple[List[SupportSetEntry], List[CostSetEntry]]]]:
    """
    Parse support/cost set definitions from scenario config.

    The raw_sets list contains per-actor, per-action set definitions:
    [
        {
            "actor_id": 0,
            "source_coa_id": 12,
            "support_set": [...],
            "cost_set": [...]
        },
        ...
    ]

    Returns:
        Nested dict: actor_id -> coa_id -> (support_entries, cost_entries)
        Empty dict when no sets defined (backward-compatible).
    """
    if not raw_sets:
        return {}

    result: Dict[int, Dict[int, Tuple[List[SupportSetEntry], List[CostSetEntry]]]] = {}

    for entry in raw_sets:
        # Accept both "actor_id" and "actor" keys
        actor_id = int(entry.get("actor_id", entry.get("actor", 0)))
        source_coa_id = int(entry["source_coa_id"])

        support_entries = [
            SupportSetEntry(
                source_coa_id=source_coa_id,
                supported_coa_id=int(s["supported_coa_id"]),
                bonus_strength=float(s["bonus_strength"]),
                rationale=str(s.get("rationale", "")),
            )
            for s in entry.get("support_set", [])
        ]

        cost_entries = [
            CostSetEntry.from_dict({
                "source_coa_id": source_coa_id,
                **c,
            })
            for c in entry.get("cost_set", [])
        ]

        if actor_id not in result:
            result[actor_id] = {}
        result[actor_id][source_coa_id] = (support_entries, cost_entries)

    return result


def parse_commitment_creating_actions_from_config(
    raw_actions: list,
) -> Dict[int, CommitmentCreatingActionMeta]:
    """
    Parse commitment-creating action metadata from scenario config.

    Returns:
        Dict of coa_id -> CommitmentCreatingActionMeta.
        Empty dict when no commitment-creating actions defined (backward-compatible).
    """
    if not raw_actions:
        return {}

    result = {}
    for entry in raw_actions:
        meta = CommitmentCreatingActionMeta.from_dict(entry)
        if meta.is_commitment_creating:
            result[meta.coa_id] = meta
    return result


def parse_proposal_response_actions_from_config(
    raw_actions: list,
) -> Dict[int, ProposalResponseActionMeta]:
    """
    Parse proposal response action metadata from scenario config.

    These are pre-authored Accept/Reject actions that MAGIC defines in the
    COA Playbook. The DPM activates them when a matching pending proposal
    exists.

    Returns:
        Dict of coa_id -> ProposalResponseActionMeta.
        Empty dict when no proposal response actions defined (backward-compatible).
    """
    if not raw_actions:
        return {}

    result = {}
    for entry in raw_actions:
        meta = ProposalResponseActionMeta.from_dict(entry)
        result[meta.coa_id] = meta
    return result


def compute_initial_influence(
    clarity: float,
    irreversibility: float,
    influence_base: float = DEFAULT_INFLUENCE_BASE,
    influence_clarity_weight: float = DEFAULT_INFLUENCE_CLARITY_WEIGHT,
    influence_irreversibility_weight: float = DEFAULT_INFLUENCE_IRREVERSIBILITY_WEIGHT,
) -> float:
    """
    Compute the initial influence weight for an implicit commitment.

    initial_influence = influence_base
                        + influence_clarity_weight * Clarity
                        + influence_irreversibility_weight * Irreversibility

    Clamped to [0, 1].

    Spec reference: Section 2.4, Influence Weight Initialization.
    """
    raw = (
        influence_base
        + influence_clarity_weight * clarity
        + influence_irreversibility_weight * irreversibility
    )
    return max(0.0, min(1.0, raw))


def extract_commitment_params(simulation_parameters: dict) -> dict:
    """
    Extract commitment layer simulation parameters with defaults.
    Mirrors the pattern of temporal_params extraction in model.py.
    """
    sim = simulation_parameters or {}
    return {
        "influence_base": float(
            sim.get("influence_base", DEFAULT_INFLUENCE_BASE)
        ),
        "influence_clarity_weight": float(
            sim.get("influence_clarity_weight", DEFAULT_INFLUENCE_CLARITY_WEIGHT)
        ),
        "influence_irreversibility_weight": float(
            sim.get(
                "influence_irreversibility_weight",
                DEFAULT_INFLUENCE_IRREVERSIBILITY_WEIGHT,
            )
        ),
        "commitment_decay_exponent": float(
            sim.get("commitment_decay_exponent", DEFAULT_COMMITMENT_DECAY_EXPONENT)
        ),
        "commitment_expiry_threshold": float(
            sim.get("commitment_expiry_threshold", DEFAULT_COMMITMENT_EXPIRY_THRESHOLD)
        ),
        "support_bonus_weight": float(
            sim.get("support_bonus_weight", DEFAULT_SUPPORT_BONUS_WEIGHT)
        ),
        "cost_penalty_weight": float(
            sim.get("cost_penalty_weight", DEFAULT_COST_PENALTY_WEIGHT)
        ),
        "hard_constraint_threshold": float(
            sim.get("hard_constraint_threshold", DEFAULT_HARD_CONSTRAINT_THRESHOLD)
        ),
        "reconsideration_ledger_threshold": float(
            sim.get(
                "reconsideration_ledger_threshold",
                DEFAULT_RECONSIDERATION_LEDGER_THRESHOLD,
            )
        ),
        "reconsideration_commitment_threshold": float(
            sim.get(
                "reconsideration_commitment_threshold",
                DEFAULT_RECONSIDERATION_COMMITMENT_THRESHOLD,
            )
        ),
        "reconsideration_dampening_factor": float(
            sim.get(
                "reconsideration_dampening_factor",
                DEFAULT_RECONSIDERATION_DAMPENING_FACTOR,
            )
        ),
        "sunk_cost_bias": float(
            sim.get("sunk_cost_bias", DEFAULT_SUNK_COST_BIAS)
        ),
        "status_quo_bias": float(
            sim.get("status_quo_bias", DEFAULT_STATUS_QUO_BIAS)
        ),
        "fulfillment_bonus_weight": float(
            sim.get("fulfillment_bonus_weight", DEFAULT_FULFILLMENT_BONUS_WEIGHT)
        ),
        "credibility_cost_weight": float(
            sim.get("credibility_cost_weight", DEFAULT_CREDIBILITY_COST_WEIGHT)
        ),
        "fulfillment_credibility_boost": float(
            sim.get(
                "fulfillment_credibility_boost",
                DEFAULT_FULFILLMENT_CREDIBILITY_BOOST,
            )
        ),
        "withdrawal_cost_fraction": float(
            sim.get("withdrawal_cost_fraction", DEFAULT_WITHDRAWAL_COST_FRACTION)
        ),
        "proposal_expiry_default": int(
            sim.get("proposal_expiry_default", DEFAULT_PROPOSAL_EXPIRY_DEFAULT)
        ),
        "coalition_support_low_threshold": float(
            sim.get(
                "coalition_support_low_threshold",
                DEFAULT_COALITION_SUPPORT_LOW_THRESHOLD,
            )
        ),
        "explicit_commitment_violation_threshold": float(
            sim.get(
                "explicit_commitment_violation_threshold",
                DEFAULT_EXPLICIT_VIOLATION_THRESHOLD,
            )
        ),
        "posture_smoothing_weight": float(
            sim.get("posture_smoothing_weight", DEFAULT_POSTURE_SMOOTHING_WEIGHT)
        ),
        "posture_clarity_weight": float(
            sim.get("posture_clarity_weight", DEFAULT_POSTURE_CLARITY_WEIGHT)
        ),
        "posture_irreversibility_weight": float(
            sim.get(
                "posture_irreversibility_weight",
                DEFAULT_POSTURE_IRREVERSIBILITY_WEIGHT,
            )
        ),
        "visibility_floor": float(
            sim.get("visibility_floor", DEFAULT_VISIBILITY_FLOOR)
        ),
        "posture_trend_smoothing": float(
            sim.get("posture_trend_smoothing", DEFAULT_POSTURE_TREND_SMOOTHING)
        ),
        "trend_confidence_scaling": float(
            sim.get("trend_confidence_scaling", DEFAULT_TREND_CONFIDENCE_SCALING)
        ),
        "reciprocity_sensitivity": float(
            sim.get("reciprocity_sensitivity", DEFAULT_RECIPROCITY_SENSITIVITY)
        ),
        "reciprocity_floor": float(
            sim.get("reciprocity_floor", DEFAULT_RECIPROCITY_FLOOR)
        ),
        "posture_trend_reversal_threshold": float(
            sim.get(
                "posture_trend_reversal_threshold",
                DEFAULT_POSTURE_TREND_REVERSAL_THRESHOLD,
            )
        ),
        "posture_trend_confidence_threshold": float(
            sim.get(
                "posture_trend_confidence_threshold",
                DEFAULT_POSTURE_TREND_CONFIDENCE_THRESHOLD,
            )
        ),
        "acceptance_credibility_boost": float(
            sim.get(
                "acceptance_credibility_boost",
                DEFAULT_ACCEPTANCE_CREDIBILITY_BOOST,
            )
        ),
        "rejection_resolve_boost": float(
            sim.get(
                "rejection_resolve_boost",
                DEFAULT_REJECTION_RESOLVE_BOOST,
            )
        ),
        "compliance_credibility_boost": float(
            sim.get(
                "compliance_credibility_boost",
                DEFAULT_COMPLIANCE_CREDIBILITY_BOOST,
            )
        ),
    }
