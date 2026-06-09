"""Pytest fixtures: ensure GA is importable from sys.path.

The bridge package imports GA modules (`agent_loop`, `ga`). We never copy
or vendor GA; we put its install path on sys.path at test startup.

GA path resolves in this order:
  1. GA_PATH environment variable
  2. ~/Documents/GenericAgent (user's local install)
  3. managed-ga/code in this repository

Tests that don't need GA still load fine (the path is just prepended;
imports happen lazily). Tests that need GA fail with a clear ImportError
if the path is wrong.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True


def _resolve_ga_path() -> str | None:
    env = os.environ.get("GA_PATH")
    if env:
        return env if Path(env).is_dir() else None
    default = Path.home() / "Documents" / "GenericAgent"
    if default.is_dir():
        return str(default)
    managed = Path(__file__).resolve().parents[2] / "managed-ga" / "code"
    return str(managed) if managed.is_dir() else None


_GA_PATH = _resolve_ga_path()
if _GA_PATH and _GA_PATH not in sys.path:
    sys.path.insert(0, _GA_PATH)
