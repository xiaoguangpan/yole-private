from __future__ import annotations

import importlib.util
import sys
from collections.abc import Generator
from pathlib import Path
from typing import Any, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LLMCORE_PATH = REPO_ROOT / "managed-ga" / "code" / "llmcore.py"


def load_llmcore() -> Any:
    spec = importlib.util.spec_from_file_location("managed_ga_llmcore_for_tests", LLMCORE_PATH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    assert spec.loader is not None
    previous_dont_write_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous_dont_write_bytecode
    return cast(Any, module)


class _Response:
    raw = "ok"
    tool_calls: list[Any] = []


class _Backend:
    name = "fake"
    system = ""

    def __init__(self, chunks_by_model: dict[str, list[str | BaseException]]) -> None:
        self.chunks_by_model = chunks_by_model
        self.model = "bad"
        self.history = ["history"]

    def ask(self, _merged: dict[str, Any]) -> Generator[str, None, _Response]:
        chunks = list(self.chunks_by_model[self.model])

        def _gen() -> Generator[str, None, _Response]:
            for chunk in chunks:
                if isinstance(chunk, BaseException):
                    raise chunk
                yield chunk
            return _Response()

        return _gen()


def drain(generator: Generator[Any, None, Any]) -> tuple[list[Any], Any]:
    chunks: list[Any] = []
    while True:
        try:
            chunks.append(next(generator))
        except StopIteration as stop:
            return chunks, stop.value


def route_with(*models: str) -> dict[str, Any]:
    return {
        "conversation": list(models),
        "models": {model: {"enabled": True, "inputModalities": ["text"]} for model in models},
    }


def test_route_fallbacks_when_candidate_fails_before_visible_output(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("YOLE_GA_STATE_ROOT", str(tmp_path))
    llmcore = load_llmcore()
    backend = _Backend({"bad": [TimeoutError("timed out")], "good": ["ok"]})
    client = llmcore.NativeToolClient(backend)

    chunks, response = drain(
        client._chat_with_yole_route({"content": []}, route_with("bad", "good"))
    )

    assert chunks == ["ok"]
    assert response is not None
    assert backend.model == "good"


def test_route_does_not_fallback_after_visible_output(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("YOLE_GA_STATE_ROOT", str(tmp_path))
    llmcore = load_llmcore()
    backend = _Backend({"bad": ["partial", TimeoutError("timed out")], "good": ["ok"]})
    client = llmcore.NativeToolClient(backend)

    chunks, response = drain(
        client._chat_with_yole_route({"content": []}, route_with("bad", "good"))
    )

    assert chunks == ["partial", "\n!!!Error: timed out"]
    assert response is None
    assert backend.model == "bad"


def test_normal_text_with_number_five_is_not_retryable_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("YOLE_GA_STATE_ROOT", str(tmp_path))
    llmcore = load_llmcore()

    assert not llmcore._is_retryable_model_error("Here are 5 ways to inspect the log.")
    assert llmcore._is_retryable_model_error("HTTP 503 upstream unavailable")
