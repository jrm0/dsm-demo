import React, { useState, useMemo, useCallback } from "react";

/**
 * GenerateWizard - Document-to-Scenario Generation Flow
 *
 * Portable Component: Can be used in CPCN_UI
 *
 * 4-step wizard:
 *   Upload → Configure → Specialists → Generate
 *
 * Connects to MAGIC backend for:
 *   - Document upload (MinIO presigned URLs)
 *   - RAG corpus ingestion
 *   - Specialist agent selection
 *   - Scenario parameter generation
 *
 * Currently a UI stub for demo/feedback purposes.
 * API wiring will be added when connecting to the MAGIC backend.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Specialist Agent Roster
// ═══════════════════════════════════════════════════════════════════════════════

const SPECIALISTS = [
  {
    id: "diplomat",
    name: "Diplomat",
    description: "Analyzes diplomatic norms, alliance structures, treaty obligations, and negotiation dynamics to inform de-escalation pathways and relationship modeling.",
    color: "#c084fc",
  },
  {
    id: "ir_expert",
    name: "IR Expert",
    description: "Applies international relations theory — deterrence, coercion, signaling — to structure strategic interaction logic and escalation ladders.",
    color: "#818cf8",
  },
  {
    id: "military_strategist",
    name: "Military Strategist",
    description: "Evaluates force posture, operational concepts, and military capabilities to define action characteristics, severity, and feasibility constraints.",
    color: "#f87171",
  },
  {
    id: "cultural_analyst",
    name: "Cultural Analyst",
    description: "Examines decision-making culture, institutional norms, and cognitive biases that shape how each actor perceives risk, loss, and strategic opportunity.",
    color: "#fb923c",
  },
  {
    id: "political_economist",
    name: "Political Economist",
    description: "Assesses economic interdependencies, sanctions architecture, trade leverage, and resource vulnerabilities that define the economic action space.",
    color: "#fbbf24",
  },
  {
    id: "regime_specialist",
    name: "Regime Specialist",
    description: "Analyzes domestic political structures, leadership incentives, regime stability, and internal constraints that shape strategic preferences and red lines.",
    color: "#34d399",
  },
  {
    id: "red_team_analyst",
    name: "Red Team Analyst",
    description: "Stress-tests assumptions by identifying adversary strategies, exploitable gaps, and scenarios where conventional analysis may fail.",
    color: "#f472b6",
  },
];


// ═══════════════════════════════════════════════════════════════════════════════
// Shared UI Primitives (matching SetupWizard style)
// ═══════════════════════════════════════════════════════════════════════════════

const StepIndicator = ({ steps, currentStep }) => (
  <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
    {steps.map((step, i) => (
      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
        <div style={{
          height: "3px", width: "100%", borderRadius: "2px",
          background: i <= currentStep ? "var(--accent)" : "var(--border)",
          transition: "background 0.3s",
        }} />
        <span style={{
          fontSize: "9px",
          color: i <= currentStep ? "var(--accent)" : "var(--text-dim)",
          fontWeight: i === currentStep ? 600 : 400,
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          {step}
        </span>
      </div>
    ))}
  </div>
);

const SectionCard = ({ children, style = {} }) => (
  <div style={{
    background: "var(--bg-card)", border: "1px solid var(--border)",
    borderRadius: "6px", padding: "16px", ...style,
  }}>
    {children}
  </div>
);

const StepTitle = ({ children }) => (
  <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
    {children}
  </h3>
);

const StepDescription = ({ children }) => (
  <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "12px", lineHeight: "1.5" }}>
    {children}
  </p>
);


// ═══════════════════════════════════════════════════════════════════════════════
// Specialist Toggle Card
// ═══════════════════════════════════════════════════════════════════════════════

const SpecialistCard = ({ specialist, enabled, onToggle }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "12px 14px",
        background: enabled ? `${specialist.color}10` : "var(--bg-deep)",
        border: `1px solid ${enabled ? specialist.color : hovered ? "var(--border-focus)" : "var(--border)"}`,
        borderRadius: "6px",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s",
        opacity: enabled ? 1 : 0.6,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "20px",
          height: "20px",
          borderRadius: "4px",
          background: enabled ? specialist.color : "var(--border)",
          color: enabled ? "var(--bg-deep)" : "var(--text-dim)",
          fontSize: "10px",
          fontWeight: 700,
          flexShrink: 0,
          transition: "all 0.15s",
        }}>
          {enabled ? "✓" : "–"}
        </span>
        <span style={{
          fontSize: "12px",
          fontWeight: 600,
          color: enabled ? "var(--text-primary)" : "var(--text-secondary)",
        }}>
          {specialist.name}
        </span>
        <span style={{
          marginLeft: "auto",
          fontSize: "8px",
          fontWeight: 600,
          color: enabled ? specialist.color : "var(--text-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}>
          {enabled ? "Active" : "Off"}
        </span>
      </div>

      {/* Description */}
      <div style={{
        fontSize: "10px",
        lineHeight: "1.5",
        color: "var(--text-secondary)",
      }}>
        {specialist.description}
      </div>
    </button>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// File Upload Row (stub)
