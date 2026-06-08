import React, { useState, useCallback } from "react";

/**
 * AppShell - v0.8 Top-Level Layout
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * Three-panel architecture:
 *   Left Sidebar   │  Main Content Area
 *   (nav + action  │  ┌─ Config Bar (collapsed setup) ─┐
 *    detail)        │  │ Timeline                       │
 *                   │  │ Event Log                      │
 *                   │  │ Deep-Dive Panel                │
 *                   │  └────────────────────────────────┘
 */

// ─── Navigation Items ───
const NAV_ITEMS = [
  { id: "generate",   label: "Generate",   icon: "⬡" },
  { id: "simulation", label: "Simulation", icon: "▸" },
  { id: "scenarios",  label: "Scenarios",  icon: "◈" },
  { id: "dashboard",  label: "Dashboard",  icon: "◫" },
  { id: "help",       label: "Help",       icon: "?" },
];

// ─── Sidebar Navigation ───
const SidebarNav = ({ activeView, onNavigate }) => (
  <nav style={{
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
  }}>
    {NAV_ITEMS.map((item) => {
      const isActive = activeView === item.id;
      return (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            width: "100%",
            padding: "9px 16px",
            border: "none",
            background: isActive ? "var(--accent-dim)" : "transparent",
            borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
            color: isActive ? "var(--accent)" : "var(--text-secondary)",
            fontSize: "12px",
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              e.currentTarget.style.background = "var(--bg-card)";
              e.currentTarget.style.color = "var(--text-primary)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }
          }}
        >
          <span style={{ width: 16, textAlign: "center", fontSize: 13, opacity: 0.7 }}>
            {item.icon}
          </span>
          {item.label}
        </button>
      );
    })}
  </nav>
);

// ─── Config Bar (collapsed setup) ───
const ConfigBar = ({ scenario, regime, timescale, actors, instigatingAction, onExpand }) => {
  if (!scenario) return null;

  const chips = [
    { label: "Scenario", value: scenario.name || scenario.scenario_name || "Unknown" },
    regime && { label: "Regime", value: regime },
    timescale && { label: "Timescale", value: timescale },
    actors?.[0] && { label: "Blue", value: actors[0].name, color: "var(--blue)" },
    actors?.[1] && { label: "Red", value: actors[1].name, color: "var(--red)" },
    instigatingAction && { label: "Instigating Action", value: `${instigatingAction.actorName}: ${instigatingAction.actionName}`, color: "var(--gold)" },
  ].filter(Boolean);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "8px 20px",
      background: "var(--bg-main)",
      borderBottom: "1px solid var(--border)",
      fontSize: "11px",
      flexShrink: 0,
      minHeight: "var(--config-bar-height)",
    }}>
      {chips.map((chip, i) => (
        <div key={i} style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "4px",
          padding: "4px 10px",
        }}>
          <span style={{
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "var(--text-dim)",
          }}>
            {chip.label}
          </span>
          <span style={{
            color: chip.color || "var(--text-primary)",
            fontWeight: 500,
          }}>
            {chip.value}
          </span>
        </div>
      ))}
      <button
        onClick={onExpand}
        style={{
          marginLeft: "auto",
          color: "var(--text-dim)",
          cursor: "pointer",
          fontSize: "10px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          background: "none",
          border: "none",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
      >
        Edit Setup
      </button>
    </div>
  );
};

