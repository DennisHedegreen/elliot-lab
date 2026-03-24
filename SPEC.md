# Elliot Lab Spec

Project title: Elliot Lab

Purpose:
Create a minimal test bench for neuron and micro-circuit behavior outside the full Elliot world.

## Core setup

Base structure:

- one input signal
- one neuron or mechanism under test
- one output signal

Optional later extension:

- one hidden intermediate state if needed by the neuron type

## First test goals

The first lab versions should answer questions like:

1. What does this neuron do under repeated input?
2. Does it accumulate, leak, spike, saturate, or oscillate?
3. How stable is it under noise?
4. Does it preserve useful state over time?
5. Does it produce behavior that is distinct enough to justify later use in Elliot?

## Candidate neuron types

- baseline weighted unit
- memristor-like unit
- bucket neuron
- syphon neuron
- any later custom neuron that shows meaningfully different dynamics

## Output standard

Every neuron test should be comparable across runs.

Minimum outputs should include:

- input trace
- internal state trace
- output trace
- simple summary metrics

## Promotion rule

Elliot Lab exists to reduce confusion.

A neuron idea should only move into `elliot/` if:

- it shows a clear and repeatable behavior in the lab
- that behavior is different from the baseline
- there is a concrete reason to believe it matters in an embodied setting

## Adjacent concept layer

This spec defines the brutally small bench.

The larger visual and water-based concept direction lives in:

- `NEURON-LAB-CONCEPTS-1.md`

That concept document is intentionally wider than the first implementation.
The first code should still start small.
