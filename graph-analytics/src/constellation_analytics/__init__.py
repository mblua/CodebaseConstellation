"""Offline analytics and layout writer for CodebaseConstellation snapshots."""

from .pipeline import RunConfig, RunSummary, run_pipeline

__all__ = ["RunConfig", "RunSummary", "run_pipeline"]
__version__ = "0.1.0"
