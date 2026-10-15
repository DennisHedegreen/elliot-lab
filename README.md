# Adaptive Circuit Systems — Circuit Lab

`elliot-lab/` is currently the `Circuit Lab` bench inside the broader `Adaptive Circuit Systems`
program.

It exists so new neuron and micro-circuit ideas can be tested in isolation before they are moved
into the embodied Elliot line.

This repository is not a finished public product yet.
It is a live local workbench with a real browser shell, a first export format, and an early Builder
layer.

If you want the shortest current truth before reading further, start with `STATUS.md`.
The broader program architecture is maintained in the Hedegreen Research workspace; the sibling `_system` path is not part of this standalone public repository.

## Public Demo and Workbench

The related [Circuit Lab demo in TID](https://hedegreenresearch.com/tid/circuit-lab-demo/) is a smaller public sketch, not this full local workbench or a hosted Streamlit edition. Use the setup and status instructions here for the workbench.

## What It Is

Circuit Lab is a small hydraulic workbench for thinking about primitive and microcircuit behavior
through visible flow.

The current architecture line is:

- `Circuit Lab` designs an internal flow structure
- `elliot-module/v1` freezes that structure into a reusable module with explicit public ports
- `Module Builder` imports those modules as black boxes and composes them
- a later `Brain Builder` belongs above that layer, not inside current runtime claims
- only after that should larger Elliot composition happen

The purpose is not to replace `elliot/`.
The purpose is to make internal mechanisms legible before they disappear into a larger agent.

Working umbrella:

- `Adaptive Circuit Systems` is the broader technical program
- `Circuit Lab` is the current bench
- `Module Builder` is the current composition layer
- `Brain Builder` is future, not current scope
- `Elliot` is the organism/application line

## Current State

What already exists:

- a browser-based Circuit Lab shell
- `Water Mode` and `Build Mode` over the same running scene
- scene save/load
- threshold bucket, leaky bucket, siphon, reservoir, pipe, source, and output basin primitives
- conservation tracking, burst accounting, and a readable event log
- explicit public interface marking in Build Mode
- `elliot-module/v1` export/import
- a separate early `builder/` app for black-box module composition
- Builder readiness checks that block broken Lab handoffs
- a small set of example scenes
- a first multi-input/multi-output scene for checking public module boundaries

What is true but should not be oversold:

- Module Builder is real, but still early
- export works, but the format is still intentionally narrow
- multi-input/multi-output round-trips have an example contract, not a broad design system yet
- the shell is useful, but it is still a workbench, not a polished design tool
- the repo contains both the current browser direction and some earlier runner/sketch history

What is not claimed yet:

- finished product status
- stable hardware mapping
- final naming beyond the current Circuit Lab / Module Builder / Brain Builder language
- wider multi-fluid or adaptive-pipe systems
- physical backend mapping or compilation

## Relationship To Elliot

- `elliot/` stays the embodied organism and benchmark line
- `elliot-lab/` is currently the controlled Circuit Lab bench
- the broader umbrella is `Adaptive Circuit Systems`, not `Elliot`
- ideas should prove themselves here before they are promoted upward

Short rule:

If a mechanism cannot show something interesting in the lab, it should not move into Elliot yet.

## How To Read The Current Runtime

Core working terms:

- `scene`: a Lab working document
- `primitive`: a base behavior type such as bucket, leaky bucket, siphon, or reservoir
- `component`: one primitive instance inside a scene
- `route`: an internal connection between components
- `internal port`: a port on a component inside Lab
- `interface port`: an explicitly exposed public input/output on an exported module
- `module`: an exported reusable unit
- `module instance`: one imported module placed in Module Builder

Important current boundary:

- `Source` and `Output Basin` are Lab harness, not public module interface
- only explicitly exposed public ports belong to exported modules
- Module Builder should see modules and their interface, not raw internal scene structure

## Run Locally

Serve the repo with a simple local server:

```bash
python3 -m http.server 8765 --directory "/home/dennis-hedegreen/hedegreen research/elliot-lab"
```

Then open:

```text
http://127.0.0.1:8765/
```

Module Builder lives here:

```text
http://127.0.0.1:8765/builder/
```

If `8765` is busy, choose another free port.

## Files

- `README.md` repo front and current status
- `STATUS.md` quick truth layer for current maturity
- `SPEC.md` v1 rules and hard boundaries
- `NEURON-LAB-CONCEPTS-1.md` wider concept direction
- `../_system/architecture/ADAPTIVE-CIRCUIT-SYSTEMS-PROGRAM.md` broader umbrella structure
- `index.html`, `app.js`, `styles.css` Lab shell
- `builder/` early Module Builder composition layer
- `scenes/` example scene files
- `run.py`, `src/elliot_lab/`, `tests/` earlier runner/sketch layer

## Example Scenes

- `scenes/threshold-bucket.scene.json`
- `scenes/classic-leaky-bucket.scene.json`
- `scenes/classic-reservoir-return.scene.json`
- `scenes/classic-siphon.scene.json`
- `scenes/siphon-wide-fast.scene.json`
- `scenes/siphon-narrow-slow.scene.json`
- `scenes/multi-io-threshold-router.scene.json`

## Next Practical Work

The next honest steps are:

1. Use `multi-io-threshold-router.scene.json` to pressure-test Builder run expansion with two or more module instances.
2. Test the readiness panel against missing modules, stale ports, and duplicate route files.
3. Keep the public module boundary readable in both Lab and Builder.
4. Continue the first substrate-neutral semantics pass without pretending the water runtime is gone.
5. Build the missing research spine in `data/adaptive-circuit-systems/` and `editorial/rooms/adaptive-circuit-systems/` without claiming the runtime already solved physical translation.

## Earlier Runner Layer

The first Python runner is intentionally narrow:

- one built-in pulse input trace
- one runnable neuron type: baseline
- one output trace
- one internal state trace
- one summary block with comparable metrics

Run it with:

```bash
python3 run.py
```

Or emit JSON for later comparison:

```bash
python3 run.py --json
```

Current CLI knobs:

- `--length`
- `--pulse-start`
- `--pulse-stop`
- `--amplitude`
- `--baseline`
- `--weight`
- `--bias`
- `--activation`

## Build Rule

Conceptual ambition is allowed to be large.

Implementation ambition should stay small until the bench is real.
