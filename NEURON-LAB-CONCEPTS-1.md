# Neuron Lab — Concept Document

**Hedegreen Research**  
**2026.03.24**  
**Dennis Hedegreen**

---

## Core Idea

A visual workbench for designing, testing, and understanding neuron types using a water/flow metaphor. Each neuron is a physical container with inflow, outflow, capacity, and behavior. Connections between neurons are drawn channels with physical properties. The tool has two modes: Flow Mode (visual water simulation) and Math Mode (live equations and parameters behind the same system). Built for Codex-driven development. GitHub release under Hedegreen Research.

---

## Two Modes

**Flow Mode:** Water, containers, channels. Visual. Intuitive. Build and observe.

**Math Mode:** Same system, same state. Water visuals replaced by live equations, parameters, derivatives. Every component shows its mathematical equivalent updating in real time. Toggle between modes without losing state.

---

## Conservation Rule

Water cannot disappear. All output from any component must go somewhere: another neuron, a channel, or a designated drain. Leaks are not lost: they are bottom outputs connected via pipes. This is a closed system.

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

## Pipeline

`Neuron Lab` (GitHub, standalone tool) → `Elliot` (agent built from tested components) → `Elliot Playground` (community, train and share Elliots)

---

## Status

Concept phase. No code. This document is the current design specification for the water/flow direction.
