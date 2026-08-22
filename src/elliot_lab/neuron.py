from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class BaselineNeuron:
    """Smallest useful neuron: weighted input plus optional bias."""

    weight: float = 1.0
    bias: float = 0.0
    activation: str = "identity"
    _last_state: float = field(default=0.0, init=False, repr=False)

    @property
    def name(self) -> str:
        return "baseline"

    def reset(self) -> None:
        self._last_state = 0.0

    def step(self, input_value: float) -> tuple[float, float]:
        raw_state = (input_value * self.weight) + self.bias
        output_value = self._activate(raw_state)
        self._last_state = raw_state
        return raw_state, output_value

    def _activate(self, value: float) -> float:
        if self.activation == "identity":
            return value
        if self.activation == "relu":
            return max(0.0, value)
        raise ValueError(f"Unsupported activation: {self.activation}")
