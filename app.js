"use strict";

const STORAGE_KEY = "elliot-lab-scene-draft-v1";
const VIEW_MODE_STORAGE_KEY = "elliot-lab-view-mode-v1";
const LAB_HANDOFF_STORAGE_KEY = "elliot-lab-handoff-v1";
const FORMAT_VERSION = 1;
const MODULE_FORMAT = "elliot-module/v1";
const EPSILON = 0.000001;
const PIPE_CAPACITY_FACTOR = 0.003;
const DEFAULT_BURST_AMOUNT = 3;
const PORT_DRAFT_THRESHOLD = 7;
const MAX_PUBLIC_INPUTS = 3;
const MAX_PUBLIC_OUTPUTS = 3;
const DEFAULT_HARNESS_ROUTE_CONFIG = Object.freeze({
  width: 14,
  length: 220,
  max_flow_per_tick: 1,
  transit_ticks: 2,
});
const DEFAULT_HARNESS_SOURCE_CONFIG = Object.freeze({
  width: 12,
  height: 18,
  capacity: 24,
  emit_rate: 1,
  burst_amount: DEFAULT_BURST_AMOUNT,
});
const DEFAULT_HARNESS_OUTPUT_CONFIG = Object.freeze({
  width: 18,
  height: 14,
  capacity: 999999,
});

const PRIMITIVE_REGISTRY = Object.freeze({
  source: {
    simulation: {
      config_schema: ["capacity", "emit_rate", "burst_amount", "width", "height"],
      state_schema: ["current_level"],
      emit_ports: ["out"],
      receive_ports: [],
    },
    semantics: {
      role: "signal_injector",
      conserved_quantity: "stored_quantity",
      summary: "Injects stored quantity into the local circuit as a pulse source.",
    },
    mapping_notes: [
      "Could map to an input stimulus source or injected drive signal.",
      "Stored charge is runtime state, not a public vessel semantics requirement.",
    ],
  },
  bucket: {
    simulation: {
      config_schema: ["capacity", "outlet_height", "outlet_size", "width", "height"],
      state_schema: ["current_level"],
      emit_ports: ["out"],
      receive_ports: ["in"],
    },
    semantics: {
      role: "accumulator",
      conserved_quantity: "stored_quantity",
      summary: "Accumulates quantity and releases it once level rises above the outlet threshold.",
    },
    mapping_notes: [
      "Outlet height corresponds to a release threshold.",
      "Outlet size corresponds to bounded release rate.",
    ],
  },
  leaky_bucket: {
    simulation: {
      config_schema: ["capacity", "outlet_height", "outlet_size", "leak_rate", "width", "height"],
      state_schema: ["current_level"],
      emit_ports: ["out", "leak"],
      receive_ports: ["in"],
    },
    semantics: {
      role: "decaying_accumulator",
      conserved_quantity: "stored_quantity",
      summary: "Accumulator with continuous loss plus thresholded release.",
    },
    mapping_notes: [
      "Leak corresponds to decay, bleed-off, or retention loss.",
      "Useful as a stateful element with both persistence and loss.",
    ],
  },
  siphon: {
    simulation: {
      config_schema: ["capacity", "trigger_level", "outlet_size", "width", "height"],
      state_schema: ["current_level", "is_triggered"],
      emit_ports: ["out"],
      receive_ports: ["in"],
    },
    semantics: {
      role: "threshold_release",
      conserved_quantity: "stored_quantity",
      summary: "Holds quantity until triggered, then releases it nonlinearly in a dump phase.",
    },
    mapping_notes: [
      "Trigger corresponds to a thresholded nonlinear transition.",
      "Dumping corresponds to burst-style release rather than steady outflow.",
    ],
  },
  reservoir: {
    simulation: {
      config_schema: ["capacity", "return_rate", "width", "height"],
      state_schema: ["current_level"],
      emit_ports: ["out"],
      receive_ports: ["in"],
    },
    semantics: {
      role: "retained_state",
      conserved_quantity: "stored_quantity",
      summary: "Retained internal state that can return through ordinary routes.",
    },
    mapping_notes: [
      "Return rate corresponds to slow release from long-lived internal state.",
      "Not a terminal sink in v1.",
    ],
  },
  output_basin: {
    simulation: {
      config_schema: ["capacity", "width", "height"],
      state_schema: ["current_level"],
      emit_ports: [],
      receive_ports: ["in"],
    },
    semantics: {
      role: "terminal_readout",
      conserved_quantity: "emitted_output",
      summary: "Terminal readout sink where quantity leaves the local circuit.",
    },
    mapping_notes: [
      "Represents emitted output or externalized readout.",
      "Should be treated as a terminal collection surface, not retained state.",
    ],
  },
  pipe: {
    simulation: {
      config_schema: ["width", "length", "max_flow_per_tick", "transit_ticks"],
      state_schema: ["segments"],
      emit_ports: ["from"],
      receive_ports: ["to"],
    },
    semantics: {
      role: "constrained_route",
      conserved_quantity: "in_flight_quantity",
      summary: "Constrained transmission path with timing, capacity, and blockage effects.",
    },
    mapping_notes: [
      "Transit corresponds to delay and path length.",
      "Capacity and max flow correspond to throughput and saturation limits.",
    ],
  },
});

const DEFAULT_SCENE = {
  format_version: FORMAT_VERSION,
  scene_id: "clean-threshold-bucket-demo",
  title: "Clean Threshold Bucket Demo",
  view: {
    tick_ms: 600,
  },
  runtime: {
    tick: 0,
    total_water: 0,
    conservation_delta: 0,
    conservation_ok: true,
  },
  module_interface_draft: {
    inputs: [],
    outputs: [],
  },
  components: [
    {
      id: "source-1",
      type: "source",
      label: "Source",
      position: { x: 96, y: 192 },
      config: {
        width: 12,
        height: 18,
        capacity: 24,
        emit_rate: 1.2,
        burst_amount: DEFAULT_BURST_AMOUNT,
      },
      state: {
        current_level: 0,
      },
    },
    {
      id: "bucket-1",
      type: "bucket",
      label: "Threshold Bucket",
      position: { x: 372, y: 142 },
      config: {
        width: 17,
        height: 24,
        capacity: 20,
        outlet_height: 1,
        outlet_size: 1.0,
      },
      state: {
        current_level: 0,
      },
    },
    {
      id: "output-1",
      type: "output_basin",
      label: "Output Basin",
      position: { x: 770, y: 248 },
      config: {
        width: 18,
        height: 14,
        capacity: 30,
      },
      state: {
        current_level: 0,
      },
    },
  ],
  connections: [
    {
      id: "pipe-1",
      type: "pipe",
      label: "Source Pipe",
      from_component: "source-1",
      from_port: "out",
      to_component: "bucket-1",
      to_port: "in",
      config: {
        width: 14,
        length: 220,
        max_flow_per_tick: 1.2,
        transit_ticks: 2,
      },
      state: {
        segments: [0, 0],
      },
    },
    {
      id: "pipe-2",
      type: "pipe",
      label: "Bucket Pipe",
      from_component: "bucket-1",
      from_port: "out",
      to_component: "output-1",
      to_port: "in",
      config: {
        width: 12,
        length: 260,
        max_flow_per_tick: 1.0,
        transit_ticks: 3,
      },
      state: {
        segments: [0, 0, 0],
      },
    },
  ],
};

const TYPE_LABELS = {
  source: "Source",
  bucket: "Bucket",
  leaky_bucket: "Leaky Bucket",
  siphon: "Siphon",
  output_basin: "Output Basin",
  reservoir: "Reservoir",
  pipe: "Pipe",
};

function componentSymbolMarkup(type) {
  switch (type) {
    case "source":
      return `
        <svg viewBox="0 0 20 20" class="component-symbol-svg" aria-hidden="true">
          <path d="M10 3.2C12.8 7.1 15 9.5 15 12.6A5 5 0 1 1 5 12.6C5 9.5 7.2 7.1 10 3.2Z" fill="currentColor"></path>
        </svg>
      `;
    case "bucket":
      return `
        <svg viewBox="0 0 20 20" class="component-symbol-svg" aria-hidden="true">
          <path d="M5 4.5V12a2.4 2.4 0 0 0 2.4 2.4h5.2A2.4 2.4 0 0 0 15 12V4.5"></path>
        </svg>
      `;
    case "leaky_bucket":
      return `
        <svg viewBox="0 0 20 20" class="component-symbol-svg" aria-hidden="true">
          <path d="M5 4.5V12a2.4 2.4 0 0 0 2.4 2.4h5.2A2.4 2.4 0 0 0 15 12V4.5"></path>
          <circle cx="10" cy="16.8" r="1.2" fill="currentColor"></circle>
        </svg>
      `;
    case "siphon":
      return `
        <svg viewBox="0 0 20 20" class="component-symbol-svg" aria-hidden="true">
          <path d="M5 5.2v4.1c0 3.2 2 5.3 5 5.3s5-2.1 5-5.3V5.2"></path>
          <path d="M15 5.2h2.2"></path>
        </svg>
      `;
    case "output_basin":
      return `
        <svg viewBox="0 0 20 20" class="component-symbol-svg" aria-hidden="true">
          <path d="M3.2 10H10"></path>
          <path d="M10 6.2 15.8 10 10 13.8"></path>
          <path d="M3.2 6.2v7.6"></path>
        </svg>
      `;
    case "reservoir":
      return `
        <svg viewBox="0 0 20 20" class="component-symbol-svg" aria-hidden="true">
          <path d="M3.5 12.8c0-3.5 2.9-6.3 6.5-6.3s6.5 2.8 6.5 6.3v2.7H3.5Z"></path>
          <path d="M5 12.4c1.8 1 3.2 1 5 0 1.8 1 3.2 1 5 0"></path>
        </svg>
      `;
    default:
      return "";
  }
}

function markerSymbolMarkup(component) {
  if (component?.type === "siphon") {
    return `
      <svg viewBox="0 0 16 16" class="component-symbol-svg is-marker" aria-hidden="true">
        <path d="M3 11c1.8-4 8.2-4 10 0"></path>
        <path d="M8 3.5v3.3"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 16 16" class="component-symbol-svg is-marker" aria-hidden="true">
      <path d="M2.8 8h6.8"></path>
      <path d="M9.6 5 13.2 8 9.6 11"></path>
    </svg>
  `;
}

function isBucketLike(componentOrType) {
  const type = typeof componentOrType === "string" ? componentOrType : componentOrType?.type;
  return type === "bucket" || type === "leaky_bucket";
}

function isTankLike(componentOrType) {
  const type = typeof componentOrType === "string" ? componentOrType : componentOrType?.type;
  return isBucketLike(type) || type === "siphon";
}

function tankThresholdLevel(component) {
  if (!component) {
    return 0;
  }
  if (component.type === "siphon") {
    return Number(component.config.trigger_level || 0);
  }
  if (isBucketLike(component)) {
    return Number(component.config.outlet_height || 0);
  }
  return 0;
}

function createEmptyBurstSession() {
  return {
    burst_id: null,
    last_burst_amount: 0,
    burst_start_tick: null,
    burst_end_tick: null,
    burst_active: false,
    burst_input_total: 0,
    burst_output_delta: 0,
    burst_reservoir_level: 0,
    burst_retained_delta: 0,
    burst_net_circuit_change: 0,
    in_circuit_start: 0,
    in_circuit_end: 0,
    out_start: 0,
    reservoir_start: 0,
    source_id: null,
    terminal_state: "stable",
  };
}

const appState = {
  scene: null,
  baselineScene: null,
  selection: {
    kind: "component",
    id: "bucket-1",
  },
  playing: false,
  autoStopWhenSettled: false,
  timerId: null,
  drag: null,
  portGesture: null,
  pipeDraft: null,
  burstSession: createEmptyBurstSession(),
  burstCounter: 0,
  logEntries: [],
  logEntryCounter: 0,
  notice: {
    tone: "live",
    text: "Loading Circuit Lab...",
  },
  showConnectionZones: false,
  viewMode: "water",
  storyExpanded: false,
};

const refs = {
  appShell: document.querySelector(".app-shell"),
  sceneTitleInput: document.querySelector("#scene-title-input"),
  sceneMeta: document.querySelector("#scene-meta"),
  leftRail: document.querySelector(".left-rail"),
  rightRail: document.querySelector(".right-rail"),
  objectList: document.querySelector("#object-list"),
  pipeFromSelect: document.querySelector("#pipe-from-select"),
  pipeToSelect: document.querySelector("#pipe-to-select"),
  pipeWidthInput: document.querySelector("#pipe-width-input"),
  pipeLengthInput: document.querySelector("#pipe-length-input"),
  pipeFlowInput: document.querySelector("#pipe-flow-input"),
  pipeTransitInput: document.querySelector("#pipe-transit-input"),
  pipeBuilderForm: document.querySelector("#pipe-builder-form"),
  pipeBuilderSubmit: document.querySelector("#pipe-builder-submit"),
  pipeBuilderNote: document.querySelector("#pipe-builder-note"),
  canvasSurface: document.querySelector("#canvas-surface"),
  componentLayer: document.querySelector("#component-layer"),
  pipeLayer: document.querySelector("#pipe-layer"),
  inspectorContent: document.querySelector("#inspector-content"),
  waterSelectionStrip: document.querySelector("#water-selection-strip"),
  sceneSummary: document.querySelector("#scene-summary"),
  selectionMeta: document.querySelector("#selection-meta"),
  labLogPanel: document.querySelector(".lab-log-panel"),
  labLogTitle: document.querySelector("#lab-log-title"),
  labLogList: document.querySelector("#lab-log-list"),
  lastBurstValue: document.querySelector("#last-burst-value"),
  inCircuitValue: document.querySelector("#in-circuit-value"),
  outValue: document.querySelector("#out-value"),
  reservoirValue: document.querySelector("#reservoir-value"),
  accountedValue: document.querySelector("#accounted-value"),
  tickValue: document.querySelector("#tick-value"),
  systemStateValue: document.querySelector("#system-state-value"),
  burstButton: document.querySelector("#burst-button"),
  playButton: document.querySelector("#play-button"),
  pauseButton: document.querySelector("#pause-button"),
  stepButton: document.querySelector("#step-button"),
  resetButton: document.querySelector("#reset-button"),
  zonesButton: document.querySelector("#zones-button"),
  waterModeButton: document.querySelector("#water-mode-button"),
  buildModeButton: document.querySelector("#build-mode-button"),
  storyToggleButton: document.querySelector("#story-toggle-button"),
  tickSpeedInput: document.querySelector("#tick-speed-input"),
  tickSpeedReadout: document.querySelector("#tick-speed-readout"),
  autoInterfaceButton: document.querySelector("#auto-interface-button"),
  saveDraftButton: document.querySelector("#save-draft-button"),
  loadDraftButton: document.querySelector("#load-draft-button"),
  exportModuleButton: document.querySelector("#export-module-button"),
  openBuilderButton: document.querySelector("#open-builder-button"),
  saveFileButton: document.querySelector("#save-file-button"),
  loadFileButton: document.querySelector("#load-file-button"),
  resetDemoButton: document.querySelector("#reset-demo-button"),
  sceneFileInput: document.querySelector("#scene-file-input"),
  deleteSelectionButton: document.querySelector("#delete-selection-button"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundNumber(value, digits = 2) {
  return Number.parseFloat(Number(value).toFixed(digits));
}

function slugify(value) {
  return String(value || "scene")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setNotice(text, tone = "live") {
  appState.notice = { text, tone };
}

function isWaterMode() {
  return appState.viewMode === "water";
}

function isBuildMode() {
  return appState.viewMode === "build";
}

function loadViewModePreference() {
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return raw === "build" ? "build" : "water";
  } catch (error) {
    return "water";
  }
}

function saveViewModePreference(mode) {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch (error) {
    // Keep mode switching resilient even if localStorage is unavailable.
  }
}

function setViewMode(mode) {
  const nextMode = mode === "build" ? "build" : "water";
  if (appState.viewMode === nextMode) {
    render();
    return;
  }

  appState.viewMode = nextMode;
  saveViewModePreference(nextMode);
  appState.storyExpanded = nextMode === "build" ? true : false;
  appState.drag = null;
  cancelPipeDraft();
  if (nextMode === "water") {
    appState.showConnectionZones = false;
  }
  render();
}

function pushSystemMessage(text, tone = "live") {
  setNotice(text, tone);
  pushLogEntry({ kind: "system", message: text });
}

function restartTimerIfNeeded() {
  if (!appState.playing) {
    return;
  }
  window.clearInterval(appState.timerId);
  appState.timerId = window.setInterval(stepScene, appState.scene.view.tick_ms);
}

function stopPlayback(message = null) {
  if (appState.timerId) {
    window.clearInterval(appState.timerId);
    appState.timerId = null;
  }
  appState.playing = false;
  appState.autoStopWhenSettled = false;
  if (message) {
    setNotice(message);
  }
}

function startPlayback({ autoStopWhenSettled = false, noticeText = null } = {}) {
  const flowState = sceneFlowState(appState.scene);
  if (flowState !== "settling") {
    if (noticeText) {
      setNotice(flowState === "blocked" ? "Scene is blocked." : "Scene is already stable.");
    }
    appState.playing = false;
    appState.autoStopWhenSettled = false;
    return;
  }
  appState.playing = true;
  appState.autoStopWhenSettled = autoStopWhenSettled;
  window.clearInterval(appState.timerId);
  appState.timerId = window.setInterval(stepScene, appState.scene.view.tick_ms);
  if (noticeText) {
    setNotice(noticeText);
  }
}

function cancelPipeDraft() {
  appState.pipeDraft = null;
}

function saveDraft(scene, message = null) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
    if (message) {
      setNotice(message);
    }
  } catch (error) {
    pushSystemMessage(`Draft save failed: ${error.message}`, "danger");
  }
}

function loadDraft() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeScene(JSON.parse(raw));
  } catch (error) {
    pushSystemMessage(`Draft load failed: ${error.message}`, "danger");
    return null;
  }
}

