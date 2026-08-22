from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from elliot_lab import BaselineNeuron, LabRunner, build_pulse_trace


class LabRunnerTests(unittest.TestCase):
    def test_pulse_trace_stays_inside_requested_window(self) -> None:
        trace = build_pulse_trace(length=8, pulse_start=2, pulse_stop=5, amplitude=3.0)

        self.assertEqual(trace, [0.0, 0.0, 3.0, 3.0, 3.0, 0.0, 0.0, 0.0])

    def test_runner_returns_comparable_traces_and_summary(self) -> None:
        input_trace = build_pulse_trace(length=6, pulse_start=1, pulse_stop=4, amplitude=2.0)
        neuron = BaselineNeuron(weight=0.5, bias=0.0, activation="identity")

        result = LabRunner(input_trace=input_trace, neuron=neuron).run()

        self.assertEqual(result.neuron_name, "baseline")
        self.assertEqual([point.input_value for point in result.trace], [0.0, 2.0, 2.0, 2.0, 0.0, 0.0])
        self.assertEqual([point.state_value for point in result.trace], [0.0, 1.0, 1.0, 1.0, 0.0, 0.0])
        self.assertEqual([point.output_value for point in result.trace], [0.0, 1.0, 1.0, 1.0, 0.0, 0.0])
        self.assertEqual(result.summary["steps"], 6.0)
        self.assertEqual(result.summary["total_input"], 6.0)
        self.assertEqual(result.summary["total_output"], 3.0)
        self.assertEqual(result.summary["non_zero_output_steps"], 3.0)
        self.assertEqual(result.summary["output_input_ratio"], 0.5)


if __name__ == "__main__":
    unittest.main()
