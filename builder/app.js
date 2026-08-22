"use strict";

const MODULE_FORMAT = "elliot-module/v1";
const BUILDER_SCENE_FORMAT = "elliot-builder-scene/v1";
const MODULE_LIBRARY_STORAGE_KEY = "elliot-builder-module-library-v1";
const BUILDER_SCENE_STORAGE_KEY = "elliot-builder-scene-draft-v1";
const LAB_HANDOFF_STORAGE_KEY = "elliot-lab-handoff-v1";
const MAX_PUBLIC_INPUTS = 3;
const MAX_PUBLIC_OUTPUTS = 3;
const DEFAULT_ROUTE_CONFIG = Object.freeze({
  width: 14,
  length: 220,
  max_flow_per_tick: 1,
  transit_ticks: 2,
});
const DEFAULT_INSTANCE_SIZE = {
  width: 240,
  baseHeight: 124,
  portSpacing: 30,
};

const DEFAULT_SCENE = {
  format: BUILDER_SCENE_FORMAT,
  title: "Module Composition",
  instances: [],
  routes: [],
};

const appState = {
  library: [],
  scene: clone(DEFAULT_SCENE),
  selection: {
    kind: null,
    id: null,
  },
  drag: null,
  notice: {
    tone: "live",
    text: "Loading Module Builder...",
  },
};

