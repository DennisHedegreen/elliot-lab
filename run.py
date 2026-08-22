#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from elliot_lab import BaselineNeuron, LabRunner, build_pulse_trace


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the first Circuit Lab bench: 1 input, 1 neuron, 1 output."
    )
    parser.add_argument("--length", type=int, default=16)
    parser.add_argument("--pulse-start", type=int, default=4)
    parser.add_argument("--pulse-stop", type=int, default=9)
    parser.add_argument("--amplitude", type=float, default=1.0)
    parser.add_argument("--baseline", type=float, default=0.0)
    parser.add_argument("--weight", type=float, default=1.0)
    parser.add_argument("--bias", type=float, default=0.0)
    parser.add_argument("--activation", choices=("identity", "relu"), default="identity")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the run result as JSON instead of a text table.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    input_trace = build_pulse_trace(
        length=args.length,
        pulse_start=args.pulse_start,
        pulse_stop=args.pulse_stop,
        amplitude=args.amplitude,
        baseline=args.baseline,
    )
    neuron = BaselineNeuron(
        weight=args.weight,
        bias=args.bias,
        activation=args.activation,
    )
    result = LabRunner(input_trace=input_trace, neuron=neuron).run()

    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
        return 0

    print("Circuit Lab minimal runner")
    print(f"input={result.input_name} neuron={result.neuron_name}")
    print("")
    print("step  input   state   output")
    for point in result.trace:
        print(
            f"{point.step:>4}  "
            f"{point.input_value:>5.2f}  "
            f"{point.state_value:>5.2f}  "
            f"{point.output_value:>6.2f}"
        )

    print("")
    print("summary")
    for key, value in result.summary.items():
        print(f"- {key}: {value:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
