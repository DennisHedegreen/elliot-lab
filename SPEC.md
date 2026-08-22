# Circuit Lab V1 Spec

This file is the hard implementation-side spec for the current bench.

It is not the same thing as the repo front.
For a quicker public-facing state read, start with `README.md` and `STATUS.md`.

Project title: Circuit Lab

Purpose:
Create a brutally small graphical browser workbench for primitive and micro-circuit behavior inside the wider `Adaptive Circuit Systems` direction and outside the full Elliot world.

The product is not a terminal trace viewer.
The product is a visual bench with buckets, pipes, visible water, and a simulation motor behind it.

Current architecture boundary:

- Circuit Lab designs the inside of a future reusable unit
- `elliot-module/v1` freezes one Lab structure into a reusable module with explicit public ports
- Module Builder imports those exported modules as black boxes
- any future Brain Builder comes after Module Builder, not before
- larger Elliot composition comes after those boundaries, not before

Working naming model from here:

- `scene`: a Lab working document
- `primitive`: a base behavior type
- `component`: one primitive instance inside a scene
- `route`: an internal connection between components
- `internal port`: a port on a component inside Lab
- `interface port`: an explicitly exposed public input/output on an exported module
- `module`: an exported reusable unit
- `module instance`: one imported module placed in Builder

## Product form

Circuit Lab v1 should be:

- browser-based
- graphical
- understandable at a glance
- physically legible
- more like a water instrument than a generic data card grid
- small enough to prove one closed system honestly

The first proof is not a big sandbox.
The first proof is one simple scene where water visibly moves through the system and does not disappear.

## Mode model

The shell should now be understood as two top-level views over the same running scene:

- `Water Mode`
- `Build Mode`

Rules:

- `Water Mode` is the default
- `Water Mode` is read/observe only
- `Build Mode` owns editing, tuning, builder controls, and math/debug density
- switching mode must not reset water, tick, selection, or burst history
- mode is a local UI preference only, not part of saved scene files

## Module boundary

The shell now needs a second boundary above scene persistence:

- a Lab scene may contain many internal components and routes
- only explicitly exposed interface ports are public
- exported modules may have multiple public inputs and multiple public outputs
- internal routes stay internal during export
- Builder should only see module instances and public interface ports, not raw internal graph details

The first technical expression of that boundary is:

- `module_interface_draft` inside Lab scenes
- export v1 limited to `3` public inputs and `3` public outputs
- `elliot-module/v1` as the first export format
- exported modules stripping `Source`, `Output Basin`, and harness routes so public interface is the real external boundary
- Module Builder compositions expanding back into a namespaced Lab scene so there is still only one simulation engine
- Module Builder must show whether each public port is routed or open; open ports are expanded into Lab harness components when the composition is run

`elliot-module/v1` should contain at least:

- module identity: `id`, `name`, `version`
- explicit public `inputs[]` and `outputs[]`
- bindings from each public interface port to one internal component port
- internal graph data: `components[]` and `routes[]`
- semantics metadata describing primitive roles without renaming the current runtime motor

## Hard rule

No water may simply vanish.

At every tick, water must always be in one of these places:

- source
- pipe
- bucket
- output basin
- reservoir

That means leak is not loss.
If a component leaks, that leak must go somewhere explicit.

## First screen

The v1 screen should have:

- a central canvas for movable buckets, pipes, and basins
- a small component palette
- a right-side inspector for selected object parameters
- bottom transport controls: `play`, `pause`, `step`, `reset`
- a compact status area showing total water, current tick, and conservation state

UI matters here.
The page should feel like a real workbench, not like a generic node editor or a debug console with shapes pasted on top.

## V1 component set

The first browser bench should support:

- `Source`
- `Pipe`
- `Bucket`
- `Leaky Bucket`
- `Siphon`
- `Output Basin`
- `Reservoir`

The first real scene should be:

`Source -> Pipe -> Bucket -> Pipe -> Output Basin`

