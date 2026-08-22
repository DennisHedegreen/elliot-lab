# Adaptive Circuit Systems — Circuit Lab Status

Current date context: `2026-05-16`

This file is the quick truth layer for the current `Circuit Lab` repo surface.

It is not a roadmap and not a manifesto.
It exists so the repo can say clearly what is real now, what is early, and what is still parked.

## Real now

- the browser-based Circuit Lab shell exists and runs locally
- `Water Mode` and `Build Mode` both exist over the same running scene
- scenes can be saved and reopened
- the current primitive set includes `Source`, `Pipe`, `Bucket`, `Leaky Bucket`, `Siphon`,
  `Output Basin`, and `Reservoir`
- the runtime tracks conservation, burst accounting, and event/log state
- Build Mode can expose explicit public interface ports
- `elliot-module/v1` exists as a first export/import format
- `builder/` exists as an early black-box composition layer now read as `Module Builder`
- Builder now marks routed vs open public ports so the black-box boundary is visible while composing
- Builder blocks Lab handoff when a composition has missing modules, stale ports, or missing bindings
- `scenes/multi-io-threshold-router.scene.json` exists as the first explicit multi-input/multi-output boundary test scene

## Early but real

- Module Builder can import modules and run compositions back through the Lab motor
- Auto Interface can infer simple harness boundaries
- multiple public inputs and outputs are supported in export v1, but the rule is still narrow and
  intentionally capped
- open Builder ports still expand to Lab harness components on run, so the water runtime remains the execution layer
- the older Python runner still exists as a small controlled sketch beside the browser shell

## Not claimed yet

- finished product maturity
- public release stability
- final interface vocabulary
- stable hardware mapping
- wider multi-fluid or adaptive-pipe systems
- large-scale Brain Builder or Elliot composition beyond the current `Circuit Lab -> Module Builder` boundary
- physical backend compilation
- AI-designed architectures inside the program constraints

## Current hard rule

The repository should read as a real Circuit Lab workbench inside a larger program.

Not vapor.
Not a finished CAD system.
Not a polished public product.

## Immediate next work

1. Run the multi-input/multi-output example through Builder with two or more module instances.
2. Test Module Builder route/port validation around missing modules, stale ports, and duplicate routes.
3. Keep docs and README aligned with the actual runtime instead of the larger concept horizon.
4. Use the new `Adaptive Circuit Systems` umbrella and research spine without pretending the rename or the long-range pipeline is already complete.
