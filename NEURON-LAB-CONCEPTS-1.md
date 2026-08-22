# Adaptive Circuit Systems — Circuit Lab Concepts

**Hedegreen Research**  
**2026.03.24**  
**Dennis Hedegreen**

---

## Working note

This document now belongs to the wider `Adaptive Circuit Systems` direction.

Current reading:

- `Circuit Lab` is the current bench
- `Module Builder` is the current composition layer
- `Brain Builder` is future
- `Elliot` is the organism/application line

The older `Neuron Lab` / `Elliot Lab` language should now be read as earlier naming around the
same bench direction, not as the whole program name.

## Core Idea

A visual workbench for designing, testing, and understanding neuron types using a water/flow metaphor. Each neuron is a physical container with inflow, outflow, capacity, and behavior. Connections between neurons are drawn channels with physical properties. The tool conceptually wants two views over the same running state. In the current product shell those views are named `Water Mode` (the intuitive visual layer) and `Build Mode` (the editing and parameter layer). Built for Codex-driven development. GitHub release under Hedegreen Research.

Current locked product reading:

- Circuit Lab is not the whole Elliot stack
- it is the bench for designing the internal structure behind a future Elliot unit
- terminal output belongs to `Output Basin`
- `Reservoir` is active storage and return inside the circuit
- explicit public interface ports are marked inside Lab before export
- `elliot-module/v1` is the first reusable module boundary
- Module Builder is the next layer up, but only as a black-box composition surface over exported modules

---

## Two Modes

**Water Mode:** Water, containers, channels. Visual. Intuitive. Read the circuit before the math.

**Build Mode:** Same system, same state. Builder controls, parameters, and debug density live here. Future equation overlays can stay inside Build rather than forcing a separate third mode.

Short decision:

- earlier concept language called these `Flow Mode` and `Math Mode`
- current product implementation ships them as `Water Mode` and `Build Mode`
- same scene, same state, no reset on toggle

Current architecture line:

- `scene` = Lab working document with internal graph
- `module` = exported reusable unit with explicit public interface
- `module instance` = black-box imported unit inside Builder

---

## Conservation Rule

Water cannot disappear. All output from any component must go somewhere: another neuron, a channel, or a designated terminal sink. Leaks are not lost: they are bottom outputs connected via pipes. This is a closed system.

Current shell decision:

- `Output Basin` is the present terminal sink
- `Reservoir` is active storage and may return water through explicit outgoing pipes

---

## Neuron Types

### 1. Bucket (Threshold Neuron)

A container. Water flows in from a configurable position on one side. Water flows out from a configurable position on the other side. Outflow only happens when water level reaches the outflow position.

**Parameters:**
- Container width
- Container height (total capacity)
- Inflow position (where on wall input enters)
- Outflow position (where on wall output exits = threshold)

**Math:**
- `ΔV = inflow − outflow`
- Fires when `V ≥ threshold` (outflow height as % of container)

**Known equivalent:** Step function / hard threshold neuron.

### 2. Leaky Bucket (Leaky Integrator)

Bucket with a hole in the bottom. Constantly drains. Signal must be sustained to maintain level. The bottom drain is a pipe: it connects to other components. Two outputs: threshold output (side) and leak output (bottom).

**Parameters:**
- All bucket parameters
- Leak rate (bottom hole size)

**Math:**
- `ΔV = inflow − leak − outflow`
- `V(t+1) = V(t) + I(t) − leak_rate`
- Fires only if `inflow > leak_rate` and `V ≥ threshold`

**Key design point:** Leak output is not waste. It is a secondary signal carried by a pipe. Other neurons can listen on it. One neuron, two output channels at different strengths.

**Known equivalent:** Integrate-and-fire neuron. Standard in computational neuroscience.

### 3. Double Bucket (Smoothing Neuron)

Not a special type. Two leaky buckets connected: upper bucket's bottom pipe feeds into lower bucket. Upper bucket's hole must be larger than lower bucket's hole, or lower bucket can never fill.

**Behavior:** Spiky input in, smooth signal out. Upper bucket rate-limits delivery. Cannot be overstimulated: max flow physically capped by upper hole size.

**Math:**
- Upper: `ΔV₁ = inflow − drain₁`
- Lower: `ΔV₂ = drain₁ − drain₂`
- Fires when `V₂ ≥ threshold`
- Requires: `drain₁ > drain₂`

**Known equivalent:** Cascaded leaky integrators. Low-pass filter.

### 4. Classic Syphon (Burst Neuron)

Container fills slowly. Nothing happens until water reaches the syphon bend. Then entire container dumps at once. Resets to zero.

**Parameters:**
- Container capacity
- Syphon trigger level (bend height)
- Inflow position

**Math:**
- `V(t+1) = V(t) + I(t)` while `V < trigger`
- When `V ≥ trigger`: `output = V`, then `V = 0`
- All-or-nothing discharge

**Known equivalent:** Integrate-and-fire with hard reset.

### 5. Syphon with Rest Level (Frequency Neuron)

Syphon that stops draining at a set rest level instead of zero. Retains partial volume after firing. Can fire again faster.

**Parameters:**
- All syphon parameters
- Rest level (where syphon stops draining)

**Math:**
- When `V ≥ trigger`: `output = V − rest_level`, then `V = rest_level`
- Time to next fire = `(trigger − rest_level) / inflow_rate`
- Higher input = higher firing frequency

**Known equivalent:** Rate coding. Biological neurons encode intensity as firing frequency.

### 6. Inverse Syphon (Absence Detector)

Starts full. Maintains level while input is present. When input stops, syphon triggers and dumps.

