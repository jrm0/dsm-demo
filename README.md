# DSM Testing UI — Demo Deployment

Self-contained deployment of the DSM Testing UI v0.8 with the DPM simulation engine.
Lets SMEs run and interact with simulations in the browser.

## Included Scenarios

- **Taiwan v0.8** — 53 actions, 3 parameter profiles (Baseline, Provocative, Isolationist)
- **Taiwan EXP13** — 51 actions, 3 parameter profiles

## Quick Start (Local)

```bash
# Install Python deps
pip install -r requirements.txt

# Build the UI (one-time, or after frontend changes)
cd frontend && npm install && npm run build && cd ..

# Run the server
python app.py
# Open http://localhost:8000
```

## Deploy to Render

1. Create a new GitHub repo and push this directory as its contents:
   ```bash
   cd dsm-demo-deploy
   git init && git add -A && git commit -m "initial"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. On [render.com](https://render.com), create a **New Web Service** and connect the repo.
   Render will auto-detect the Dockerfile.

3. Set environment variables in the Render dashboard:
   - `AUTH_USER` — username for basic auth (e.g., `dsm`)
   - `AUTH_PASS` — password for basic auth

   Leave these unset to disable auth (open access).

4. Deploy. The health check at `/healthz` confirms the service is running.

## Updating

When the DPM engine or Testing UI changes, re-sync from the source repos:

```bash
./update.sh                     # copies engine, scenarios, data, frontend source
cd frontend && npm run build    # rebuild the UI
git add -A && git commit -m "sync updates" && git push
```

Render auto-deploys on push.

## Architecture

```
app.py          — Flask server (based on standalone_app.py)
                  Serves the API + built static UI + optional basic auth
engine/         — DPM simulation engine (unmodified copies)
scenarios/      — Scenario JSON payloads
data/           — Parameter regimes CSV + calibrated defaults
frontend/       — React UI source (Vite + Tailwind)
static/         — Vite build output (served by Flask)
```

The server runs entirely in-memory — no database, no external services.
Each browser session gets its own simulation instance.
