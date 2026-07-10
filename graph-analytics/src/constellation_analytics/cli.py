from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .model import ContractError
from .pipeline import RunConfig, run_pipeline


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="constellation-analytics",
        description=(
            "Compute graph analytics, actionable dependency-cycle findings, Leiden "
            "communities, and an offline 3D ForceAtlas2 layout for a v1 snapshot."
        ),
    )
    parser.add_argument(
        "--database", required=True, type=Path, help="v1 SQLite database"
    )
    parser.add_argument(
        "--snapshot-id", type=int, help="complete snapshot id; defaults to latest"
    )
    parser.add_argument(
        "--repository-id",
        type=int,
        help="repository scope when selecting the latest complete snapshot",
    )
    parser.add_argument(
        "--layout-name",
        default="architecture-v1",
        help="layout name replaced idempotently within the snapshot",
    )
    parser.add_argument("--seed", type=int, default=1, help="deterministic random seed")
    parser.add_argument(
        "--iterations",
        type=int,
        default=250,
        help="offline ForceAtlas2 iterations (minimum 1)",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="pretty-print the JSON run summary",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    arguments = parser.parse_args(argv)
    try:
        summary = run_pipeline(
            RunConfig(
                database=arguments.database,
                snapshot_id=arguments.snapshot_id,
                repository_id=arguments.repository_id,
                layout_name=arguments.layout_name,
                seed=arguments.seed,
                iterations=arguments.iterations,
            )
        )
    except (ContractError, ValueError) as error:
        print(f"constellation-analytics: {error}", file=sys.stderr)
        return 2
    print(
        json.dumps(
            summary.to_dict(),
            indent=2 if arguments.pretty else None,
            sort_keys=True,
            separators=None if arguments.pretty else (",", ":"),
        )
    )
    return 0