**Parameters:**
- Container capacity (starts at max)
- Drain trigger (threshold for dump)
- Output magnitude

**Math:**
- `V(t+1) = capacity` while `I(t) > 0`
- `V(t+1) = V(t) − drain_rate` while `I(t) = 0`
- When `V ≤ trigger`: `output = dump`, then `V = 0`

**Known equivalent:** Off-response neurons. Off-center retinal ganglion cells.

---

## Pipe Components

### 1. Channel (Line Rider)

Connections between neurons are drawn freehand. Water flows through them with physics. Shape determines signal properties.

**Properties from drawing:**
- Width = connection weight (narrow = weak, wide = strong)
- Length and route = delay (longer path = later arrival)
- Slope = speed (steep = fast, gentle = slow)
- Uphill section = natural gate (weak signals die halfway, strong signals pass)
- Curves = attenuation (sharp bend = momentum loss)

**Emergent behaviors:**
- Threshold without parameter: draw a hill, only strong signals clear it
- Feedback loop: draw a channel that curves back
- Branching: channel splits into two paths with different timing
- Merging: two channels pour into one neuron

**Known equivalents:** Delay lines, weighted connections. The physical drawing interface is novel.

### 2. Splitter

Pipe divides into two. Signal distributes by configurable ratio.

**Parameters:**
- Split ratio (for example `80/20`, `50/50`)

**Behavior:** One input, two outputs. Ratio determines weight distribution. With memristor property on branches, ratio can shift over time based on usage.

### 3. Merger

Two pipes combine into one. Signals add together.

**Behavior:** Two inputs, one output. Simple addition.

### 4. Sluse (Canal Lock Gate)

Two ports, one chamber between them. Each port opens and closes independently. Chamber adjusts water level to match the side being opened.

**States:**
- Both closed: no signal
- Left open only: chamber fills from left
- Right open only: chamber drains to right
- Both open: flow through

**Key properties:**
- Bidirectional: signal can flow either direction depending on which port opens
- Controlled by external signals (other neurons can open/close ports)
- Acts as comparator: balances levels between two sides before passing signal

**Known equivalent:** Gating mechanisms (LSTM gates, attention). Hebbian coincidence detection (both sides must be active).

### 5. Memristor Pipe (Erosion Channel)

A pipe that changes width based on usage. More water flow = wider pipe = easier flow next time. No flow = pipe silts up = narrower over time.

**Parameters:**
- `α` (erosion rate: how fast flow widens the pipe)
- `β` (silt rate: how fast pipe narrows without use)
- `W_min` (minimum width: pipe never fully closes)
- `W_max` (maximum width: pipe cannot grow infinitely)

**Math:**
- `W(t+1) = W(t) + α × flow(t)` — usage widens
- `W(t+1) = W(t) − β` — no usage narrows
- `W_min ≤ W ≤ W_max`

**Key property:** This is the learning mechanism. No separate training phase. The system adapts while running. Frequently used paths strengthen. Unused paths weaken.

**Known equivalent:** Synaptic plasticity. Hebbian learning. Biological memristors proposed by Leon Chua (1971).

Decision note:

- this remains a future pipe family
- current shell does not yet implement runtime `erosion_rate`, `silt_rate`, `W_min`, or `W_max`
- mode split and current pipe readability come first

---

## Component Summary

| Type | Category | Function |
|---|---|---|
| Bucket | Neuron | Threshold |
| Leaky Bucket | Neuron | Leaky integrator, dual output |
| Double Bucket | Combination | Smoothing / rate limiting |
| Classic Syphon | Neuron | Burst / all-or-nothing |
| Frequency Syphon | Neuron | Rate coding |
| Inverse Syphon | Neuron | Absence detection |
| Channel | Pipe | Signal transport with physics |
| Splitter | Pipe | Signal distribution |
| Merger | Pipe | Signal combination |
| Sluse | Pipe | Bidirectional gating |
| Memristor Pipe | Pipe | Adaptive learning |

---

## Future Idea Bank

These are future ideas, not current implementation scope.
They should stay recorded, but they should not pull the shell away from the current single-fluid bench too early.

### Reservoir Families

`Reservoir` should not necessarily stay one fixed thing forever.
Later versions may split this into several roles:

- `Storage Reservoir`: a holding basin that can later feed back into the system
- `Return Reservoir`: a slower recirculation source inside the circuit rather than a final sink
- `Ambient Reservoir`: a diffuse system-wide background source instead of one direct pipe
- `Bias Reservoir`: a persistent background store that nudges local circuits without acting like a visible pipe source

The point is that terminal output already belongs to `Output Basin`, so later reservoir families should mostly stay inside the circuit as memory, recharge, or atmosphere.

### Multi-Fluid Simulation

The first shell should stay single-fluid.
Later versions may test multiple fluids in the same bench.

This could allow:

- one fluid acting as direct signal
- another fluid acting as modulator or inhibitor
- a fluid making another fluid thicker or slower
- fluid mixtures changing leak, threshold, or pipe response

This is not only a graphics idea.
It is a way to explore richer state, gating, inhibition, and long-tail memory in the same physical metaphor.

If multi-fluid work ever starts, the system should define clearly:

- whether fluids mix or remain separable
- whether capacity is shared or fluid-specific
- whether pipes carry layered or blended state
- how the UI and logs keep multiple fluids legible

---

## Pipeline

`Neuron Lab` (GitHub, standalone tool) → `Elliot` (agent built from tested components) → `Elliot Playground` (community, train and share Elliots)

---

## Status

Concept phase. No code. This document is the current design specification for the water/flow direction.
