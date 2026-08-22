from __future__ import annotations

from dataclasses import asdict, dataclass
from statistics import fmean
from typing import Protocol, Sequence


class Neuron(Protocol):
    name: str

    def reset(self) -> None:
        ...

    def step(self, input_value: float) -> tuple[float, float]:
        ...


@dataclass(frozen=True)
class StepTrace:
    step: int
    input_value: float
    state_value: float
    output_value: float


@dataclass(frozen=True)
class RunResult:
    neuron_name: str
    input_name: str
    trace: list[StepTrace]
    summary: dict[str, float]

    def to_dict(self) -> dict[str, object]:
        return {
            "neuron_name": self.neuron_name,
            "input_name": self.input_name,
            "trace": [asdict(point) for point in self.trace],
            "summary": self.summary,
        }


@dataclass
class LabRunner:
    input_trace: Sequence[float]
    neuron: Neuron
    input_name: str = "pulse"

    def run(self) -> RunResult:
        self.neuron.reset()
        trace: list[StepTrace] = []

        for step, input_value in enumerate(self.input_trace):
            state_value, output_value = self.neuron.step(input_value)
            trace.append(
                StepTrace(
                    step=step,
                    input_value=input_value,
                    state_value=state_value,
                    output_value=output_value,
                )
            )

        return RunResult(
            neuron_name=self.neuron.name,
            input_name=self.input_name,
            trace=trace,
            summary=_build_summary(trace),
        )


def _build_summary(trace: Sequence[StepTrace]) -> dict[str, float]:
    if not trace:
        raise ValueError("trace cannot be empty")

    input_values = [point.input_value for point in trace]
    state_values = [point.state_value for point in trace]
    output_values = [point.output_value for point in trace]

    total_input = sum(input_values)
    total_output = sum(output_values)

    return {
        "steps": float(len(trace)),
        "total_input": total_input,
        "total_output": total_output,
        "peak_input": max(input_values),
        "peak_state": max(state_values),
        "peak_output": max(output_values),
        "mean_output": fmean(output_values),
        "non_zero_output_steps": float(sum(1 for value in output_values if value != 0.0)),
        "output_input_ratio": (total_output / total_input) if total_input else 0.0,
    }
