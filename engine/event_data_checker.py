import numpy as np
from enums import NUM_IMPACT_DIMS

class EventDataChecker:
    def __init__(self, num_actors: int, enums: dict):
        self.data_schema = {
            "Situational-Confidence": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": False,
                "source": "3D",
                "backward-links": ["Total-Uncertainty-Score",
                                   "Uncertainty-Sensitivity-Multiplier",
                                   ],
                "equation": "1-(Total\\_Uncertainty\\_Score * Uncertainty\\_Sensitivity\\_Multiplier)"
            },
            "Max-Num-Turns": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "simulation",
                "backward-links": [],
                "equation": ""
            },
            "Configuration-Type": {
                "type": "string",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "simulation",
                "backward-links": [],
                "equation": ""
            },
            "Use-Stochasticity": {
                "type": "boolean",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "simulation",
                "backward-links": [],
                "equation": ""
            },
            "Random-Seed": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "simulation",
                "backward-links": [],
                "equation": ""
            },
            "Random-Distribution": {
                "type": "string",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "simulation",
                "backward-links": [],
                "equation": ""
            },
            "Simulation-Name": {
                "type": "string",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "simulation",
                "backward-links": [],
                "equation": ""
            },
          
            "Crisis-Threshold": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "actor",
                "backward-links": [],
                "equation": ""
            },
            "Deescalation-Bonus-Value": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "actor",
                "backward-links": [],
                "equation": ""
            },
            "Peer-Capability-Ratio": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "actor",
                "backward-links": [],
                "equation": ""
            },
            "Escalatory-Severity-Threshold": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "actor",
                "backward-links": [],
                "equation": ""
            },
            "Aversion-Factor-Value": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "actor",
                "backward-links": [],
                "equation": ""
            },
            "COA-Deescalation-Flag-Vector": {
                "type": "matrix",
                "elements": None,
                "shape": (len(enums['Action']),1),
                "X": "actions",
                "Y": "1",
                "input": True,
                "source": "scenario",
                "backward-links": [],
                "equation": ""
            },
            "Nuclear-Powers": {
                "type": "matrix",
                "elements": None,
                "shape": (num_actors,1),
                "X": "actors",
                "Y": "1",
                "input": True,
                "source": "scenario",
                "backward-links": [],
                "equation": ""
            },
            "Action-Type-Vector": {
                "type": "matrix",
                "elements": None,
                "shape": (len(enums['Action']),1),
                "X": "actions",
                "Y": "1",
                "input": True,
                "source": "scenario",
                "backward-links": [],
                "equation": ""
            },
            "Action-Toggle-Pair-Map": {
                "type": "dict",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "scenario",
                "backward-links": [],
                "equation": ""
            },
            "Initial-Available-Playbook": {
                "type": "matrix",
                "elements": None,
                "shape": (len(enums['Action']),1),
                "X": "actions",
                "Y": "1",
                "input": True,
                "source": "scenario",
                "backward-links": [],
                "equation": ""
            },
            "Current-Available-Playbook": {
                "type": "matrix",
                "elements": None,
                "shape": (len(enums['Action']),1),
                "X": "actions",
                "Y": "1",
                "input": True,
                "source": "actor",
                "backward-links": [],
                "equation": ""
            },
            "Used-One-Off-Actions": {
                "type": "list",
                "elements": None,
                "shape": None,
                "input": True,
                "source": "actor",
                "backward-links": [],
                "equation": ""
            },
          "Other-Profile-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Char']),1),
            "X": "characteristics",
            "Y": "1",
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Other-Profile-Vector-New": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Char']),1),
            "X": "characteristics",
            "Y": "1",
            "input": False,
            "source": "5",
            "backward-links": ["Base-Input-Vectors", "Learning-Rate", "Other-Profile-Vector"],
            "equation": """Other\\_Profile\\_Vector\\_New = (Learning\\_Rate*Base\\_Input\\_Vector) + ((1-Learning\\_Rate)*Other\\_Profile\\_Vector)"""
          },
          "Action-Cost-Matrix": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']), NUM_IMPACT_DIMS),
            "X": "actions",
            "Y": "resource_dimensions",
            "input": True,
            "source": "scenario",
            "backward-links": [],
            "equation": ""
          },
          "Action-Discrepancy-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Action-Sequence": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "event",
            "backward-links": [],
            "equation": ""
          },
          "Action-Weight-Range": {
            "type": "dict",
            "elements": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": False,
                "source": ""
            },
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Actor-Discrepancy-Vectors": {
            "type": "dict",
            "elements": {
                "type": "matrix",
                "elements": None,
                "shape": (len(enums['Goal']),1),
                "X": "objectives",
                "Y": "1",
                "input": False,
                "source": "",
            },
            "shape": None,
            "input": False,
            "source": "2",
            "backward-links": ["Salience-Decay-Multiplier",
                               "Strategic-Impact-Vectors",
                               "Urgency-Sensitivity",
                               "Baseline-Priority-Vector",
                               "Actor-Time-Horizon",
                               "Objectives-Time-Horizon",
                               "Time-Horizon-Discount-Factor",
                               ],
            "equation": ""
          },
          "Actor-Time-Horizon": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Actor-Time-Horizon-New": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "5",
            "backward-links": ["Total-Problem-Score", "Short-Horizon-Threshold", "Long-Horizon-Threshold"],
            "equation": """\\text{if } Total\\_Problem\\_Score > Short\\_Horizon\\_Threshold: \\\\
            \\quad Actor\\_Time\\_Horizon\\_New = Short \\\\
            \\text{else if } Total\\_Problem\\_Score < Long\\_Horizon\\_Threshold: \\\\
            \\quad Actor\\_Time\\_Horizon\\_New = Long \\\\
            \\text{else: }\\\\
            \\quad Actor\\_Time\\_Horizon\\_New = Medium \\\\"""
          },
          # DEPRECATED: Adversary-Threshold is no longer used in the 2-player pipeline.
          # Discrete relationship states replaced by continuous Relationship-Score.
          # Kept in schema for backward compatibility with existing scenario data.
          "Adversary-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "DEPRECATED: No longer drives relationship state transitions."
          },
          "Alliance-Salience": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Ally-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "DEPRECATED: No longer drives relationship state transitions."
          },
          "Analytical-Competence": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Base-Cost-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),1),
            "X": "actions",
            "Y": "1",
            "input": True,
            "source": "scenario",
            "backward-links": [],
            "equation": ""
          },
          "Base-Input-Action-IDs": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "1",
            "backward-links": ["Action-Sequence"],
            "equation": "\\text{Action IDs corresponding to each Base-Input-Vector, for DIM row lookup.}"
          },
          "Base-Input-Vectors": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "1",
            "backward-links": ["Max-Ambiguity-SD", "Inherent-Ambiguity-Vector", "Action-Sequence", "Analytical-Competence", "Relationship-Score", "Z-Score-Range", "Other-Profile-Vector", "Self-Profile-Vector", "Action-Weight-Range", "Belief-Update-Bias", "Signal-Strength-Weights"],
            "equation": """
            stdev\\_estimate = Max\\_Ambiguity\\_SD * (1-action\\_vector[Clarity]) * Inherent\\_Ambiguity\\_Vector[Clarity] \\\\
            perceived\\_mean = action\\_vector \\\\
            perceived\\_stdev = stdev\\_estimate / analytical\\_competence \\\\
            relationship = Relationship\\_State\\_Matrix[Self, Other] \\\\
            threat\\_perception\\_bias = \\text{ 0 if ally, 1 if adversary, 0.5 if neutral} \\\\
            point\\_observation = perceived\\_mean + ((threat\\_perception\\_bias-0.5) * z\\_score\\_range * perceived\\_stdev)
            signal\\_strength = (c\\_1 * point\\_observation[Clarity]) + (c\\_2 * point\\_observation[Severity]) + (c\\_3 * point\\_observation[Irreversibility]) \\\\
            perceived\\_signal\\_strength = signal\\_strength / belief\\_update\\_bias \\\\
            w\\_a = w\\_{min} + (perceived\\_signal\\_strength * (w\\_{max} - w\\_{min})) \\\\
            w\\_m = 1 - w\\_a \\\\
            Base\\_Input\\_Vectors[j] = (w\\_a * point\\_observation) + (w\\_m * APV\\_Tensor[j])"""
          },
          "Base-Risk-Propensity": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Base-Decay-Rate": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Baseline-Priority-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']),1),
            "X": "objectives",
            "Y": "1",
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Belief-Update-Bias": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "COA-Benefits": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),1),
            "X": "actions",
            "Y": "1",
            "input": False,
            "source": "3B",
            "backward-links": ["Alliance-Salience", "Competitive-Salience", "Action-Utility-Matrix", "COA-Playbook", "Adjusted-Discrepancy-Vector", "Total-Problem-Score"],
            "equation": """COA\\_Benefits = MyBenefit+(AllyBenefit*Alliance\\_Salience)+(AdversaryHarm*Competitive\\_Salience)"""
          },
          "Culmination-Diagnostic": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["COA-Benefits", "Action-Cost-Matrix", "Self-Profile-Vector", "Dimension-Feasibility-Profile"],
            "equation": "Enriched culmination: per-dimension profile, severity, constraining dimension"
          },
          "Dimension-Feasibility-Profile": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Surplus-Deficit-Matrix", "COA-Benefits"],
            "equation": "Per-dimension infeasible ratio among positive-benefit actions"
          },
          "Feasibility-Gate": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),),
            "X": "actions",
            "input": False,
            "source": "3B",
            "backward-links": ["Surplus-Deficit-Matrix"],
            "equation": "min\\_dim\\_surplus >= feasibility\\_gate\\_threshold"
          },
          "Surplus-Deficit-Matrix": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']), NUM_IMPACT_DIMS),
            "X": "actions",
            "Y": "resource_dimensions",
            "input": False,
            "source": "3B",
            "backward-links": ["Action-Cost-Matrix", "Self-Profile-Vector"],
            "equation": "(-1 * ACM) + SPV_resource^T"
          },
          "Commitment-Support-Bonus": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Commitment-Landscape"],
            "equation": "Per-action support bonus from commitment landscape"
          },
          "Commitment-Cost-Penalty": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Commitment-Landscape"],
            "equation": "Per-action cost penalty from commitment landscape"
          },
          "Commitment-Penalty-Propensity-Used": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Effective-Risk-Propensity"],
            "equation": "max(0.1, Effective-Risk-Propensity)"
          },
          "Cost-Annotation-Matrix": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "scenario",
            "backward-links": [],
            "equation": "Per-action analyst-facing cost metadata (6 dimensions × 3 bounds)"
          },
          "Cost-Annotation-Accumulator": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "4",
            "backward-links": ["Cost-Annotation-Matrix", "Chosen-Action-Sequence"],
            "equation": "Dimension-appropriate accumulation across turns"
          },
          "Sustaining-Forced-Withdrawals": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "pre-3",
            "backward-links": ["Self-Profile-Vector"],
            "equation": "Sustained actions force-withdrawn due to resource depletion"
          },
          "COA-Characteristics-Matrix": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Char']),len(enums['Action'])),
            "X": "characteristics",
            "Y": "actions",
            "input": True,
            "source": "scenario",
            "backward-links": [],
            "equation": ""
          },
          "COA-Clarity-Score-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),1),
            "X": "actions",
            "Y": "1",
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "COA-Conflict-Matrix": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),len(enums['Action'])),
            "X": "actions",
            "Y": "actions",
            "input": True,
            "source": "scenario",
            "backward-links": [],
            "equation": ""
          },
          "Action-Utility-Matrix": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']),len(enums['Action'])),
            "X": "objectives",
            "Y": "actions",
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "COA-Playbook": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),len(enums['Party'])),
            "X": "actions",
            "Y": "parties",
            "input": True,
            "source": "scenario",
            "backward-links": [],
            "equation": ""
          },
          "COA-Volatility-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),1),
            "X": "actions",
            "Y": "1",
            "input": True,
            "source": "scenario",
            "backward-links": [],
            "equation": ""
          },
          "Candidate-Action-Sequences": {
            "type": "list",
            "elements": {
                "type": "dict",
                "elements": None,
                "shape": None,
                "input": False,
                "source": ""
            },
            "shape": None,
            "input": False,
            "source": "3B,3C,3D",
            "backward-links": ["Provisional-Utility-Vector",
                                "Num-Actions-Explored",
                                "Max-Actions-Per-Turn",
                                "COA-Benefits",
                                "Final-Cost-Vector",
                                "COA-Conflict-Matrix",
                                "Total-Uncertainty-Score",
                                "Clarity-Preference-Scalar",
                                "COA-Clarity-Score-Vector",
                               ],
            "equation": ""
          },
          "Chosen-Action-Sequence": {
              "type": "list",
              "elements": {
                "type": "scalar",
                "elements": None,
              },
              "shape": None,
              "input": False,
              "source": "3D",
              "backward-links": ["Ranked-Response-List", "COA-Characteristics-Matrix", "Action-Discrepancy-Threshold"],
              "equation": ""
          },
          "Chosen-Action-Vectors": {
            "type": "list",
            "elements": {
                "type": "matrix",
                "elements": None,
                "shape": (len(enums['Char']),1),
                "X": "characteristics",
                "Y": "1",
                "input": False,
                "source": ""
            },
            "shape": None,
            "input": False,
            "source": "3D",
            "backward-links": ["Ranked-Response-List", "COA-Characteristics-Matrix", "Action-Discrepancy-Threshold"],
            "equation": ""
          },
          "Commitment-Estimates": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3",
            "backward-links": [],
            "equation": ""
          },
          "Commitment-Weights": {
            "type": "matrix",
            "elements": None,
            "shape": (5,),
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Clarity-Preference-Scalar": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Culmination-Index": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": [
                "COA-Benefits",
                "Final-Cost-Vector",
            ],
            "equation": "Culmination\\_Index = unaffordable\\_count / total\\_top\\_actions"
          },
          "Culmination-Index-Raw": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Culmination-Index"],
            "equation": "\\text{Count of top-benefit actions whose cost exceeds available resources.}"
          },
          "Culmination-Index-Total": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Culmination-Index"],
            "equation": "\\text{Total number of top-benefit actions evaluated.}"
          },
          "Competitive-Salience": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Desperation-Sensitivity": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Effective-Risk-Propensity": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3A",
            "backward-links": ["Base-Risk-Propensity",
                               "Uncertainty-Sensitivity-Multiplier",
                               "Desperation-Sensitivity",
                               "Total-Uncertainty-Score"
                               ],
            "equation": """uncertainty\\_factor = 1 + (Uncertainty\\_Sensitivity\\_Multiplier * Total\\_Uncertainty\\_Score) \\\\
            desperation\\_factor = max(0.1, 1-(Desperation\\_Sensitivity * Total\\_Problem\\_Score)) \\\\
            Effective\\_Risk\\_Propensity = Base\\_Risk\\_Propensity * uncertainty\\_factor * desperation\\_factor"""
          },
          "Feasibility-Scaling-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Final-Cost-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),1),
            "X": "actions",
            "Y": "1",
            "input": False,
            "source": "3B",
            "backward-links": ["Action-Cost-Matrix",
                               "Self-Profile-Vector",
                               "Feasibility-Scaling-Weight",
                               "Base-Cost-Vector"
                               ],
            "equation": """surplus\\_deficit\\_matrix = (-1*Action\\_Cost\\_Matrix) + Self\\_Profile\\_Vector^T \\\\
            total\\_feasibility\\_score = \\sum surplus\\_deficit\\_matrix \\\\
            adjusted\\_feasibility\\_score = 1 + (Feasibility\\_Scaling\\_Weight * total\\_feasibility\\_score) \\\\
            Final\\_Cost\\_Vector = Base\\_Cost\\_Vector / adjusted\\_feasibility\\_score"""
          },
          "Final-Discrepancy-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']),1),
            "X": "objectives",
            "Y": "1",
            "input": False,
            "source": "2",
            "backward-links": [
                "Perceived-Signal-Strengths",
                "Strategic-Impact-Vectors",
                "Urgency-Sensitivity",
                "Baseline-Priority-Vector",
                "Actor-Time-Horizon",
                "Objectives-Time-Horizon",
                "Time-Horizon-Discount-Factor",
            ],
            "equation": """\\text{Aggregation of strategic impact vectors weighted within }\\\\
            \\text{each actor by action order and then between actors by perceived signal strength}"""
          },
          "Goal-Impact-Matrix": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']), len(enums['Action'])),
            "X": "objectives",
            "Y": "actions",
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Goal-Improvement-Matrix": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']), len(enums['Action'])),
            "X": "objectives",
            "Y": "actions",
            "input": False,
            "source": "3B",
            "backward-links": [
                "Action-Utility-Matrix",
                "Final-Discrepancy-Vector",
            ],
            "equation": "Goal\\_Improvement\\_Matrix[g,a] = loss\\_before[g,a] - loss\\_after[g,a]"
          },
          "Goal-Ledger": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']), 1),
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Goal-Ledger-Layers": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Inherent-Ambiguity-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Char']),1),
            "X": "characteristics",
            "Y": "1",
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Learning-Rate": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Long-Horizon-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Max-Actions-Per-Turn": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Max-Ambiguity-SD": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Num-Actions-Explored": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Objectives-Time-Horizon": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']),1),
            "X": "objectives",
            "Y": "1",
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Outcomes-Variance": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Perceived-Signal-Strengths": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "1",
            "backward-links": [
                "Relationship-Score",
                "Signal-Strength-Weights",
                "Belief-Update-Bias",
                "Max-Ambiguity-SD",
                "Inherent-Ambiguity-Vector",
                "Action-Sequence",
                "Analytical-Competence",
                "Z-Score-Range",
            ],
            "equation": """\\text{for each action: }\\\\
            stdev\\_estimate = Max\\_Ambiguity\\_SD * (1-action\\_vector[Clarity]) * Inherent\\_Ambiguity\\_Vector[Clarity] \\\\
            perceived\\_mean = action\\_vector \\\\
            perceived\\_stdev = stdev\\_estimate / analytical\\_competence \\\\
            relationship = Relationship\\_State\\_Matrix[Self, Other] \\\\
            threat\\_perception\\_bias = \\text{ 0 if ally, 1 if adversary, 0.5 if neutral} \\\\
            point\\_observation = perceived\\_mean + ((threat\\_perception\\_bias-0.5) * z\\_score\\_range * perceived\\_stdev)
            signal\\_strength = (c\\_1 * point\\_observation[Clarity]) + (c\\_2 * point\\_observation[Severity]) + (c\\_3 * point\\_observation[Irreversibility]) \\\\
            perceived\\_signal\\_strength = signal\\_strength / belief\\_update\\_bias \\\\"""
          },
          "Persistence-Metadata": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "2",
            "backward-links": [],
            "equation": ""
          },
          "Provisional-Utility-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),1),
            "X": "actions",
            "Y": "1",
            "input": False,
            "source": "3B",
            "backward-links": [
                "Effective-Risk-Propensity",
                "Final-Cost-Vector",
                "COA-Benefits"
            ],
            "equation": """Provisional\\_Utility\\_Vector = COA\\_Benefits - (Effective\\_Risk\\_Propensity * Final\\_Cost\\_Vector)"""
          },
          "Provisional-Utility-Vector-Normalized": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']),1),
            "X": "actions",
            "Y": "1",
            "input": False,
            "source": "3B",
            "backward-links": [
                "Provisional-Utility-Vector",
            ],
            "equation": """2 * (Provisional\\_Utility\\_Vector - min(Provisional\\_Utility\\_Vector)) / (max(Provisional\\_Utility\\_Vector) - min(Provisional\\_Utility\\_Vector)) - 1"""
          },
          "Ranked-Response-List": {
            "type": "list",
            "elements": {
                "type": "dict",
                "elements": None,
                "shape": None,
                "input": False,
                "source": ""
            },
            "shape": None,
            "input": False,
            "source": "3D",
            "backward-links": [
                "Candidate-Action-Sequences",
                "Total-Uncertainty-Score",
                "Uncertainty-Sensitivity-Multiplier",
                "StDev-Spread-Parameter",
                "Effective-Risk-Propensity",
                "COA-Volatility-Vector",
            ],
            "equation": """situational\\_confidence = 1 - (Total\\_Uncertainty\\_Score * Uncertainty\\_Sensitivity\\_Multiplier) \\\\
            outcome\\_uncertainty\\_factor = StDev\\_Spread\\_Parameter * (1 - situational\\_confidence) \\\\
            \\text{for each candidate action sequence: }\\\\
            \\quad \\text{for action } i \\text{ in sequence}\\\\
            \\quad benefit\\_stdev = \\sqrt{\\sum (candidate\\_benefit\\_list[i] * outcome\\_uncertainty\\_factor * COA\\_Volatility\\_Vector[i])^2} \\\\
            \\quad cost\\_stdev = \\sqrt{\\sum (candidate\\_cost\\_list[i] * outcome\\_uncertainty\\_factor * COA\\_Volatility\\_Vector[i])^2} \\\\
            \\quad utility\\_mean = candidate\\_total\\_benefit - (Effective\\_Risk\\_Propensity * candidate\\_total\\_cost) \\\\
            \\quad utility\\_stdev = \\sqrt{benefit\\_stdev^2 + (Effective\\_Risk\\_Propensity * cost\\_stdev)^2} \\\\
            \\\\
            Ranked\\_Response\\_List = \\text{candidate action sequences sorted by utility\\_mean and then by -utility\\_stdev}"""
          },
          "Relationship-Score": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "Scalar in [-1, 1]. Negative = adversarial, zero = neutral, positive = allied."
          },
          "Relationship-Score-New": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3",
            "backward-links": [
                "Strategic-Impact-Vectors",
                "Relationship-Update-Sensitivity",
                "Relationship-Score"
            ],
            "equation": """update = \\sum Relationship\\_Update\\_Sensitivity * \\sum strategic\\_impact \\\\
            Relationship\\_Score\\_New = clip(Relationship\\_Score + update, -1, 1)"""
          },
          "Relationship-Update-Sensitivity": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Coalition-Cost-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{CDL stub parameter. Weight for coalition cost in benefit formula. Default 0.0.}"
          },
          "Network-Cost-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{CDL stub parameter. Weight for network cost in benefit formula. Default 0.0.}"
          },
          "Salience-Decay-Multiplier": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Surprise-Scaling-Factor": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Self-Profile-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Char']),1),
            "X": "characteristics",
            "Y": "1",
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Severity-Activation-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Short-Horizon-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Signal-Strength-Weights": {
            "type": "dict",
            "elements": {
                "type": "scalar",
                "elements": None,
                "shape": None,
                "input": False,
                "source": ""
            },
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "StDev-Spread-Parameter": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Strategic-Impact-Vectors": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "2",
            "backward-links": [
                "Base-Input-Vectors",
                "Base-Input-Action-IDs",
                "Relationship-Score",
                "Goal-Impact-Matrix",
                "Severity-Activation-Threshold",
            ],
            "equation": """\\text{for each action in }Base\\_Input\\_Vectors:\\\\
            \\quad relationship = Relationship\\_State\\_Matrix[Self, actor\\_source] \\\\
            \\quad impact\\_profile = Goal\\_Impact\\_Tensor[relationship, :, action\\_id] \\\\
            \\quad Strategic\\_Impact\\_Vector = impact\\_profile \\times perceived\\_severity"""
          },
          "Surprise-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Tangible-Impacts": {
              "type": "matrix",
                "elements": None,
                "shape": (num_actors, NUM_IMPACT_DIMS, 1),
                "X": "actors",
                "Y": "resource_dimensions",
                "Z": "1",
                "input": False,
                "source": "5",
                "backward-links": [
                    "Self-Impact-Matrix",
                    "Adversary-Impact-Matrix",
                    "Self-Impact-StDev-Matrix",
                    "Adversary-Impact-StDev-Matrix",
                    "Outcomes-Variance",
                    "Chosen-Action-Sequence",
                ],
                "equation": """\\text{for each chosen action } a_i:\\\\
                \\quad mean = Impact\\_Matrix[a_i, :] \\\\
                \\quad stdev = Impact\\_StDev\\_Matrix[a_i, :] * Outcomes\\_Variance \\\\
                \\quad \\text{update } Tangible\\_Impacts[Actor] \\text{ using mean and stdev}"""
          },
          "Self-Impact-Matrix": {
              "type": "matrix",
              "elements": None,
              "shape": (len(enums['Action']), NUM_IMPACT_DIMS),
              "X": "actions",
              "Y": "resource_dimensions",
              "input": True,
              "source": "actor",
              "backward-links": [],
              "equation": ""
          },
          "Adversary-Impact-Matrix": {
              "type": "matrix",
              "elements": None,
              "shape": (len(enums['Action']), NUM_IMPACT_DIMS),
              "X": "actions",
              "Y": "resource_dimensions",
              "input": True,
              "source": "actor",
              "backward-links": [],
              "equation": ""
          },
          "Self-Impact-StDev-Matrix": {
                "type": "matrix",
                "elements": None,
                "shape": (len(enums['Action']), NUM_IMPACT_DIMS),
                "X": "actions",
                "Y": "resource_dimensions",
                "input": True,
                "source": "actor",
                "backward-links": [],
                "equation": ""
          },
          "Adversary-Impact-StDev-Matrix": {
                "type": "matrix",
                "elements": None,
                "shape": (len(enums['Action']), NUM_IMPACT_DIMS),
                "X": "actions",
                "Y": "resource_dimensions",
                "input": True,
                "source": "actor",
                "backward-links": [],
                "equation": ""
          },
          "Time-Horizon-Discount-Factor": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Adjusted-Discrepancy-Vector": {
            "type": "matrix",
            "elements": "Goal",
            "shape": (len(enums['Goal']), 1),
            "X": "objectives",
            "Y": "1",
            "input": False,
            "source": "3.0",
            "backward-links": ["Final-Discrepancy-Vector", "Action-Utility-Matrix", "World-State-Timeline"],
            "equation": "\\text{Final-Discrepancy - Expected-Sustained-Contribution. Equals Final-Discrepancy when temporal layer inactive.}"
          },
          "Expected-Sustained-Contribution": {
            "type": "matrix",
            "elements": "Goal",
            "shape": (len(enums['Goal']), 1),
            "X": "objectives",
            "Y": "1",
            "input": False,
            "source": "3.0",
            "backward-links": ["Action-Utility-Matrix", "World-State-Timeline"],
            "equation": "\\sum_a AUM[:,a] \\times f_s \\times (n_a+1)^{-d_e} \\text{ for surviving SUSTAINING actions. Zeros when layer inactive.}"
          },
          "Sustaining-Review-Results": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3.0",
            "backward-links": ["Action-Utility-Matrix", "Final-Discrepancy-Vector", "World-State-Timeline"],
            "equation": "\\text{Withdrawal decisions: withdraw_list_coa_ids, forced_withdrawals. Empty lists when layer inactive.}"
          },
          "Continuation-Review-Results": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3.0",
            "backward-links": ["Action-Utility-Matrix", "Final-Discrepancy-Vector", "World-State-Timeline"],
            "equation": "\\text{Cancellation decisions: cancel_list_coa_ids. Empty list when layer inactive.}"
          },
          "Total-Problem-Score": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3A",
            "backward-links": [
                "Adjusted-Discrepancy-Vector"
            ],
            "equation": "Total\\_Problem\\_Score = ||Adjusted\\_Discrepancy\\_Vector||"
          },
          "PT-TPS-Previous": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Persisted from prior turn's Total-Problem-Score. Default 0.0 on first turn.}"
          },
          "PT-Reference-Point": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3A",
            "backward-links": ["Total-Problem-Score", "PT-Reference-Persistence"],
            "equation": "ref_t = \\rho \\cdot ref_{t-1} + (1-\\rho) \\cdot TPS_{t-1}. \\text{ Initialized to TPS_0 on Turn 0.}"
          },
          "PT-Reference-Persistence": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\rho \\in [0,1]. \\text{ Controls EWMA drift rate. 0.95 = slow adaptation, 0.0 = reset every turn.}"
          },
          "PT-Enabled": {
            "type": "boolean",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Master toggle for Prospect Theory distortion. Default True.}"
          },
          "PT-Alpha": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Value function curvature (diminishing sensitivity). Default 0.88.}"
          },
          "PT-Lambda": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Loss aversion multiplier. Default 2.25.}"
          },
          "Temporal-Discount-Rate": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Per-actor time preference for delayed benefits. Resolved to system default (0.1) at setup if not specified.}"
          },
          "Withdrawal-Reluctance-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Sunk-cost bias for sustaining actions. Higher = more reluctant to withdraw. Resolved to system default (0.3) at setup.}"
          },
          "Cancellation-Reluctance-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Sunk-cost bias for in-progress actions. Higher = more reluctant to cancel. Resolved to system default (0.4) at setup.}"
          },
          "Anticipatory-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Forward-looking planning tendency. Hard cap 0.3. Resolved to system default (0.2) at setup.}"
          },
          "PT-TPS-Delta": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3A",
            "backward-links": [
                "Total-Problem-Score",
                "PT-TPS-Previous"
            ],
            "equation": "PT\\_TPS\\_Delta = Total\\_Problem\\_Score - PT\\_TPS\\_Previous"
          },
          "PT-TPS-Previous-Used": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3A",
            "backward-links": [
                "PT-TPS-Previous"
            ],
            "equation": "PT\\_TPS\\_Previous\\_Used = PT\\_TPS\\_Previous \\text{ (persisted from prior turn)}"
          },
          "PT-Domain": {
            "type": "string",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3A",
            "backward-links": [
                "PT-TPS-Delta"
            ],
            "equation": "\\text{if } PT\\_TPS\\_Delta > 0.01: \\text{losses} \\quad \\text{elif } PT\\_TPS\\_Delta < -0.01: \\text{gains} \\quad \\text{else: neutral}"
          },
          "Total-Uncertainty-Score": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3A",
            "backward-links": [
                "Uncertainty-Vectors",
            ],
            "equation": "Total\\_Uncertainty\\_Score = avg(Uncertainty\\_Vectors)"
          },
          "Uncertainty-Sensitivity-Multiplier": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Uncertainty-Vectors": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "1",
            "backward-links": [
                "Surprise-Weight",
                "Surprise-Scaling-Factor",
                "Z-Score-Range",
                "Relationship-Score",
                "Analytical-Competence",
                "Max-Ambiguity-SD",
                "Inherent-Ambiguity-Vector",
                "Action-Sequence",
            ],
            "equation": """
            stdev\\_estimate = Max\\_Ambiguity\\_SD * (1-action\\_vector[Clarity]) * Inherent\\_Ambiguity\\_Vector[Clarity] \\\\
            perceived\\_mean = action\\_vector \\\\
            perceived\\_stdev = stdev\\_estimate / analytical\\_competence \\\\
            relationship = Relationship\\_State\\_Matrix[Self, Other] \\\\
            threat\\_perception\\_bias = \\text{ 0 if ally, 1 if adversary, 0.5 if neutral} \\\\
            point\\_observation = perceived\\_mean + ((threat\\_perception\\_bias-0.5) * Z\\_Score\\_Range * perceived\\_stdev) \\\\
            surprise\\_score = Surprise\\_Scaling\\_Factor * (point\\_observation - apv)^2 \\\\
            Uncertainty\\_Vector = (Surprise\\_Weight * surprise\\_score) + (Ambiguity\\_Weight * perceived\\_mean)
            """
          },
          "Urgency-Sensitivity": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Urgency-Blending-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": ""
          },
          "Z-Score-Range": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": ""
          },
          "Temporal-Context": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "temporal_preprocessor",
            "backward-links": [],
            "equation": "\\text{Temporal pre-processor output: observable\\_events, transitioned\\_ids. Empty dict when layer inactive. Reviews relocated to Stage 3.0.}"
          },
          "Temporal-Observable-Events": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "1",
            "backward-links": ["Temporal-Context"],
            "equation": "\\text{Unpacked from Temporal-Context. List of ObservableEvent objects for current actor's turn. Empty list when layer inactive.}"
          },
          "Temporal-Transitioned-IDs": {
            "type": "set",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "1",
            "backward-links": ["Temporal-Context"],
            "equation": "\\text{Unpacked from Temporal-Context. Set of record IDs that transitioned lifecycle state this turn. Empty set when layer inactive.}"
          },
          "Temporal-Profiles": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Per-actor map of coa\\_id to ActionTemporalProfile. Parsed from scenario config (shared default) or actor payload (override). Empty dict when layer inactive.}"
          },
          "Temporal-Params": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{System-level temporal simulation parameters (perception\\_threshold, expiry\\_threshold, etc.). Always present with defaults.}"
          },
          "Temporal-Layer-Active": {
            "type": "boolean",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{True when temporal profiles are defined. False = all temporal code paths produce v2.0-equivalent passthrough behavior.}"
          },
          "World-State-Timeline": {
            "type": "object",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{WorldStateTimeline instance tracking all ActionLifecycleRecords across the simulation. None when layer inactive.}"
          },
          "Sustaining-Review": {
            "type": "object",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{SustainingReview instance. Injected by model.py for Stage 3.0 consumption. None when layer inactive.}"
          },
          "Continuation-Review": {
            "type": "object",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{ContinuationReview instance. Injected by model.py for Stage 3.0 consumption. None when layer inactive.}"
          },

          # ---------------------------------------------------------------
          # Commitment Register fields (v0.8 PR 2)
          # ---------------------------------------------------------------

          "Commitment-Layer-Active": {
            "type": "boolean",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{True when support/cost sets or commitment-creating actions are defined. False = all commitment code paths return passthrough.}"
          },
          "Commitment-Params": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{System-level commitment simulation parameters (influence\\_base, decay\\_exponent, etc.). Always present with defaults.}"
          },
          "Support-Cost-Sets": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Per-actor support/cost set definitions. Scenario config default with per-actor override. Empty dict when not defined.}"
          },
          "Commitment-Creating-Actions": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Per-actor map of coa\\_id to CommitmentCreatingActionMeta. Scenario config default with per-actor override. Empty dict when not defined.}"
          },
          "Commitment-Register-State": {
            "type": "object",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Serialized CommitmentRegister per actor. Persisted across turns. Empty register when commitment layer inactive.}"
          },
          "PAPT-State": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Perceived Adversary Posture Trend state: posture\\_trend, severity\\_running\\_average, trend\\_confidence. Initialized to neutral.}"
          },
          "Adversary-Commitment-Register-State": {
            "type": "object",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Serialized CommitmentRegister for the adversary. Used for proposal response eligibility gating.}"
          },
          "Proposal-Response-Actions": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Per-actor map of coa\\_id to ProposalResponseActionMeta. Scenario config default with per-actor override.}"
          },
          # --- Commitment computed fields (populated by event.py pipeline) ---
          "Commitment-Landscape": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Commitment-Register-State", "Support-Cost-Sets", "Commitment-Params"],
            "equation": "\\text{Transient per-turn landscape: support\\_bonuses, cost\\_penalties, hard\\_constraints per candidate COA. Empty dict when layer inactive.}"
          },
          "Screened-COA-List": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Commitment-Landscape", "Current-Available-Playbook"],
            "equation": "\\text{List of COA IDs that pass screening filter (temporal exclusion + hard constraint). All available actions when layer inactive.}"
          },
          "Reconsideration-Active": {
            "type": "boolean",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Commitment-Params", "PAPT-State", "Final-Discrepancy-Vector", "Temporal-Transitioned-IDs", "Goal-Ledger-Layers"],
            "equation": "\\text{True when any reconsideration trigger fires. Dampens implicit commitment influence and relaxes hard constraints.}"
          },
          "Reciprocity-Modifier": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["PAPT-State", "Commitment-Params"],
            "equation": "1.0 + (sensitivity \\times posture\\_trend \\times confidence \\times -1). Clamped to [floor, \\infty). Modulates de-escalation bonus."
          },
          "Fulfillment-Bonus": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["Commitment-Register-State", "Commitment-Params"],
            "equation": "\\text{Per-action bonus from triggered explicit commitments. credibility\\_stake × audience\\_cost\\_exposure × weight.}"
          },
          "Triggered-Commitment-IDs": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3",
            "backward-links": ["Commitment-Register-State", "Base-Input-Vectors"],
            "equation": "\\text{IDs of explicit commitments newly triggered this turn by perceived adversary actions.}"
          },
          "Expired-Commitment-IDs": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3",
            "backward-links": ["Commitment-Register-State"],
            "equation": "\\text{IDs of untriggered explicit commitments that expired this turn (past expiry\\_turns).}"
          },
          "Commitment-Violations": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3",
            "backward-links": ["Commitment-Register-State", "Chosen-Action-Sequence"],
            "equation": "\\text{List of violation/fulfillment records: commitment\\_id, outcome, credibility\\_cost, audience\\_cost, credibility\\_boost.}"
          },
          "Activated-Proposal-Responses": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3",
            "backward-links": ["Commitment-Register-State", "Current-Available-Playbook"],
            "equation": "\\text{COA IDs of Accept/Reject actions activated for pending proposals.}"
          },
          "Proposal-Resolutions": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3",
            "backward-links": ["Commitment-Register-State", "Chosen-Action-Sequence"],
            "equation": "\\text{List of proposal resolution records: proposal\\_commitment\\_id, outcome, promise IDs.}"
          },
          #
          # Simulation parameters are bundled inside the Commitment-Params
          # dict and accessed via commitment_params['param_name'], not as
          # top-level event_data keys. See commitment.py extract_commitment_params()
          # for the full list with defaults.

          # ---------------------------------------------------------------
          # Infrastructure / game-loop keys injected into event_data
          # ---------------------------------------------------------------

          "Turn-Mode": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "simulation",
            "backward-links": [],
            "equation": "\\text{TurnMode enum: Sequential (0), Simultaneous (1). Controls turn structure.}"
          },
          "Alternating-Initiative": {
            "type": "boolean",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "simulation",
            "backward-links": [],
            "equation": "\\text{When True, sequential turn order alternates each turn. Default False.}"
          },
          "Exogenous-Events": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "simulation",
            "backward-links": [],
            "equation": "\\text{List of exogenous event configurations. Each entry defines trigger conditions and action sequences.}"
          },
          "Current-Turn": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{Zero-based turn index injected by the game loop. Default 0.}"
          },
          "Is-Prescriptive": {
            "type": "boolean",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{When True, actor follows a prescribed action sequence instead of computing one. Default False.}"
          },

          # ---------------------------------------------------------------
          # Relationship modifiers (system-level, from simulation_parameters)
          # ---------------------------------------------------------------

          "Relationship-Modifier-Ally": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{GIM modifier for actions tagged as Ally relationship. Default -0.3.}"
          },
          "Relationship-Modifier-Neutral": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{GIM modifier for actions tagged as Neutral relationship. Default 0.3.}"
          },
          "Relationship-Modifier-Adversary": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{GIM modifier for actions tagged as Adversary relationship. Default 1.0.}"
          },

          # ---------------------------------------------------------------
          # Persisted inter-turn state (carried on actor dicts)
          # ---------------------------------------------------------------

          "Previous-Discrepancy-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']), 1),
            "X": "objectives",
            "Y": "1",
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Prior turn's Final-Discrepancy-Vector. Used in continuation review. None on first turn.}"
          },
          "Previous-Commitment-Estimate": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Prior turn's Commitment-Estimates. Used for commitment trend tracking. None on first turn.}"
          },
          "Goal-Ledger-History": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{List of prior Goal-Ledger snapshots. Used for reconsideration trigger detection. Empty list on first turn.}"
          },
          "Exogenous-Coalition-Effects": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{CDL coalition effects from exogenous events. None when CDL inactive.}"
          },
          "Temporal-Planning-Heuristic": {
            "type": "object",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{PlanningHeuristic instance for anticipatory planning. None when temporal layer inactive.}"
          },

          # ---------------------------------------------------------------
          # Cognitive / strategic tuning parameters (actor-level, per-actor)
          # ---------------------------------------------------------------

          "Alliance-Salience-Scaling-Factor": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Multiplier on Alliance-Salience in COA-Benefits calculation. Default 0.0 (disabled).}"
          },
          "Competitive-Salience-Scaling-Factor": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Multiplier on Competitive-Salience in COA-Benefits calculation. Default 0.0 (disabled).}"
          },
          "Diminishing-Returns-Rate": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Steepness of sigmoid diminishing returns on repeated action usage. Default 5.0.}"
          },
          "Problem-Focus-Parameter": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Controls priority blending between baseline and urgency-driven priorities. Read in Stage 2.}"
          },
          "Desperation-Scaling-Factor": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Scales desperation effect on risk propensity in Stage 3A. Default 1.0.}"
          },
          "Base-Risk-Scaling-Factor": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Multiplier on base risk propensity in Effective-Risk-Propensity calculation. Default 1.0.}"
          },
          "Bias-Amplification-Parameter": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Amplifies threat-perception bias in Stage 1 signal interpretation. Default 1.0 (neutral).}"
          },
          "Priority-Blending-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Weight for blending baseline vs. urgency-driven priority vectors in Stage 2. Default 0.5.}"
          },
          "Action-Efficacy-Discount": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Self-efficacy discount on projected action effects. 1.0 = full confidence. Default 0.9.}"
          },
          "Vindictiveness-Parameter": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Weight for adversary-harm component in benefit calculation. Default 0.0 (disabled).}"
          },

          # ---------------------------------------------------------------
          # Engine tuning parameters (system-level, from simulation_parameters)
          # ---------------------------------------------------------------

          "Sigmoid-Slope-K": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{Slope parameter for sigmoid activation in Stage 1. Default 4.0.}"
          },
          "Sigmoid-Midpoint-Tau": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{Midpoint parameter for sigmoid activation in Stage 1. Default 0.1.}"
          },
          "Relevance-Activation-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{Minimum activation level for relevance filtering. Default 0.0.}"
          },
          "Outranking-Indifference-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{PROMETHEE q threshold (indifference). Default 0.01.}"
          },
          "Outranking-Preference-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{PROMETHEE p threshold (strict preference). Default 0.05.}"
          },
          "Feasibility-Penalty-Exponent": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{Exponent for feasibility penalty in cost adjustment. Default 1.0.}"
          },
          "Risk-Reward-Blender-Parameter": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": True,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Blending parameter for risk-reward tradeoff in sequence ranking. Default 0.0.}"
          },
          "Feasibility-Gate-Threshold": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{Minimum surplus-deficit for an action to pass the feasibility gate. Default -0.1.}"
          },
          "Cost-Horizon-Weight": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "system",
            "backward-links": [],
            "equation": "\\text{Weight for temporal cost horizon discounting. Default 0.5.}"
          },

          # ---------------------------------------------------------------
          # Prospect Theory parameters (§6.1–6.2)
          # ---------------------------------------------------------------

          "Reference-Point-Type": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{ReferencePointType enum: StatusQuo (0), Aspiration (1), Adaptive (2). Controls PT reference framing.}"
          },
          "Reference-Adaptation-Rate": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{EWMA smoothing rate for Adaptive reference point mode. Default 0.3. Only consumed when Reference-Point-Type = Adaptive.}"
          },

          # ---------------------------------------------------------------
          # Goal-Veto-Thresholds (§6.3 — active actor parameter)
          # ---------------------------------------------------------------

          "Goal-Veto-Thresholds": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']), 1),
            "X": "objectives",
            "Y": "1",
            "input": False,
            "source": "actor",
            "backward-links": [],
            "equation": "\\text{Per-goal veto threshold for PROMETHEE outranking. None = no veto. Enables red-line goals.}"
          },

          # ---------------------------------------------------------------
          # Active intermediate structures — written and consumed in the
          # decision loop (§6.4)
          # ---------------------------------------------------------------

          "Action-Usage-Counts": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']), 1),
            "X": "actions",
            "Y": "1",
            "input": False,
            "source": "3B",
            "backward-links": [],
            "equation": "\\text{Per-action cumulative usage count for diminishing returns. Persisted across turns. Initialized to zeros.}"
          },
          "Action-Usage-Counts-New": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']), 1),
            "X": "actions",
            "Y": "1",
            "input": False,
            "source": "4",
            "backward-links": ["Action-Usage-Counts", "Chosen-Action-Sequence"],
            "equation": "\\text{Updated usage counts after current turn's chosen actions. Persisted to actor data.}"
          },
          "Chosen-Adversary-Targets": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3D",
            "backward-links": ["Candidate-Action-Sequences"],
            "equation": "\\text{Per-action target actor indices for the chosen sequence. Used in Stage 4 impact application.}"
          },
          "Current-Available-Playbook-New": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']), 1),
            "X": "actions",
            "Y": "1",
            "input": False,
            "source": "4",
            "backward-links": ["Current-Available-Playbook", "Chosen-Action-Sequence", "Action-Toggle-Pair-Map"],
            "equation": "\\text{Updated action availability mask after one-off and toggle state changes. Persisted.}"
          },
          "Self-Credibility-Delta": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "4",
            "backward-links": ["Commitment-Violations"],
            "equation": "\\text{Net credibility adjustment from commitment fulfillment/violation. Applied to SPV[Credibility].}"
          },
          "Reference-Point-Vector": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Goal']), 1),
            "X": "objectives",
            "Y": "1",
            "input": False,
            "source": "pre-1",
            "backward-links": ["Reference-Point-Type", "Goal-Ledger", "Baseline-Priority-Vector"],
            "equation": "\\text{PT reference point in goal space. StatusQuo=Goal-Ledger, Aspiration=-BPV, Adaptive=EWMA blend.}"
          },

          # ---------------------------------------------------------------
          # Diagnostic / metadata structures — written for inspection,
          # not consumed downstream (§6.4)
          # ---------------------------------------------------------------

          "PT-Adjusted-Benefits": {
            "type": "matrix",
            "elements": None,
            "shape": (len(enums['Action']), 1),
            "X": "actions",
            "Y": "1",
            "input": False,
            "source": "3B",
            "backward-links": ["COA-Benefits", "Reference-Point-Vector", "PT-Alpha", "PT-Lambda"],
            "equation": "\\text{PT-distorted benefit vector. Diagnostic output capturing prospect theory framing effect on utility.}"
          },
          "PT-Prospect-Values": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3C",
            "backward-links": ["Candidate-Action-Sequences", "Reference-Point-Vector", "PT-Alpha", "PT-Lambda"],
            "equation": "\\text{Per-candidate prospect values for sequence ranking inspection. Diagnostic.}"
          },
          "PT-Priority-Weights": {
            "type": "list",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3C",
            "backward-links": ["Adjusted-Discrepancy-Vector"],
            "equation": "\\text{Normalized priority weights used in PT calculation. Diagnostic.}"
          },
          "PT-Alpha-Used": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["PT-Alpha"],
            "equation": "\\text{Alpha parameter value actually used in this turn's PT calculation. Diagnostic.}"
          },
          "PT-Lambda-Used": {
            "type": "scalar",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "3B",
            "backward-links": ["PT-Lambda"],
            "equation": "\\text{Lambda parameter value actually used in this turn's PT calculation. Diagnostic.}"
          },
          "Exogenous-Relationship-Tags": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "1",
            "backward-links": ["Action-Sequence"],
            "equation": "\\text{Maps observation index to RelationshipTag for exogenous events. Drives GIM modifier in Stage 2.}"
          },
          "Exogenous-Goal-Impact-Overrides": {
            "type": "dict",
            "elements": None,
            "shape": None,
            "input": False,
            "source": "1",
            "backward-links": ["Action-Sequence"],
            "equation": "\\text{Maps observation index to goal impact vector for exogenous events with explicit impact.}"
          },
        }

        self.update_forward_links()

        self.num_actors = num_actors

    def update_forward_links(self):
        """
        Updates the forward-links in the data schema based on the backward-links.
        :return: None
        """
        for key, schema in self.data_schema.items():
            schema["forward-links"] = []

        for key, schema in self.data_schema.items():
            for link in schema.get("backward-links", []):
                if link in self.data_schema:
                    self.data_schema[link].setdefault("forward-links", []).append(key)
                else:
                    raise KeyError(f"Backward link '{link}' in element '{key}' not found in data schema.")

    def metadata(self):
        """
        Returns the data schema as a JSON-ifiable dict. Converts numpy shapes to lists for JSON serialization.
        """
        def convert(item):
            if isinstance(item, dict):
                return {k: convert(v) for k, v in item.items()}
            elif isinstance(item, list):
                return [convert(i) for i in item]
            elif isinstance(item, tuple):
                return list(item)
            else:
                return item

        return convert(self.data_schema)
        
    def check_element(self, element_name: str, element: any, schema: dict):
        """
        Check if the element matches the schema element.
        :param element_name: name of the element for error printing purposes
        :param element: data to be checked
        :param schema: corresponding schema element
        :return:
        """
        if schema["type"] == "scalar":
            if not isinstance(element, (int, float)):
                raise TypeError(f"Element '{element_name}' should be a scalar, got {type(element)}")
        elif schema["type"] == "string":
            if not isinstance(element, str):
                raise TypeError(f"Element '{element_name}' should be a string, got {type(element)}")
        elif schema["type"] == "boolean":
            if not isinstance(element, bool):
                raise TypeError(f"Element '{element_name}' should be a boolean, got {type(element)}")
        elif schema["type"] == "matrix":
            if not isinstance(element, np.ndarray):
                raise TypeError(f"Element '{element_name}' should be a matrix (numpy ndarray), got {type(element)}")
            if element.shape != schema["shape"]:
                raise ValueError(f"Element '{element_name}' shape mismatch: expected {schema['shape']}, got {element.shape}")
        elif schema["type"] == "list":
            if not isinstance(element, list):
                raise TypeError(f"Element '{element_name}' should be a list, got {type(element)}")
            if schema["elements"] is not None:
                for e in element:
                    self.check_element(f'{element_name}_element', e, schema["elements"])
        elif schema["type"] == "dict":
            if not isinstance(element, dict):
                raise TypeError(f"Element '{element_name}' should be a dict, got {type(element)}")
        elif schema["type"] == "set":
            if not isinstance(element, set):
                raise TypeError(f"Element '{element_name}' should be a set, got {type(element)}")
        elif schema["type"] == "object":
            # Opaque objects (e.g., WorldStateTimeline) — type-check skipped
            pass
        else:
            raise ValueError(f"Unknown type '{schema['type']}' for element '{element_name}'")

    def check_data(self, data: dict, input = True):
        """
        Check if the data matches the schema.
        :param data: data to be checked
        :param input: if True, check only input elements.
                      Elements with input=False are optional: they are skipped
                      when checking inputs, and tolerated as absent when
                      checking the full schema (they have runtime defaults).
        :return: True if data matches the schema, raises an error otherwise.
        """
        for key, schema in self.data_schema.items():
            if input and not schema["input"]:
                continue
            if key not in data:
                if not schema["input"]:
                    continue  # optional element with a runtime default
                raise KeyError(f"Missing required element '{key}'")
            self.check_element(key, data[key], schema)
        return True

    def get_params_of_source(self, source: str):
        """
        Returns a list of actor parameters.
        :return: list of actor parameters
        """
        return {key: schema for key, schema in self.data_schema.items() if schema["source"] == source}

