# Elliot Lab

Elliot Lab is a side project to `elliot/`.

The purpose is not to replace Elliot.
The purpose is to isolate and test neuron behavior in a much smaller environment before any promising mechanism is moved into the embodied Elliot line.

Status:
- concept exists
- bench rules exist
- first runner not built yet

## Core idea

Keep the lab brutally small:

- one input
- one neuron or internal mechanism
- one output

That makes it easier to test:

- threshold behavior
- persistence
- leakage or decay
- accumulation
- hysteresis
- oscillation
- noise response
- novel neuron ideas such as `syphon` and `bucket`

## Relationship to Elliot

- `elliot/` stays the embodied agent and public benchmark line
- `elliot-lab/` becomes the bench for controlled neuron experiments
- `hedegreenresearch/` may publish the public notes that come out of the work

The rule is simple:

If a neuron idea cannot show something interesting in the lab, it should not be promoted into Elliot yet.

## Direction

The first version of Elliot Lab should stay minimal.

No world.
No grid.
No food.
No pain.
No multiple senses.

Just controlled signal tests and comparable neuron responses.

The first implementation should prove:
- one input trace
- one component under test
- one output trace
- a readable internal state
- comparable runs across neuron types

The first implementation should not try to prove:
- full world simulation
- rich graphics
- open-ended sandboxing
- every water metaphor feature at once

## Documents

- `SPEC.md` for the minimal bench rules
- `NEURON-LAB-CONCEPTS-1.md` for the larger water/flow design direction

## Repository shape

Right now this repository is intentionally small.

It should stay that way until the first runner exists.

Expected near-term shape:
- `README.md` for project entry
- `SPEC.md` for the hard minimal bench
- `NEURON-LAB-CONCEPTS-1.md` for the larger visual direction
- `src/` later, when code actually starts
- `examples/` or `results/` later, only if the first runner creates something worth keeping

## Build rule

Conceptual ambition is allowed to be large.

Implementation ambition should stay small until the bench is real.
