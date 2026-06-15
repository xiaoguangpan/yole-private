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
    model = "deepseek-v4-pro"
    history: list[Any] = []

    def __init__(
        self,
        chunks: list[str | BaseException],
        input_modalities: set[str] | None = None,
    ) -> None:
        self.chunks = chunks
        self.input_modalities = input_modalities or set()
        self.seen: list[dict[str, Any]] = []

    def ask(self, merged: dict[str, Any]) -> Generator[str, None, _Response]:
        self.seen.append(merged)
        chunks = list(self.chunks)

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


def image_message() -> list[dict[str, Any]]:
    return [
        {"type": "text", "text": "what is in this image?"},
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": "abc123",
            },
        },
    ]


def test_model_error_is_returned_without_cross_model_fallback(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("YOLE_GA_STATE_ROOT", str(tmp_path))
    llmcore = load_llmcore()
    backend = _Backend([TimeoutError("timed out")])
    client = llmcore.NativeToolClient(backend)

    chunks, response = drain(client.chat([{"role": "user", "content": "hello"}]))

    assert chunks == ["\n!!!Error: timed out"]
    assert response is None
    assert backend.model == "deepseek-v4-pro"


def test_text_only_model_uses_fixed_vision_summary_for_images(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("YOLE_GA_STATE_ROOT", str(tmp_path))
    llmcore = load_llmcore()
    monkeypatch.setattr(llmcore, "_vision_summary_with_model", lambda _backend, _content: "image summary")
    backend = _Backend(["ok"], input_modalities={"text"})
    client = llmcore.NativeToolClient(backend)

    chunks, response = drain(client.chat([{"role": "user", "content": image_message()}]))

    assert chunks == ["ok"]
    assert response is not None
    sent_content = backend.seen[0]["content"]
    assert all(block.get("type") != "image" for block in sent_content if isinstance(block, dict))
    assert "image summary" in "\n".join(
        block.get("text", "") for block in sent_content if isinstance(block, dict)
    )


def test_multimodal_model_receives_images_directly(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("YOLE_GA_STATE_ROOT", str(tmp_path))
    llmcore = load_llmcore()
    monkeypatch.setattr(
        llmcore,
        "_vision_summary_with_model",
        lambda _backend, _content: pytest.fail("vision summary should not be called"),
    )
    backend = _Backend(["ok"], input_modalities={"text", "image"})
    client = llmcore.NativeToolClient(backend)

    chunks, response = drain(client.chat([{"role": "user", "content": image_message()}]))

    assert chunks == ["ok"]
    assert response is not None
    sent_content = backend.seen[0]["content"]
    assert any(block.get("type") == "image" for block in sent_content if isinstance(block, dict))