function sceneForResetBaseline(scene) {
  const baseline = clone(scene);
  baseline.runtime = {
    tick: 0,
    total_water: 0,
    conservation_delta: 0,
    conservation_ok: true,
  };
  return baseline;
}

function captureBaseline(message = null) {
  appState.baselineScene = sceneForResetBaseline(appState.scene);
  saveDraft(appState.scene, message);
}

function rescaleSegments(existing, newLength) {
  const nextSegments = Array.from({ length: newLength }, () => 0);
  if (!Array.isArray(existing) || !existing.length) {
    return nextSegments;
  }
  if (newLength === 1) {
    nextSegments[0] = existing.reduce((sum, value) => sum + value, 0);
    return nextSegments;
  }
  const lastExistingIndex = Math.max(1, existing.length - 1);
  const lastNextIndex = newLength - 1;
  for (let index = 0; index < existing.length; index += 1) {
    const amount = Number(existing[index] || 0);
    if (amount <= 0) {
      continue;
    }
    const progress = index / lastExistingIndex;
    const mappedIndex = clamp(Math.round(progress * lastNextIndex), 0, lastNextIndex);
    nextSegments[mappedIndex] += amount;
  }
  return nextSegments;
}

function componentDefaults(type) {
  if (type === "source") {
    return {
      type,
      label: "Source",
      config: {
        width: 12,
        height: 18,
        capacity: 24,
        emit_rate: 1.0,
        burst_amount: DEFAULT_BURST_AMOUNT,
      },
      state: {
        current_level: 16,
      },
    };
  }

  if (type === "bucket") {
    return {
      type,
      label: "Bucket",
      config: {
        width: 16,
        height: 22,
        capacity: 20,
        outlet_height: 10,
        outlet_size: 1.0,
      },
      state: {
        current_level: 0,
      },
    };
  }

  if (type === "leaky_bucket") {
    return {
      type,
      label: "Leaky Bucket",
      config: {
        width: 16,
        height: 22,
        capacity: 20,
        outlet_height: 10,
        outlet_size: 1.0,
        leak_rate: 0.2,
        leak_target_id: null,
      },
      state: {
        current_level: 0,
      },
    };
  }

  if (type === "siphon") {
    return {
      type,
      label: "Siphon",
      config: {
        width: 16,
        height: 24,
        capacity: 20,
        trigger_level: 10,
      },
      state: {
        current_level: 0,
        is_triggered: false,
      },
    };
  }

  if (type === "output_basin") {
    return {
      type,
      label: "Output Basin",
      config: {
        width: 18,
        height: 14,
        capacity: 30,
      },
      state: {
        current_level: 0,
      },
    };
  }

  return {
    type: "reservoir",
    label: "Reservoir",
    config: {
      width: 18,
      height: 14,
      capacity: 30,
      return_rate: 1.0,
    },
    state: {
      current_level: 0,
    },
  };
}

function normalizeComponent(component, index = 0) {
  const defaults = componentDefaults(component?.type || "bucket");
  const next = {
    id: component?.id || `${defaults.type}-${index + 1}`,
    type: defaults.type,
    label: component?.label || defaults.label,
    position: {
      x: Number(component?.position?.x ?? 120 + index * 34),
      y: Number(component?.position?.y ?? 120 + index * 28),
    },
    config: {
      ...defaults.config,
      ...(component?.config || {}),
    },
    state: {
      ...defaults.state,
      ...(component?.state || {}),
    },
  };

  next.config.width = clamp(Number(next.config.width || defaults.config.width), 8, 36);
  next.config.height = clamp(Number(next.config.height || defaults.config.height), 10, 42);
  next.config.capacity = clamp(Number(next.config.capacity || defaults.config.capacity), 1, 1000);
  next.state.current_level =
    next.type === "output_basin"
      ? Math.max(0, Number(next.state.current_level || 0))
      : clamp(
          Number(next.state.current_level || 0),
          0,
          Number(next.config.capacity),
        );

  if (next.type === "source") {
    next.config.emit_rate = clamp(Number(next.config.emit_rate || 1), 0.1, 20);
    next.config.burst_amount = clamp(
      Number(next.config.burst_amount || DEFAULT_BURST_AMOUNT),
      0.1,
      100,
    );
  }

  if (isBucketLike(next.type)) {
    next.config.outlet_height = clamp(
      Number(next.config.outlet_height || 1),
      0,
      Number(next.config.capacity),
    );
    next.config.outlet_size = clamp(Number(next.config.outlet_size || 1), 0.1, 20);
  }

  if (next.type === "siphon") {
    next.config.trigger_level = clamp(
      Number(next.config.trigger_level || 1),
      0,
      Number(next.config.capacity),
    );
    next.state.is_triggered = Boolean(next.state.is_triggered);
  }

  if (next.type === "leaky_bucket") {
    next.config.leak_rate = clamp(Number(next.config.leak_rate || 0.1), 0, 20);
    next.config.leak_target_id = next.config.leak_target_id ? String(next.config.leak_target_id) : null;
  }

  if (next.type === "reservoir") {
    next.config.return_rate = clamp(Number(next.config.return_rate || 1), 0.1, 20);
  }

  return next;
}

function normalizeConnection(connection, componentsById, index = 0) {
  if (!connection?.from_component || !connection?.to_component) {
    return null;
  }
  if (!componentsById.has(connection.from_component) || !componentsById.has(connection.to_component)) {
    return null;
  }

  const transitTicks = clamp(Number(connection?.config?.transit_ticks || 1), 1, 24);
  const normalized = {
    id: connection?.id || `pipe-${index + 1}`,
    type: "pipe",
    label: connection?.label || `Pipe ${index + 1}`,
    from_component: connection.from_component,
    from_port: connection?.from_port || "out",
    to_component: connection.to_component,
    to_port: connection?.to_port || "in",
    config: {
      width: clamp(Number(connection?.config?.width || 12), 4, 40),
      length: clamp(Number(connection?.config?.length || 200), 40, 1000),
      max_flow_per_tick: clamp(Number(connection?.config?.max_flow_per_tick || 1), 0.1, 20),
      transit_ticks: transitTicks,
    },
    state: {
      segments: rescaleSegments(connection?.state?.segments || [], transitTicks),
    },
  };

  return normalized;
}

function primitiveDefinition(type) {
  return PRIMITIVE_REGISTRY[type] || null;
}

function isInterfaceInputEligible(component) {
  return canReceivePipe(component) && component?.type !== "output_basin";
}

function isInterfaceOutputEligible(component) {
  return canStartPipe(component) && component?.type !== "source";
}

function interfacePortLimit(direction) {
  return direction === "output" ? MAX_PUBLIC_OUTPUTS : MAX_PUBLIC_INPUTS;
}

function interfaceDirectionLabel(direction, plural = false) {
  if (direction === "output") {
    return plural ? "public outputs" : "public output";
  }
  return plural ? "public inputs" : "public input";
}

