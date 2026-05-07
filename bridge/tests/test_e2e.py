"""End-to-end test: spawn a real bridge subprocess and run a real LLM round-trip.

Marked @pytest.mark.e2e so the default `pytest` invocation skips it. Run
explicitly:

    pytest -m e2e

Costs a small amount of LLM API quota per run (one minimal completion).

Environment:
    GA_PATH         path to GenericAgent install (default ~/Documents/GenericAgent)
    BRIDGE_PYTHON   Python interpreter used to spawn the bridge subprocess.
                    Must be one that can `import` GA's runtime deps
                    (anthropic / openai / lark_oapi etc). Defaults to
                    sys.executable; override if pytest runs in a venv that
                    doesn't have GA deps installed.
"""
from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
GA_PATH = os.environ.get("GA_PATH") or str(Path.home() / "Documents" / "GenericAgent")
BRIDGE_PYTHON = os.environ.get("BRIDGE_PYTHON") or sys.executable

# A minimal user message designed to keep the round-trip short and cheap.
PING_PROMPT = "Reply with exactly the single word: pong"

E2E_READY_TIMEOUT = 30.0       # GA + LLM session init can be slow on first run
E2E_RUN_TIMEOUT = 180.0        # full LLM round-trip, generous for slow networks
E2E_LINE_TIMEOUT = 30.0        # max wait between consecutive events

pytestmark = pytest.mark.e2e


# ---------------- Subprocess + reader thread ----------------


class _BridgeProc:
    """Wraps a bridge subprocess with a stdout reader thread feeding a queue."""

    def __init__(self, proc: subprocess.Popen[str]) -> None:
        self.proc = proc
        self.events: queue.Queue[dict[str, Any]] = queue.Queue()
        self._stderr_chunks: list[str] = []
        self._reader = threading.Thread(target=self._read_stdout, daemon=True)
        self._err_reader = threading.Thread(target=self._read_stderr, daemon=True)
        self._reader.start()
        self._err_reader.start()

    def _read_stdout(self) -> None:
        assert self.proc.stdout is not None
        for line in iter(self.proc.stdout.readline, ""):
            line = line.strip()
            if not line:
                continue
            try:
                self.events.put(json.loads(line))
            except json.JSONDecodeError:
                self.events.put({"kind": "_unparseable", "raw": line})

    def _read_stderr(self) -> None:
        assert self.proc.stderr is not None
        for line in iter(self.proc.stderr.readline, ""):
            self._stderr_chunks.append(line)

    def stderr_so_far(self) -> str:
        return "".join(self._stderr_chunks)

    def send(self, cmd: dict[str, Any]) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(json.dumps(cmd) + "\n")
        self.proc.stdin.flush()

    def next_event(self, timeout: float) -> dict[str, Any]:
        try:
            return self.events.get(timeout=timeout)
        except queue.Empty as e:
            rc = self.proc.poll()
            err = self.stderr_so_far()
            raise AssertionError(
                f"timed out after {timeout}s waiting for event "
                f"(proc rc={rc}, stderr tail: {err[-500:]!r})"
            ) from e

    def shutdown(self) -> None:
        if self.proc.poll() is None:
            try:
                self.send({"kind": "shutdown"})
            except Exception:
                pass
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()


@pytest.fixture
def bridge_proc() -> Iterator[_BridgeProc]:
    if not Path(GA_PATH).is_dir():
        pytest.skip(f"GA_PATH not found: {GA_PATH}")

    env = os.environ.copy()
    # The subprocess will `import bridge.workbench_bridge`, which needs the
    # repo root on its module search path.
    env["PYTHONPATH"] = (
        str(REPO_ROOT) + os.pathsep + env.get("PYTHONPATH", "")
    ).rstrip(os.pathsep)

    proc = subprocess.Popen(
        [
            BRIDGE_PYTHON,
            "-m", "bridge.workbench_bridge",
            "--ga-path", GA_PATH,
            "--session-id", "test_e2e_sess",
        ],
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    bp = _BridgeProc(proc)
    try:
        yield bp
    finally:
        bp.shutdown()


# ---------------- Tests ----------------


def test_bridge_starts_and_emits_ready(bridge_proc: _BridgeProc) -> None:
    ev = bridge_proc.next_event(timeout=E2E_READY_TIMEOUT)
    assert ev["kind"] == "ready", f"unexpected first event: {ev}"
    assert ev["sessionId"] == "test_e2e_sess"
    assert ev["protocolVersion"] == "0.1"
    assert ev["pid"] > 0
    assert ev["gaCommit"], "gaCommit missing"


def test_bridge_full_message_round_trip(bridge_proc: _BridgeProc) -> None:
    """Send one tiny user message and verify the bridge produces turn_end +
    run_complete with non-empty final content."""
    ready = bridge_proc.next_event(timeout=E2E_READY_TIMEOUT)
    assert ready["kind"] == "ready"

    bridge_proc.send(
        {
            "kind": "user_message",
            "text": PING_PROMPT,
            "images": [],
        }
    )

    events: list[dict[str, Any]] = []
    deadline = time.monotonic() + E2E_RUN_TIMEOUT
    while time.monotonic() < deadline:
        ev = bridge_proc.next_event(timeout=E2E_LINE_TIMEOUT)
        events.append(ev)
        if ev["kind"] == "run_complete":
            break
    else:
        pytest.fail(f"no run_complete within {E2E_RUN_TIMEOUT}s; events: "
                    f"{[e['kind'] for e in events]}")

    kinds = [e["kind"] for e in events]
    assert "turn_end" in kinds, f"missing turn_end; got {kinds}"
    assert kinds[-1] == "run_complete", f"last event was {kinds[-1]}"

    final = events[-1]["finalContent"]
    assert final, "finalContent should be non-empty"
    # The exact LLM output isn't pinned, but for this prompt we expect
    # something containing 'pong' (case-insensitive).
    assert "pong" in final.lower(), f"unexpected final content: {final!r}"