def transform_to_variable_name(name: str):
    """
    Transforms a string to a valid Python variable name. Replaces dashes with underscores and sets to lowercase.
    :param name:
    :return:
    """
    name = name.replace("-", "_").lower()
    if not re.match(r'^[a-z_][a-z0-9_]*$', name):
        raise ValueError(f"Invalid variable name: {name}")
    return name

def transform_to_variable_type(type: str) -> str:
    type_map = {
        "scalar": "float",
        "matrix": "np.ndarray",
        "list": "list",
        "dict": "dict",
        "string": "str",
        "boolean": "bool",
    }
    if type not in type_map:
        raise ValueError(f"Unknown type: {type}")
    return type_map[type]

import re
from pathlib import Path
import json

def extract_data_keys(py_file: str):
    """
        Extracts all unique keys from data["<text>"] in a Python file.
        Used to create a data schema from a Python file.
    """
    text = Path(py_file).read_text()

    # Regex to find data["<text>"]
    matches = re.findall(r'data\["([^"]+)"\]', text)

    unique_keys = sorted(set(matches))

    result = {
        key: {"type": "", "elements": None, "shape": None, "input": False, "source": ""}
        for key in unique_keys
    }

    return result

def print_args(checker):
    actor_params = {
        transform_to_variable_name(name): transform_to_variable_type(schema["type"])
        for name, schema in checker.get_params_of_source("actor").items()}

    system_params = {
        transform_to_variable_name(name): transform_to_variable_type(schema["type"])
        for name, schema in checker.get_params_of_source("system").items()}

    print(", \n".join([f"{name}: {type} = None" for name, type in actor_params.items()]))
    print("\n\n")
    print(", \n".join([f"{name}: {type} = None" for name, type in system_params.items()]))

