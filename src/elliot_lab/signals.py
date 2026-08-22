from __future__ import annotations


def build_pulse_trace(
    *,
    length: int = 16,
    pulse_start: int = 4,
    pulse_stop: int = 9,
    amplitude: float = 1.0,
    baseline: float = 0.0,
) -> list[float]:
    """Build a simple rectangular pulse for the first runner."""

    if length <= 0:
        raise ValueError("length must be positive")
    if not 0 <= pulse_start <= pulse_stop <= length:
        raise ValueError("pulse_start/pulse_stop must stay inside the trace length")

    trace: list[float] = []
    for step in range(length):
        if pulse_start <= step < pulse_stop:
            trace.append(amplitude)
        else:
            trace.append(baseline)
    return trace
