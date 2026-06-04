"""Managed GenericAgent code_run subprocess behavior tests."""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

import pytest

_MANAGED_GA_CODE = Path(__file__).resolve().parents[2] / "managed-ga" / "code"
if str(_MANAGED_GA_CODE) not in sys.path:
    sys.path.insert(0, str(_MANAGED_GA_CODE))

_PREVIOUS_DONT_WRITE_BYTECODE = sys.dont_write_bytecode
sys.dont_write_bytecode = True
_GA_SPEC = importlib.util.spec_from_file_location(
    "managed_ga_code_ga", _MANAGED_GA_CODE / "ga.py"
)
assert _GA_SPEC is not None
assert _GA_SPEC.loader is not None
managed_ga = importlib.util.module_from_spec(_GA_SPEC)
try:
    _GA_SPEC.loader.exec_module(managed_ga)
finally:
    sys.dont_write_bytecode = _PREVIOUS_DONT_WRITE_BYTECODE
ga = cast(Any, managed_ga)


class _EmptyStdout:
    def readline(self) -> bytes:
        return b""

    def close(self) -> None:
        pass


class _FakeProcess:
    stdout = _EmptyStdout()

    def poll(self) -> int:
        return 0

    def kill(self) -> None:
        pass


def _drain(gen: Any) -> Any:
    while True:
        try:
            next(gen)
        except StopIteration as exc:
            return exc.value


def test_code_run_closes_child_stdin(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    popen_calls: list[dict[str, Any]] = []

    def fake_popen(*_args: Any, **kwargs: Any) -> _FakeProcess:
        popen_calls.append(kwargs)
        return _FakeProcess()

    monkeypatch.setattr(ga.subprocess, "Popen", fake_popen)

    result = _drain(
        ga.code_run(
            "print('ok')",
            code_type="python",
            timeout=1,
            cwd=str(tmp_path),
        )
    )

    assert result["status"] == "success"
    assert popen_calls
    assert popen_calls[0]["stdin"] is subprocess.DEVNULL