const refs = {
  titleInput: document.querySelector("#builder-title-input"),
  meta: document.querySelector("#builder-meta"),
  moduleLibraryList: document.querySelector("#module-library-list"),
  routeFromSelect: document.querySelector("#route-from-select"),
  routeToSelect: document.querySelector("#route-to-select"),
  routeWidthInput: document.querySelector("#route-width-input"),
  routeLengthInput: document.querySelector("#route-length-input"),
  routeFlowInput: document.querySelector("#route-flow-input"),
  routeTransitInput: document.querySelector("#route-transit-input"),
  routeBuilderForm: document.querySelector("#route-builder-form"),
  routeBuilderNote: document.querySelector("#route-builder-note"),
  canvas: document.querySelector("#builder-canvas"),
  routeLayer: document.querySelector("#builder-route-layer"),
  instanceLayer: document.querySelector("#builder-instance-layer"),
  inspectorContent: document.querySelector("#builder-inspector-content"),
  deleteSelectionButton: document.querySelector("#delete-builder-selection-button"),
  moduleCountValue: document.querySelector("#module-count-value"),
  instanceCountValue: document.querySelector("#instance-count-value"),
  routeCountValue: document.querySelector("#route-count-value"),
  inputCountValue: document.querySelector("#input-count-value"),
  outputCountValue: document.querySelector("#output-count-value"),
  builderSummary: document.querySelector("#builder-summary"),
  builderSelection: document.querySelector("#builder-selection"),
  readinessList: document.querySelector("#builder-readiness-list"),
  importModuleButton: document.querySelector("#import-module-button"),
  openLabButton: document.querySelector("#open-lab-button"),
  runLabButton: document.querySelector("#run-lab-button"),
  saveDraftButton: document.querySelector("#save-builder-draft-button"),
  loadDraftButton: document.querySelector("#load-builder-draft-button"),
  saveFileButton: document.querySelector("#save-builder-file-button"),
  loadFileButton: document.querySelector("#load-builder-file-button"),
  clearButton: document.querySelector("#clear-builder-button"),
  moduleFileInput: document.querySelector("#module-file-input"),
  builderFileInput: document.querySelector("#builder-file-input"),
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
  return String(value || "module")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setNotice(text, tone = "live") {
  appState.notice = { text, tone };
}

function moduleKey(modulePayload) {
  return `${modulePayload.module.id}@${modulePayload.module.version}`;
}

function isModulePayload(value) {
  return (
    value?.format === MODULE_FORMAT &&
    value?.module?.id &&
    value?.module?.name &&
    Array.isArray(value?.interface?.inputs) &&
    Array.isArray(value?.interface?.outputs) &&
    Array.isArray(value?.graph?.components) &&
    Array.isArray(value?.graph?.routes)
  );
}

function isLabScenePayload(value) {
  return (
    Array.isArray(value?.components) &&
    Array.isArray(value?.connections) &&
    Array.isArray(value?.module_interface_draft?.inputs) &&
    Array.isArray(value?.module_interface_draft?.outputs)
  );
}

function primitiveRoleForType(type) {
  const map = {
    source: {
      role: "signal_injector",
      summary: "Injects stored quantity into the local circuit.",
    },
    bucket: {
      role: "accumulator",
      summary: "Accumulator with thresholded release.",
    },
    leaky_bucket: {
      role: "decaying_accumulator",
      summary: "Accumulator with continuous loss and thresholded release.",
    },
    siphon: {
      role: "threshold_release",
      summary: "Thresholded nonlinear release mechanism.",
    },
    reservoir: {
      role: "retained_state",
      summary: "Retained internal state with return path.",
    },
    output_basin: {
      role: "terminal_readout",
      summary: "Terminal readout sink.",
    },
  };
  return map[type] || { role: "component", summary: "" };
}

function scenePrimitiveRoles(scenePayload) {
  return [...new Set((scenePayload.components || []).map((component) => component.type))].map((type) => {
    const role = primitiveRoleForType(type);
    return {
      primitive: type,
      label: type,
      role: role.role,
      summary: role.summary,
    };
  });
}

function pureModuleGraphFromScene(scenePayload) {
  const components = (scenePayload.components || []).filter(
    (component) => component.type !== "source" && component.type !== "output_basin",
  );
  const componentIds = new Set(components.map((component) => component.id));
  const routes = (scenePayload.connections || []).filter(
    (route) => componentIds.has(route.from_component) && componentIds.has(route.to_component),
  );
  return {
    components: clone(components),
    routes: clone(routes),
    layout: {
      scene_id: String(scenePayload.scene_id || ""),
      title: String(scenePayload.title || ""),
    },
  };
}

function modulePayloadFromScene(scenePayload) {
  if (!isLabScenePayload(scenePayload)) {
    throw new Error("File is neither a valid elliot-module/v1 export nor a Lab scene.");
  }
  const inputs = scenePayload.module_interface_draft.inputs || [];
  const outputs = scenePayload.module_interface_draft.outputs || [];
  if (!inputs.length || !outputs.length) {
    throw new Error(
      "Lab scene must expose at least one public input and one public output before Builder can import it.",
    );
  }
  if (inputs.length > MAX_PUBLIC_INPUTS || outputs.length > MAX_PUBLIC_OUTPUTS) {
    throw new Error(
      `Module Builder v1 supports at most ${MAX_PUBLIC_INPUTS} public inputs and ${MAX_PUBLIC_OUTPUTS} public outputs per module.`,
    );
  }
  const pureGraph = pureModuleGraphFromScene(scenePayload);

  return {
    format: MODULE_FORMAT,
    module: {
      id: String(scenePayload.scene_id || slugify(scenePayload.title || "lab-module") || "lab-module"),
      name: String(scenePayload.title || "Imported Lab Module"),
      version: "0.1.0",
    },
    interface: {
      inputs: inputs.map((entry) => ({
        id: String(entry.id),
        name: String(entry.name || entry.id),
      })),
      outputs: outputs.map((entry) => ({
        id: String(entry.id),
        name: String(entry.name || entry.id),
      })),
    },
    bindings: {
      inputs: inputs.map((entry) => ({
        interface_port: String(entry.id),
        component_id: String(entry.component_id),
        port_id: String(entry.port_id || "in"),
      })),
      outputs: outputs.map((entry) => ({
        interface_port: String(entry.id),
        component_id: String(entry.component_id),
        port_id: String(entry.port_id || "out"),
      })),
    },
    graph: {
      components: pureGraph.components,
      routes: pureGraph.routes,
      layout: pureGraph.layout,
    },
    semantics: {
      summary: "Reusable module converted from an export-ready Circuit Lab scene.",
      primitive_roles: scenePrimitiveRoles({
        components: pureGraph.components,
      }),
    },
    metadata: {
      imported_from_scene: true,
      source_scene_id: String(scenePayload.scene_id || ""),
    },
  };
}

function normalizeModule(modulePayload) {
  const normalizedSource = isModulePayload(modulePayload)
    ? modulePayload
    : modulePayloadFromScene(modulePayload);

  if (!isModulePayload(normalizedSource)) {
    throw new Error(
      "File is neither a valid elliot-module/v1 export nor an export-ready Lab scene with public interface ports.",
    );
  }
  if (
    (normalizedSource.interface.inputs || []).length > MAX_PUBLIC_INPUTS ||
    (normalizedSource.interface.outputs || []).length > MAX_PUBLIC_OUTPUTS
  ) {
    throw new Error(
      `Module Builder v1 supports at most ${MAX_PUBLIC_INPUTS} public inputs and ${MAX_PUBLIC_OUTPUTS} public outputs per module.`,
    );
  }

  return {
    format: MODULE_FORMAT,
    module: {
      id: String(normalizedSource.module.id),
      name: String(normalizedSource.module.name),
      version: String(normalizedSource.module.version || "0.1.0"),
    },
    interface: {
      inputs: (normalizedSource.interface.inputs || []).map((entry) => ({
        id: String(entry.id),
        name: String(entry.name || entry.id),
      })),
      outputs: (normalizedSource.interface.outputs || []).map((entry) => ({
        id: String(entry.id),
        name: String(entry.name || entry.id),
      })),
    },
    bindings: {
      inputs: (normalizedSource.bindings?.inputs || []).map((entry) => ({
        interface_port: String(entry.interface_port),
        component_id: String(entry.component_id),
        port_id: String(entry.port_id),
      })),
      outputs: (normalizedSource.bindings?.outputs || []).map((entry) => ({
        interface_port: String(entry.interface_port),
        component_id: String(entry.component_id),
        port_id: String(entry.port_id),
      })),
    },
    graph: {
      components: clone(normalizedSource.graph.components || []),
      routes: clone(normalizedSource.graph.routes || []),
      layout: clone(normalizedSource.graph.layout || {}),
    },
    semantics: clone(normalizedSource.semantics || {}),
    metadata: clone(normalizedSource.metadata || {}),
  };
}

function defaultBuilderScene() {
  return clone(DEFAULT_SCENE);
}

function normalizeBuilderScene(scene) {
  return {
    format: BUILDER_SCENE_FORMAT,
    title: String(scene?.title || "Module Composition"),
    instances: (Array.isArray(scene?.instances) ? scene.instances : []).map((instance, index) => ({
      id: String(instance?.id || `module-instance-${index + 1}`),
      module_key: String(instance?.module_key || ""),
      label: String(instance?.label || `Module ${index + 1}`),
      position: {
        x: clamp(Number(instance?.position?.x ?? 120 + index * 34), 0, 2600),
        y: clamp(Number(instance?.position?.y ?? 120 + index * 28), 0, 1800),
      },
    })),
    routes: (Array.isArray(scene?.routes) ? scene.routes : []).map((route, index) => ({
      id: String(route?.id || `builder-route-${index + 1}`),
      from_instance_id: String(route?.from_instance_id || ""),
      from_port_id: String(route?.from_port_id || ""),
      to_instance_id: String(route?.to_instance_id || ""),
      to_port_id: String(route?.to_port_id || ""),
      config: {
        width: clamp(Number(route?.config?.width || DEFAULT_ROUTE_CONFIG.width), 4, 40),
        length: clamp(Number(route?.config?.length || DEFAULT_ROUTE_CONFIG.length), 40, 1000),
        max_flow_per_tick: clamp(
          Number(route?.config?.max_flow_per_tick || DEFAULT_ROUTE_CONFIG.max_flow_per_tick),
          0.1,
          20,
        ),
        transit_ticks: clamp(
          Number(route?.config?.transit_ticks || DEFAULT_ROUTE_CONFIG.transit_ticks),
          1,
          24,
        ),
      },
    })),
  };
}

function saveLibrary() {
  window.localStorage.setItem(MODULE_LIBRARY_STORAGE_KEY, JSON.stringify(appState.library));
}

function loadLibrary() {
  try {
    const raw = window.localStorage.getItem(MODULE_LIBRARY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw).map(normalizeModule);
  } catch (error) {
    setNotice(`Module library load failed: ${error.message}`, "danger");
    return [];
  }
}

function saveBuilderDraft(message = null) {
  window.localStorage.setItem(BUILDER_SCENE_STORAGE_KEY, JSON.stringify(appState.scene));
  if (message) {
    setNotice(message);
  }
}

function loadBuilderDraft() {
  try {
    const raw = window.localStorage.getItem(BUILDER_SCENE_STORAGE_KEY);
    return raw ? normalizeBuilderScene(JSON.parse(raw)) : null;
  } catch (error) {
    setNotice(`Module Builder draft load failed: ${error.message}`, "danger");
    return null;
  }
}

function moduleForKey(key) {
  return appState.library.find((entry) => moduleKey(entry) === key) || null;
}

function moduleForInstance(instance) {
  return instance ? moduleForKey(instance.module_key) : null;
}

function findInstance(id) {
  return appState.scene.instances.find((instance) => instance.id === id) || null;
}

function findRoute(id) {
  return appState.scene.routes.find((route) => route.id === id) || null;
}

function modulePortList(modulePayload, direction) {
  return direction === "output"
    ? modulePayload?.interface?.outputs || []
    : modulePayload?.interface?.inputs || [];
}

function modulePort(modulePayload, direction, portId) {
  return modulePortList(modulePayload, direction).find((entry) => entry.id === portId) || null;
}

function instanceSize(instance) {
  const modulePayload = moduleForInstance(instance);
  const inputs = modulePortList(modulePayload, "input").length;
  const outputs = modulePortList(modulePayload, "output").length;
  const rows = Math.max(1, inputs, outputs);
  return {
    width: DEFAULT_INSTANCE_SIZE.width,
    height: DEFAULT_INSTANCE_SIZE.baseHeight + rows * DEFAULT_INSTANCE_SIZE.portSpacing,
  };
}

function nextInstanceId() {
  let counter = 1;
  const ids = new Set(appState.scene.instances.map((instance) => instance.id));
  while (ids.has(`module-instance-${counter}`)) {
    counter += 1;
  }
  return `module-instance-${counter}`;
}

function nextRouteId() {
  let counter = 1;
  const ids = new Set(appState.scene.routes.map((route) => route.id));
  while (ids.has(`builder-route-${counter}`)) {
    counter += 1;
  }
  return `builder-route-${counter}`;
}

function nextInstancePosition() {
  const count = appState.scene.instances.length;
  return {
    x: 84 + (count % 4) * 280,
    y: 84 + Math.floor(count / 4) * 220,
  };
}

function routeConfigFromInputs() {
  return {
    width: clamp(Number(refs.routeWidthInput.value), 4, 40),
    length: clamp(Number(refs.routeLengthInput.value), 40, 1000),
    max_flow_per_tick: clamp(Number(refs.routeFlowInput.value), 0.1, 20),
    transit_ticks: clamp(Number(refs.routeTransitInput.value), 1, 24),
  };
}

function addModuleToLibrary(modulePayload) {
  const next = normalizeModule(modulePayload);
  const key = moduleKey(next);
  const existingIndex = appState.library.findIndex((entry) => moduleKey(entry) === key);
  if (existingIndex >= 0) {
    appState.library[existingIndex] = next;
  } else {
    appState.library.push(next);
  }
  saveLibrary();
  return next;
}

function addModuleInstance(moduleKeyValue) {
  const modulePayload = moduleForKey(moduleKeyValue);
  if (!modulePayload) {
    return null;
  }
  const sameTypeCount = appState.scene.instances.filter(
    (instance) => instance.module_key === moduleKeyValue,
  ).length;
  const instance = {
    id: nextInstanceId(),
    module_key: moduleKeyValue,
    label: `${modulePayload.module.name} ${sameTypeCount + 1}`,
    position: nextInstancePosition(),
  };
  appState.scene.instances.push(instance);
  appState.selection = { kind: "instance", id: instance.id };
  saveBuilderDraft("Module instance added.");
  return instance;
}

function publicInputs() {
  const options = [];
  for (const instance of appState.scene.instances) {
    const modulePayload = moduleForInstance(instance);
    for (const port of modulePortList(modulePayload, "input")) {
      options.push({
        value: `${instance.id}::${port.id}`,
        label: `${instance.label} / ${port.name}`,
        instance,
        port,
      });
    }
  }
  return options;
}

function publicOutputs() {
  const options = [];
  for (const instance of appState.scene.instances) {
    const modulePayload = moduleForInstance(instance);
    for (const port of modulePortList(modulePayload, "output")) {
      options.push({
        value: `${instance.id}::${port.id}`,
        label: `${instance.label} / ${port.name}`,
        instance,
        port,
      });
    }
  }
  return options;
}

function parseBuilderPortReference(value) {
  const [instanceId, portId] = String(value || "").split("::");
  if (!instanceId || !portId) {
    return null;
  }
  return { instanceId, portId };
}

function routeExists(fromInstanceId, fromPortId, toInstanceId, toPortId, ignoreRouteId = null) {
  return appState.scene.routes.some(
    (route) =>
      route.id !== ignoreRouteId &&
      route.from_instance_id === fromInstanceId &&
      route.from_port_id === fromPortId &&
      route.to_instance_id === toInstanceId &&
      route.to_port_id === toPortId,
  );
}

function routeName(route) {
  const fromInstance = findInstance(route.from_instance_id);
  const toInstance = findInstance(route.to_instance_id);
  return `${fromInstance?.label || route.from_instance_id || "Missing source"} -> ${
    toInstance?.label || route.to_instance_id || "Missing target"
  }`;
}

function portName(modulePayload, direction, portId) {
  return modulePort(modulePayload, direction, portId)?.name || portId;
}

function compositionDiagnostics() {
  const diagnostics = [];
  const seenRoutes = new Set();

  if (!appState.scene.instances.length) {
    diagnostics.push({
      level: "danger",
      title: "No modules",
      message: "Add at least one module instance before running in Lab.",
    });
    return diagnostics;
  }

  for (const instance of appState.scene.instances) {
    const modulePayload = moduleForInstance(instance);
    if (!modulePayload) {
      diagnostics.push({
        level: "danger",
        title: "Missing module",
        message: `${instance.label} references a module that is not in the library.`,
      });
    }
  }

  for (const route of appState.scene.routes) {
    const signature = `${route.from_instance_id}:${route.from_port_id}->${route.to_instance_id}:${route.to_port_id}`;
    if (seenRoutes.has(signature)) {
      diagnostics.push({
        level: "warning",
        title: "Duplicate route",
        message: `${routeName(route)} repeats the same public-port connection.`,
      });
    }
    seenRoutes.add(signature);

    const fromInstance = findInstance(route.from_instance_id);
    const toInstance = findInstance(route.to_instance_id);
    const fromModule = moduleForInstance(fromInstance);
    const toModule = moduleForInstance(toInstance);
    if (!fromInstance || !toInstance || !fromModule || !toModule) {
      diagnostics.push({
        level: "danger",
        title: "Broken route",
        message: `${routeName(route)} cannot resolve both module instances.`,
      });
      continue;
    }
    if (!modulePort(fromModule, "output", route.from_port_id)) {
      diagnostics.push({
        level: "danger",
        title: "Invalid output",
        message: `${fromInstance.label} no longer exposes output ${route.from_port_id}.`,
      });
    }
    if (!modulePort(toModule, "input", route.to_port_id)) {
      diagnostics.push({
        level: "danger",
        title: "Invalid input",
        message: `${toInstance.label} no longer exposes input ${route.to_port_id}.`,
      });
    }
    if (!bindingFor(fromModule, "output", route.from_port_id)) {
      diagnostics.push({
        level: "danger",
        title: "Missing output binding",
        message: `${fromInstance.label} output ${portName(fromModule, "output", route.from_port_id)} has no internal binding.`,
      });
    }
    if (!bindingFor(toModule, "input", route.to_port_id)) {
      diagnostics.push({
        level: "danger",
        title: "Missing input binding",
        message: `${toInstance.label} input ${portName(toModule, "input", route.to_port_id)} has no internal binding.`,
      });
    }
  }

  for (const instance of appState.scene.instances) {
    const modulePayload = moduleForInstance(instance);
    if (!modulePayload) {
      continue;
    }
    for (const publicInput of modulePayload.interface.inputs) {
      if (!routeIsConnectedToInput(instance.id, publicInput.id)) {
        diagnostics.push({
          level: "live",
          title: "Harness input",
          message: `${instance.label} / ${publicInput.name} will receive a Lab source.`,
        });
      }
    }
    for (const publicOutput of modulePayload.interface.outputs) {
      if (!routeIsConnectedToOutput(instance.id, publicOutput.id)) {
        diagnostics.push({
          level: "live",
          title: "Harness output",
          message: `${instance.label} / ${publicOutput.name} will receive a Lab basin.`,
        });
      }
    }
  }

  if (!diagnostics.length) {
    diagnostics.push({
      level: "ok",
      title: "Ready",
      message: "All public ports are routed.",
    });
  }

  return diagnostics;
}

function blockingDiagnostics() {
  return compositionDiagnostics().filter((entry) => entry.level === "danger");
}

function canCreateRoute(fromRef, toRef) {
  if (!fromRef || !toRef) {
    return false;
  }
  if (routeExists(fromRef.instanceId, fromRef.portId, toRef.instanceId, toRef.portId)) {
    return false;
  }
  const fromInstance = findInstance(fromRef.instanceId);
  const toInstance = findInstance(toRef.instanceId);
  const fromModule = moduleForInstance(fromInstance);
  const toModule = moduleForInstance(toInstance);
  return Boolean(
    fromInstance &&
      toInstance &&
      modulePort(fromModule, "output", fromRef.portId) &&
      modulePort(toModule, "input", toRef.portId),
  );
}

function addRouteFromBuilder() {
  const fromRef = parseBuilderPortReference(refs.routeFromSelect.value);
  const toRef = parseBuilderPortReference(refs.routeToSelect.value);
  if (!canCreateRoute(fromRef, toRef)) {
    setNotice("Choose a valid output-to-input route.", "danger");
    render();
    return;
  }
  const route = {
    id: nextRouteId(),
    from_instance_id: fromRef.instanceId,
    from_port_id: fromRef.portId,
    to_instance_id: toRef.instanceId,
    to_port_id: toRef.portId,
    config: routeConfigFromInputs(),
  };
  appState.scene.routes.push(route);
  appState.selection = { kind: "route", id: route.id };
  saveBuilderDraft("Builder route added.");
  render();
}

function routePortPoint(instance, direction, portIndex) {
  const size = instanceSize(instance);
  const x = instance.position.x;
  const y = instance.position.y;
  return {
    x: direction === "input" ? x : x + size.width,
    y: y + 92 + portIndex * DEFAULT_INSTANCE_SIZE.portSpacing,
  };
}

function instancePortPoint(instance, direction, portId) {
  const modulePayload = moduleForInstance(instance);
  const ports = modulePortList(modulePayload, direction);
  const index = Math.max(
    0,
    ports.findIndex((port) => port.id === portId),
  );
  return routePortPoint(instance, direction, index);
}

function routePath(route) {
  const fromInstance = findInstance(route.from_instance_id);
  const toInstance = findInstance(route.to_instance_id);
  if (!fromInstance || !toInstance) {
    return null;
  }
  const from = instancePortPoint(fromInstance, "output", route.from_port_id);
  const to = instancePortPoint(toInstance, "input", route.to_port_id);
  const controlOffset = Math.max(60, Math.abs(to.x - from.x) * 0.34);
  const d = `M ${from.x} ${from.y} C ${from.x + controlOffset} ${from.y} ${to.x - controlOffset} ${to.y} ${to.x} ${to.y}`;
  return {
    d,
    mid: {
      x: (from.x + to.x) * 0.5,
      y: (from.y + to.y) * 0.5,
    },
  };
}

function setSelection(kind, id) {
  appState.selection = { kind, id };
  render();
}

function selectionLabel() {
  if (!appState.selection?.id) {
    return "None";
  }
  if (appState.selection.kind === "instance") {
    return findInstance(appState.selection.id)?.label || "None";
  }
  if (appState.selection.kind === "route") {
    const route = findRoute(appState.selection.id);
    if (!route) {
      return "None";
    }
    return `${route.from_instance_id} -> ${route.to_instance_id}`;
  }
  return "None";
}

function renderLibrary() {
  refs.moduleLibraryList.replaceChildren();
  if (!appState.library.length) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent = "Import your first elliot-module/v1 file to start composing.";
    refs.moduleLibraryList.append(empty);
    return;
  }

  for (const modulePayload of appState.library) {
    const card = document.createElement("article");
    card.className = "library-card";
    card.innerHTML = `
      <h3>${modulePayload.module.name}</h3>
      <div class="library-meta">
        <div>${modulePayload.module.id} · v${modulePayload.module.version}</div>
        <div>${modulePayload.interface.inputs.length} inputs / ${modulePayload.interface.outputs.length} outputs</div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "library-actions";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "action-button action-button-accent";
    addButton.textContent = "Add Instance";
    addButton.dataset.moduleAction = "add-instance";
    addButton.dataset.moduleKey = moduleKey(modulePayload);
    actions.append(addButton);

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "action-button";
    openButton.textContent = "Open in Lab";
    openButton.dataset.moduleAction = "open-in-lab";
    openButton.dataset.moduleKey = moduleKey(modulePayload);
    actions.append(openButton);

    card.append(actions);
    refs.moduleLibraryList.append(card);
  }
}

function renderRouteBuilder() {
  const outputs = publicOutputs();
  const inputs = publicInputs();
  const selectedFrom = refs.routeFromSelect.value;
  const selectedTo = refs.routeToSelect.value;
  refs.routeFromSelect.replaceChildren();
  refs.routeToSelect.replaceChildren();

  for (const option of outputs) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    refs.routeFromSelect.append(el);
  }

  for (const option of inputs) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    refs.routeToSelect.append(el);
  }

  if (outputs.some((option) => option.value === selectedFrom)) {
    refs.routeFromSelect.value = selectedFrom;
  }
  if (inputs.some((option) => option.value === selectedTo)) {
    refs.routeToSelect.value = selectedTo;
  }

  if (!outputs.length || !inputs.length) {
    refs.routeBuilderNote.textContent = "Import modules and add instances with public ports before routing.";
  } else {
    const fromRef = parseBuilderPortReference(refs.routeFromSelect.value || outputs[0].value);
    const toRef = parseBuilderPortReference(refs.routeToSelect.value || inputs[0].value);
    const boundary = builderBoundarySummary();
    refs.routeBuilderNote.textContent = canCreateRoute(fromRef, toRef)
      ? `Public module route is valid. Open ports get Lab harnesses on run (${boundary.openInputs} inputs / ${boundary.openOutputs} outputs).`
      : "Choose a valid output-to-input route.";
  }
}

function renderReadiness() {
  refs.readinessList.replaceChildren();
  const labels = {
    danger: "Block",
    warning: "Check",
    live: "Harness",
    ok: "Ready",
  };

  for (const diagnostic of compositionDiagnostics()) {
    const item = document.createElement("article");
    item.className = `readiness-item is-${diagnostic.level}`;
    item.innerHTML = `
      <p class="readiness-kicker">${labels[diagnostic.level] || diagnostic.level}</p>
      <h3>${diagnostic.title}</h3>
      <p>${diagnostic.message}</p>
    `;
    refs.readinessList.append(item);
  }
}

function renderRoutes() {
  refs.routeLayer.replaceChildren();

  for (const route of appState.scene.routes) {
    const path = routePath(route);
    if (!path) {
      continue;
    }

    const sleeve = document.createElementNS("http://www.w3.org/2000/svg", "path");
    sleeve.setAttribute("d", path.d);
    sleeve.setAttribute("stroke-width", clamp(route.config.width + 4, 8, 48));
    sleeve.classList.add("builder-route-sleeve");
    sleeve.dataset.routeId = route.id;
    refs.routeLayer.append(sleeve);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", path.d);
    line.setAttribute("stroke-width", clamp(route.config.width, 4, 40));
    line.classList.add("builder-route-line");
    line.dataset.routeId = route.id;
    if (appState.selection.kind === "route" && appState.selection.id === route.id) {
      line.classList.add("is-selected");
    }
    refs.routeLayer.append(line);

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("d", path.d);
    hit.setAttribute("stroke-width", clamp(route.config.width + 16, 18, 64));
    hit.classList.add("builder-route-hit");
    hit.dataset.routeId = route.id;
    refs.routeLayer.append(hit);

    const tag = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    tag.setAttribute("x", String(path.mid.x - 48));
    tag.setAttribute("y", String(path.mid.y - 14));
    tag.setAttribute("width", "96");
    tag.setAttribute("height", "28");
    tag.setAttribute("rx", "10");
    tag.setAttribute("ry", "10");
    tag.classList.add("builder-route-tag");
    tag.dataset.routeId = route.id;
    if (appState.selection.kind === "route" && appState.selection.id === route.id) {
      tag.classList.add("is-selected");
    }
    refs.routeLayer.append(tag);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(path.mid.x));
    text.setAttribute("y", String(path.mid.y + 4));
    text.setAttribute("text-anchor", "middle");
    text.classList.add("builder-route-text");
    text.dataset.routeId = route.id;
    text.textContent = `f${roundNumber(route.config.max_flow_per_tick, 1)} · t${route.config.transit_ticks}`;
    refs.routeLayer.append(text);
  }
}

function instanceCard(instance) {
  const modulePayload = moduleForInstance(instance);
  const card = document.createElement("article");
  card.className = "builder-instance";
  if (!modulePayload) {
    card.classList.add("is-missing");
  }
  if (appState.selection.kind === "instance" && appState.selection.id === instance.id) {
    card.classList.add("is-selected");
  }

  const size = instanceSize(instance);
  card.style.left = `${instance.position.x}px`;
  card.style.top = `${instance.position.y}px`;
  card.style.height = `${size.height}px`;
  card.dataset.instanceId = instance.id;

  const inputs = modulePortList(modulePayload, "input");
  const outputs = modulePortList(modulePayload, "output");
  card.innerHTML = `
    <div class="builder-instance-head">
      <div>
        <p class="builder-instance-name">${instance.label}</p>
        <p class="builder-instance-version">${
          modulePayload
            ? `${modulePayload.module.id} · v${modulePayload.module.version}`
            : "Missing module"
        }</p>
      </div>
    </div>
  `;

  const body = document.createElement("div");
  body.className = "builder-instance-body";

  const inputColumn = document.createElement("div");
  inputColumn.className = "port-column";
  inputColumn.innerHTML = `<p class="port-column-title">Inputs</p>`;
  for (const port of inputs) {
    const state = portConnectionState(instance.id, "input", port.id);
    const el = document.createElement("div");
    el.className = `builder-port is-input ${state.connected ? "is-connected" : "is-open"}`;
    el.title = state.detail;
    el.innerHTML = `<span>${port.name}</span><span class="builder-port-status">${state.label}</span>`;
    inputColumn.append(el);
  }

  const outputColumn = document.createElement("div");
  outputColumn.className = "port-column";
  outputColumn.innerHTML = `<p class="port-column-title">Outputs</p>`;
  for (const port of outputs) {
    const state = portConnectionState(instance.id, "output", port.id);
    const el = document.createElement("div");
    el.className = `builder-port is-output ${state.connected ? "is-connected" : "is-open"}`;
    el.title = state.detail;
    el.innerHTML = `<span>${port.name}</span><span class="builder-port-status">${state.label}</span>`;
    outputColumn.append(el);
  }

  body.append(inputColumn, outputColumn);
  card.append(body);

  const foot = document.createElement("div");
  foot.className = "builder-instance-foot";
  const routedInputs = inputs.filter((port) => portConnectionState(instance.id, "input", port.id).connected).length;
  const routedOutputs = outputs.filter((port) => portConnectionState(instance.id, "output", port.id).connected).length;
  foot.innerHTML = `
    <span>${routedInputs}/${inputs.length} in routed</span>
    <span>${routedOutputs}/${outputs.length} out routed</span>
  `;
  card.append(foot);

  return card;
}

function boundaryPortRow(instance, direction, port) {
  const state = portConnectionState(instance.id, direction, port.id);
  const row = document.createElement("div");
  row.className = `boundary-row is-${direction} ${state.connected ? "is-connected" : "is-open"}`;

  const name = document.createElement("span");
  name.className = "boundary-port-name";
  name.textContent = `${direction === "input" ? "IN" : "OUT"} / ${port.name}`;

  const status = document.createElement("span");
  status.className = "boundary-port-status";
  status.textContent = state.connected ? "routed internally" : "Lab harness on run";
  status.title = state.detail;

  row.append(name, status);
  return row;
}

function renderInstances() {
  refs.instanceLayer.replaceChildren();
  for (const instance of appState.scene.instances) {
    refs.instanceLayer.append(instanceCard(instance));
  }
}

function renderInspector() {
  refs.inspectorContent.replaceChildren();

  if (!appState.selection?.id) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent = "Select a module instance or builder route to inspect it.";
    refs.inspectorContent.append(empty);
    return;
  }

  if (appState.selection.kind === "route") {
    const route = findRoute(appState.selection.id);
    if (!route) {
      return;
    }
    const fromInstance = findInstance(route.from_instance_id);
    const toInstance = findInstance(route.to_instance_id);
    const block = document.createElement("section");
    block.className = "inspector-block";
    block.innerHTML = `
      <h3>Builder Route</h3>
      <div class="route-meta">
        <div>${fromInstance?.label || route.from_instance_id} -> ${toInstance?.label || route.to_instance_id}</div>
        <div>${route.from_port_id} -> ${route.to_port_id}</div>
      </div>
    `;
    const form = document.createElement("div");
    form.className = "stack-form";
    form.innerHTML = `
      <label class="field">
        <span class="field-label">Width</span>
        <input data-route-field="width" type="number" min="4" max="40" step="1" value="${route.config.width}" />
      </label>
      <label class="field">
        <span class="field-label">Length</span>
        <input data-route-field="length" type="number" min="40" max="1000" step="10" value="${route.config.length}" />
      </label>
      <label class="field">
        <span class="field-label">Max Flow</span>
        <input data-route-field="max_flow_per_tick" type="number" min="0.1" max="20" step="0.1" value="${route.config.max_flow_per_tick}" />
      </label>
      <label class="field">
        <span class="field-label">Transit Ticks</span>
        <input data-route-field="transit_ticks" type="number" min="1" max="24" step="1" value="${route.config.transit_ticks}" />
      </label>
    `;
    refs.inspectorContent.append(block, form);
    return;
  }

  const instance = findInstance(appState.selection.id);
  if (!instance) {
    return;
  }
  const modulePayload = moduleForInstance(instance);
  const block = document.createElement("section");
  block.className = "inspector-block";
  block.innerHTML = `
    <h3>${instance.label}</h3>
    <div class="inspector-meta">
      <div>${modulePayload?.module?.id || "Missing module"} · v${modulePayload?.module?.version || "?"}</div>
      <div>${modulePayload?.interface?.inputs?.length || 0} inputs / ${modulePayload?.interface?.outputs?.length || 0} outputs</div>
      <div>${modulePayload?.semantics?.summary || "Imported reusable module."}</div>
    </div>
  `;

  const form = document.createElement("div");
  form.className = "stack-form";
  form.innerHTML = `
    <label class="field">
      <span class="field-label">Label</span>
      <input data-instance-field="label" type="text" value="${instance.label}" />
    </label>
  `;

  const actions = document.createElement("div");
  actions.className = "inspector-inline-actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "action-button";
  openButton.textContent = "Open Module in Lab";
  openButton.dataset.instanceAction = "open-in-lab";
  openButton.dataset.instanceId = instance.id;
  actions.append(openButton);

  const boundary = document.createElement("section");
  boundary.className = "inspector-block";
  boundary.innerHTML = `
    <h3>Boundary Contract</h3>
    <div class="inspector-meta">
      <div>Builder sees only public ports. Internal components remain hidden until Lab run expansion.</div>
    </div>
  `;
  const boundaryList = document.createElement("div");
  boundaryList.className = "boundary-list";
  for (const port of modulePortList(modulePayload, "input")) {
    boundaryList.append(boundaryPortRow(instance, "input", port));
  }
  for (const port of modulePortList(modulePayload, "output")) {
    boundaryList.append(boundaryPortRow(instance, "output", port));
  }
  boundary.append(boundaryList);

  refs.inspectorContent.append(block, form, boundary, actions);
}

function renderStatus() {
  const boundary = builderBoundarySummary();
  const blocking = blockingDiagnostics();
  refs.titleInput.value = appState.scene.title;
  refs.meta.textContent = `${BUILDER_SCENE_FORMAT} / ${appState.library.length} modules in library / ${boundary.openInputs} open inputs / ${boundary.openOutputs} open outputs / ${appState.notice.text}`;
  refs.moduleCountValue.textContent = String(appState.library.length);
  refs.instanceCountValue.textContent = String(appState.scene.instances.length);
  refs.routeCountValue.textContent = String(appState.scene.routes.length);
  refs.inputCountValue.textContent = `${boundary.connectedInputs}/${boundary.inputs}`;
  refs.outputCountValue.textContent = `${boundary.connectedOutputs}/${boundary.outputs}`;
  refs.builderSummary.textContent = `${appState.scene.instances.length} module instances / ${appState.scene.routes.length} builder routes / ${boundary.openInputs} inputs and ${boundary.openOutputs} outputs will get Lab harnesses`;
  refs.builderSelection.textContent = `Selection: ${selectionLabel()}`;
  refs.runLabButton.disabled = blocking.length > 0;
  refs.runLabButton.title = blocking.length
    ? "Fix blocking composition issues before running in Circuit Lab."
    : "";
}

function render() {
  renderLibrary();
  renderRouteBuilder();
  renderReadiness();
  renderRoutes();
  renderInstances();
  renderInspector();
  renderStatus();
}

function downloadJson(data, filename, message) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
  setNotice(message);
}

function saveSceneToFile() {
  downloadJson(
    appState.scene,
    `${slugify(appState.scene.title || "builder-composition")}.builder.json`,
    "Builder scene downloaded.",
  );
  render();
}

function canvasPoint(event) {
  const rect = refs.canvas.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };
}

function beginInstanceDrag(event) {
  const card = event.target.closest(".builder-instance");
  if (!card) {
    return;
  }
  const instance = findInstance(card.dataset.instanceId);
  if (!instance) {
    return;
  }
  const point = canvasPoint(event);
  appState.drag = {
    instanceId: instance.id,
    offsetX: point.x - instance.position.x,
    offsetY: point.y - instance.position.y,
  };
  setSelection("instance", instance.id);
}

function moveInstanceDrag(event) {
  if (!appState.drag) {
    return;
  }
  const instance = findInstance(appState.drag.instanceId);
  if (!instance) {
    appState.drag = null;
    return;
  }
  const point = canvasPoint(event);
  instance.position.x = clamp(point.x - appState.drag.offsetX, 0, 2600);
  instance.position.y = clamp(point.y - appState.drag.offsetY, 0, 1800);
  render();
}

function endInstanceDrag() {
  if (!appState.drag) {
    return;
  }
  appState.drag = null;
  saveBuilderDraft("Instance moved.");
}

function removeSelection() {
  if (!appState.selection?.id) {
    setNotice("Nothing selected to remove.", "danger");
    render();
    return;
  }

  if (appState.selection.kind === "instance") {
    const instanceId = appState.selection.id;
    appState.scene.instances = appState.scene.instances.filter((instance) => instance.id !== instanceId);
    appState.scene.routes = appState.scene.routes.filter(
      (route) =>
        route.from_instance_id !== instanceId && route.to_instance_id !== instanceId,
    );
    appState.selection = { kind: null, id: null };
    saveBuilderDraft("Module instance removed.");
    render();
    return;
  }

  if (appState.selection.kind === "route") {
    appState.scene.routes = appState.scene.routes.filter((route) => route.id !== appState.selection.id);
    appState.selection = { kind: null, id: null };
    saveBuilderDraft("Builder route removed.");
    render();
  }
}

function builderBounds(modulePayload) {
  const components = modulePayload?.graph?.components || [];
  if (!components.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return {
    minX: Math.min(...components.map((component) => Number(component.position?.x || 0))),
    minY: Math.min(...components.map((component) => Number(component.position?.y || 0))),
    maxX: Math.max(...components.map((component) => Number(component.position?.x || 0))),
    maxY: Math.max(...components.map((component) => Number(component.position?.y || 0))),
  };
}

function namespacedId(instanceId, id) {
  return `${instanceId}__${id}`;
}

function bindingFor(modulePayload, direction, interfacePortId) {
  const list =
    direction === "output"
      ? modulePayload?.bindings?.outputs || []
      : modulePayload?.bindings?.inputs || [];
  return list.find((entry) => entry.interface_port === interfacePortId) || null;
}

function routeIsConnectedToInput(instanceId, portId) {
  return appState.scene.routes.some(
    (route) => route.to_instance_id === instanceId && route.to_port_id === portId,
  );
}

function routeIsConnectedToOutput(instanceId, portId) {
  return appState.scene.routes.some(
    (route) => route.from_instance_id === instanceId && route.from_port_id === portId,
  );
}

function portConnectionState(instanceId, direction, portId) {
  const connected =
    direction === "input"
      ? routeIsConnectedToInput(instanceId, portId)
      : routeIsConnectedToOutput(instanceId, portId);
  return {
    connected,
    label: connected ? "routed" : "harness",
    detail: connected
      ? "Connected to another module through a Builder route."
      : "Open public port. Builder will add a Lab harness when running the composition.",
  };
}

function builderBoundarySummary() {
  const inputs = publicInputs();
  const outputs = publicOutputs();
  const connectedInputs = inputs.filter((entry) =>
    routeIsConnectedToInput(entry.instance.id, entry.port.id),
  ).length;
  const connectedOutputs = outputs.filter((entry) =>
    routeIsConnectedToOutput(entry.instance.id, entry.port.id),
  ).length;
  return {
    inputs: inputs.length,
    outputs: outputs.length,
    connectedInputs,
    connectedOutputs,
    openInputs: inputs.length - connectedInputs,
    openOutputs: outputs.length - connectedOutputs,
  };
}

function expandBuilderSceneToLab() {
  const expandedScene = {
    format_version: 1,
    scene_id: slugify(appState.scene.title || "builder-composition") || "builder-composition",
    title: `${appState.scene.title || "Module Composition"} · Lab Run`,
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
    components: [],
    connections: [],
  };

  for (const instance of appState.scene.instances) {
    const modulePayload = moduleForInstance(instance);
    if (!modulePayload) {
      continue;
    }
    const bounds = builderBounds(modulePayload);
    const offsetX = instance.position.x - bounds.minX;
    const offsetY = instance.position.y - bounds.minY;

    for (const component of modulePayload.graph.components) {
      const nextComponent = clone(component);
      nextComponent.id = namespacedId(instance.id, component.id);
      nextComponent.label = `${instance.label} · ${component.label}`;
      nextComponent.position = {
        x: roundNumber(offsetX + Number(component.position?.x || 0), 0),
        y: roundNumber(offsetY + Number(component.position?.y || 0), 0),
      };
      expandedScene.components.push(nextComponent);
    }

    for (const route of modulePayload.graph.routes) {
      const nextRoute = clone(route);
      nextRoute.id = namespacedId(instance.id, route.id);
      nextRoute.from_component = namespacedId(instance.id, route.from_component);
      nextRoute.to_component = namespacedId(instance.id, route.to_component);
      expandedScene.connections.push(nextRoute);
    }
  }

  for (const route of appState.scene.routes) {
    const fromInstance = findInstance(route.from_instance_id);
    const toInstance = findInstance(route.to_instance_id);
    const fromModule = moduleForInstance(fromInstance);
    const toModule = moduleForInstance(toInstance);
    const fromBinding = bindingFor(fromModule, "output", route.from_port_id);
    const toBinding = bindingFor(toModule, "input", route.to_port_id);
    if (!fromBinding || !toBinding) {
      continue;
    }

    expandedScene.connections.push({
      id: route.id,
      type: "pipe",
      label: `${fromInstance.label} -> ${toInstance.label}`,
      from_component: namespacedId(fromInstance.id, fromBinding.component_id),
      from_port: fromBinding.port_id,
      to_component: namespacedId(toInstance.id, toBinding.component_id),
      to_port: toBinding.port_id,
      config: clone(route.config),
      state: {
        segments: Array.from({ length: route.config.transit_ticks }, () => 0),
      },
    });
  }

  for (const instance of appState.scene.instances) {
    const modulePayload = moduleForInstance(instance);
    if (!modulePayload) {
      continue;
    }
    const bounds = builderBounds(modulePayload);
    const offsetX = instance.position.x - bounds.minX;
    const offsetY = instance.position.y - bounds.minY;

    for (const publicInput of modulePayload.interface.inputs) {
      if (routeIsConnectedToInput(instance.id, publicInput.id)) {
        continue;
      }
      const binding = bindingFor(modulePayload, "input", publicInput.id);
      if (!binding) {
        continue;
      }
      const harnessId = namespacedId(instance.id, `harness-source-${publicInput.id}`);
      const boundComponent = modulePayload.graph.components.find(
        (component) => component.id === binding.component_id,
      );
      const targetX = Number(boundComponent?.position?.x || bounds.minX);
      const targetY = Number(boundComponent?.position?.y || bounds.minY);
      expandedScene.components.push({
        id: harnessId,
        type: "source",
        label: `${instance.label} · ${publicInput.name}`,
        position: {
          x: roundNumber(offsetX + targetX - 180, 0),
          y: roundNumber(offsetY + targetY, 0),
        },
        config: {
          width: 12,
          height: 18,
          capacity: 24,
          emit_rate: 1,
          burst_amount: 3,
        },
        state: {
          current_level: 0,
        },
      });
      expandedScene.connections.push({
        id: namespacedId(instance.id, `harness-input-route-${publicInput.id}`),
        type: "pipe",
        label: `${publicInput.name} Harness`,
        from_component: harnessId,
        from_port: "out",
        to_component: namespacedId(instance.id, binding.component_id),
        to_port: binding.port_id,
        config: clone(DEFAULT_ROUTE_CONFIG),
        state: {
          segments: Array.from({ length: DEFAULT_ROUTE_CONFIG.transit_ticks }, () => 0),
        },
      });
    }

    for (const publicOutput of modulePayload.interface.outputs) {
      if (routeIsConnectedToOutput(instance.id, publicOutput.id)) {
        continue;
      }
      const binding = bindingFor(modulePayload, "output", publicOutput.id);
      if (!binding) {
        continue;
      }
      const harnessId = namespacedId(instance.id, `harness-output-${publicOutput.id}`);
      const boundComponent = modulePayload.graph.components.find(
        (component) => component.id === binding.component_id,
      );
      const targetX = Number(boundComponent?.position?.x || bounds.maxX);
      const targetY = Number(boundComponent?.position?.y || bounds.maxY);
      expandedScene.components.push({
        id: harnessId,
        type: "output_basin",
        label: `${instance.label} · ${publicOutput.name}`,
        position: {
          x: roundNumber(offsetX + targetX + 180, 0),
          y: roundNumber(offsetY + targetY, 0),
        },
        config: {
          width: 18,
          height: 14,
          capacity: 999999,
        },
        state: {
          current_level: 0,
        },
      });
      expandedScene.connections.push({
        id: namespacedId(instance.id, `harness-output-route-${publicOutput.id}`),
        type: "pipe",
        label: `${publicOutput.name} Readout`,
        from_component: namespacedId(instance.id, binding.component_id),
        from_port: binding.port_id,
        to_component: harnessId,
        to_port: "in",
        config: clone(DEFAULT_ROUTE_CONFIG),
        state: {
          segments: Array.from({ length: DEFAULT_ROUTE_CONFIG.transit_ticks }, () => 0),
        },
      });
    }
  }

  return expandedScene;
}

function openModuleInLab(modulePayload, message) {
  window.localStorage.setItem(
    LAB_HANDOFF_STORAGE_KEY,
    JSON.stringify({
      kind: "module",
      module: modulePayload,
      message,
    }),
  );
  window.location.href = "../";
}

function runCompositionInLab() {
  const blocking = blockingDiagnostics();
  if (blocking.length) {
    setNotice(`Cannot run in Lab: ${blocking[0].message}`, "danger");
    render();
    return;
  }
  const scene = expandBuilderSceneToLab();
  window.localStorage.setItem(
    LAB_HANDOFF_STORAGE_KEY,
    JSON.stringify({
      kind: "scene",
      scene,
      message: `Opened Module Builder composition: ${appState.scene.title || "Module Composition"}`,
    }),
  );
  window.location.href = "../";
}

function handleInspectorInput(event) {
  const input = event.target;
  if (input.dataset.instanceField === "label" && appState.selection.kind === "instance") {
    const instance = findInstance(appState.selection.id);
    if (!instance) {
      return;
    }
    instance.label = String(input.value || "").slice(0, 64) || instance.label;
    saveBuilderDraft("Instance label updated.");
    render();
    return;
  }

  if (input.dataset.routeField && appState.selection.kind === "route") {
    const route = findRoute(appState.selection.id);
    if (!route) {
      return;
    }
    const key = input.dataset.routeField;
    if (key === "width") {
      route.config.width = clamp(Number(input.value), 4, 40);
    } else if (key === "length") {
      route.config.length = clamp(Number(input.value), 40, 1000);
    } else if (key === "max_flow_per_tick") {
      route.config.max_flow_per_tick = clamp(Number(input.value), 0.1, 20);
    } else if (key === "transit_ticks") {
      route.config.transit_ticks = clamp(Number(input.value), 1, 24);
    }
    saveBuilderDraft("Builder route updated.");
    render();
  }
}

function handleInspectorClick(event) {
  const button = event.target.closest("[data-instance-action]");
  if (!button) {
    return;
  }
  const instance = findInstance(button.dataset.instanceId);
  const modulePayload = moduleForInstance(instance);
  if (!instance || !modulePayload) {
    return;
  }
  if (button.dataset.instanceAction === "open-in-lab") {
    openModuleInLab(modulePayload, `Opened module from Builder: ${modulePayload.module.name}`);
  }
}

function registerEvents() {
  refs.titleInput.addEventListener("input", () => {
    appState.scene.title = refs.titleInput.value || "Module Composition";
    saveBuilderDraft("Module Builder scene title updated.");
    render();
  });

  refs.moduleLibraryList.addEventListener("click", (event) => {
    const action = event.target.closest("[data-module-action]");
    if (!action) {
      return;
    }
    const modulePayload = moduleForKey(action.dataset.moduleKey);
    if (!modulePayload) {
      return;
    }
    if (action.dataset.moduleAction === "add-instance") {
      addModuleInstance(action.dataset.moduleKey);
      render();
      return;
    }
    if (action.dataset.moduleAction === "open-in-lab") {
      openModuleInLab(modulePayload, `Opened module from Module Builder: ${modulePayload.module.name}`);
    }
  });

  refs.routeBuilderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addRouteFromBuilder();
  });
  refs.routeFromSelect.addEventListener("change", render);
  refs.routeToSelect.addEventListener("change", render);

  refs.instanceLayer.addEventListener("click", (event) => {
    const card = event.target.closest(".builder-instance");
    if (!card) {
      return;
    }
    setSelection("instance", card.dataset.instanceId);
  });
  refs.instanceLayer.addEventListener("pointerdown", beginInstanceDrag);
  window.addEventListener("pointermove", moveInstanceDrag);
  window.addEventListener("pointerup", endInstanceDrag);

  refs.routeLayer.addEventListener("click", (event) => {
    const hit = event.target.closest("[data-route-id]");
    if (!hit) {
      return;
    }
    setSelection("route", hit.dataset.routeId);
  });

  refs.inspectorContent.addEventListener("input", handleInspectorInput);
  refs.inspectorContent.addEventListener("click", handleInspectorClick);
  refs.deleteSelectionButton.addEventListener("click", removeSelection);

  refs.importModuleButton.addEventListener("click", () => refs.moduleFileInput.click());
  refs.moduleFileInput.addEventListener("change", async () => {
    const [file] = refs.moduleFileInput.files || [];
    if (!file) {
      return;
    }
    try {
      const modulePayload = normalizeModule(JSON.parse(await file.text()));
      addModuleToLibrary(modulePayload);
      setNotice(`Imported module: ${modulePayload.module.name}`);
    } catch (error) {
      setNotice(error.message, "danger");
    } finally {
      refs.moduleFileInput.value = "";
      render();
    }
  });

  refs.saveDraftButton.addEventListener("click", () => {
    saveBuilderDraft("Module Builder draft saved locally.");
    render();
  });
  refs.loadDraftButton.addEventListener("click", () => {
    const draft = loadBuilderDraft();
    if (!draft) {
      setNotice("No Module Builder draft found.", "danger");
      render();
      return;
    }
    appState.scene = draft;
    appState.selection = { kind: null, id: null };
    setNotice("Module Builder draft loaded.");
    render();
  });
  refs.saveFileButton.addEventListener("click", saveSceneToFile);
  refs.loadFileButton.addEventListener("click", () => refs.builderFileInput.click());
  refs.builderFileInput.addEventListener("change", async () => {
    const [file] = refs.builderFileInput.files || [];
    if (!file) {
      return;
    }
    try {
      const payload = normalizeBuilderScene(JSON.parse(await file.text()));
      appState.scene = payload;
      appState.selection = { kind: null, id: null };
      setNotice(`Loaded Module Builder file: ${file.name}`);
    } catch (error) {
      setNotice(`Module Builder load failed: ${error.message}`, "danger");
    } finally {
      refs.builderFileInput.value = "";
      render();
    }
  });

  refs.clearButton.addEventListener("click", () => {
    appState.scene = defaultBuilderScene();
    appState.selection = { kind: null, id: null };
    saveBuilderDraft("Module Builder scene cleared.");
    render();
  });

  refs.openLabButton.addEventListener("click", () => {
    saveBuilderDraft("Module Builder draft saved before opening Circuit Lab.");
    window.location.href = "../";
  });
  refs.runLabButton.addEventListener("click", runCompositionInLab);
}

function bootstrap() {
  appState.library = loadLibrary();
  appState.scene = loadBuilderDraft() || defaultBuilderScene();
  refs.routeWidthInput.value = String(DEFAULT_ROUTE_CONFIG.width);
  refs.routeLengthInput.value = String(DEFAULT_ROUTE_CONFIG.length);
  refs.routeFlowInput.value = String(DEFAULT_ROUTE_CONFIG.max_flow_per_tick);
  refs.routeTransitInput.value = String(DEFAULT_ROUTE_CONFIG.transit_ticks);
  setNotice("Module Builder ready.");
  registerEvents();
  render();
}

bootstrap();
