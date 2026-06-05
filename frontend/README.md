# DSM Testing UI

Developer and SME testing interface for the Deterrence Signaling Model (DSM). Provides deep inspection of simulation internals across all five model stages, with dual narrative/analytical views for both subject matter experts and developers.

## Quick Start

### Prerequisites

- Node.js 18+
- DPM backend running locally (see below)
- A MAGIC-generated scenario payload (JSON)

### 1. Start the DPM Backend

From the `Decision-Process-Model/server/src` directory:

```bash
python app_standalone.py
```

This starts a standalone server (no database required) on `http://localhost:8000`.

### 2. Start the UI

```bash
npm install
npm run dev
```

Open `http://localhost:5174`. The UI proxies `/api` requests to the DPM backend automatically.

### 3. Load a Scenario and Run

1. The UI loads available scenarios from the backend's `server/param_sweep/` directory on startup.
2. Select a scenario from the dropdown — this pulls in the full MAGIC-generated payload (actions, objectives, actor profiles, characteristics matrix, etc.).
3. Choose a parameter regime (OWL, HAWK, DOVE, or custom) and optionally tune individual actor parameters.
4. Select the initiating actor and their opening action.
5. Hit **Run Simulation** — the backend executes the DSM event loop and streams results back.

## Using Your Own Payloads

Place MAGIC-generated JSON files in the DPM backend's `server/param_sweep/` directory. The UI discovers them automatically on page load. An example payload is included in `example-payloads/` for reference.

The payload must include `scenario_config` (with `temporal_profiles`, `support_cost_sets`, `commitment_creating_actions`), `scenario_parameters` (with `coa_characteristics_matrix`, `base_cost_vector`, `coa_volatility_vector`, `action_type_vector`), and `actor_profiles` with per-actor parameters. See the example file for the expected structure.

## What You're Looking At

The UI is a three-panel layout:

**Left sidebar** — Navigation tabs (Setup, Simulate, Generate) plus a context-sensitive detail panel. During simulation, clicking an event or action opens the Action Detail Sidebar showing characteristics, temporal profiles, support/cost sets, commitment info, and actor availability. Multi-action events display both actions side-by-side for comparison.

**Main content area** — Top to bottom: a configuration bar, the Action Timeline (DIME-grouped swimlanes with lifecycle bars), the Event Log (turn-by-turn event cards), and the Actor Deep Dive panel at the bottom.

**Right panel** — Collapsible status charts (TPS, escalation level, relationship score) that update as the simulation progresses.

### Action Timeline

Horizontal swimlane visualization grouped by DIME category (Diplomatic, Informational, Military, Economic). Each action appears as a lifecycle bar spanning its active turns. Collapsed view shows density bands; expanded view shows individual action rows. Category headers and action labels stick to the left edge during horizontal scroll.

### Event Inspector

The deep-dive panel for examining what happened at each DSM stage. Toggle between Narrative (plain-language explanations with key metrics) and Analytical (full matrices, vectors, charts, and intermediate calculations) views.

- **Stage 1 — Perception**: Point observation vs. perceived characteristics, uncertainty vectors, signal strength, analytical competence, belief update bias
- **Stage 2 — Interpretation**: Baseline vs. situational priorities, discrepancy vectors, Total Problem Score, action threshold, Goal Ledger with layer decomposition
- **Stage 3 — Decision-Making**: Risk assessment, utility calculations, ranked action lists, Prospect Theory value/loss decomposition with interactive charts
- **Stage 4 — Learning**: Belief updates (APV tensor changes), self-profile evolution, relationship score changes, commitment estimates

### Counterfactual Analysis

Right-click any event in the Event Log to open the Override Panel. Select alternative actions and run a counterfactual branch — the timeline and status charts overlay the branching path against the original for comparison.

## Project Structure

```
src/
├── main.jsx                                # App entry point
├── theme.css                               # CSS custom properties (dark theme)
├── index.css                               # Base styles
│
└── components/
    ├── DSMTestingAppV08.jsx                # Main orchestrator — state, API calls, data wiring
    ├── index.js                            # Top-level exports
    │
    ├── layout/                             # Shell and detail panels
    │   ├── AppShell.jsx                    # Three-panel layout with nav tabs
    │   ├── ActionDetailSidebar.jsx         # Multi-action detail with collapsible sections
    │   ├── ParamDetailSidebar.jsx          # Parameter detail view
    │   └── ActorDeepDive.jsx               # Four-column actor state summary
    │
    ├── setup/                              # Scenario configuration
    │   ├── SetupWizard.jsx                 # Step-by-step configuration flow
    │   ├── GenerateWizard.jsx              # Payload generation wizard
    │   ├── ParameterRegimeSelector.jsx     # Global regime selection with radar chart
    │   ├── ActorConfigPanel.jsx            # Per-actor parameter editing
    │   └── InitialActionSelector.jsx       # DIME-categorized action picker
    │
    ├── simulation/                         # Execution and visualization
    │   ├── ActionTimeline.jsx              # DIME swimlane timeline with sticky labels
    │   ├── TimelineView.jsx                # Event log with counterfactual branching
    │   ├── CurrentStateDashboard.jsx       # Status charts (TPS, escalation, relationship)
    │   ├── GoalLedgerChart.jsx             # Goal ledger trend visualization
    │   └── OverridePanel.jsx               # Counterfactual action selector with heatmap
    │
    └── inspector/                          # Event stage analysis
        ├── EventInspector.jsx              # Stage tabs and narrative/analytical toggle
        └── stages/
            ├── Stage1Perception.jsx        # Signal perception and uncertainty
            ├── Stage2Interpretation.jsx    # Priority evaluation and discrepancy
            ├── Stage3DecisionMaking.jsx    # Utility, risk, prospect theory
            └── Stage4Learning.jsx          # Belief and relationship updates
```

## Architecture

State is centralized in `DSMTestingAppV08.jsx`, which manages scenario configuration, simulation lifecycle, event data, and all UI state via React hooks. Child components receive data and callbacks through props — no external state management library.

Styling uses inline styles with CSS custom properties defined in `theme.css` (dark theme). No component-level CSS files.

All components are designed as self-contained modules with clear props interfaces for portability to CPCN_UI.

## Configuration

### Backend URL

The Vite dev server proxies `/api` to `http://localhost:8000` by default. To point at a different backend:

```bash
VITE_API_URL=http://your-backend:8000 npm run dev
```

### Build Commands

```bash
npm run dev       # Dev server with hot reload (port 5174)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint
```

## Related Repos

- **Decision-Process-Model** — The DSM engine and API server. This UI calls its endpoints.
- **CPCN_UI** — Production interface. Components from this testing UI are designed for portability there.
