import React, { useState } from "react";
import Stage1Perception from "./stages/Stage1Perception";
import Stage2Interpretation from "./stages/Stage2Interpretation";
import Stage3DecisionMaking from "./stages/Stage3DecisionMaking";
import Stage4Learning from "./stages/Stage4Learning";

/**
 * EventInspector - Deep Dive Panel for Event Analysis
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * This is the core component for deep inspection of DSM stages.
 * Each stage has two view modes:
 * - Narrative View: Plain language explanations with key metrics
 * - Analytical View: Full matrices, vectors, charts, and intermediate calculations
 *
 * UI Stage Mapping:
 * - Stage 1: Perception (Model Stage 1)
 * - Stage 2: Interpretation (Model Stages 2+3 combined)
 * - Stage 3: Decision-Making (Model Stage 4)
 * - Stage 4: Learning (Model Stage 5)
 */

const STAGES = [
  { id: 1, name: "Perception", component: Stage1Perception },
  { id: 2, name: "Interpretation", component: Stage2Interpretation },
  { id: 3, name: "Decision-Making", component: Stage3DecisionMaking },
  { id: 4, name: "Learning", component: Stage4Learning },
];

const StageTab = ({ stage, isActive, onClick }) => (
  <button
    onClick={() => onClick(stage.id)}
    style={{
      padding: '5px 12px',
      fontSize: '12px',
      fontWeight: 500,
      fontFamily: 'var(--font-sans)',
      borderTopLeftRadius: '6px',
      borderTopRightRadius: '6px',
      transition: 'background-color 150ms, color 150ms',
      cursor: 'pointer',
      border: 'none',
      marginBottom: isActive ? '-1px' : '0',
      background: isActive ? 'var(--bg-card)' : 'var(--bg-main)',
      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
      borderTop: isActive ? '1px solid var(--border)' : '1px solid transparent',
      borderLeft: isActive ? '1px solid var(--border)' : '1px solid transparent',
      borderRight: isActive ? '1px solid var(--border)' : '1px solid transparent',
    }}
    onMouseEnter={(e) => {
      if (!isActive) {
        e.currentTarget.style.background = 'var(--bg-card-hover)';
      }
    }}
    onMouseLeave={(e) => {
      if (!isActive) {
        e.currentTarget.style.background = 'var(--bg-main)';
      }
    }}
  >
    Stage {stage.id}: {stage.name}
  </button>
);

const ViewModeToggle = ({ isDevMode, onToggle }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-sans)' }}>
    <span style={{
      fontWeight: !isDevMode ? 500 : 400,
      color: !isDevMode ? 'var(--purple)' : 'var(--text-dim)',
    }}>Narrative</span>
    <button
      onClick={onToggle}
      style={{
        position: 'relative',
        width: '44px',
        height: '20px',
        borderRadius: '9999px',
        transition: 'background-color 200ms',
        background: isDevMode ? 'var(--purple)' : 'var(--border-light)',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '3px',
          width: '14px',
          height: '14px',
          background: 'var(--text-primary)',
          borderRadius: '9999px',
          transition: 'transform 200ms',
          transform: isDevMode ? 'translateX(27px)' : 'translateX(3px)',
        }}
      />
    </button>
    <span style={{
      fontWeight: isDevMode ? 500 : 400,
      color: isDevMode ? 'var(--purple)' : 'var(--text-dim)',
    }}>Analytical</span>
  </div>
);

// Helper to parse comma-separated actions into array
const parseActions = (actionString) => {
  if (!actionString) return [];
  return actionString.split(',').map(a => a.trim()).filter(Boolean);
};

const EventInspector = ({
  eventData,
  allEvents,
  selectedEventIndex,
  actorName,
  observedAction,
  otherActorName,
  relationshipState,
  ontology,
}) => {
  const [activeStage, setActiveStage] = useState(1);
  const [isDevMode, setIsDevMode] = useState(false);

  if (!eventData) {
    return (
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '16px',
        background: 'var(--bg-main)',
        textAlign: 'center',
        fontFamily: 'var(--font-sans)',
      }}>
        <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: 0 }}>Select an event from the timeline to inspect it.</p>
      </div>
    );
  }

  const ActiveStageComponent = STAGES.find((s) => s.id === activeStage)?.component;
  const actions = parseActions(observedAction);

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '6px',
      background: 'var(--bg-card)',
      boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg-main)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Event Inspector</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{actorName}</strong> responding to actions from <strong style={{ color: 'var(--text-primary)' }}>{otherActorName}</strong>:
          </p>
          <ol style={{
            listStyleType: 'decimal',
            listStylePosition: 'inside',
            marginTop: '3px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            paddingLeft: 0,
            marginBottom: 0,
          }}>
            {actions.map((action, idx) => (
              <li key={idx} style={{ fontWeight: 500 }}>{action}</li>
            ))}
          </ol>
        </div>
        <ViewModeToggle isDevMode={isDevMode} onToggle={() => setIsDevMode(!isDevMode)} />
      </div>

      {/* Stage Tabs */}
      <div style={{
        display: 'flex',
        gap: '3px',
        padding: '10px 12px 0 12px',
        background: 'var(--bg-main)',
        borderBottom: '1px solid var(--border)',
      }}>
        {STAGES.map((stage) => (
          <StageTab
            key={stage.id}
            stage={stage}
            isActive={activeStage === stage.id}
            onClick={setActiveStage}
          />
        ))}
      </div>

      {/* Stage Content */}
      <div style={{ padding: '12px' }}>
        {ActiveStageComponent && (
          <ActiveStageComponent
            eventData={eventData}
            allEvents={allEvents}
            selectedEventIndex={selectedEventIndex}
            isDevMode={isDevMode}
            actorName={actorName}
            observedAction={observedAction}
            otherActorName={otherActorName}
            relationshipState={relationshipState}
            ontology={ontology}
          />
        )}
      </div>
    </div>
  );
};

export default EventInspector;