// ═══════════════════════════════════════════════════════════════════════════════

const FileRow = ({ name, size, status }) => (
  <div style={{
    display: "flex",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: "10px",
  }}>
    <span style={{ flex: 1, color: "var(--text-primary)" }}>{name}</span>
    <span style={{ width: "70px", textAlign: "right", color: "var(--text-dim)" }}>{size}</span>
    <span style={{
      width: "80px",
      textAlign: "right",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "4px",
    }}>
      <span style={{
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: status === "uploaded" ? "var(--green)" :
                    status === "uploading" ? "var(--accent)" :
                    status === "error" ? "var(--red)" : "var(--text-dim)",
      }} />
      <span style={{
        color: status === "uploaded" ? "var(--green)" :
               status === "uploading" ? "var(--accent)" :
               status === "error" ? "var(--red)" : "var(--text-dim)",
        fontSize: "9px",
      }}>
        {status === "uploaded" ? "Uploaded" :
         status === "uploading" ? "Uploading..." :
         status === "error" ? "Failed" : "Queued"}
      </span>
    </span>
  </div>
);


// ═══════════════════════════════════════════════════════════════════════════════
// Job Status Monitor (stub for Step 4)
// ═══════════════════════════════════════════════════════════════════════════════

const GenerationStatus = ({ status }) => {
  const stages = [
    { label: "RAG Indexing", description: "Building document embeddings" },
    { label: "Specialist Analysis", description: "Agents analyzing corpus" },
    { label: "Consensus Integration", description: "Reconciling specialist outputs" },
    { label: "Payload Assembly", description: "Compiling scenario parameters" },
  ];

  const activeIndex = status === "idle" ? -1 :
                      status === "indexing" ? 0 :
                      status === "analyzing" ? 1 :
                      status === "integrating" ? 2 :
                      status === "assembling" ? 3 : 4;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {stages.map((stage, i) => {
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;
        const isPending = i > activeIndex;

        return (
          <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 12px",
            background: isActive ? "var(--accent-dim)" : "var(--bg-deep)",
            border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "5px",
            opacity: isPending ? 0.4 : 1,
          }}>
            <span style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 700,
              background: isDone ? "var(--green)" : isActive ? "var(--accent)" : "var(--border)",
              color: isDone || isActive ? "var(--bg-deep)" : "var(--text-dim)",
            }}>
              {isDone ? "✓" : i + 1}
            </span>
            <div>
              <div style={{
                fontSize: "11px",
                fontWeight: 600,
                color: isActive ? "var(--accent)" : isDone ? "var(--green)" : "var(--text-secondary)",
              }}>
                {stage.label}
              </div>
              <div style={{ fontSize: "9px", color: "var(--text-dim)" }}>
                {stage.description}
              </div>
            </div>
            {isActive && (
              <span style={{
                marginLeft: "auto",
                fontSize: "9px",
                color: "var(--accent)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}>
                Running...
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// Main GenerateWizard
// ═══════════════════════════════════════════════════════════════════════════════

const STEPS = ["Upload", "Configure", "Specialists", "Generate"];

const GenerateWizard = ({ onNavigateToSimulation }) => {
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Upload state
  const [corpusName, setCorpusName] = useState("");
  const [classification, setClassification] = useState("LOW");
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // Step 2: Configure state
  const [corpusDescription, setCorpusDescription] = useState("");
  const [researchQuery, setResearchQuery] = useState("");
  const [actorInputs, setActorInputs] = useState(["", ""]);

  // Step 3: Specialist state
  const [enabledSpecialists, setEnabledSpecialists] = useState(
    () => new Set(SPECIALISTS.map(s => s.id))
  );

  // Step 4: Generation state
  const [genStatus, setGenStatus] = useState("idle"); // idle | indexing | analyzing | integrating | assembling | complete

  // Stub: simulate file upload
  const handleFileSelect = useCallback(() => {
    // Stub — in real implementation, this triggers file input click and uploads to MinIO
    const stubFiles = [
      { name: "Strategic_Assessment_2026.pdf", size: "12.4 MB", status: "uploaded" },
      { name: "Defense_Posture_Brief.pdf", size: "8.1 MB", status: "uploaded" },
      { name: "Economic_Framework.pdf", size: "5.7 MB", status: "uploading" },
    ];
    setUploadedFiles(stubFiles);
  }, []);

  const toggleSpecialist = useCallback((id) => {
    setEnabledSpecialists(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setEnabledSpecialists(new Set(SPECIALISTS.map(s => s.id)));
  }, []);

  const selectNone = useCallback(() => {
    setEnabledSpecialists(new Set());
  }, []);

  // Stub: simulate generation
  const handleGenerate = useCallback(() => {
    setGenStatus("indexing");
    // Simulate progression for demo
    setTimeout(() => setGenStatus("analyzing"), 2000);
    setTimeout(() => setGenStatus("integrating"), 5000);
    setTimeout(() => setGenStatus("assembling"), 7000);
    setTimeout(() => setGenStatus("complete"), 9000);
  }, []);

  // Validation is advisory for now — all steps are navigable for demo purposes.
  // Real validation will gate the final "Launch" button, not step navigation.
  const stepComplete = useMemo(() => [
    true,                          // Upload — always navigable
    true,                          // Configure — always navigable
    enabledSpecialists.size > 0,   // Specialists — at least one required for Generate
    genStatus === "complete",      // Generate — complete when pipeline finishes
  ], [enabledSpecialists, genStatus]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "85vh" }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 0 20px" }}>
        <StepIndicator steps={STEPS} currentStep={currentStep} />

        {/* ════ Step 0: Upload Documents ════ */}
        {currentStep === 0 && (
          <SectionCard>
            <StepTitle>Upload Source Documents</StepTitle>
            <StepDescription>
              Provide the intelligence corpus that MAGIC specialists will analyze to generate
              scenario parameters, action definitions, and actor profiles.
            </StepDescription>

            {/* Dropzone */}
            <div
              onClick={handleFileSelect}
              style={{
                border: "1px dashed var(--accent)",
                borderRadius: "6px",
                padding: "28px 20px",
                textAlign: "center",
                cursor: "pointer",
                background: "var(--bg-deep)",
                marginBottom: "16px",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-dim)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-deep)"; }}
            >
              <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Drop PDF files here or click to browse
              </div>
              <div style={{ fontSize: "9px", color: "var(--text-dim)" }}>
                Accepted: PDF — Max 1,500 MB total
              </div>
            </div>

            {/* Corpus name + classification */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: "12px", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "4px" }}>
                  Corpus Name
                </div>
                <input
                  type="text"
                  placeholder="e.g. Taiwan Strait Crisis Package"
                  value={corpusName}
                  onChange={(e) => setCorpusName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "var(--bg-deep)",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    fontSize: "11px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "4px" }}>
                  Classification
                </div>
                <select
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "var(--bg-deep)",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  <option value="LOW">LOW</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </div>
            </div>

            {/* Uploaded files list */}
            {uploadedFiles.length > 0 && (
              <div>
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "6px" }}>
                  Uploaded Files
                </div>
                <div style={{
                  background: "var(--bg-deep)",
                  borderRadius: "4px",
                  padding: "6px 10px",
                }}>
                  {/* Table header */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "4px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-dim)",
                  }}>
                    <span style={{ flex: 1 }}>Filename</span>
                    <span style={{ width: "70px", textAlign: "right" }}>Size</span>
                    <span style={{ width: "80px", textAlign: "right" }}>Status</span>
                  </div>
                  {uploadedFiles.map((f, i) => (
                    <FileRow key={i} name={f.name} size={f.size} status={f.status} />
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {/* ════ Step 1: Configure ════ */}
        {currentStep === 1 && (
          <SectionCard>
            <StepTitle>Configure Scenario Parameters</StepTitle>
            <StepDescription>
              Define the research focus and identify the actors for this scenario.
              Specialists will use this context to guide their analysis of the uploaded corpus.
            </StepDescription>

            {/* Research query */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "4px" }}>
                Research Query
              </div>
              <textarea
                placeholder="e.g. Analyze escalation dynamics in a Taiwan Strait confrontation between the United States and China, focusing on military, diplomatic, economic, and information dimensions..."
                value={researchQuery}
                onChange={(e) => setResearchQuery(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  color: "var(--text-primary)",
                  fontSize: "11px",
                  lineHeight: "1.5",
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Corpus description */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "4px" }}>
                Corpus Description
              </div>
              <textarea
                placeholder="Brief description of the documents and their relevance to the scenario..."
                value={corpusDescription}
                onChange={(e) => setCorpusDescription(e.target.value)}
                rows={2}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  color: "var(--text-primary)",
                  fontSize: "11px",
                  lineHeight: "1.5",
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Actor identification */}
            <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px" }}>
              Actor Identification
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <div style={{
                  display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px",
                }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--blue)", flexShrink: 0 }} />
                  <span style={{ fontSize: "10px", color: "var(--blue)", fontWeight: 500 }}>Actor 1 (Blue)</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. United States"
                  value={actorInputs[0]}
                  onChange={(e) => setActorInputs([e.target.value, actorInputs[1]])}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "var(--bg-deep)",
                    border: "1px solid var(--blue-border, var(--border))",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    fontSize: "11px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <div style={{
                  display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px",
                }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
                  <span style={{ fontSize: "10px", color: "var(--red)", fontWeight: 500 }}>Actor 2 (Red)</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. China"
                  value={actorInputs[1]}
                  onChange={(e) => setActorInputs([actorInputs[0], e.target.value])}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "var(--bg-deep)",
                    border: "1px solid var(--red-border, var(--border))",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    fontSize: "11px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          </SectionCard>
        )}

        {/* ════ Step 2: Specialist Selection ════ */}
        {currentStep === 2 && (
          <SectionCard>
            <StepTitle>Select Specialist Agents</StepTitle>
            <StepDescription>
              Choose which MAGIC specialists will analyze your corpus. Each specialist
              brings domain expertise that shapes the parameters they bid to research.
              All are selected by default.
            </StepDescription>

            {/* Bulk actions */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}>
              <span style={{ fontSize: "10px", color: "var(--text-primary)" }}>
                <span style={{ fontWeight: 600 }}>{enabledSpecialists.size}</span>
                <span style={{ color: "var(--text-dim)" }}> of {SPECIALISTS.length} specialists selected</span>
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={selectAll}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    fontSize: "9px",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Select All
                </button>
                <span style={{ color: "var(--border)", fontSize: "9px" }}>|</span>
                <button
                  onClick={selectNone}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-dim)",
                    fontSize: "9px",
                    cursor: "pointer",
                  }}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Specialist card grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}>
              {SPECIALISTS.map((specialist) => (
                <SpecialistCard
                  key={specialist.id}
                  specialist={specialist}
                  enabled={enabledSpecialists.has(specialist.id)}
                  onToggle={() => toggleSpecialist(specialist.id)}
                />
              ))}
            </div>

            {enabledSpecialists.size === 0 && (
              <div style={{
                marginTop: "10px",
                padding: "8px 12px",
                background: "var(--red-dim)",
                border: "1px solid var(--red-border)",
                borderRadius: "4px",
                fontSize: "10px",
                color: "var(--red)",
              }}>
                At least one specialist must be selected to generate a scenario.
              </div>
            )}
          </SectionCard>
        )}

        {/* ════ Step 3: Generate ════ */}
        {currentStep === 3 && (
          <SectionCard>
            <StepTitle>Generate Scenario</StepTitle>
            <StepDescription>
              {genStatus === "idle"
                ? "Review your configuration and launch the generation pipeline. MAGIC specialists will analyze your corpus and produce a simulation-ready payload."
                : genStatus === "complete"
                ? "Generation complete. Your scenario payload is ready for simulation."
                : "Generation in progress. Specialists are analyzing your corpus..."
              }
            </StepDescription>

            {/* Summary before launch */}
            {genStatus === "idle" && (
              <div style={{
                background: "var(--bg-deep)",
                borderRadius: "6px",
                padding: "12px 14px",
                marginBottom: "16px",
              }}>
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-dim)", fontWeight: 600, marginBottom: "8px" }}>
                  Configuration Summary
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: "10px" }}>
                  <span style={{ color: "var(--text-dim)" }}>Corpus:</span>
                  <span style={{ color: "var(--text-primary)" }}>{corpusName || "Untitled"} ({uploadedFiles.length} files)</span>
                  <span style={{ color: "var(--text-dim)" }}>Actors:</span>
                  <span>
                    <span style={{ color: "var(--blue)" }}>{actorInputs[0] || "Actor 1"}</span>
                    <span style={{ color: "var(--text-dim)" }}> vs </span>
                    <span style={{ color: "var(--red)" }}>{actorInputs[1] || "Actor 2"}</span>
                  </span>
                  <span style={{ color: "var(--text-dim)" }}>Specialists:</span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {enabledSpecialists.size} of {SPECIALISTS.length}
                    <span style={{ color: "var(--text-dim)", marginLeft: "6px" }}>
                      ({SPECIALISTS.filter(s => enabledSpecialists.has(s.id)).map(s => s.name).join(", ")})
                    </span>
                  </span>
                  {researchQuery && (
                    <>
                      <span style={{ color: "var(--text-dim)" }}>Query:</span>
                      <span style={{
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>{researchQuery}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Generation status */}
            {genStatus !== "idle" && (
              <div style={{ marginBottom: "16px" }}>
                <GenerationStatus status={genStatus} />
              </div>
            )}

            {/* Launch / complete actions */}
            {genStatus === "idle" && (
              <button
                onClick={handleGenerate}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  background: "var(--green)",
                  border: "1px solid var(--green)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                Launch Generation Pipeline
              </button>
            )}

            {genStatus === "complete" && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={onNavigateToSimulation}
                  style={{
                    flex: 1,
                    padding: "12px 20px",
                    background: "var(--accent)",
                    border: "1px solid var(--accent)",
                    borderRadius: "6px",
                    color: "var(--bg-deep)",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open in Simulation →
                </button>
                <button
                  onClick={() => {
                    setGenStatus("idle");
                    setCurrentStep(0);
                    setUploadedFiles([]);
                    setCorpusName("");
                    setResearchQuery("");
                    setCorpusDescription("");
                    setActorInputs(["", ""]);
                    setEnabledSpecialists(new Set(SPECIALISTS.map(s => s.id)));
                  }}
                  style={{
                    padding: "12px 16px",
                    background: "var(--bg-deep)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "var(--text-secondary)",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  New Scenario
                </button>
              </div>
            )}
          </SectionCard>
        )}
      </div>

      {/* ════ Navigation bar — pinned at bottom ════ */}
      <div style={{
        flexShrink: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 20px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-main)",
      }}>
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          style={{
            padding: "8px 16px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            color: currentStep === 0 ? "var(--text-dim)" : "var(--text-secondary)",
            fontSize: "11px",
            cursor: currentStep === 0 ? "default" : "pointer",
          }}
        >
          Back
        </button>
        <div style={{ display: "flex", gap: "8px" }}>
          {currentStep < STEPS.length - 1 && (
            <button
              onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
              disabled={!stepComplete[currentStep]}
              style={{
                padding: "8px 20px",
                background: stepComplete[currentStep] ? "var(--accent)" : "var(--bg-card)",
                border: `1px solid ${stepComplete[currentStep] ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "4px",
                color: stepComplete[currentStep] ? "var(--bg-deep)" : "var(--text-dim)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: stepComplete[currentStep] ? "pointer" : "default",
              }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerateWizard;
