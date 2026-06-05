"""
Coalition Dynamics Layer (CDL) — Stub Interface

Placeholder for the Coalition Dynamics Layer specified in CDL Spec v0.2.
All functions return neutral values (0.0) so the 2-player refactored
benefit formula can reference CDL costs without requiring the full
CDL implementation.

When the CDL is implemented, this module will be replaced by the real
coalition processing logic.
"""

import numpy as np


def compute_domestic_coalition_cost(actor_data, action_id, num_actions):
    """
    Compute the domestic coalition cost for a given action.

    In the full CDL, this aggregates faction satisfaction impacts:
    how much does this action displease key domestic factions?

    Stub returns zeros (no coalition cost penalty).
    """
    return np.zeros((num_actions, 1))


def compute_network_cost(actor_data, action_id, num_actions):
    """
    Compute the network constraint cost for a given action.

    In the full CDL, this evaluates alliance obligation violations:
    does this action violate commitments to allies in the network?

    Stub returns zeros (no network cost penalty).
    """
    return np.zeros((num_actions, 1))


def compute_ally_benefit(actor_data, num_actions):
    """
    Estimate the benefit of each action to the actor's allies.

    Alliance salience captures the psychological reality that some actors
    weight their allies' objectives more heavily than others. A high
    alliance_salience actor will prefer actions that benefit their allies,
    even at some cost to themselves.

    This is the mirror of compute_adversary_impact: where adversary impact
    asks "how does my action hurt their goals?", ally benefit asks "how
    does my action help my allies' goals?"

    In the full CDL:
      - Lightweight: basic ally-benefit estimate derived from coalition
        structure, faction alignment, and action properties.
      - Full CDL: weighted aggregation across coalition members, factoring
        in faction satisfaction and binding mechanism strength.

    Stub returns zeros (ally benefit component is dormant).
    Scaled by alliance_salience in Stage 3b.
    """
    return np.zeros((num_actions, 1))


def compute_adversary_impact(actor_data, num_actions):
    """
    Estimate the impact of each action on the adversary's goals.

    This is conceptually distinct from Goal-Impact-Matrix (which captures
    how the OTHER player's actions affect MY goals). Adversary impact
    answers: "when I take action A, how much does it hurt THEIR goals?"

    In the 2-player model this was previously the adversary slice of
    COA-Effects-Tensor. That structure was removed in the dimension
    reduction. This stub provides the CDL hook point where adversary
    impact modeling will be restored:

      - CDL Lightweight: basic adversary-impact estimate derived from
        coalition structure and action properties.
      - ARA Phase: full adversary reasoning with separate goal models.

    Stub returns zeros (adversary harm component is dormant).
    Scaled by competitive_salience_scaling_factor in Stage 3b.
    """
    return np.zeros((num_actions, 1))


def update_coalition_state(actor_data, strategic_impact_vector, chosen_actions,
                           exogenous_coalition_effects=None):
    """
    Update coalition health, faction satisfaction, and binding mechanisms
    after a turn completes (CDL Stage 4 update).

    In the full CDL, this processes:
      - Rally effects from negative strategic impacts
      - Friction from policy misalignment with faction interests
      - Erosion of binding mechanisms over time
      - Direct exogenous effects on faction satisfaction

    Stub is a no-op — returns actor_data unchanged.
    """
    return actor_data