// ─── Main AppShell ───
const AppShell = ({
  // Config bar props
  scenario,
  regime,
  timescale,
  actors,
  instigatingAction,
  onExpandSetup,
  // Sidebar content
  sidebarContent,
  // Main area content slots
  configBar,           // optional: replace default config bar
  timelineContent,
  eventLogContent,
  deepDiveContent,
  // Right panel (status charts)
  rightPanelContent,
  rightPanelOpen = true,
  onToggleRightPanel,
  // Setup overlay (shown when expanded)
  setupContent,
  setupExpanded,
  // Generate view content
  generateContent,
  // View state (lifted to parent for cross-component coordination)
  activeView: activeViewProp,
  onActiveViewChange,
}) => {
  const [activeViewInternal, setActiveViewInternal] = useState("simulation");
  const activeView = activeViewProp ?? activeViewInternal;
  const setActiveView = onActiveViewChange ?? setActiveViewInternal;

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      background: "var(--bg-deep)",
      fontFamily: "var(--font-sans)",
      color: "var(--text-primary)",
      fontSize: "12px",
      overflow: "hidden",
    }}>

      {/* ════ LEFT SIDEBAR ════ */}
      <div style={{
        width: "var(--sidebar-width)",
        minWidth: "var(--sidebar-width)",
        background: "var(--bg-main)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Logo / header */}
        <div style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span style={{
            fontWeight: 700,
            fontSize: "14px",
            color: "var(--accent)",
            letterSpacing: "0.5px",
          }}>
            AGORA
          </span>
          <span style={{
            fontSize: "9px",
            color: "var(--text-dim)",
            background: "var(--bg-card)",
            padding: "2px 6px",
            borderRadius: "3px",
          }}>
            v0.8
          </span>
        </div>

        {/* Navigation */}
        <SidebarNav activeView={activeView} onNavigate={setActiveView} />

        {/* Sidebar detail content (action detail, etc.) */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
        }}>
          {sidebarContent}
        </div>
      </div>

      {/* ════ MAIN CONTENT ════ */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}>

        {/* ──── Generate View ──── */}
        {activeView === "generate" && generateContent && (
          <div style={{
            flex: 1,
            overflow: "hidden",
            background: "var(--bg-main)",
          }}>
            {generateContent}
          </div>
        )}

        {/* ──── Simulation View ──── */}
        {activeView === "simulation" && (
          <>
            {/* Config Bar */}
            {configBar || (
              <ConfigBar
                scenario={scenario}
                regime={regime}
                timescale={timescale}
                actors={actors}
                instigatingAction={instigatingAction}
                onExpand={onExpandSetup}
              />
            )}

            {/* Setup Overlay */}
            {setupExpanded && (
              <div style={{
                background: "var(--bg-main)",
                borderBottom: "1px solid var(--border)",
                maxHeight: "85vh",
                overflow: "hidden",
              }}>
                {setupContent}
              </div>
            )}

            {/* Timeline + Event Log — fills all available height */}
            {timelineContent && (
              <div style={{
                flex: "1 1 0",
                minHeight: 0,
                overflow: "auto",
                borderBottom: deepDiveContent ? "1px solid var(--border)" : "none",
              }}>
                {timelineContent}
              </div>
            )}

            {/* Fallback content when no timeline (e.g. no-sim placeholder) */}
            {!timelineContent && eventLogContent && (
              <div style={{
                flex: "1 1 0",
                minHeight: 0,
                overflow: "auto",
              }}>
                {eventLogContent}
              </div>
            )}

            {/* Actor Detail Panel — collapsible bar at bottom */}
            {deepDiveContent && (
              <div style={{
                flexShrink: 0,
              }}>
                {deepDiveContent}
              </div>
            )}
          </>
        )}

        {/* ──── Placeholder for other views ──── */}
        {activeView !== "simulation" && activeView !== "generate" && (
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-dim)",
            fontSize: "12px",
          }}>
            {activeView === "scenarios" ? "Scenario library — coming soon" :
             activeView === "dashboard" ? "Analytics dashboard — coming soon" :
             activeView === "help" ? "Help & documentation — coming soon" :
             "Select a view"}
          </div>
        )}
      </div>

      {/* ════ RIGHT PANEL (Status Charts) ════ */}
      {activeView === "simulation" && rightPanelContent && (
        <div style={{
          width: rightPanelOpen ? "var(--right-panel-width, 300px)" : "36px",
          minWidth: rightPanelOpen ? "var(--right-panel-width, 300px)" : "36px",
          background: "var(--bg-main)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.2s ease, min-width 0.2s ease",
        }}>
          {/* Collapse / expand toggle */}
          <button
            onClick={onToggleRightPanel}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: rightPanelOpen ? "space-between" : "center",
              padding: rightPanelOpen ? "10px 12px" : "10px 0",
              background: "none",
              border: "none",
              borderBottom: "1px solid var(--border)",
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: "inherit",
              width: "100%",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            {rightPanelOpen ? (
              <>
                <span>Status</span>
                <span style={{ fontSize: "10px", opacity: 0.7 }}>▶</span>
              </>
            ) : (
              <span style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                fontSize: "10px",
                letterSpacing: "1px",
              }}>
                ◀ STATUS
              </span>
            )}
          </button>

          {/* Panel content — scrollable */}
          {rightPanelOpen && (
            <div style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              padding: "12px",
            }}>
              {rightPanelContent}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AppShell;