function normalizeInterfaceEntries(entries, componentsById, direction) {
  const normalized = [];
  const seenIds = new Set();
  const requiredPortId = direction === "input" ? "in" : "out";
  const isEligible =
    direction === "input" ? isInterfaceInputEligible : isInterfaceOutputEligible;

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (normalized.length >= interfacePortLimit(direction)) {
      break;
    }
    const componentId = String(entry?.component_id || "").trim();
    const portId = String(entry?.port_id || requiredPortId).trim() || requiredPortId;
    const component = componentsById.get(componentId);
    if (!component || portId !== requiredPortId || !isEligible(component)) {
      continue;
    }

    const fallbackName =
      direction === "input"
        ? `${component.label} In`
        : `${component.label} Out`;
    const idBase =
      String(entry?.id || "").trim() ||
      slugify(`${direction}-${entry?.name || component.label}`) ||
      `${direction}-${normalized.length + 1}`;
    let uniqueId = idBase;
    let counter = 2;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${idBase}-${counter}`;
      counter += 1;
    }
    seenIds.add(uniqueId);
    normalized.push({
      id: uniqueId,
      name: String(entry?.name || "").trim().slice(0, 64) || fallbackName,
      component_id: componentId,
      port_id: requiredPortId,
    });
  }

  return normalized;
}

function normalizeModuleInterfaceDraft(draft, components) {
  const componentsById = new Map(components.map((component) => [component.id, component]));
  return {
    inputs: normalizeInterfaceEntries(draft?.inputs, componentsById, "input"),
    outputs: normalizeInterfaceEntries(draft?.outputs, componentsById, "output"),
  };
}

function normalizeScene(scene) {
  const next = {
    format_version: Number(scene?.format_version || FORMAT_VERSION),
    scene_id: scene?.scene_id || "elliot-lab-scene",
    title: scene?.title || "Untitled Scene",
    view: {
      tick_ms: clamp(Number(scene?.view?.tick_ms || 600), 120, 1400),
    },
    runtime: {
      tick: Math.max(0, Number(scene?.runtime?.tick || 0)),
      total_water: 0,
      conservation_delta: Number(scene?.runtime?.conservation_delta || 0),
      conservation_ok: true,
    },
    module_interface_draft: {
      inputs: [],
      outputs: [],
    },
    components: [],
    connections: [],
  };

  next.components = (Array.isArray(scene?.components) ? scene.components : []).map((component, index) =>
    normalizeComponent(component, index),
  );

  const componentsById = new Map(next.components.map((component) => [component.id, component]));
  next.connections = (Array.isArray(scene?.connections) ? scene.connections : [])
    .map((connection, index) => normalizeConnection(connection, componentsById, index))
    .filter(Boolean);
  next.module_interface_draft = normalizeModuleInterfaceDraft(
    scene?.module_interface_draft,
    next.components,
  );

  refreshSceneRuntime(next);
  return next;
}

function getSelectionLabel() {
  if (!appState.selection?.id) {
    return "None";
  }
  if (appState.selection.kind === "leak") {
    const source = findComponent(appState.selection.id);
    const target = leakTargetFor(source);
    if (source && target) {
      return `${source.label} -> ${target.label} (Leak)`;
    }
  }
  const selectedComponent = findComponent(appState.selection.id);
  if (selectedComponent) {
    return `${selectedComponent.label} (${TYPE_LABELS[selectedComponent.type]})`;
  }
  const selectedPipe = findConnection(appState.selection.id);
  if (selectedPipe) {
    return `${selectedPipe.label} (Pipe)`;
  }
  return "None";
}

function findComponent(id) {
  return appState.scene.components.find((component) => component.id === id) || null;
}

function findConnection(id) {
  return appState.scene.connections.find((connection) => connection.id === id) || null;
}

function interfaceDraftEntries(direction) {
  return direction === "output"
    ? appState.scene.module_interface_draft.outputs
    : appState.scene.module_interface_draft.inputs;
}

function interfaceBindingFor(direction, componentId, portId) {
  return interfaceBindingsForPort(direction, componentId, portId)[0] || null;
}

function interfaceBindingsForPort(direction, componentId, portId) {
  return interfaceDraftEntries(direction).filter(
    (entry) => entry.component_id === componentId && entry.port_id === portId,
  );
}

function suggestedInterfaceName(direction, component) {
  const base =
    direction === "input"
      ? `${component.label} In`
      : `${component.label} Out`;
  let candidate = base;
  let suffix = 2;
  const names = new Set(
    interfaceDraftEntries(direction).map((entry) => String(entry.name || "").trim().toLowerCase()),
  );
  while (names.has(candidate.toLowerCase())) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function nextInterfacePortId(direction, name) {
  const base = slugify(name || direction) || direction;
  let candidate = `${direction}-${base}`;
  let counter = 2;
  const ids = new Set([
    ...appState.scene.module_interface_draft.inputs.map((entry) => entry.id),
    ...appState.scene.module_interface_draft.outputs.map((entry) => entry.id),
  ]);
  while (ids.has(candidate)) {
    candidate = `${direction}-${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function clearModuleInterfaceDraft() {
  appState.scene.module_interface_draft = {
    inputs: [],
    outputs: [],
  };
}

function autoInterfaceInputName(source, count) {
  if (count === 1) {
    return "Stim In";
  }
  return `${source.label} In`;
}

function autoInterfaceOutputName(outputBasin, count) {
  if (count === 1) {
    return "Readout";
  }
  return `${outputBasin.label} Out`;
}

function applyInterfaceSuggestions(direction, suggestions) {
  if (suggestions.length > interfacePortLimit(direction)) {
    throw new Error(
      `Auto Interface found ${suggestions.length} ${interfaceDirectionLabel(direction, true)}. Export v1 supports at most ${interfacePortLimit(direction)}.`,
    );
  }
  const list = [];
  for (const suggestion of suggestions) {
    list.push({
      id: nextInterfacePortId(direction, suggestion.name),
      name: suggestion.name,
      component_id: suggestion.component_id,
      port_id: suggestion.port_id,
    });
  }
  if (direction === "output") {
    appState.scene.module_interface_draft.outputs = list;
  } else {
    appState.scene.module_interface_draft.inputs = list;
  }
}

function autoPopulateModuleInterface() {
  const inputHarnessRoutes = appState.scene.connections.filter((connection) => {
    const from = findComponent(connection.from_component);
    const to = findComponent(connection.to_component);
    return from?.type === "source" && isInterfaceInputEligible(to);
  });

  const outputHarnessRoutes = appState.scene.connections.filter((connection) => {
    const from = findComponent(connection.from_component);
    const to = findComponent(connection.to_component);
    return to?.type === "output_basin" && isInterfaceOutputEligible(from);
  });

  const inputCount = inputHarnessRoutes.length;
  const outputCount = outputHarnessRoutes.length;

  const inputSuggestions = inputHarnessRoutes.map((connection) => {
    const source = findComponent(connection.from_component);
    return {
      component_id: connection.to_component,
      port_id: "in",
      name: autoInterfaceInputName(source, inputCount),
    };
  });

  const outputSuggestions = outputHarnessRoutes.map((connection) => {
    const basin = findComponent(connection.to_component);
    return {
      component_id: connection.from_component,
      port_id: "out",
      name: autoInterfaceOutputName(basin, outputCount),
    };
  });

  if (!inputSuggestions.length) {
    const fallbackInput = appState.scene.components.find((component) => isInterfaceInputEligible(component));
    if (fallbackInput) {
      inputSuggestions.push({
        component_id: fallbackInput.id,
        port_id: "in",
        name: "Stim In",
      });
    }
  }

  if (!outputSuggestions.length) {
    const fallbackOutput = appState.scene.components.find((component) => isInterfaceOutputEligible(component));
    if (fallbackOutput) {
      outputSuggestions.push({
        component_id: fallbackOutput.id,
        port_id: "out",
        name: "Readout",
      });
    }
  }

  clearModuleInterfaceDraft();
  applyInterfaceSuggestions("input", inputSuggestions);
  applyInterfaceSuggestions("output", outputSuggestions);

  if (!inputSuggestions.length || !outputSuggestions.length) {
    throw new Error("Auto Interface could not find both a public input and a public output.");
  }

  return {
    inputs: inputSuggestions.length,
    outputs: outputSuggestions.length,
  };
}

function exposeInterfacePort(direction, componentId, portId) {
  const component = findComponent(componentId);
  if (!component) {
    return null;
  }
  const requiredPortId = direction === "input" ? "in" : "out";
  if (portId !== requiredPortId) {
    return null;
  }
  if (
    (direction === "input" && !isInterfaceInputEligible(component)) ||
    (direction === "output" && !isInterfaceOutputEligible(component))
  ) {
    return null;
  }

  if (interfaceDraftEntries(direction).length >= interfacePortLimit(direction)) {
    throw new Error(
      `Export v1 supports at most ${interfacePortLimit(direction)} ${interfaceDirectionLabel(direction, true)}.`,
    );
  }

  const name = suggestedInterfaceName(direction, component);
  const binding = {
    id: nextInterfacePortId(direction, name),
    name,
    component_id: componentId,
    port_id: portId,
  };
  interfaceDraftEntries(direction).push(binding);
  return binding;
}

function removeInterfacePort(direction, interfaceId) {
  const list = interfaceDraftEntries(direction);
  const next = list.filter((entry) => entry.id !== interfaceId);
  if (direction === "output") {
    appState.scene.module_interface_draft.outputs = next;
  } else {
    appState.scene.module_interface_draft.inputs = next;
  }
}

function componentSize(component) {
  return {
    width: clamp(component.config.width * 8, 84, 240),
    height: clamp(component.config.height * 8, 120, 300),
  };
}

function waterRatio(component) {
  if (component.type === "output_basin") {
    return component.state.current_level > EPSILON ? 1 : 0;
  }
  return component.config.capacity > 0
    ? clamp(component.state.current_level / component.config.capacity, 0, 1)
    : 0;
}

function getPortPosition(component, port) {
  const size = componentSize(component);
  const x = component.position.x;
  const y = component.position.y;

  if (isTankLike(component)) {
    if (component.type === "leaky_bucket" && port === "leak") {
      return {
        x: x + size.width * 0.36,
        y: y + size.height - 2,
      };
    }
    const thresholdRatio =
      component.config.capacity > 0
        ? clamp(tankThresholdLevel(component) / component.config.capacity, 0, 1)
        : 0.5;
    if (port === "out") {
      return {
        x: x + size.width,
        y: y + size.height - thresholdRatio * size.height,
      };
    }
    return {
      x,
      y: y + size.height * 0.38,
    };
  }

  if (component.type === "source") {
    return {
      x: x + size.width,
      y: y + size.height * 0.5,
    };
  }

  if (component.type === "reservoir") {
    if (port === "out") {
      return {
        x: x + size.width,
        y: y + size.height * 0.42,
      };
    }
    return {
      x,
      y: y + size.height * 0.32,
    };
  }

  if (component.type === "output_basin") {
    return {
      x,
      y: y + size.height * 0.32,
    };
  }

  return {
    x: x + size.width,
    y: y + size.height * 0.5,
  };
}

function sumPipeWater(connection) {
  return connection.state.segments.reduce((sum, value) => sum + Number(value || 0), 0);
}

function getAccounting(scene) {
  let sources = 0;
  let vessels = 0;
  let reservoir = 0;
  let output = 0;
  let pipes = 0;

  for (const component of scene.components) {
    const amount = Number(component.state.current_level || 0);
    if (component.type === "source") {
      sources += amount;
    } else if (isTankLike(component)) {
      vessels += amount;
    } else if (component.type === "reservoir") {
      reservoir += amount;
    } else if (component.type === "output_basin") {
      output += amount;
    }
  }

  for (const connection of scene.connections) {
    pipes += sumPipeWater(connection);
  }

  return {
    sources,
    vessels,
    reservoir,
    output,
    pipes,
    in_circuit: sources + vessels + reservoir + pipes,
    out: output,
    accounted: sources + vessels + reservoir + pipes + output,
  };
}

function componentCapacityLimit(component) {
  if (!component) {
    return 0;
  }
  if (component.type === "output_basin") {
    return Number.POSITIVE_INFINITY;
  }
  return Number(component.config.capacity || 0);
}

function refreshSceneRuntime(scene) {
  const accounting = getAccounting(scene);
  scene.runtime.total_water = accounting.accounted;
  scene.runtime.conservation_ok = Math.abs(Number(scene.runtime.conservation_delta || 0)) <= EPSILON;
  return scene;
}

function currentBurstId() {
  return appState.burstSession?.burst_id || null;
}

function pushLogEntry({
  tick = appState.scene?.runtime?.tick || 0,
  burstId = currentBurstId(),
  kind,
  message,
  amount = null,
  fromComponent = null,
  toComponent = null,
}) {
  appState.logEntryCounter += 1;
  appState.logEntries.push({
    id: `log-${appState.logEntryCounter}`,
    tick,
    burst_id: burstId,
    kind,
    message,
    amount,
    from_component: fromComponent,
    to_component: toComponent,
  });
  if (appState.logEntries.length > 100) {
    appState.logEntries.shift();
  }
}

function resetRuntimeView(message = null) {
  appState.burstSession = createEmptyBurstSession();
  appState.burstCounter = 0;
  appState.logEntries = [];
  appState.logEntryCounter = 0;
  if (message) {
    pushLogEntry({ kind: "system", message });
  }
}

function beginBurstSession(source, acceptedAmount) {
  const accounting = getAccounting(appState.scene);
  appState.burstCounter += 1;
  appState.burstSession = {
    burst_id: `burst-${appState.burstCounter}`,
    last_burst_amount: acceptedAmount,
    burst_start_tick: appState.scene.runtime.tick,
    burst_end_tick: null,
    burst_active: true,
    burst_input_total: acceptedAmount,
    burst_output_delta: 0,
    burst_reservoir_level: accounting.reservoir,
    burst_retained_delta: 0,
    burst_net_circuit_change: 0,
    in_circuit_start: accounting.in_circuit - acceptedAmount,
    in_circuit_end: accounting.in_circuit,
    out_start: accounting.out,
    reservoir_start: accounting.reservoir,
    source_id: source.id,
  };
}

function finalizeBurstSession(terminalState = "stable") {
  if (!appState.burstSession.burst_active) {
    return;
  }

  const accounting = getAccounting(appState.scene);
  appState.burstSession.burst_end_tick = appState.scene.runtime.tick;
  appState.burstSession.burst_active = false;
  appState.burstSession.burst_output_delta = roundNumber(
    accounting.out - appState.burstSession.out_start,
    2,
  );
  appState.burstSession.burst_reservoir_level = roundNumber(accounting.reservoir, 2);
  appState.burstSession.in_circuit_end = roundNumber(accounting.in_circuit, 2);
  appState.burstSession.burst_net_circuit_change = roundNumber(
    accounting.in_circuit - appState.burstSession.in_circuit_start,
    2,
  );
  appState.burstSession.burst_retained_delta = appState.burstSession.in_circuit_end;
  appState.burstSession.terminal_state = terminalState;

  const settleTicks = Math.max(
    0,
    Number(appState.burstSession.burst_end_tick) - Number(appState.burstSession.burst_start_tick),
  );
  pushLogEntry({
    kind: terminalState === "blocked" ? "burst_blocked" : "burst_settled",
    message: `Burst ${terminalState === "blocked" ? "blocked" : "settled"} in ${settleTicks} ticks. Accepted ${roundNumber(appState.burstSession.burst_input_total, 2)} | Circuit now ${roundNumber(appState.burstSession.in_circuit_end, 2)} | Reservoir now ${roundNumber(appState.burstSession.burst_reservoir_level, 2)} | Net circuit change ${roundNumber(appState.burstSession.burst_net_circuit_change, 2)} | Out ${roundNumber(appState.burstSession.burst_output_delta, 2)}`,
  });
}

function systemStateLabel() {
  const flowState = sceneFlowState(appState.scene);
  if (appState.burstSession.burst_active) {
    if (flowState === "blocked") {
      return "Blocked";
    }
    return "Settling";
  }
  if (flowState === "blocked") {
    return "Blocked";
  }
  if (appState.playing && flowState === "settling") {
    return "Running";
  }
  return appState.scene.runtime.conservation_ok ? "Stable" : "Drift";
}

function canStartPipe(component) {
  return component?.type === "source" || isTankLike(component) || component?.type === "reservoir";
}

function canReceivePipe(component) {
  return (
    isTankLike(component) ||
    component?.type === "output_basin" ||
    component?.type === "reservoir"
  );
}

function hasRoute(fromComponentId, toComponentId, ignoreConnectionId = null) {
  return appState.scene.connections.some(
    (connection) =>
      connection.id !== ignoreConnectionId &&
      connection.from_component === fromComponentId &&
      connection.to_component === toComponentId,
  );
}

function isValidPipeRoute(fromComponent, toComponent, ignoreConnectionId = null) {
  if (!fromComponent || !toComponent || fromComponent.id === toComponent.id) {
    return false;
  }
  if (!canStartPipe(fromComponent) || !canReceivePipe(toComponent)) {
    return false;
  }
  return !hasRoute(fromComponent.id, toComponent.id, ignoreConnectionId);
}

function isValidLeakRoute(fromComponent, toComponent) {
  return fromComponent?.type === "leaky_bucket" && toComponent?.type === "reservoir";
}

function isValidDraftRoute(fromComponent, toComponent, mode = "pipe") {
  return mode === "leak"
    ? isValidLeakRoute(fromComponent, toComponent)
    : isValidPipeRoute(fromComponent, toComponent);
}

function pointerToCanvasPosition(event) {
  const rect = refs.canvasSurface.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };
}

function outgoingPipes(componentId) {
  return appState.scene.connections.filter((connection) => connection.from_component === componentId);
}

function pipeConfigFromInputs() {
  return {
    width: Number(refs.pipeWidthInput.value),
    length: Number(refs.pipeLengthInput.value),
    max_flow_per_tick: Number(refs.pipeFlowInput.value),
    transit_ticks: Number(refs.pipeTransitInput.value),
  };
}

function createPipeConnection(fromComponentId, toComponentId) {
  const fromNode = findComponent(fromComponentId);
  const toNode = findComponent(toComponentId);

  if (!isValidPipeRoute(fromNode, toNode)) {
    return null;
  }

  const connection = normalizeConnection(
    {
      id: generateId("pipe"),
      label: `Pipe ${appState.scene.connections.length + 1}`,
      from_component: fromComponentId,
      from_port: "out",
      to_component: toComponentId,
      to_port: "in",
      config: pipeConfigFromInputs(),
      state: {
        segments: [],
      },
    },
    new Map(appState.scene.components.map((component) => [component.id, component])),
    appState.scene.connections.length,
  );

  if (!connection) {
    return null;
  }

  appState.scene.connections.push(connection);
  appState.selection = { kind: "pipe", id: connection.id };
  return connection;
}

function pipeTotalCapacity(connection) {
  return Math.max(0.4, connection.config.width * connection.config.length * PIPE_CAPACITY_FACTOR);
}

function pipeSegmentCapacity(connection) {
  const segmentCount = Math.max(1, connection.state.segments.length || connection.config.transit_ticks || 1);
  return pipeTotalCapacity(connection) / segmentCount;
}

function pipeFillRatio(connection) {
  return pipeTotalCapacity(connection) > 0
    ? clamp(sumPipeWater(connection) / pipeTotalCapacity(connection), 0, 1.4)
    : 0;
}

function injectIntoPipe(connection, requestedAmount) {
  if (!connection || requestedAmount <= 0) {
    return 0;
  }
  const roomAtPipeEntrance = Math.max(0, pipeSegmentCapacity(connection) - connection.state.segments[0]);
  const inserted = Math.min(requestedAmount, connection.config.max_flow_per_tick, roomAtPipeEntrance);
  if (inserted <= 0) {
    return 0;
  }
  connection.state.segments[0] += inserted;
  return inserted;
}

function deliverPipeExit(connection, availableCapacity) {
  const segments = connection.state.segments;
  if (!segments.length) {
    return 0;
  }
  const lastIndex = segments.length - 1;
  const delivered = Math.min(
    Math.max(0, segments[lastIndex]),
    Math.max(0, availableCapacity),
    connection.config.max_flow_per_tick,
  );
  if (delivered > EPSILON) {
    segments[lastIndex] -= delivered;
  }
  return delivered;
}

function advancePipe(connection) {
  const segments = connection.state.segments;
  if (!segments.length) {
    return;
  }
  const segmentCapacity = pipeSegmentCapacity(connection);
  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const room = Math.max(0, segmentCapacity - segments[index + 1]);
    const moved = Math.min(segments[index], room);
    if (moved <= EPSILON) {
      continue;
    }
    segments[index] -= moved;
    segments[index + 1] += moved;
  }
}

function availableComponentCapacity(componentId, pendingDeliveries) {
  const component = findComponent(componentId);
  if (!component) {
    return 0;
  }
  if (component.type === "output_basin") {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(
    0,
    componentCapacityLimit(component) -
      component.state.current_level -
      Number(pendingDeliveries.get(componentId) || 0),
  );
}

function pipeHasInputRoom(connection) {
  return Math.max(0, pipeSegmentCapacity(connection) - connection.state.segments[0]) > EPSILON;
}

function leakTargetFor(component) {
  if (component?.type !== "leaky_bucket" || !component.config.leak_target_id) {
    return null;
  }
  const target = findComponent(component.config.leak_target_id);
  return target?.type === "reservoir" ? target : null;
}

function componentCanRelease(component) {
  const connections = outgoingPipes(component.id);
  if (!connections.length) {
    return false;
  }

  if (component.type === "source") {
    return (
      component.state.current_level > EPSILON &&
      connections.some((connection) => pipeHasInputRoom(connection))
    );
  }

  if (isBucketLike(component)) {
    return (
      component.state.current_level - component.config.outlet_height > EPSILON &&
      connections.some((connection) => pipeHasInputRoom(connection))
    );
  }

  if (component?.type === "siphon") {
    return (
      (component.state.is_triggered || component.state.current_level >= component.config.trigger_level) &&
      component.state.current_level > EPSILON &&
      connections.some((connection) => pipeHasInputRoom(connection))
    );
  }

  if (component?.type === "reservoir") {
    return (
      component.state.current_level > EPSILON &&
      component.config.return_rate > EPSILON &&
      connections.some((connection) => pipeHasInputRoom(connection))
    );
  }

  return false;
}

function componentCanLeak(component) {
  if (component?.type !== "leaky_bucket") {
    return false;
  }
  const leakTarget = leakTargetFor(component);
  if (!leakTarget) {
    return false;
  }
  return (
    component.state.current_level > EPSILON &&
    component.config.leak_rate > EPSILON &&
    availableComponentCapacity(leakTarget.id, new Map()) > EPSILON
  );
}

function pipeCanAdvance(connection) {
  const segments = connection.state.segments;
  if (!segments.length) {
    return false;
  }
  const segmentCapacity = pipeSegmentCapacity(connection);
  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const room = Math.max(0, segmentCapacity - segments[index + 1]);
    const moved = Math.min(segments[index], room);
    if (moved > EPSILON) {
      return true;
    }
  }
  return false;
}

function pipeCanDeliver(connection) {
  const segments = connection.state.segments;
  if (!segments.length) {
    return false;
  }
  const lastAmount = Number(segments[segments.length - 1] || 0);
  if (lastAmount <= EPSILON) {
    return false;
  }
  const freeCapacity = availableComponentCapacity(connection.to_component, new Map());
  return Math.min(lastAmount, freeCapacity, connection.config.max_flow_per_tick) > EPSILON;
}

function componentIsBlockedOnOutput(component) {
  const connections = outgoingPipes(component.id);
  if (!connections.length) {
    return false;
  }

  if (component.type === "source") {
    return (
      component.state.current_level > EPSILON &&
      !connections.some((connection) => pipeHasInputRoom(connection))
    );
  }

  if (isBucketLike(component)) {
    return (
      component.state.current_level - component.config.outlet_height > EPSILON &&
      !connections.some((connection) => pipeHasInputRoom(connection))
    );
  }

  if (component.type === "siphon") {
    return (
      (component.state.is_triggered || component.state.current_level >= component.config.trigger_level) &&
      component.state.current_level > EPSILON &&
      !connections.some((connection) => pipeHasInputRoom(connection))
    );
  }

  if (component.type === "reservoir") {
    return (
      component.state.current_level > EPSILON &&
      component.config.return_rate > EPSILON &&
      !connections.some((connection) => pipeHasInputRoom(connection))
    );
  }

  return false;
}

function componentIsBlockedOnLeak(component) {
  if (component?.type !== "leaky_bucket") {
    return false;
  }
  const leakTarget = leakTargetFor(component);
  if (!leakTarget) {
    return false;
  }
  return (
    component.state.current_level > EPSILON &&
    component.config.leak_rate > EPSILON &&
    availableComponentCapacity(leakTarget.id, new Map()) <= EPSILON
  );
}

function sceneFlowState(scene) {
  if (!scene) {
    return "stable";
  }

  let hasBlockedPotential = false;

  for (const connection of scene.connections) {
    if (!connection.state.segments.some((amount) => Number(amount || 0) > EPSILON)) {
      continue;
    }
    if (pipeCanAdvance(connection) || pipeCanDeliver(connection)) {
      return "settling";
    }
    hasBlockedPotential = true;
  }

  for (const component of scene.components) {
    if (componentCanRelease(component) || componentCanLeak(component)) {
      return "settling";
    }
    if (componentIsBlockedOnOutput(component) || componentIsBlockedOnLeak(component)) {
      hasBlockedPotential = true;
    }
  }

  return hasBlockedPotential ? "blocked" : "stable";
}

function sceneHasMotionPotential(scene) {
  return sceneFlowState(scene) === "settling";
}