`Reservoir` exists in the model from the start so later leak paths have somewhere explicit to go.
In this milestone, `Output Basin` is the only terminal sink.
It should behave as an effectively infinite sink in runtime, not as a small capped bucket that can block the rest of the circuit.
Current `Reservoir` should now be read as active storage inside the circuit that can later return through an explicit outgoing pipe.

## Bucket model

The first bucket should behave like a threshold container.

Required properties:

- `width`
- `height`
- `capacity`
- `current_level`
- `outlet_height`
- `outlet_size`

Rules:

- incoming water raises `current_level`
- outgoing water only starts when `current_level >= outlet_height`
- outflow per tick is limited by `outlet_size`
- water level must stay visually readable on screen

Later extensions may add:

- inlet position
- outlet position
- more complex outlet geometry

## Leaky bucket model

The first leaky bucket should stay close to the threshold bucket, but with a simple bottom leak.

Required properties:

- `width`
- `height`
- `capacity`
- `current_level`
- `outlet_height`
- `outlet_size`
- `leak_rate`
- `leak_target_id`

Rules:

- the normal outlet still behaves like a threshold bucket
- the leak removes water every tick from the water the component already held
- leak water must go to an explicit `Reservoir`
- the leak path should be visible on the canvas as a distinct leak/storage connection, not only as a hidden inspector field
- leak water must remain fully accounted for in the system

## Reservoir model

The first active reservoir should behave like a storage vessel that can later return water through ordinary pipes.

Required properties:

- `width`
- `height`
- `capacity`
- `current_level`
- `return_rate`

Rules:

- incoming water raises `current_level`
- reservoir water remains part of `In Circuit`
- if the reservoir has no outgoing pipes, it simply stores water
- if `current_level > 0` and a valid outgoing pipe has room, the reservoir may emit up to `return_rate` per tick
- reservoir return uses the same pipe capacity, transit, and backpressure rules as other outputs
- the current milestone keeps reservoir return always-open rather than thresholded

## Output basin model

`Output Basin` is the terminal sink for the local circuit.

Rules:

- it can receive ordinary pipes
- it cannot emit
- it should not create downstream blockage just because its visual shell shows a small nominal capacity
- water here no longer counts toward `In Circuit`
- all water here counts toward `Out`

## Siphon model

The first siphon should act like a holding vessel with a trigger point and a dump phase.

Required properties:

- `width`
- `height`
- `capacity`
- `current_level`
- `trigger_level`
- `is_triggered`

Rules:

- incoming water raises `current_level`
- the siphon stays closed while `current_level < trigger_level`
- once `current_level >= trigger_level`, the siphon enters a triggered dump state
- while triggered, it should keep pushing water through its normal outlet until empty or blocked by downstream pipe capacity
- once emptied, the siphon resets and can be primed again by later bursts
- siphon state should be visible in the lab log so trigger and reset moments are not hidden

## Pipe model

Pipes are not just decorative lines.
They are stateful carriers of water in transit.

Required properties:

- `length`
- `width`
- `max_flow_per_tick`
- `transit_ticks`
- `in_flight_water`

Rules:

- pipe `width` controls how much water can move through it per tick
- pipe `length` controls travel time or transit distance
- water inside a pipe must remain part of the system state while traveling
- the first version should stay deterministic and simple rather than physically fancy
- pipe width, fill, and pressure should remain visually legible enough on canvas that a wide-fast pipe and a narrow-slow pipe can be compared without reading raw inspector values first

Later extensions may add:

- slope
- bends
- splitters
- mergers
- memristor behavior

Adaptive or rusting pipes are not part of this milestone yet.
The next pipe-specific spec may define:

- `erosion_rate`
- `silt_rate`
- `width_min`
- `width_max`
- usage-based widening
- inactivity-based narrowing

## Parameter controls

These parameters should be treated as first-class from the beginning, not as afterthoughts:

- pipe width
- pipe length
- bucket width
- bucket height
- bucket outlet height
- bucket outlet size

The first graphical build does not need full direct-manipulation handles for all of them.
But the inspector should be designed so these controls can land there early without forcing a redesign.

Short version:

- UI first
- inspector matters
- geometry and hole sizes must be adjustable later

## Simulation loop

V1 should use a clear tick order:

1. Source emits water for the current tick.
2. New water enters the first connected pipe or input port.
3. Pipes advance in-flight water toward their destination.
4. Buckets decide outflow from the water they already held before new arrivals land.
5. Outflow enters outgoing pipes or basins.
6. Incoming deliveries land in buckets, basins, and reservoirs at the end of the tick.
7. Total water is checked against the conservation rule.

The simulation should be deterministic and inspectable.

## Output standard

Even though the product is graphical, v1 still needs machine-readable state.

Minimum readable state should include:

- current tick
- total water in system
- water by component
- water in transit by pipe
- bucket level
- reservoir total
- output basin total
- conservation pass/fail
- burst-oriented event history grouped clearly enough that one burst can be read as a bounded causal sequence

In `Water Mode`, that event history may sit behind a compact `Story` entrypoint instead of staying open by default.

## State model

The shell should now distinguish between:

- `Settling`: water can still move honestly through the scene
- `Stable`: no further motion is possible and nothing is trapped behind blocked downstream capacity
- `Blocked`: motion has stopped, but at least one pipe or output-capable component is still pinned by downstream capacity or backpressure

## Immediate next work

The next implementation pass should focus on:

1. hardening Module Builder v1 as a black-box composition layer for imported Lab modules
2. keeping public interface exposure and internal route visibility clear in Build Mode without pulling export language into Water Mode
3. beginning the first substrate-neutral semantics pass in docs and export vocabulary without rewriting the current water-first runtime

## V1 persistence

Circuit Lab v1 should be able to save and reopen a small scene file.

This is not the same as defining the full future `Elliot` format.
It is only a lab-scene persistence layer so work is not lost between sessions.

The first persistence target is:

- save current scene
- reopen saved scene later
- keep component positions
- keep component parameters
- keep connections between components

The scene file should stay:

- small
- human-readable
- versioned
- specific to Circuit Lab

The scene file should contain at least:

- `format_version`
- `scene_id`
- `title`
- `components`
- `connections`
- optional view metadata such as canvas positions

Each saved component should carry enough data to reopen the scene faithfully:

- `id`
- `type`
- geometry or position
- current editable parameters

Each saved connection should carry:

- `id`
- `from_component`
- `from_port`
- `to_component`
- `to_port`
- connection parameters such as pipe width and length

Hard limit for now:

- do not define the full future Elliot save format yet
- do not define composite neuron packaging yet
- do not overfit the file to imagined later network needs

Short rule:

V1 saves scenes.
Later versions may save reusable modules.
Much later, Elliot can get its own format.

## Non-goals for v1

Do not try to prove all of this in the first build:

- freehand fluid simulation
- polished cinematic water effects
- many neuron families at once
- multiple reservoir families with different system roles
- multi-fluid interaction where one fluid changes another fluid's behavior
- full Elliot world behavior
- giant sandboxing tools
- memristor pipes
- splitters and mergers
- advanced siphon mechanics
- full future Elliot serialization

## Success condition

Circuit Lab v1 is successful when:

- a user can place or load one simple closed scene
- the scene visibly shows water moving through pipes and into a bucket
- the bucket visibly reaches threshold and sends water onward
- no water disappears from the system
- a saved scene can be reopened later without losing the layout and core parameters
- the UI is clear enough that pipe size, pipe length, bucket size, and outlet size make intuitive sense as later controls

## Adjacent concept layer

This spec defines the brutally small browser bench.

The larger visual and water-based concept direction lives in:

- `NEURON-LAB-CONCEPTS-1.md`

That concept document is intentionally wider than the first implementation.
The first code should still start small.