def print_set_args(checker):
    actor_params = {
        transform_to_variable_name(name): name
        for name, _ in checker.get_params_of_source("actor").items()
    }
    system_params = {
        transform_to_variable_name(name): name
        for name, _ in checker.get_params_of_source("system").items()
    }

    print("\n".join([
        f"if {vname} is not None:\n\tself.profile['{name}'] = {vname}"
        for vname, name in actor_params.items()]))

    print("\n\n")

    print("\n".join([
        f"if {vname} is not None:\n\tself.profile['{name}'] = {vname}"
        for vname, name in system_params.items()]))

def print_sizes(checker):
    """
    Prints the sizes of all elements in the data schema. First for actor, then for system.
    """
    actor_params = checker.get_params_of_source("actor")
    system_params = checker.get_params_of_source("system")

    print("\n".join([f"{name}: {schema['shape']}" for name, schema in actor_params.items()]))
    print("\n\n")
    print("\n".join([f"{name}: {schema['shape']}" for name, schema in system_params.items()]))

# Example usage
if __name__ == "__main__":
    # d = extract_data_keys("event.py")
    # print(json.dumps(d, indent=2))
    checker = EventDataChecker(num_actors=3)
    print(json.dumps(checker.metadata(), indent=2))
    # json_schema = checker.data_schema
    # # convert 'shape' tuples to lists for JSON serialization
    # for schema in json_schema.values():
    #     if isinstance(schema["shape"], tuple):
    #         schema["shape"] = list(schema["shape"])
    # output to JSON file
    with open("sample_data/data_schema_3_player.json", "w") as f:
        json.dump(checker.metadata(), f, indent=2)

    # print_args(checker)
    # print("\n")
    # print_set_args(checker)
    # print("\n")
    # print_sizes(checker)
    # print("\n")
    #
    # actor_params = checker.get_params_of_source("actor")
    # actor_params = [f"{name}: {schema["shape"]}" for name, schema in actor_params.items() if schema["type"] == "matrix"]
    # print("\n".join(actor_params))