function stepScene() {
  if (!appState.scene) {
    return;
  }

  const beforeAccounting = getAccounting(appState.scene);
  const deliveries = new Map();
  const activeContainers = new Set();

  for (const connection of appState.scene.connections) {
    const freeCapacity = availableComponentCapacity(connection.to_component, deliveries);
    const delivered = deliverPipeExit(connection, freeCapacity);
    if (delivered <= EPSILON) {
      continue;
    }
    const fromComponent = findComponent(connection.from_component);
    const toComponent = findComponent(connection.to_component);
    pushLogEntry({
      kind: "pipe_delivery",
      message: `Pipe moved ${roundNumber(delivered, 2)} from ${fromComponent?.label || connection.from_component} -> ${toComponent?.label || connection.to_component}`,
      amount: roundNumber(delivered, 2),
      fromComponent: connection.from_component,
      toComponent: connection.to_component,
    });
    if (toComponent?.type === "output_basin") {
      pushLogEntry({
        kind: "output_receive",
        message: `Output received ${roundNumber(delivered, 2)}`,
        amount: roundNumber(delivered, 2),
        fromComponent: connection.from_component,
        toComponent: connection.to_component,
      });
      if (appState.burstSession.burst_active) {
        appState.burstSession.burst_output_delta = roundNumber(
          appState.burstSession.burst_output_delta + delivered,
          2,
        );
      }
    } else if (toComponent?.type === "reservoir") {
      activeContainers.add(toComponent.id);
      pushLogEntry({
        kind: "reservoir_receive",
        message: `Reservoir received ${roundNumber(delivered, 2)}`,
        amount: roundNumber(delivered, 2),
        fromComponent: connection.from_component,
        toComponent: connection.to_component,
      });
    } else if (isTankLike(toComponent)) {
      activeContainers.add(toComponent.id);
    }
    deliveries.set(
      connection.to_component,
      (deliveries.get(connection.to_component) || 0) + delivered,
    );
  }

  for (const connection of appState.scene.connections) {
    advancePipe(connection);
  }

  for (const component of appState.scene.components) {
    if (component.type !== "source") {
      continue;
    }

    let remaining = Math.min(component.state.current_level, component.config.emit_rate);
    for (const connection of outgoingPipes(component.id)) {
      if (remaining <= 0) {
        break;
      }
      const inserted = injectIntoPipe(connection, remaining);
      if (inserted > EPSILON) {
        const toComponent = findComponent(connection.to_component);
        pushLogEntry({
          kind: "source_emit",
          message: `${component.label} emitted ${roundNumber(inserted, 2)} toward ${toComponent?.label || connection.to_component}`,
          amount: roundNumber(inserted, 2),
          fromComponent: component.id,
          toComponent: connection.to_component,
        });
      }
      remaining -= inserted;
      component.state.current_level -= inserted;
    }
  }

  for (const component of appState.scene.components) {
    if (!isTankLike(component) && component.type !== "reservoir") {
      continue;
    }
    const connections = outgoingPipes(component.id);

    if (component.type === "leaky_bucket") {
      const leakTarget = leakTargetFor(component);
      const leakCapacity = leakTarget ? availableComponentCapacity(leakTarget.id, deliveries) : 0;
      const leaked = Math.min(component.state.current_level, component.config.leak_rate, leakCapacity);
      if (leaked > EPSILON) {
        component.state.current_level -= leaked;
        deliveries.set(leakTarget.id, (deliveries.get(leakTarget.id) || 0) + leaked);
        activeContainers.add(component.id);
        activeContainers.add(leakTarget.id);
        pushLogEntry({
          kind: "bucket_leak",
          message: `${component.label} leaked ${roundNumber(leaked, 2)} to ${leakTarget.label}`,
          amount: roundNumber(leaked, 2),
          fromComponent: component.id,
          toComponent: leakTarget.id,
        });
      }
    }

    if (!connections.length) {
      continue;
    }

    let remainingOutflow = 0;
    let releaseKind = "bucket_release";
    let releaseVerb = "released";

    if (component.type === "siphon") {
      if (!component.state.is_triggered && component.state.current_level >= component.config.trigger_level) {
        component.state.is_triggered = true;
        activeContainers.add(component.id);
        pushLogEntry({
          kind: "siphon_trigger",
          message: `${component.label} triggered at ${roundNumber(component.state.current_level, 2)}`,
          amount: roundNumber(component.state.current_level, 2),
          toComponent: component.id,
        });
      }
      if (component.state.is_triggered) {
        remainingOutflow = component.state.current_level;
        releaseKind = "siphon_dump";
        releaseVerb = "dumped";
      }
    } else if (component.type === "reservoir") {
      remainingOutflow = Math.min(component.state.current_level, component.config.return_rate);
      releaseKind = "reservoir_return";
      releaseVerb = "returned";
    } else {
      remainingOutflow = Math.min(
        Math.max(0, component.state.current_level - component.config.outlet_height),
        component.config.outlet_size,
      );
    }

    for (const connection of connections) {
      if (remainingOutflow <= 0) {
        break;
      }
      const inserted = injectIntoPipe(connection, remainingOutflow);
      if (inserted > EPSILON) {
        activeContainers.add(component.id);
        pushLogEntry({
          kind: releaseKind,
          message: `${component.label} ${releaseVerb} ${roundNumber(inserted, 2)}`,
          amount: roundNumber(inserted, 2),
          fromComponent: component.id,
          toComponent: connection.to_component,
        });
      }
      remainingOutflow -= inserted;
      component.state.current_level -= inserted;
    }
  }

  // Deliveries land at the end of the tick so buckets cannot release new inflow immediately.
  for (const component of appState.scene.components) {
    const delivered = Number(deliveries.get(component.id) || 0);
    if (component.type === "output_basin") {
      component.state.current_level = Math.max(0, Number(component.state.current_level || 0) + delivered);
    } else {
      component.state.current_level = clamp(
        Number(component.state.current_level || 0) + delivered,
        0,
        component.config.capacity,
      );
    }
    if (component.type === "siphon" && component.state.is_triggered && component.state.current_level <= EPSILON) {
      component.state.is_triggered = false;
      pushLogEntry({
        kind: "siphon_reset",
        message: `${component.label} reset to 0`,
        amount: 0,
        toComponent: component.id,
      });
    }
    if (isBucketLike(component) && activeContainers.has(component.id)) {
      pushLogEntry({
        kind: "bucket_level",
        message: `${component.label} level now ${roundNumber(component.state.current_level, 2)}`,
        amount: roundNumber(component.state.current_level, 2),
        toComponent: component.id,
      });
    }
    if (component.type === "siphon" && activeContainers.has(component.id)) {
      pushLogEntry({
        kind: "siphon_level",
        message: `${component.label} level now ${roundNumber(component.state.current_level, 2)}`,
        amount: roundNumber(component.state.current_level, 2),
        toComponent: component.id,
      });
    }
    if (component.type === "reservoir" && activeContainers.has(component.id)) {
      pushLogEntry({
        kind: "reservoir_level",
        message: `${component.label} level now ${roundNumber(component.state.current_level, 2)}`,
        amount: roundNumber(component.state.current_level, 2),
        toComponent: component.id,
      });
    }
  }

  const afterAccounting = getAccounting(appState.scene);
  appState.scene.runtime.tick += 1;
  appState.scene.runtime.conservation_delta = roundNumber(
    afterAccounting.accounted - beforeAccounting.accounted,
    6,
  );
  appState.scene.runtime.conservation_ok =
    Math.abs(appState.scene.runtime.conservation_delta) <= EPSILON;
  refreshSceneRuntime(appState.scene);
  const flowState = sceneFlowState(appState.scene);
  if (appState.autoStopWhenSettled && flowState !== "settling") {
    finalizeBurstSession(flowState === "blocked" ? "blocked" : "stable");
    stopPlayback(flowState === "blocked" ? "Scene blocked." : null);
  }
  render();
}

function generateId(prefix) {
  let counter = 1;
  const seen = new Set([
    ...appState.scene.components.map((component) => component.id),
    ...appState.scene.connections.map((connection) => connection.id),
  ]);
  while (seen.has(`${prefix}-${counter}`)) {
    counter += 1;
  }
  return `${prefix}-${counter}`;
}

function nextComponentPosition(type) {
  const count = appState.scene.components.filter((component) => component.type === type).length;
  const map = {
    source: { x: 88, y: 116 },
    bucket: { x: 260, y: 132 },
    leaky_bucket: { x: 292, y: 176 },
    siphon: { x: 320, y: 148 },
    output_basin: { x: 640, y: 236 },
    reservoir: { x: 520, y: 412 },
  };
  const base = map[type] || { x: 200, y: 200 };
  return {
    x: base.x + count * 28,
    y: base.y + count * 24,
  };
}

function guardBuildMode(actionLabel = "edit the scene") {
  if (!isWaterMode()) {
    return false;
  }
  pushSystemMessage(`Open Build Mode to ${actionLabel}.`, "danger");
  render();
  return true;
}

function addComponent(type) {
  if (guardBuildMode("add components")) {
    return;
  }
  stopPlayback();
  const defaults = componentDefaults(type);
  const component = normalizeComponent(
    {
      id: generateId(type === "output_basin" ? "output" : type),
      type,
      label: `${TYPE_LABELS[type]} ${appState.scene.components.filter((item) => item.type === type).length + 1}`,
      position: nextComponentPosition(type),
      config: defaults.config,
      state: defaults.state,
    },
    appState.scene.components.length,
  );
  appState.scene.components.push(component);
  appState.selection = { kind: "component", id: component.id };
  captureBaseline(`${TYPE_LABELS[type]} added.`);
  render();
}

function addPipeFromBuilder() {
  if (guardBuildMode("build pipes")) {
    return;
  }
  stopPlayback();

  const fromComponent = refs.pipeFromSelect.value;
  const toComponent = refs.pipeToSelect.value;
  const fromNode = findComponent(fromComponent);
  const toNode = findComponent(toComponent);

  if (!isValidPipeRoute(fromNode, toNode)) {
    pushSystemMessage(
      "Choose a valid route: source, vessel, or reservoir into bucket, siphon, basin, or reservoir.",
      "danger",
    );
    render();
    return;
  }

  const connection = createPipeConnection(fromComponent, toComponent);
  if (!connection) {
    pushSystemMessage("Pipe creation failed. Check the selected components.", "danger");
    render();
    return;
  }

  captureBaseline("Pipe added.");
  render();
}

function burstTargetSource() {
  const selected =
    appState.selection?.kind === "component" ? findComponent(appState.selection.id) : null;
  if (selected?.type === "source") {
    return selected;
  }
  return appState.scene.components.find((component) => component.type === "source") || null;
}

function triggerBurst() {
  if (appState.burstSession.burst_active) {
    pushSystemMessage("Wait for the current burst to settle before triggering another one.");
    render();
    return;
  }

  const source = burstTargetSource();
  if (!source) {
    pushSystemMessage("Add or select a source before triggering a burst.");
    render();
    return;
  }

  const burstAmount = Number(source.config.burst_amount || DEFAULT_BURST_AMOUNT);
  const beforeLevel = source.state.current_level;
  source.state.current_level = clamp(
    source.state.current_level + burstAmount,
    0,
    source.config.capacity,
  );
  const added = roundNumber(source.state.current_level - beforeLevel, 2);

  if (added <= 0) {
    pushSystemMessage(`${source.label} is already full. Burst skipped.`);
    render();
    return;
  }

  appState.selection = { kind: "component", id: source.id };
  refreshSceneRuntime(appState.scene);
  beginBurstSession(source, added);
  pushLogEntry({
    kind: "burst_in",
    message: `Burst +${added} into ${source.label}`,
    amount: added,
    fromComponent: source.id,
  });

  const flowState = sceneFlowState(appState.scene);
  if (flowState === "settling") {
    startPlayback({
      autoStopWhenSettled: true,
      noticeText: null,
    });
  } else {
    finalizeBurstSession(flowState === "blocked" ? "blocked" : "stable");
  }

  render();
}

function removeSelection() {
  if (guardBuildMode("delete scene objects")) {
    return;
  }
  if (!appState.selection?.id) {
    pushSystemMessage("Nothing selected to delete.", "danger");
    render();
    return;
  }
  stopPlayback();

  if (appState.selection.kind === "component") {
    const id = appState.selection.id;
    appState.scene.components = appState.scene.components.filter((component) => component.id !== id);
    appState.scene.connections = appState.scene.connections.filter(
      (connection) => connection.from_component !== id && connection.to_component !== id,
    );
    appState.scene.module_interface_draft.inputs = appState.scene.module_interface_draft.inputs.filter(
      (entry) => entry.component_id !== id,
    );
    appState.scene.module_interface_draft.outputs =
      appState.scene.module_interface_draft.outputs.filter((entry) => entry.component_id !== id);
    appState.selection = firstSelection();
    captureBaseline("Component removed.");
    render();
    return;
  }

  if (appState.selection.kind === "pipe") {
    appState.scene.connections = appState.scene.connections.filter(
      (connection) => connection.id !== appState.selection.id,
    );
    appState.selection = firstSelection();
    captureBaseline("Pipe removed.");
    render();
    return;
  }

  if (appState.selection.kind === "leak") {
    const source = findComponent(appState.selection.id);
    if (!source || source.type !== "leaky_bucket") {
      appState.selection = firstSelection();
      render();
      return;
    }
    source.config.leak_target_id = null;
    refreshSceneRuntime(appState.scene);
    appState.selection = { kind: "component", id: source.id };
    captureBaseline("Leak route removed.");
    render();
  }
}

function firstSelection() {
  if (appState.scene.components.length) {
    return {
      kind: "component",
      id: appState.scene.components[0].id,
    };
  }
  if (appState.scene.connections.length) {
    return {
      kind: "pipe",
      id: appState.scene.connections[0].id,
    };
  }
  return {
    kind: null,
    id: null,
  };
}

function resetSimulation() {
  stopPlayback();
  appState.scene = normalizeScene(clone(appState.baselineScene));
  resetRuntimeView("Scene reset to current baseline.");
  render();
}

function loadScene(scene, message) {
  stopPlayback();
  appState.scene = normalizeScene(scene);
  appState.baselineScene = sceneForResetBaseline(appState.scene);
  appState.selection = firstSelection();
  saveDraft(appState.scene);
  resetRuntimeView(message);
  render();
}

function downloadJsonFile(data, filename, successMessage) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
  pushSystemMessage(successMessage);
}

function primitiveRolesForScene(scene) {
  return primitiveRolesForComponents(scene.components);
}

function primitiveRolesForComponents(components) {
  return [...new Set(components.map((component) => component.type))].map((type) => {
    const definition = primitiveDefinition(type);
    return {
      primitive: type,
      label: TYPE_LABELS[type] || type,
      role: definition?.semantics?.role || "component",
      conserved_quantity: definition?.semantics?.conserved_quantity || "stored_quantity",
      summary: definition?.semantics?.summary || "",
      mapping_notes: definition?.mapping_notes || [],
    };
  });
}

function buildModuleSummary(scene) {
  const roles = primitiveRolesForScene(scene).map((entry) => entry.role);
  if (!roles.length) {
    return "Reusable computational module exported from Circuit Lab.";
  }
  return `Reusable module with ${roles.join(", ")} semantics.`;
}

function moduleGraphFromScene(scene) {
  const components = scene.components.filter(
    (component) => component.type !== "source" && component.type !== "output_basin",
  );
  const componentIds = new Set(components.map((component) => component.id));
  const routes = scene.connections.filter(
    (connection) =>
      componentIds.has(connection.from_component) && componentIds.has(connection.to_component),
  );
  return {
    components: clone(components),
    routes: clone(routes),
    layout: {
      scene_id: scene.scene_id,
      title: scene.title,
    },
  };
}

function uniqueHarnessId(baseId, takenIds) {
  let candidate = baseId;
  let counter = 2;
  while (takenIds.has(candidate)) {
    candidate = `${baseId}-${counter}`;
    counter += 1;
  }
  takenIds.add(candidate);
  return candidate;
}

function emptyRouteSegments(routeConfig) {
  return Array.from({ length: Number(routeConfig.transit_ticks) }, () => 0);
}

function labHarnessSceneFromModule(modulePayload) {
  const inputsById = new Map(
    (modulePayload?.interface?.inputs || []).map((entry) => [entry.id, entry]),
  );
  const outputsById = new Map(
    (modulePayload?.interface?.outputs || []).map((entry) => [entry.id, entry]),
  );
  const components = clone(modulePayload?.graph?.components || []);
  const connections = clone(modulePayload?.graph?.routes || []);
  const takenComponentIds = new Set(components.map((component) => component.id));
  const takenRouteIds = new Set(connections.map((connection) => connection.id));
  const inputBindings = modulePayload?.bindings?.inputs || [];
  const outputBindings = modulePayload?.bindings?.outputs || [];
  const inputOffsets = new Map();
  const outputOffsets = new Map();

  for (const binding of inputBindings) {
    const boundComponent = components.find((component) => component.id === binding.component_id);
    if (!boundComponent) {
      continue;
    }
    const index = inputOffsets.get(binding.component_id) || 0;
    inputOffsets.set(binding.component_id, index + 1);
    const harnessSourceId = uniqueHarnessId(
      `harness-source-${slugify(binding.interface_port) || "input"}`,
      takenComponentIds,
    );
    const harnessRouteId = uniqueHarnessId(
      `harness-input-route-${slugify(binding.interface_port) || "input"}`,
      takenRouteIds,
    );
    components.push({
      id: harnessSourceId,
      type: "source",
      label: inputsById.get(binding.interface_port)?.name || "Stim In",
      position: {
        x: roundNumber(Number(boundComponent.position?.x || 0) - 180, 0),
        y: roundNumber(Number(boundComponent.position?.y || 0) + index * 48, 0),
      },
      config: clone(DEFAULT_HARNESS_SOURCE_CONFIG),
      state: {
        current_level: 0,
      },
    });
    connections.push({
      id: harnessRouteId,
      type: "pipe",
      label: `${inputsById.get(binding.interface_port)?.name || "Stim In"} Harness`,
      from_component: harnessSourceId,
      from_port: "out",
      to_component: binding.component_id,
      to_port: binding.port_id,
      config: clone(DEFAULT_HARNESS_ROUTE_CONFIG),
      state: {
        segments: emptyRouteSegments(DEFAULT_HARNESS_ROUTE_CONFIG),
      },
    });
  }

  for (const binding of outputBindings) {
    const boundComponent = components.find((component) => component.id === binding.component_id);
    if (!boundComponent) {
      continue;
    }
    const index = outputOffsets.get(binding.component_id) || 0;
    outputOffsets.set(binding.component_id, index + 1);
    const harnessOutputId = uniqueHarnessId(
      `harness-output-${slugify(binding.interface_port) || "output"}`,
      takenComponentIds,
    );
    const harnessRouteId = uniqueHarnessId(
      `harness-output-route-${slugify(binding.interface_port) || "output"}`,
      takenRouteIds,
    );
    components.push({
      id: harnessOutputId,
      type: "output_basin",
      label: outputsById.get(binding.interface_port)?.name || "Readout",
      position: {
        x: roundNumber(Number(boundComponent.position?.x || 0) + 180, 0),
        y: roundNumber(Number(boundComponent.position?.y || 0) + index * 48, 0),
      },
      config: clone(DEFAULT_HARNESS_OUTPUT_CONFIG),
      state: {
        current_level: 0,
      },
    });
    connections.push({
      id: harnessRouteId,
      type: "pipe",
      label: `${outputsById.get(binding.interface_port)?.name || "Readout"} Readout`,
      from_component: binding.component_id,
      from_port: binding.port_id,
      to_component: harnessOutputId,
      to_port: "in",
      config: clone(DEFAULT_HARNESS_ROUTE_CONFIG),
      state: {
        segments: emptyRouteSegments(DEFAULT_HARNESS_ROUTE_CONFIG),
      },
    });
  }

  return normalizeScene({
    format_version: FORMAT_VERSION,
    scene_id: modulePayload?.module?.id || "elliot-module",
    title: modulePayload?.module?.name || "Imported Module",
    view: {
      tick_ms: 600,
    },
    runtime: {
      tick: 0,
      total_water: 0,
      conservation_delta: 0,
      conservation_ok: true,
    },
    module_interface_draft: {
      inputs: inputBindings.map((binding) => ({
        id: binding.interface_port,
        name: inputsById.get(binding.interface_port)?.name || binding.interface_port,
        component_id: binding.component_id,
        port_id: binding.port_id,
      })),
      outputs: outputBindings.map((binding) => ({
        id: binding.interface_port,
        name: outputsById.get(binding.interface_port)?.name || binding.interface_port,
        component_id: binding.component_id,
        port_id: binding.port_id,
      })),
    },
    components,
    connections,
  });
}

function buildModuleExport(scene = appState.scene) {
  const inputs = scene.module_interface_draft.inputs.map((entry) => ({
    id: entry.id,
    name: entry.name,
  }));
  const outputs = scene.module_interface_draft.outputs.map((entry) => ({
    id: entry.id,
    name: entry.name,
  }));

  if (!inputs.length || !outputs.length) {
    throw new Error("Expose at least one public input and one public output before exporting.");
  }
  if (inputs.length > MAX_PUBLIC_INPUTS || outputs.length > MAX_PUBLIC_OUTPUTS) {
    throw new Error(
      `Export v1 supports at most ${MAX_PUBLIC_INPUTS} public inputs and ${MAX_PUBLIC_OUTPUTS} public outputs.`,
    );
  }

  const pureGraph = moduleGraphFromScene(scene);
  const moduleId = slugify(scene.title || scene.scene_id) || "elliot-module";
  return {
    format: MODULE_FORMAT,
    module: {
      id: moduleId,
      name: scene.title || "Untitled Module",
      version: "0.1.0",
    },
    interface: {
      inputs,
      outputs,
    },
    bindings: {
      inputs: scene.module_interface_draft.inputs.map((entry) => ({
        interface_port: entry.id,
        component_id: entry.component_id,
        port_id: entry.port_id,
      })),
      outputs: scene.module_interface_draft.outputs.map((entry) => ({
        interface_port: entry.id,
        component_id: entry.component_id,
        port_id: entry.port_id,
      })),
    },
    graph: {
      components: pureGraph.components,
      routes: pureGraph.routes,
      layout: pureGraph.layout,
    },
    semantics: {
      summary: buildModuleSummary({
        components: pureGraph.components,
      }),
      primitive_roles: primitiveRolesForComponents(pureGraph.components),
    },
    metadata: {
      exported_from_scene_id: scene.scene_id,
      exported_at: new Date().toISOString(),
    },
  };
}

function moduleToScene(modulePayload) {
  return labHarnessSceneFromModule(modulePayload);
}

function saveSceneToFile() {
  downloadJsonFile(
    appState.scene,
    `${slugify(appState.scene.title || appState.scene.scene_id)}.scene.json`,
    "Scene file downloaded.",
  );
  render();
}

function exportModuleToFile() {
  const modulePayload = buildModuleExport(appState.scene);
  downloadJsonFile(
    modulePayload,
    `${slugify(modulePayload.module.name || modulePayload.module.id)}.module.json`,
    "Module export downloaded.",
  );
  render();
}

function updateConnectionField(connection, key, rawValue) {
  if (key === "width") {
    connection.config.width = clamp(Number(rawValue), 4, 40);
  } else if (key === "length") {
    connection.config.length = clamp(Number(rawValue), 40, 1000);
  } else if (key === "max_flow_per_tick") {
    connection.config.max_flow_per_tick = clamp(Number(rawValue), 0.1, 20);
  } else if (key === "transit_ticks") {
    const nextTicks = clamp(Number(rawValue), 1, 24);
    connection.state.segments = rescaleSegments(connection.state.segments, nextTicks);
    connection.config.transit_ticks = nextTicks;
  }
}

function updateComponentField(component, section, key, rawValue) {
  const numericValue = Number(rawValue);

  if (section === "meta" && key === "label") {
    component.label = String(rawValue || "").slice(0, 64) || TYPE_LABELS[component.type];
    return;
  }

  if (section === "position") {
    component.position[key] = clamp(numericValue, 0, 2200);
    return;
  }

  if (section === "state" && key === "current_level") {
    component.state.current_level =
      component.type === "output_basin"
        ? Math.max(0, numericValue)
        : clamp(numericValue, 0, component.config.capacity);
    return;
  }

  if (section === "config" && key === "leak_target_id") {
    component.config.leak_target_id = rawValue ? String(rawValue) : null;
    return;
  }

  if (section !== "config") {
    return;
  }

  if (key === "width") {
    component.config.width = clamp(numericValue, 8, 36);
  } else if (key === "height") {
    component.config.height = clamp(numericValue, 10, 42);
  } else if (key === "capacity") {
    if (component.type === "output_basin") {
      return;
    }
    component.config.capacity = clamp(numericValue, 1, 1000);
    component.state.current_level = clamp(component.state.current_level, 0, component.config.capacity);
    if (isBucketLike(component)) {
      component.config.outlet_height = clamp(component.config.outlet_height, 0, component.config.capacity);
    }
    if (component.type === "siphon") {
      component.config.trigger_level = clamp(component.config.trigger_level, 0, component.config.capacity);
    }
  } else if (key === "emit_rate") {
    component.config.emit_rate = clamp(numericValue, 0.1, 20);
  } else if (key === "burst_amount") {
    component.config.burst_amount = clamp(numericValue, 0.1, 100);
  } else if (key === "outlet_height") {
    component.config.outlet_height = clamp(numericValue, 0, component.config.capacity);
  } else if (key === "outlet_size") {
    component.config.outlet_size = clamp(numericValue, 0.1, 20);
  } else if (key === "trigger_level") {
    component.config.trigger_level = clamp(numericValue, 0, component.config.capacity);
  } else if (key === "leak_rate") {
    component.config.leak_rate = clamp(numericValue, 0, 20);
  } else if (key === "return_rate") {
    component.config.return_rate = clamp(numericValue, 0.1, 20);
  }
}

function buildField({
  label,
  value,
  type = "number",
  step = "1",
  min = null,
  max = null,
  dataset = {},
  options = [],
}) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";

  const labelEl = document.createElement("span");
  labelEl.className = "field-label";
  labelEl.textContent = label;

  const input = document.createElement(type === "select" ? "select" : "input");
  if (type === "select") {
    for (const option of options) {
      const optionEl = document.createElement("option");
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      if (String(option.value) === String(value ?? "")) {
        optionEl.selected = true;
      }
      input.append(optionEl);
    }
  } else {
    input.type = type;
    input.value = value;
  }
  if (step != null && type !== "text") {
    input.step = step;
  }
  if (min != null) {
    input.min = min;
  }
  if (max != null) {
    input.max = max;
  }
  for (const [key, itemValue] of Object.entries(dataset)) {
    input.dataset[key] = itemValue;
  }

  wrapper.append(labelEl, input);
  return wrapper;
}

function buildAdvancedSection(children, note = null) {
  const details = document.createElement("details");
  details.className = "inspector-advanced";

  const summary = document.createElement("summary");
  summary.className = "inspector-advanced-summary";
  summary.textContent = "Advanced";
  details.append(summary);

  if (note) {
    const noteEl = document.createElement("p");
    noteEl.className = "inspector-advanced-note";
    noteEl.textContent = note;
    details.append(noteEl);
  }

  const body = document.createElement("div");
  body.className = "inspector-form inspector-advanced-form";
  for (const child of children) {
    body.append(child);
  }
  details.append(body);
  return details;
}

function buildInterfaceEntryEditor(direction, entry, detailText) {
  const wrapper = document.createElement("div");
  wrapper.className = "interface-port-row";

  const field = buildField({
    label: direction === "input" ? "Public Input" : "Public Output",
    value: entry.name,
    type: "text",
    step: null,
    dataset: {
      targetKind: "interface",
      targetId: entry.id,
      section: "interface",
      key: "name",
      direction,
    },
  });
  field.classList.add("interface-port-field");
  wrapper.append(field);

  const meta = document.createElement("p");
  meta.className = "interface-port-meta";
  meta.textContent = detailText;
  wrapper.append(meta);

  const actions = document.createElement("div");
  actions.className = "interface-port-actions";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "action-button";
  removeButton.textContent = "Remove";
  removeButton.dataset.interfaceAction = "remove";
  removeButton.dataset.direction = direction;
  removeButton.dataset.interfaceId = entry.id;
  actions.append(removeButton);

  wrapper.append(actions);
  return wrapper;
}

function buildExposeInterfaceAction(direction, component, portId) {
  const wrapper = document.createElement("div");
  wrapper.className = "interface-port-row is-empty";

  const text = document.createElement("p");
  text.className = "interface-port-meta";
  text.textContent =
    direction === "input"
      ? "Expose this internal input port as a public interface input."
      : "Expose this internal output port as a public interface output.";
  wrapper.append(text);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "action-button";
  button.textContent = direction === "input" ? "Expose Input" : "Expose Output";
  button.dataset.interfaceAction = "expose";
  button.dataset.direction = direction;
  button.dataset.componentId = component.id;
  button.dataset.portId = portId;
  wrapper.append(button);

  return wrapper;
}

function renderInspector() {
  refs.inspectorContent.replaceChildren();

  if (!appState.selection?.id) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent = "Select a source, bucket, siphon, basin, reservoir, or pipe to inspect it.";
    refs.inspectorContent.append(empty);
    return;
  }

  if (appState.selection.kind === "pipe") {
    const connection = findConnection(appState.selection.id);
    if (!connection) {
      return;
    }

    const meta = document.createElement("section");
    meta.className = "inspector-block";
    meta.innerHTML = `
      <h3>${connection.label}</h3>
      <div class="inspector-meta">
        <div>Route: ${connection.from_component} -> ${connection.to_component}</div>
        <div>In Flight: ${roundNumber(sumPipeWater(connection), 2)}</div>
      </div>
    `;

    const form = document.createElement("div");
    form.className = "inspector-form";
    form.append(
      buildField({
        label: "Pipe Width",
        value: connection.config.width,
        min: "4",
        max: "40",
        step: "1",
        dataset: {
          targetKind: "pipe",
          targetId: connection.id,
          section: "config",
          key: "width",
        },
      }),
      buildField({
        label: "Pipe Length",
        value: connection.config.length,
        min: "40",
        max: "1000",
        step: "10",
        dataset: {
          targetKind: "pipe",
          targetId: connection.id,
          section: "config",
          key: "length",
        },
      }),
      buildField({
        label: "Max Flow Per Tick",
        value: connection.config.max_flow_per_tick,
        min: "0.1",
        max: "20",
        step: "0.1",
        dataset: {
          targetKind: "pipe",
          targetId: connection.id,
          section: "config",
          key: "max_flow_per_tick",
        },
      }),
      buildField({
        label: "Transit Ticks",
        value: connection.config.transit_ticks,
        min: "1",
        max: "24",
        step: "1",
        dataset: {
          targetKind: "pipe",
          targetId: connection.id,
          section: "config",
          key: "transit_ticks",
        },
      }),
    );

    const advanced = buildAdvancedSection(
      [
        buildField({
          label: "Label",
          value: connection.label,
          type: "text",
          step: null,
          dataset: {
            targetKind: "pipe",
            targetId: connection.id,
            section: "meta",
            key: "label",
          },
        }),
      ],
      `Internal ID: ${connection.id}`,
    );

    refs.inspectorContent.append(meta, form, advanced);
    return;
  }

  if (appState.selection.kind === "leak") {
    const source = findComponent(appState.selection.id);
    const target = leakTargetFor(source);
    if (!source || !target) {
      return;
    }

    const meta = document.createElement("section");
    meta.className = "inspector-block";
    meta.innerHTML = `
      <h3>${source.label} Leak Route</h3>
      <div class="inspector-meta">
        <div>Route: ${source.label} -> ${target.label}</div>
        <div>Leak Rate: ${roundNumber(source.config.leak_rate, 2)}</div>
      </div>
      <p class="inspector-helper">Delete Selection disconnects this leak route. Drag the gold leak port to reconnect it.</p>
    `;

    const form = document.createElement("div");
    form.className = "inspector-form";
    form.append(
      buildField({
        label: "Leak Rate",
        value: source.config.leak_rate,
        min: "0",
        max: "20",
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: source.id,
          section: "config",
          key: "leak_rate",
        },
      }),
    );

    refs.inspectorContent.append(meta, form);
    return;
  }

  const component = findComponent(appState.selection.id);
  if (!component) {
    return;
  }

  const meta = document.createElement("section");
  meta.className = "inspector-block";
  meta.innerHTML = `
    <h3>${component.label}</h3>
    <div class="inspector-meta">
      <div>Type: ${TYPE_LABELS[component.type]}</div>
      <div>${
        component.type === "output_basin"
          ? `Output: ${roundNumber(component.state.current_level, 2)} total`
          : `Water: ${roundNumber(component.state.current_level, 2)} / ${roundNumber(component.config.capacity, 2)}`
      }</div>
    </div>
  `;

  const reservoirOptions = [
    { value: "", label: "No Reservoir Target" },
    ...appState.scene.components
      .filter((item) => item.type === "reservoir")
      .map((item) => ({ value: item.id, label: item.label })),
  ];

  const form = document.createElement("div");
  form.className = "inspector-form";
  if (component.type !== "output_basin") {
    form.append(
      buildField({
        label: "Capacity",
        value: roundNumber(component.config.capacity, 2),
        min: "1",
        max: "1000",
        step: "1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "capacity",
        },
      }),
    );
  }

  form.append(
    buildField({
      label:
        component.type === "output_basin"
          ? "Collected Output"
          : component.type === "source"
            ? "Stored Water"
            : "Current Level",
      value: roundNumber(component.state.current_level, 2),
      min: "0",
      max: component.type === "output_basin" ? "1000000" : String(component.config.capacity),
      step: "0.1",
      dataset: {
        targetKind: "component",
        targetId: component.id,
        section: "state",
        key: "current_level",
      },
    }),
  );

  if (component.type === "source") {
    form.append(
      buildField({
        label: "Emit Rate",
        value: roundNumber(component.config.emit_rate, 2),
        min: "0.1",
        max: "20",
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "emit_rate",
        },
      }),
      buildField({
        label: "Burst Amount",
        value: roundNumber(component.config.burst_amount, 2),
        min: "0.1",
        max: "100",
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "burst_amount",
        },
      }),
    );
  }

  if (component.type === "bucket") {
    form.append(
      buildField({
        label: "Outlet Height",
        value: roundNumber(component.config.outlet_height, 2),
        min: "0",
        max: String(component.config.capacity),
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "outlet_height",
        },
      }),
      buildField({
        label: "Outlet Size",
        value: roundNumber(component.config.outlet_size, 2),
        min: "0.1",
        max: "20",
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "outlet_size",
        },
      }),
    );
  }

  if (component.type === "leaky_bucket") {
    form.append(
      buildField({
        label: "Outlet Height",
        value: roundNumber(component.config.outlet_height, 2),
        min: "0",
        max: String(component.config.capacity),
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "outlet_height",
        },
      }),
      buildField({
        label: "Outlet Size",
        value: roundNumber(component.config.outlet_size, 2),
        min: "0.1",
        max: "20",
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "outlet_size",
        },
      }),
      buildField({
        label: "Leak Rate",
        value: roundNumber(component.config.leak_rate, 2),
        min: "0",
        max: "20",
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "leak_rate",
        },
      }),
      buildField({
        label: "Leak To",
        value: component.config.leak_target_id || "",
        type: "select",
        step: null,
        options: reservoirOptions,
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "leak_target_id",
        },
      }),
    );
  }

  if (component.type === "siphon") {
    form.append(
      buildField({
        label: "Trigger Level",
        value: roundNumber(component.config.trigger_level, 2),
        min: "0",
        max: String(component.config.capacity),
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "trigger_level",
        },
      }),
    );
  }

  if (component.type === "reservoir") {
    form.append(
      buildField({
        label: "Return Rate",
        value: roundNumber(component.config.return_rate, 2),
        min: "0.1",
        max: "20",
        step: "0.1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "return_rate",
        },
      }),
    );
  }

  const interfaceSection = document.createElement("section");
  interfaceSection.className = "inspector-block";
  interfaceSection.innerHTML = `
    <h3>Module Interface</h3>
    <p class="inspector-helper">
      Mark explicit public ports for module export and Builder import. Internal routes stay internal.
    </p>
  `;

  const interfaceForm = document.createElement("div");
  interfaceForm.className = "inspector-form inspector-interface-form";
  let interfaceRowCount = 0;

  if (isInterfaceInputEligible(component)) {
    const existingInputs = interfaceBindingsForPort("input", component.id, "in");
    for (const existingInput of existingInputs) {
      interfaceForm.append(
        buildInterfaceEntryEditor(
          "input",
          existingInput,
          `Internal input port on ${component.label}`,
        ),
      );
    }
    if (existingInputs.length < interfacePortLimit("input")) {
      interfaceForm.append(buildExposeInterfaceAction("input", component, "in"));
    }
    interfaceRowCount += 1;
  }

  if (isInterfaceOutputEligible(component)) {
    const existingOutputs = interfaceBindingsForPort("output", component.id, "out");
    for (const existingOutput of existingOutputs) {
      interfaceForm.append(
        buildInterfaceEntryEditor(
          "output",
          existingOutput,
          `Internal output port on ${component.label}`,
        ),
      );
    }
    if (existingOutputs.length < interfacePortLimit("output")) {
      interfaceForm.append(buildExposeInterfaceAction("output", component, "out"));
    }
    interfaceRowCount += 1;
  }

  if (!interfaceRowCount) {
    const empty = document.createElement("p");
    empty.className = "inspector-helper";
    empty.textContent =
      component.type === "source" || component.type === "output_basin"
        ? "This harness component is not exported directly in v1. Use Auto Interface to expose the adjacent internal boundary instead."
        : "This component is not eligible as a public module boundary port in export v1.";
    interfaceSection.append(empty);
  } else {
    interfaceSection.append(interfaceForm);
  }

  const advanced = buildAdvancedSection(
    [
      buildField({
        label: "Label",
        value: component.label,
        type: "text",
        step: null,
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "meta",
          key: "label",
        },
      }),
      buildField({
        label: "Position X",
        value: component.position.x,
        min: "0",
        max: "2200",
        step: "1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "position",
          key: "x",
        },
      }),
      buildField({
        label: "Position Y",
        value: component.position.y,
        min: "0",
        max: "2200",
        step: "1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "position",
          key: "y",
        },
      }),
      buildField({
        label: "Width",
        value: component.config.width,
        min: "8",
        max: "36",
        step: "1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "width",
        },
      }),
      buildField({
        label: "Height",
        value: component.config.height,
        min: "10",
        max: "42",
        step: "1",
        dataset: {
          targetKind: "component",
          targetId: component.id,
          section: "config",
          key: "height",
        },
      }),
    ],
    `Internal ID: ${component.id}`,
  );

  refs.inspectorContent.append(meta, form, interfaceSection, advanced);
}

function selectionMatches(kind, id) {
  return appState.selection?.kind === kind && appState.selection?.id === id;
}

function buildInterfaceBadge(direction, entry, point, component, index = 0) {
  const badge = document.createElement("div");
  badge.className = `interface-port-badge is-${direction}`;
  const isSelectedComponent = selectionMatches("component", component.id);
  if (isSelectedComponent) {
    badge.classList.add("is-emphasized");
  }
  badge.style.left = `${point.x - component.position.x + (direction === "input" ? 18 : -96)}px`;
  badge.style.top = `${point.y - component.position.y - 14 + index * 18}px`;
  badge.innerHTML = `
    <span class="interface-port-badge-dir">${direction === "input" ? "IN" : "OUT"}</span>
    <span class="interface-port-badge-name">${entry.name}</span>
  `;
  return badge;
}

function componentCard(component) {
  const card = document.createElement("article");
  const size = componentSize(component);
  const ratio = waterRatio(component);
  const hasMarker = isTankLike(component);
  const chips = componentChips(component);
  const outletOffset =
    isTankLike(component) && component.config.capacity > 0
      ? 100 - (tankThresholdLevel(component) / component.config.capacity) * 100
      : 50;

  card.className = "component-card";
  card.dataset.componentId = component.id;
  card.dataset.type = component.type;
  if (selectionMatches("component", component.id)) {
    card.classList.add("is-selected");
  }
  card.style.left = `${component.position.x}px`;
  card.style.top = `${component.position.y}px`;
  card.style.width = `${size.width}px`;
  card.style.height = `${size.height}px`;

  const head = document.createElement("div");
  head.className = "component-head";
  head.innerHTML = `
    <div class="component-head-main">
      <div class="component-symbol-badge" aria-hidden="true">${componentSymbolMarkup(component.type)}</div>
      <div class="component-head-text">
        <div class="component-name">${component.label}</div>
        <div class="component-type-badge">${TYPE_LABELS[component.type]}</div>
      </div>
    </div>
    <div class="component-level-badge">${roundNumber(component.state.current_level, 1)}</div>
  `;

  const core = document.createElement("div");
  core.className = "component-core";
  for (const chip of chips) {
    const chipEl = document.createElement("div");
    chipEl.className = "component-chip";
    chipEl.textContent = chip;
    core.append(chipEl);
  }

  const tank = document.createElement("div");
  tank.className = "tank-shell";
  if (component.type === "output_basin" || component.type === "reservoir") {
    tank.classList.add("is-basin");
  }
  if (component.type === "output_basin") {
    tank.classList.add("is-output-outlet");
  }
  if (component.type === "source") {
    tank.classList.add("is-source");
  }
  if (hasMarker) {
    tank.classList.add("has-marker");
    tank.style.setProperty("--marker-offset", `${outletOffset}%`);
    if (
      component.state.is_triggered ||
      ratio * component.config.capacity >= tankThresholdLevel(component)
    ) {
      tank.classList.add("is-primed");
    }
  }
  tank.style.height = `${Math.max(44, size.height - 84)}px`;

  const fill = document.createElement("div");
  fill.className = "water-fill";
  fill.style.height = `${ratio * 100}%`;
  tank.append(fill);

  const fillBadge = document.createElement("div");
  fillBadge.className = "tank-water-badge";
  fillBadge.textContent =
    component.type === "output_basin"
      ? `${roundNumber(component.state.current_level, 1)}`
      : `${roundNumber(ratio * 100, 0)}%`;
  tank.append(fillBadge);

  if (component.type === "source") {
    const sourceEmitter = document.createElement("div");
    sourceEmitter.className = "source-emitter";
    if (component.state.current_level > EPSILON) {
      sourceEmitter.classList.add("is-charged");
    }
    sourceEmitter.innerHTML = `
      <span class="source-emitter-ring" aria-hidden="true"></span>
      <span class="source-emitter-body" aria-hidden="true">${componentSymbolMarkup("source")}</span>
      <span class="source-emitter-nozzle" aria-hidden="true"></span>
      <span class="source-charge-readout">${roundNumber(component.state.current_level, 1)}</span>
    `;
    tank.append(sourceEmitter);
  }

  if (component.type === "output_basin") {
    const outletBody = document.createElement("div");
    outletBody.className = "outlet-body";
    tank.append(outletBody);

    const outletMouth = document.createElement("div");
    outletMouth.className = "outlet-mouth";
    tank.append(outletMouth);

    const outletSymbol = document.createElement("div");
    outletSymbol.className = "outlet-symbol";
    outletSymbol.innerHTML = componentSymbolMarkup("output_basin");
    tank.append(outletSymbol);

    const outletReadout = document.createElement("div");
    outletReadout.className = "outlet-total-readout";
    outletReadout.textContent = roundNumber(component.state.current_level, 1);
    tank.append(outletReadout);
  }

  if (hasMarker) {
    const markerLabel = document.createElement("div");
    markerLabel.className = "tank-marker-label";
    markerLabel.style.top = `calc(${outletOffset}% - 10px)`;
    markerLabel.innerHTML = `
      <span class="tank-marker-symbol" aria-hidden="true">${markerSymbolMarkup(component)}</span>
      <span class="tank-marker-text">${
        component.type === "siphon"
          ? `trig ${roundNumber(component.config.trigger_level, 1)}`
          : `out ${roundNumber(component.config.outlet_height, 1)}`
      }</span>
    `;
    tank.append(markerLabel);
  }

  const foot = document.createElement("div");
  foot.className = "component-foot";
  foot.innerHTML = `
    <span class="component-foot-note">${componentStatusText(component)}</span>
    <span class="component-foot-note is-strong">${
      component.type === "output_basin"
        ? `total ${roundNumber(component.state.current_level, 1)}`
        : `cap ${roundNumber(component.config.capacity, 1)}`
    }</span>
  `;

  card.append(head, core, tank, foot);

  if (canReceivePipe(component)) {
    const inputPort = document.createElement("span");
    inputPort.className = "port-pin";
    inputPort.dataset.portKind = "input";
    inputPort.dataset.componentId = component.id;
    inputPort.dataset.portId = "in";
    const inputPoint = getPortPosition(component, "in");
    inputPort.style.left = `${inputPoint.x - component.position.x - 11}px`;
    inputPort.style.top = `${inputPoint.y - component.position.y - 11}px`;
    if (appState.pipeDraft) {
      const draftSource = findComponent(appState.pipeDraft.fromComponentId);
      if (isValidDraftRoute(draftSource, component, appState.pipeDraft.mode)) {
        inputPort.classList.add("is-targetable");
        if (appState.pipeDraft.hoverTargetId === component.id) {
          inputPort.classList.add("is-link-valid");
        }
      }
    }
    card.append(inputPort);
  }

  if (component.type === "source" || isTankLike(component) || component.type === "reservoir") {
    const outputPort = document.createElement("span");
    outputPort.className = "port-pin is-output";
    outputPort.dataset.portKind = "output";
    outputPort.dataset.componentId = component.id;
    outputPort.dataset.portId = "out";
    const outputPoint = getPortPosition(component, "out");
    outputPort.style.left = `${outputPoint.x - component.position.x - 11}px`;
    outputPort.style.top = `${outputPoint.y - component.position.y - 11}px`;
    if (appState.pipeDraft?.fromComponentId === component.id) {
      outputPort.classList.add("is-drafting");
    }
    card.append(outputPort);
  }

  if (component.type === "leaky_bucket") {
    const leakPort = document.createElement("span");
    leakPort.className = "port-pin is-leak";
    leakPort.dataset.portKind = "leak";
    leakPort.dataset.componentId = component.id;
    leakPort.dataset.portId = "leak";
    const leakPoint = getPortPosition(component, "leak");
    leakPort.style.left = `${leakPoint.x - component.position.x - 11}px`;
    leakPort.style.top = `${leakPoint.y - component.position.y - 11}px`;
    if (component.config.leak_target_id) {
      leakPort.classList.add("is-connected");
    }
    card.append(leakPort);
  }

  if (isBuildMode()) {
    const inputInterfaces = interfaceBindingsForPort("input", component.id, "in");
    for (const [index, inputInterface] of inputInterfaces.entries()) {
      card.append(
        buildInterfaceBadge(
          "input",
          inputInterface,
          getPortPosition(component, "in"),
          component,
          index,
        ),
      );
    }

    const outputInterfaces = interfaceBindingsForPort("output", component.id, "out");
    for (const [index, outputInterface] of outputInterfaces.entries()) {
      card.append(
        buildInterfaceBadge(
          "output",
          outputInterface,
          getPortPosition(component, "out"),
          component,
          index,
        ),
      );
    }
  }

  return card;
}

function renderComponents() {
  refs.componentLayer.replaceChildren();
  for (const component of appState.scene.components) {
    refs.componentLayer.append(componentCard(component));
  }
}

function lineLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function formatPipeMeta(connection, pressurePercent) {
  return `w${roundNumber(connection.config.width, 1)} · l${roundNumber(
    connection.config.length,
    0,
  )} · f${roundNumber(connection.config.max_flow_per_tick, 1)} · t${roundNumber(
    connection.config.transit_ticks,
    0,
  )} · p${roundNumber(pressurePercent, 0)}%`;
}

function pointAlongLine(a, b, progress) {
  return {
    x: a.x + (b.x - a.x) * progress,
    y: a.y + (b.y - a.y) * progress,
  };
}

function leakRoutePath(from, to) {
  const control = {
    x: (from.x + to.x) * 0.5,
    y: Math.max(from.y, to.y) + Math.max(38, Math.abs(from.x - to.x) * 0.18),
  };
  return {
    d: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`,
    mid: {
      x: 0.25 * from.x + 0.5 * control.x + 0.25 * to.x,
      y: 0.25 * from.y + 0.5 * control.y + 0.25 * to.y,
    },
  };
}

function componentChips(component) {
  if (component.type === "source") {
    return [
      `emit ${roundNumber(component.config.emit_rate, 1)}`,
      `burst ${roundNumber(component.config.burst_amount, 1)}`,
    ];
  }

  if (component.type === "bucket") {
    return [`out ${roundNumber(component.config.outlet_height, 1)} / ${roundNumber(component.config.outlet_size, 1)}`];
  }

  if (component.type === "leaky_bucket") {
    return [
      `out ${roundNumber(component.config.outlet_height, 1)} / ${roundNumber(component.config.outlet_size, 1)}`,
      `leak ${roundNumber(component.config.leak_rate, 1)}`,
    ];
  }

  if (component.type === "siphon") {
    return [
      `trig ${roundNumber(component.config.trigger_level, 1)}`,
      component.state.is_triggered ? "dumping" : "arms at trigger",
    ];
  }

  if (component.type === "output_basin") {
    return ["terminal output"];
  }

  return [`return ${roundNumber(component.config.return_rate, 1)}`];
}

function componentStatusText(component) {
  if (component.type === "source") {
    return component.state.current_level > EPSILON ? "charged" : "ready for burst";
  }

  if (component.type === "bucket") {
    return component.state.current_level >= component.config.outlet_height
      ? "above outlet"
      : "holding below outlet";
  }

  if (component.type === "leaky_bucket") {
    if (component.state.current_level <= EPSILON) {
      return "drained";
    }
    return component.config.leak_target_id ? "leaking while holding" : "holding";
  }

  if (component.type === "siphon") {
    return component.state.is_triggered ? "dumping" : "arming";
  }

  if (component.type === "output_basin") {
    return component.state.current_level > EPSILON ? "terminal outlet collecting output" : "terminal outlet";
  }

  if (component.state.current_level > EPSILON) {
    return outgoingPipes(component.id).length ? "stored for return" : "stored reserve";
  }
  return outgoingPipes(component.id).length ? "return reservoir" : "storage reservoir";
}

function pipeStatusText(connection) {
  const from = findComponent(connection.from_component);
  const to = findComponent(connection.to_component);
  const fillRatio = pipeFillRatio(connection);
  if (fillRatio >= 0.95) {
    return "pressured";
  }
  if (sumPipeWater(connection) > EPSILON) {
    return `moving ${from?.label || "source"} to ${to?.label || "target"}`;
  }
  return `route ${from?.label || "source"} to ${to?.label || "target"}`;
}

function renderWaterSelectionStrip() {
  refs.waterSelectionStrip.replaceChildren();

  if (!isWaterMode() || !appState.selection?.id) {
    refs.waterSelectionStrip.hidden = true;
    return;
  }

  let title = "Selection";
  let typeLabel = "";
  let amountLabel = "";
  let statusText = "";

  if (appState.selection.kind === "component") {
    const component = findComponent(appState.selection.id);
    if (!component) {
      refs.waterSelectionStrip.hidden = true;
      return;
    }
    title = component.label;
    typeLabel = component.type === "source" ? "Emitter" : TYPE_LABELS[component.type];
    amountLabel =
      component.type === "source"
        ? `charge ${roundNumber(component.state.current_level, 2)}`
        : component.type === "output_basin"
        ? `${roundNumber(component.state.current_level, 2)} total`
        : `${roundNumber(component.state.current_level, 2)} / ${roundNumber(component.config.capacity, 2)}`;
    if (component.type === "source") {
      statusText =
        component.state.current_level > EPSILON
          ? "Pulse emitter holding charge for the local circuit."
          : "Pulse emitter ready for a new burst.";
    } else if (component.type === "reservoir") {
      statusText = `${componentStatusText(component)}. Active storage inside the circuit.`;
    } else if (component.type === "output_basin") {
      statusText = `${componentStatusText(component)}. Water only leaves the local circuit here.`;
    } else {
      statusText = componentStatusText(component);
    }
  } else if (appState.selection.kind === "pipe") {
    const connection = findConnection(appState.selection.id);
    if (!connection) {
      refs.waterSelectionStrip.hidden = true;
      return;
    }
    title = connection.label;
    typeLabel = "Pipe";
    amountLabel = `${roundNumber(sumPipeWater(connection), 2)} / ${roundNumber(pipeTotalCapacity(connection), 2)}`;
    statusText = pipeStatusText(connection);
  } else if (appState.selection.kind === "leak") {
    const source = findComponent(appState.selection.id);
    const target = leakTargetFor(source);
    if (!source || !target) {
      refs.waterSelectionStrip.hidden = true;
      return;
    }
    title = `${source.label} leak`;
    typeLabel = "Leak Route";
    amountLabel = `${roundNumber(source.config.leak_rate, 2)} / tick`;
    statusText = `Leak route from ${source.label} to ${target.label}.`;
  } else {
    refs.waterSelectionStrip.hidden = true;
    return;
  }

  const strip = document.createElement("div");
  strip.className = "water-selection-card";
  strip.innerHTML = `
    <div class="water-selection-main">
      <p class="water-selection-title">${title}</p>
      <p class="water-selection-meta">${typeLabel} · ${amountLabel}</p>
      <p class="water-selection-status">${statusText}</p>
    </div>
    <button class="action-button water-selection-button" data-open-build="true">Open in Build</button>
  `;
  refs.waterSelectionStrip.append(strip);
  refs.waterSelectionStrip.hidden = false;
}

function renderViewMode() {
  refs.appShell.classList.toggle("view-mode-water", isWaterMode());
  refs.appShell.classList.toggle("view-mode-build", isBuildMode());
  refs.waterModeButton.classList.toggle("is-active", isWaterMode());
  refs.buildModeButton.classList.toggle("is-active", isBuildMode());
  refs.sceneTitleInput.readOnly = isWaterMode();
  refs.stepButton.hidden = isWaterMode();
  refs.zonesButton.hidden = isWaterMode();
  refs.sceneSummary.hidden = isWaterMode();
  refs.selectionMeta.hidden = isWaterMode();
  refs.autoInterfaceButton.hidden = isWaterMode();
  refs.storyToggleButton.hidden = isBuildMode();
  refs.storyToggleButton.textContent = appState.storyExpanded ? "Hide Story" : "Show Story";
  refs.labLogTitle.textContent = isWaterMode() ? "Story" : "Recent Burst Flow";
  refs.labLogPanel.classList.toggle("is-collapsed", isWaterMode() && !appState.storyExpanded);
  renderWaterSelectionStrip();
}

function renderPipes() {
  refs.pipeLayer.replaceChildren();

  for (const component of appState.scene.components) {
    if (component.type !== "leaky_bucket") {
      continue;
    }

    const target = leakTargetFor(component);
    if (!target) {
      continue;
    }

    const from = getPortPosition(component, "leak");
    const to = getPortPosition(target, "in");
    const leakRoute = leakRoutePath(from, to);
    const leakLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leakLine.setAttribute("d", leakRoute.d);
    leakLine.setAttribute("fill", "none");
    leakLine.setAttribute("stroke-width", clamp(4 + Number(component.config.leak_rate || 0) * 2.5, 4, 12));
    leakLine.classList.add("leak-route-line");
    leakLine.dataset.leakSourceId = component.id;
    if (componentCanLeak(component)) {
      leakLine.classList.add("is-active");
    }
    if (
      selectionMatches("leak", component.id) ||
      selectionMatches("component", component.id) ||
      selectionMatches("component", target.id)
    ) {
      leakLine.classList.add("is-selected");
    }
    refs.pipeLayer.append(leakLine);

    const leakHit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leakHit.setAttribute("d", leakRoute.d);
    leakHit.setAttribute("fill", "none");
    leakHit.setAttribute("stroke-width", clamp(18 + Number(component.config.leak_rate || 0) * 2, 18, 28));
    leakHit.classList.add("leak-route-hit");
    leakHit.dataset.leakSourceId = component.id;
    refs.pipeLayer.append(leakHit);

    const leakTag = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    leakTag.setAttribute("x", leakRoute.mid.x - 42);
    leakTag.setAttribute("y", leakRoute.mid.y - 14);
    leakTag.setAttribute("width", 84);
    leakTag.setAttribute("height", 22);
    leakTag.setAttribute("rx", 8);
    leakTag.setAttribute("ry", 8);
    leakTag.classList.add("leak-route-tag");
    leakTag.dataset.leakSourceId = component.id;
    if (selectionMatches("leak", component.id)) {
      leakTag.classList.add("is-selected");
    }
    refs.pipeLayer.append(leakTag);

    const leakText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    leakText.setAttribute("x", leakRoute.mid.x);
    leakText.setAttribute("y", leakRoute.mid.y + 1);
    leakText.setAttribute("text-anchor", "middle");
    leakText.classList.add("leak-route-text");
    leakText.dataset.leakSourceId = component.id;
    if (selectionMatches("leak", component.id)) {
      leakText.classList.add("is-selected");
    }
    leakText.textContent = `leak ${roundNumber(component.config.leak_rate, 2)}`;
    refs.pipeLayer.append(leakText);
  }

  for (const connection of appState.scene.connections) {
    const fromComponent = findComponent(connection.from_component);
    const toComponent = findComponent(connection.to_component);
    if (!fromComponent || !toComponent) {
      continue;
    }

    const from = getPortPosition(fromComponent, connection.from_port);
    const to = getPortPosition(toComponent, connection.to_port);
    const mid = pointAlongLine(from, to, 0.5);
    const strokeWidth = clamp(connection.config.width, 4, 40);
    const segmentCapacity = pipeSegmentCapacity(connection);
    const segmentSpan = 1 / Math.max(1, connection.state.segments.length);
    const fillRatio = pipeFillRatio(connection);
    const pressurePercent = clamp(fillRatio * 100, 0, 140);

    const sleeve = document.createElementNS("http://www.w3.org/2000/svg", "line");
    sleeve.setAttribute("x1", from.x);
    sleeve.setAttribute("y1", from.y);
    sleeve.setAttribute("x2", to.x);
    sleeve.setAttribute("y2", to.y);
    sleeve.setAttribute("stroke-width", clamp(strokeWidth + 6, 10, 52));
    sleeve.classList.add("pipe-sleeve");
    sleeve.dataset.pipeId = connection.id;
    if (fillRatio >= 0.95) {
      sleeve.classList.add("is-pressured");
    }
    if (selectionMatches("pipe", connection.id)) {
      sleeve.classList.add("is-selected");
    }
    refs.pipeLayer.append(sleeve);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "line");
    path.setAttribute("x1", from.x);
    path.setAttribute("y1", from.y);
    path.setAttribute("x2", to.x);
    path.setAttribute("y2", to.y);
    path.setAttribute("stroke-width", strokeWidth);
    path.classList.add("pipe-line");
    path.dataset.pipeId = connection.id;
    if (selectionMatches("pipe", connection.id)) {
      path.classList.add("is-selected");
    }
    if (fillRatio >= 0.95) {
      path.classList.add("is-pressured");
    }
    refs.pipeLayer.append(path);

    connection.state.segments.forEach((amount, index) => {
      if (amount <= 0) {
        return;
      }

      const occupancy = segmentCapacity > 0 ? clamp(amount / segmentCapacity, 0, 1.2) : 0;
      const segmentStart = index * segmentSpan;
      const segmentEnd = Math.min(1, segmentStart + segmentSpan * Math.min(occupancy, 1));
      const startPoint = pointAlongLine(from, to, segmentStart);
      const endPoint = pointAlongLine(from, to, segmentEnd);
      const fillLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      fillLine.setAttribute("x1", startPoint.x);
      fillLine.setAttribute("y1", startPoint.y);
      fillLine.setAttribute("x2", endPoint.x);
      fillLine.setAttribute("y2", endPoint.y);
      fillLine.setAttribute("stroke-width", Math.max(4, strokeWidth * 0.56));
      fillLine.classList.add("pipe-flow-line");
      fillLine.dataset.pipeId = connection.id;
      if (occupancy >= 0.98) {
        fillLine.classList.add("is-full");
      }
      refs.pipeLayer.append(fillLine);

      const capPoint = endPoint;
      const droplet = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      droplet.setAttribute("cx", capPoint.x);
      droplet.setAttribute("cy", capPoint.y);
      droplet.setAttribute("r", Math.max(3.5, strokeWidth * 0.22));
      droplet.classList.add("pipe-droplet");
      droplet.dataset.pipeId = connection.id;
      refs.pipeLayer.append(droplet);
    });

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hit.setAttribute("x1", from.x);
    hit.setAttribute("y1", from.y);
    hit.setAttribute("x2", to.x);
    hit.setAttribute("y2", to.y);
    hit.setAttribute("stroke-width", Math.max(strokeWidth + 14, 20));
    hit.classList.add("pipe-hit");
    hit.dataset.pipeId = connection.id;
    refs.pipeLayer.append(hit);

    const tagWidth = 218;
    const tag = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    tag.setAttribute("x", mid.x - tagWidth / 2);
    tag.setAttribute("y", mid.y - 20);
    tag.setAttribute("width", tagWidth);
    tag.setAttribute("height", 38);
    tag.setAttribute("rx", 9);
    tag.setAttribute("ry", 9);
    tag.classList.add("pipe-tag");
    tag.dataset.pipeId = connection.id;
    if (fillRatio >= 0.95) {
      tag.classList.add("is-pressured");
    }
    if (selectionMatches("pipe", connection.id)) {
      tag.classList.add("is-selected");
    }
    refs.pipeLayer.append(tag);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", mid.x);
    text.setAttribute("y", mid.y - 1);
    text.setAttribute("text-anchor", "middle");
    text.classList.add("pipe-tag-text");
    text.dataset.pipeId = connection.id;
    if (fillRatio >= 0.95) {
      text.classList.add("is-pressured");
    }
    if (selectionMatches("pipe", connection.id)) {
      text.classList.add("is-selected");
    }
    text.textContent = `${roundNumber(sumPipeWater(connection), 2)} / ${roundNumber(pipeTotalCapacity(connection), 2)} in pipe`;
    refs.pipeLayer.append(text);

    const meta = document.createElementNS("http://www.w3.org/2000/svg", "text");
    meta.setAttribute("x", mid.x);
    meta.setAttribute("y", mid.y + 12);
    meta.setAttribute("text-anchor", "middle");
    meta.classList.add("pipe-tag-meta");
    meta.dataset.pipeId = connection.id;
    if (fillRatio >= 0.95) {
      meta.classList.add("is-pressured");
    }
    if (selectionMatches("pipe", connection.id)) {
      meta.classList.add("is-selected");
    }
    meta.textContent = formatPipeMeta(connection, pressurePercent);
    refs.pipeLayer.append(meta);
  }

  if (appState.pipeDraft) {
    const fromComponent = findComponent(appState.pipeDraft.fromComponentId);
    if (!fromComponent) {
      return;
    }
    const from = getPortPosition(fromComponent, appState.pipeDraft.fromPort);
    const to = appState.pipeDraft.pointer;
    const preview =
      appState.pipeDraft.mode === "leak"
        ? document.createElementNS("http://www.w3.org/2000/svg", "path")
        : document.createElementNS("http://www.w3.org/2000/svg", "line");
    if (appState.pipeDraft.mode === "leak") {
      preview.setAttribute("d", leakRoutePath(from, to).d);
      preview.setAttribute("fill", "none");
      preview.setAttribute("stroke-width", clamp(4 + Number(findComponent(appState.pipeDraft.fromComponentId)?.config?.leak_rate || 0) * 2.5, 4, 12));
      preview.classList.add("leak-preview-line");
    } else {
      preview.setAttribute("x1", from.x);
      preview.setAttribute("y1", from.y);
      preview.setAttribute("x2", to.x);
      preview.setAttribute("y2", to.y);
      preview.setAttribute("stroke-width", Math.max(4, Number(refs.pipeWidthInput.value || 12) * 0.72));
      preview.classList.add("pipe-preview-line");
    }
    if (appState.pipeDraft.hoverTargetId) {
      preview.classList.add("is-valid");
    }
    refs.pipeLayer.append(preview);
  }
}

function renderObjectList() {
  refs.objectList.replaceChildren();

  for (const component of appState.scene.components) {
    const button = document.createElement("button");
    button.className = "object-row";
    if (selectionMatches("component", component.id)) {
      button.classList.add("is-selected");
    }
    button.dataset.selectKind = "component";
    button.dataset.selectId = component.id;
    button.innerHTML = `
      <span>${component.label}<br /><small>${TYPE_LABELS[component.type]}</small></span>
      <small>${roundNumber(component.state.current_level, 1)}</small>
    `;
    refs.objectList.append(button);
  }

  for (const connection of appState.scene.connections) {
    const button = document.createElement("button");
    button.className = "object-row";
    if (selectionMatches("pipe", connection.id)) {
      button.classList.add("is-selected");
    }
    button.dataset.selectKind = "pipe";
    button.dataset.selectId = connection.id;
    button.innerHTML = `
      <span>${connection.label}<br /><small>Pipe</small></span>
      <small>${roundNumber(sumPipeWater(connection), 2)}</small>
    `;
    refs.objectList.append(button);
  }
}

function renderBuilderOptions() {
  const selectedFrom = refs.pipeFromSelect.value;
  const selectedTo = refs.pipeToSelect.value;
  refs.pipeFromSelect.replaceChildren();
  refs.pipeToSelect.replaceChildren();
  const fromCandidates = appState.scene.components.filter(canStartPipe);

  for (const component of fromCandidates) {
    const fromOption = document.createElement("option");
    fromOption.value = component.id;
    fromOption.textContent = `${component.label} (${TYPE_LABELS[component.type]})`;
    refs.pipeFromSelect.append(fromOption);
  }

  const nextFrom = fromCandidates.some((component) => component.id === selectedFrom)
    ? selectedFrom
    : fromCandidates[0]?.id || "";
  if (nextFrom) {
    refs.pipeFromSelect.value = nextFrom;
  }

  const fromComponent = findComponent(nextFrom);
  const toCandidates = appState.scene.components.filter((component) =>
    isValidPipeRoute(fromComponent, component),
  );

  for (const component of toCandidates) {
    const toOption = document.createElement("option");
    toOption.value = component.id;
    toOption.textContent = `${component.label} (${TYPE_LABELS[component.type]})`;
    refs.pipeToSelect.append(toOption);
  }

  const nextTo = toCandidates.some((component) => component.id === selectedTo)
    ? selectedTo
    : toCandidates[0]?.id || "";
  if (nextTo) {
    refs.pipeToSelect.value = nextTo;
  }

  refs.pipeBuilderSubmit.disabled = !nextFrom || !nextTo;
  if (!fromCandidates.length) {
    refs.pipeBuilderNote.textContent = "Add a source, vessel, or reservoir before building a pipe.";
  } else if (!toCandidates.length) {
    refs.pipeBuilderNote.textContent = "This object has no valid targets left. Duplicate routes are blocked.";
  } else {
    refs.pipeBuilderNote.textContent =
      "Drag from an orange output port, or from the gold leak port on a leaky bucket. Reservoirs can now return through normal pipes. Leak ports still only connect to reservoirs.";
  }
}

function renderLabLog() {
  refs.labLogList.replaceChildren();

  if (!appState.logEntries.length) {
    const empty = document.createElement("p");
    empty.className = "lab-log-empty";
    empty.textContent = "No burst events yet.";
    refs.labLogList.append(empty);
    return;
  }

  const blocks = [];
  let activeBurstBlock = null;

  for (const entry of appState.logEntries) {
    if (!entry.burst_id) {
      activeBurstBlock = null;
      blocks.push({
        type: "system",
        entries: [entry],
      });
      continue;
    }

    if (!activeBurstBlock || activeBurstBlock.burstId !== entry.burst_id) {
      activeBurstBlock = {
        type: "burst",
        burstId: entry.burst_id,
        entries: [],
      };
      blocks.push(activeBurstBlock);
    }

    activeBurstBlock.entries.push(entry);
  }

  for (const block of [...blocks].reverse()) {
    if (block.type === "system") {
      const [entry] = block.entries;
      const row = document.createElement("article");
      row.className = "lab-log-row is-system";
      row.innerHTML = `
        <div class="lab-log-tick">t${entry.tick}</div>
        <div class="lab-log-main">
          <div class="lab-log-kind">${entry.kind.replaceAll("_", " ")}</div>
          <div class="lab-log-message">${entry.message}</div>
        </div>
      `;
      refs.labLogList.append(row);
      continue;
    }

    const section = document.createElement("section");
    section.className = "lab-log-block";

    const summaryEntry =
      [...block.entries].reverse().find(
        (entry) => entry.kind === "burst_settled" || entry.kind === "burst_blocked",
      ) || null;
    const firstTick = block.entries[0]?.tick ?? 0;
    const lastTick = block.entries[block.entries.length - 1]?.tick ?? firstTick;
    const burstNumber = block.burstId.replace("burst-", "");

    const head = document.createElement("header");
    head.className = "lab-log-block-head";
    head.innerHTML = `
      <div>
        <p class="lab-log-block-title">Burst ${burstNumber}</p>
        <p class="lab-log-block-range">t${firstTick} to t${lastTick}</p>
      </div>
      <p class="lab-log-block-status">${summaryEntry ? (summaryEntry.kind === "burst_blocked" ? "blocked" : "settled") : "running"}</p>
    `;
    section.append(head);

    if (summaryEntry) {
      const summary = document.createElement("article");
      summary.className = "lab-log-row is-summary";
      summary.innerHTML = `
        <div class="lab-log-tick">t${summaryEntry.tick}</div>
        <div class="lab-log-main">
          <div class="lab-log-kind">${summaryEntry.kind.replaceAll("_", " ")}</div>
          <div class="lab-log-message">${summaryEntry.message}</div>
        </div>
      `;
      section.append(summary);
    }

    const rows = document.createElement("div");
    rows.className = "lab-log-block-rows";
    for (const entry of block.entries) {
      if (entry.kind === "burst_settled" || entry.kind === "burst_blocked") {
        continue;
      }
      const row = document.createElement("article");
      row.className = "lab-log-row";
      row.innerHTML = `
        <div class="lab-log-tick">t${entry.tick}</div>
        <div class="lab-log-main">
          <div class="lab-log-kind">${entry.kind.replaceAll("_", " ")}</div>
          <div class="lab-log-message">${entry.message}</div>
        </div>
      `;
      rows.append(row);
    }
    section.append(rows);
    refs.labLogList.append(section);
  }
}

function renderStatus() {
  const accounting = getAccounting(appState.scene);
  const burstSource = burstTargetSource();
  refs.sceneTitleInput.value = appState.scene.title;
  refs.sceneMeta.textContent = `${appState.scene.scene_id} / format v${appState.scene.format_version}`;
  refs.lastBurstValue.textContent = roundNumber(appState.burstSession.last_burst_amount || 0, 2);
  refs.inCircuitValue.textContent = roundNumber(accounting.in_circuit, 2);
  refs.outValue.textContent = roundNumber(accounting.out, 2);
  refs.reservoirValue.textContent = roundNumber(accounting.reservoir, 2);
  refs.accountedValue.textContent = roundNumber(accounting.accounted, 2);
  refs.tickValue.textContent = String(appState.scene.runtime.tick);
  refs.systemStateValue.textContent = systemStateLabel();
  refs.tickSpeedInput.value = String(appState.scene.view.tick_ms);
  refs.tickSpeedReadout.textContent = `${appState.scene.view.tick_ms} ms`;
  refs.sceneSummary.textContent = `${appState.scene.components.length} components / ${appState.scene.connections.length} pipes / ${appState.scene.module_interface_draft.inputs.length} public inputs / ${appState.scene.module_interface_draft.outputs.length} public outputs / ${appState.playing ? "running" : "paused"}`;
  refs.selectionMeta.textContent = `Selection: ${getSelectionLabel()}`;
  refs.burstButton.disabled = !burstSource;
  refs.burstButton.textContent = burstSource ? `Burst ${burstSource.label}` : "Burst";
  refs.zonesButton.textContent = appState.showConnectionZones ? "Hide Zones" : "Show Zones";
  refs.zonesButton.classList.toggle("is-active", appState.showConnectionZones);
  refs.canvasSurface.classList.toggle("show-zones", appState.showConnectionZones);
}

function render() {
  renderBuilderOptions();
  renderObjectList();
  renderComponents();
  renderPipes();
  renderInspector();
  renderLabLog();
  renderStatus();
  renderViewMode();
}

function setSelection(kind, id) {
  appState.selection = { kind, id };
  render();
}

function handleInspectorInput(event) {
  if (guardBuildMode("edit component parameters")) {
    return;
  }
  const input = event.target;
  const { targetKind, targetId, section, key } = input.dataset;
  if (!targetKind || !targetId || !section || !key) {
    return;
  }

  stopPlayback();
  if (targetKind === "interface") {
    const direction = input.dataset.direction === "output" ? "output" : "input";
    const entry = interfaceDraftEntries(direction).find((item) => item.id === targetId);
    if (!entry) {
      return;
    }
    if (section === "interface" && key === "name") {
      entry.name = String(input.value || "").trim().slice(0, 64) || entry.name;
      captureBaseline("Public interface updated.");
      render();
    }
    return;
  }

  if (targetKind === "component") {
    const component = findComponent(targetId);
    if (!component) {
      return;
    }
    updateComponentField(component, section, key, input.value);
    refreshSceneRuntime(appState.scene);
    captureBaseline("Component updated.");
    render();
    return;
  }

  const connection = findConnection(targetId);
  if (!connection) {
    return;
  }
  if (section === "meta" && key === "label") {
    connection.label = String(input.value || "").slice(0, 64) || "Pipe";
  } else {
    updateConnectionField(connection, key, input.value);
  }
  refreshSceneRuntime(appState.scene);
  captureBaseline("Pipe updated.");
  render();
}

function handleInspectorClick(event) {
  const button = event.target.closest("[data-interface-action]");
  if (!button) {
    return;
  }
  if (guardBuildMode("edit public interface ports")) {
    return;
  }

  const direction = button.dataset.direction === "output" ? "output" : "input";
  stopPlayback();

  if (button.dataset.interfaceAction === "remove") {
    removeInterfacePort(direction, button.dataset.interfaceId);
    captureBaseline("Public interface updated.");
    render();
    return;
  }

  if (button.dataset.interfaceAction === "expose") {
    try {
      const binding = exposeInterfacePort(direction, button.dataset.componentId, button.dataset.portId);
      if (!binding) {
        pushSystemMessage("That port cannot be exposed in export v1.", "danger");
        render();
        return;
      }
      captureBaseline("Public interface updated.");
      render();
    } catch (error) {
      pushSystemMessage(error.message, "danger");
      render();
      return;
    }
  }
}

function pipeDraftTargetAtEvent(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const port = element?.closest(".port-pin[data-port-kind='input']");
  if (!port || !appState.pipeDraft) {
    return null;
  }
  const target = findComponent(port.dataset.componentId);
  const source = findComponent(appState.pipeDraft.fromComponentId);
  return isValidDraftRoute(source, target, appState.pipeDraft.mode) ? target : null;
}

function portInfoFromElement(element) {
  const port = element?.closest(".port-pin");
  if (!port) {
    return null;
  }
  const portKind =
    port.dataset.portKind ||
    (port.classList.contains("is-leak")
      ? "leak"
      : port.classList.contains("is-output")
        ? "output"
        : "input");
  return {
    componentId: port.dataset.componentId,
    portId:
      port.dataset.portId ||
      (portKind === "input" ? "in" : portKind === "leak" ? "leak" : "out"),
    portKind,
  };
}

function connectionsForPort(portInfo) {
  if (!portInfo || portInfo.portKind === "leak") {
    return [];
  }
  if (portInfo.portKind === "input") {
    return appState.scene.connections.filter(
      (connection) =>
        connection.to_component === portInfo.componentId && connection.to_port === portInfo.portId,
    );
  }
  return appState.scene.connections.filter(
    (connection) =>
      connection.from_component === portInfo.componentId && connection.from_port === portInfo.portId,
  );
}

function cyclePortConnectionSelection(portInfo) {
  const component = findComponent(portInfo?.componentId);
  if (!component) {
    return false;
  }
  if (portInfo.portKind === "leak") {
    if (component.config.leak_target_id) {
      setSelection("leak", component.id);
      return true;
    }
    setSelection("component", component.id);
    return false;
  }
  const matchingConnections = connectionsForPort(portInfo);
  if (!matchingConnections.length) {
    setSelection("component", component.id);
    return false;
  }

  const currentIndex = matchingConnections.findIndex((connection) =>
    selectionMatches("pipe", connection.id),
  );
  const nextConnection =
    matchingConnections[
      currentIndex >= 0
        ? (currentIndex + 1) % matchingConnections.length
        : 0
    ];
  setSelection("pipe", nextConnection.id);
  return true;
}

function startPipeDraftFromPort(portInfo, event) {
  if (isWaterMode() || !portInfo || portInfo.portKind === "input") {
    return false;
  }

  const component = findComponent(portInfo.componentId);
  if (!component) {
    return false;
  }

  stopPlayback();
  event.preventDefault();
  event.stopPropagation();
  appState.selection = { kind: "component", id: component.id };
  const draftMode = portInfo.portKind === "leak" ? "leak" : "pipe";
  appState.pipeDraft = {
    fromComponentId: component.id,
    fromPort: portInfo.portId || "out",
    mode: draftMode,
    pointer: pointerToCanvasPosition(event),
    hoverTargetId: null,
  };
  render();
  return true;
}

function beginPortGesture(event) {
  if (isWaterMode()) {
    return false;
  }

  const portInfo = portInfoFromElement(event.target);
  if (!portInfo) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  appState.portGesture = {
    ...portInfo,
    startX: event.clientX,
    startY: event.clientY,
  };
  return true;
}

function maybePromotePortGestureToDraft(event) {
  if (!appState.portGesture || appState.portGesture.portKind === "input") {
    return false;
  }

  const delta = Math.hypot(
    event.clientX - appState.portGesture.startX,
    event.clientY - appState.portGesture.startY,
  );
  if (delta < PORT_DRAFT_THRESHOLD) {
    return false;
  }

  const gesture = appState.portGesture;
  appState.portGesture = null;
  if (!startPipeDraftFromPort(gesture, event)) {
    return false;
  }
  movePipeDraft(event);
  return true;
}

function finishPortGesture(event) {
  if (!appState.portGesture) {
    return false;
  }

  const gesture = appState.portGesture;
  appState.portGesture = null;
  event.preventDefault();
  event.stopPropagation();
  cyclePortConnectionSelection(gesture);
  render();
  return true;
}

function movePipeDraft(event) {
  if (!appState.pipeDraft) {
    return;
  }
  appState.pipeDraft.pointer = pointerToCanvasPosition(event);
  const target = pipeDraftTargetAtEvent(event);
  appState.pipeDraft.hoverTargetId = target?.id || null;
  render();
}

function finishPipeDraft(event) {
  if (!appState.pipeDraft) {
    return;
  }

  const draft = appState.pipeDraft;
  const target = pipeDraftTargetAtEvent(event);
  cancelPipeDraft();

  if (!target) {
    pushSystemMessage(draft.mode === "leak" ? "Leak draft cancelled." : "Pipe draft cancelled.");
    render();
    return;
  }

  if (draft.mode === "leak") {
    const source = findComponent(draft.fromComponentId);
    if (!source || !isValidLeakRoute(source, target)) {
      pushSystemMessage("Leak draft failed. Drop it on a reservoir.", "danger");
      render();
      return;
    }

    source.config.leak_target_id = target.id;
    refreshSceneRuntime(appState.scene);
    captureBaseline("Leak target updated from canvas.");
    pushSystemMessage(`Leak target connected: ${source.label} -> ${target.label}.`);
    render();
    return;
  }

  const connection = createPipeConnection(draft.fromComponentId, target.id);
  if (!connection) {
    pushSystemMessage("Pipe draft failed. Check the selected ports.", "danger");
    render();
    return;
  }

  captureBaseline("Pipe drawn on canvas.");
  pushSystemMessage(
    `Pipe connected: ${findComponent(draft.fromComponentId)?.label} -> ${target.label}.`,
  );
  render();
}

function beginDrag(event) {
  if (isWaterMode()) {
    return;
  }
  if (event.target.closest(".port-pin")) {
    return;
  }
  const card = event.target.closest(".component-card");
  if (!card) {
    return;
  }
  const component = findComponent(card.dataset.componentId);
  if (!component) {
    return;
  }
  stopPlayback();
  appState.selection = { kind: "component", id: component.id };
  appState.drag = {
    componentId: component.id,
    offsetX: event.clientX - component.position.x,
    offsetY: event.clientY - component.position.y,
  };
  card.setPointerCapture?.(event.pointerId);
  render();
}

function moveDrag(event) {
  if (appState.pipeDraft) {
    movePipeDraft(event);
    return;
  }
  if (appState.portGesture) {
    maybePromotePortGestureToDraft(event);
    return;
  }
  if (!appState.drag) {
    return;
  }
  const component = findComponent(appState.drag.componentId);
  if (!component) {
    return;
  }
  component.position.x = clamp(event.clientX - appState.drag.offsetX, 24, 2000);
  component.position.y = clamp(event.clientY - appState.drag.offsetY, 24, 1400);
  render();
}

function endDrag(event) {
  if (appState.pipeDraft) {
    finishPipeDraft(event);
    return;
  }
  if (appState.portGesture) {
    finishPortGesture(event);
    return;
  }
  if (!appState.drag) {
    return;
  }
  appState.drag = null;
  captureBaseline("Component moved.");
  render();
}

function registerEvents() {
  document.querySelectorAll("[data-add-type]").forEach((button) => {
    button.addEventListener("click", () => addComponent(button.dataset.addType));
  });

  refs.pipeBuilderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addPipeFromBuilder();
  });
  refs.pipeFromSelect.addEventListener("change", renderBuilderOptions);
  refs.pipeToSelect.addEventListener("change", renderBuilderOptions);

  refs.objectList.addEventListener("click", (event) => {
    const row = event.target.closest("[data-select-id]");
    if (!row) {
      return;
    }
    setSelection(row.dataset.selectKind, row.dataset.selectId);
  });

  refs.componentLayer.addEventListener("click", (event) => {
    if (event.target.closest(".port-pin")) {
      return;
    }
    const card = event.target.closest(".component-card");
    if (!card) {
      return;
    }
    setSelection("component", card.dataset.componentId);
  });

  refs.componentLayer.addEventListener("pointerdown", (event) => {
    if (beginPortGesture(event)) {
      return;
    }
    beginDrag(event);
  });
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);

  refs.pipeLayer.addEventListener("click", (event) => {
    const leakHit = event.target.closest("[data-leak-source-id]");
    if (leakHit) {
      setSelection("leak", leakHit.dataset.leakSourceId);
      return;
    }
    const hit = event.target.closest("[data-pipe-id]");
    if (!hit) {
      return;
    }
    setSelection("pipe", hit.dataset.pipeId);
  });

  refs.inspectorContent.addEventListener("input", handleInspectorInput);
  refs.inspectorContent.addEventListener("click", handleInspectorClick);

  refs.sceneTitleInput.addEventListener("input", () => {
    if (isWaterMode()) {
      refs.sceneTitleInput.value = appState.scene.title;
      return;
    }
    appState.scene.title = refs.sceneTitleInput.value || "Untitled Scene";
    appState.scene.scene_id = slugify(appState.scene.title) || appState.scene.scene_id;
    captureBaseline("Scene title updated.");
    render();
  });

  refs.tickSpeedInput.addEventListener("input", () => {
    appState.scene.view.tick_ms = clamp(Number(refs.tickSpeedInput.value), 120, 1400);
    captureBaseline("Tick speed updated.");
    restartTimerIfNeeded();
    render();
  });

  refs.burstButton.addEventListener("click", triggerBurst);
  refs.playButton.addEventListener("click", () => {
    if (appState.playing) {
      return;
    }
    startPlayback({ autoStopWhenSettled: false, noticeText: "Simulation running." });
    render();
  });

  refs.pauseButton.addEventListener("click", () => {
    stopPlayback("Simulation paused.");
    render();
  });

  refs.stepButton.addEventListener("click", () => {
    stopPlayback();
    stepScene();
    pushSystemMessage("Advanced one tick.");
    render();
  });

  refs.resetButton.addEventListener("click", resetSimulation);
  refs.zonesButton.addEventListener("click", () => {
    appState.showConnectionZones = !appState.showConnectionZones;
    render();
  });
  refs.waterModeButton.addEventListener("click", () => setViewMode("water"));
  refs.buildModeButton.addEventListener("click", () => setViewMode("build"));
  refs.storyToggleButton.addEventListener("click", () => {
    if (!isWaterMode()) {
      return;
    }
    appState.storyExpanded = !appState.storyExpanded;
    render();
  });
  refs.autoInterfaceButton.addEventListener("click", () => {
    if (guardBuildMode("set a simple module interface")) {
      return;
    }
    stopPlayback();
    try {
      const result = autoPopulateModuleInterface();
      captureBaseline(
        `Auto interface set: ${result.inputs} public inputs / ${result.outputs} public outputs.`,
      );
    } catch (error) {
      pushSystemMessage(error.message, "danger");
    }
    render();
  });
  refs.saveDraftButton.addEventListener("click", () => {
    saveDraft(appState.scene);
    pushSystemMessage("Draft saved locally.");
    render();
  });
  refs.loadDraftButton.addEventListener("click", () => {
    const scene = loadDraft();
    if (!scene) {
      pushSystemMessage("No local draft found.", "danger");
      render();
      return;
    }
    loadScene(scene, "Local draft loaded.");
  });
  refs.exportModuleButton.addEventListener("click", () => {
    try {
      exportModuleToFile();
    } catch (error) {
      pushSystemMessage(error.message, "danger");
      render();
    }
  });
  refs.openBuilderButton.addEventListener("click", () => {
    saveDraft(appState.scene);
    window.location.href = "./builder/";
  });
  refs.saveFileButton.addEventListener("click", saveSceneToFile);
  refs.loadFileButton.addEventListener("click", () => refs.sceneFileInput.click());
  refs.sceneFileInput.addEventListener("change", async () => {
    const [file] = refs.sceneFileInput.files || [];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload?.format === MODULE_FORMAT) {
        loadScene(moduleToScene(payload), `Loaded module file: ${file.name}`);
      } else {
        loadScene(normalizeScene(payload), `Loaded scene file: ${file.name}`);
      }
    } catch (error) {
      pushSystemMessage(`Scene load failed: ${error.message}`, "danger");
      render();
    } finally {
      refs.sceneFileInput.value = "";
    }
  });

  refs.resetDemoButton.addEventListener("click", () => {
    loadScene(clone(DEFAULT_SCENE), "Reset to clean demo scene.");
  });
  refs.deleteSelectionButton.addEventListener("click", removeSelection);
  refs.waterSelectionStrip.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-build]");
    if (!button) {
      return;
    }
    setViewMode("build");
  });
}

function consumeLabHandoff() {
  try {
    const raw = window.localStorage.getItem(LAB_HANDOFF_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    window.localStorage.removeItem(LAB_HANDOFF_STORAGE_KEY);
    const payload = JSON.parse(raw);
    if (payload?.kind === "module" && payload?.module?.format === MODULE_FORMAT) {
      return {
        scene: moduleToScene(payload.module),
        message: payload.message || `Opened module: ${payload.module.module?.name || "Imported Module"}`,
      };
    }
    if (payload?.kind === "scene" && payload?.scene) {
      return {
        scene: normalizeScene(payload.scene),
        message: payload.message || "Opened Module Builder composition in Circuit Lab.",
      };
    }
  } catch (error) {
    pushSystemMessage(`Lab handoff failed: ${error.message}`, "danger");
  }
  return null;
}

function bootstrap() {
  const handoff = consumeLabHandoff();
  const draft = loadDraft();
  appState.viewMode = loadViewModePreference();
  appState.storyExpanded = appState.viewMode === "build";
  appState.scene = handoff?.scene || draft || normalizeScene(clone(DEFAULT_SCENE));
  appState.baselineScene = sceneForResetBaseline(appState.scene);
  appState.selection = firstSelection();
  resetRuntimeView(
    handoff?.message ||
      (draft ? "Loaded local draft." : "Loaded clean threshold bucket demo."),
  );
  registerEvents();
  render();
}

bootstrap();
