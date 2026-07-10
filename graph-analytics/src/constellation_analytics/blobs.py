from __future__ import annotations

from dataclasses import dataclass
import hashlib
import math
import struct
from typing import Iterable

from .model import ContractError


POSITION_HEADER = struct.Struct("<4sHHIBBHQQ")
POSITION_RECORD = struct.Struct("<QffffHHI")
EDGE_HEADER = struct.Struct("<4sHHIHHQQ")
EDGE_RECORD = struct.Struct("<QIIHHf")


@dataclass(frozen=True, slots=True)
class PositionRecord:
    node_id: int
    x: float
    y: float
    z: float
    radius: float
    kind_code: int
    flags: int
    cluster_id: int


@dataclass(frozen=True, slots=True)
class EdgeRecord:
    edge_id: int
    source_index: int
    target_index: int
    kind_code: int
    flags: int
    weight: float


@dataclass(frozen=True, slots=True)
class DecodedPositions:
    snapshot_id: int
    layout_id: int
    records: tuple[PositionRecord, ...]


def as_f32(value: float) -> float:
    """Round a Python float exactly as the v1 f32 encoder does."""
    return struct.unpack("<f", struct.pack("<f", value))[0]


def sha256_hex(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _require_unsigned(value: int, bits: int, label: str) -> None:
    if not (0 <= value < 1 << bits):
        raise ContractError(f"{label} does not fit u{bits}: {value}")


def _require_f32(value: float, label: str) -> None:
    if not math.isfinite(value):
        raise ContractError(f"{label} is not finite")
    try:
        encoded = as_f32(value)
    except (OverflowError, struct.error) as error:
        raise ContractError(f"{label} does not fit f32") from error
    if not math.isfinite(encoded):
        raise ContractError(f"{label} does not encode to a finite f32")


def encode_positions(
    snapshot_id: int,
    layout_id: int,
    records: Iterable[PositionRecord],
) -> bytes:
    candidates = tuple(records)
    _require_unsigned(snapshot_id, 64, "positions snapshot id")
    _require_unsigned(layout_id, 64, "positions layout id")
    _require_unsigned(len(candidates), 32, "positions record count")
    content = bytearray(
        POSITION_HEADER.pack(
            b"CCP1",
            1,
            POSITION_HEADER.size,
            len(candidates),
            3,
            1,
            0,
            snapshot_id,
            layout_id,
        )
    )
    seen: set[int] = set()
    for record in candidates:
        _require_unsigned(record.node_id, 64, "positions node id")
        if record.node_id in seen:
            raise ContractError(f"duplicate node {record.node_id} in positions blob")
        seen.add(record.node_id)
        for label, value in zip(
            ("x", "y", "z", "radius"),
            (record.x, record.y, record.z, record.radius),
            strict=True,
        ):
            _require_f32(value, f"node {record.node_id} {label}")
        if record.radius <= 0.0:
            raise ContractError(f"node {record.node_id} radius must be positive")
        if record.flags & ~0x0F:
            raise ContractError(f"node {record.node_id} uses reserved flag bits")
        if not (1 <= record.kind_code <= 0xFFFF):
            raise ContractError(f"node {record.node_id} has invalid kind code")
        if not (0 <= record.cluster_id <= 0xFFFF_FFFF):
            raise ContractError(f"node {record.node_id} has invalid cluster id")
        content.extend(
            POSITION_RECORD.pack(
                record.node_id,
                record.x,
                record.y,
                record.z,
                record.radius,
                record.kind_code,
                record.flags,
                record.cluster_id,
            )
        )
    return bytes(content)


def encode_edges(
    snapshot_id: int,
    layout_id: int,
    position_count: int,
    records: Iterable[EdgeRecord],
) -> bytes:
    candidates = tuple(records)
    _require_unsigned(snapshot_id, 64, "edges snapshot id")
    _require_unsigned(layout_id, 64, "edges layout id")
    _require_unsigned(len(candidates), 32, "edges record count")
    content = bytearray(
        EDGE_HEADER.pack(
            b"CCE1",
            1,
            EDGE_HEADER.size,
            len(candidates),
            EDGE_RECORD.size,
            0,
            snapshot_id,
            layout_id,
        )
    )
    seen: set[int] = set()
    for record in candidates:
        _require_unsigned(record.edge_id, 64, "edge id")
        if record.edge_id in seen:
            raise ContractError(f"duplicate edge {record.edge_id} in edges blob")
        seen.add(record.edge_id)
        if (
            record.source_index >= position_count
            or record.target_index >= position_count
        ):
            raise ContractError(f"edge {record.edge_id} has an out-of-range node index")
        if record.source_index < 0 or record.target_index < 0:
            raise ContractError(f"edge {record.edge_id} has a negative node index")
        _require_unsigned(
            record.source_index, 32, f"edge {record.edge_id} source index"
        )
        _require_unsigned(
            record.target_index, 32, f"edge {record.edge_id} target index"
        )
        _require_f32(record.weight, f"edge {record.edge_id} weight")
        if record.weight < 0.0:
            raise ContractError(f"edge {record.edge_id} has invalid weight")
        if record.flags & ~0x03:
            raise ContractError(f"edge {record.edge_id} uses reserved flag bits")
        if not (1 <= record.kind_code <= 0xFFFF):
            raise ContractError(f"edge {record.edge_id} has invalid kind code")
        content.extend(
            EDGE_RECORD.pack(
                record.edge_id,
                record.source_index,
                record.target_index,
                record.kind_code,
                record.flags,
                record.weight,
            )
        )
    return bytes(content)


def decode_positions(
    content: bytes,
    *,
    expected_snapshot_id: int | None = None,
    expected_layout_id: int | None = None,
    expected_sha256: str | None = None,
) -> DecodedPositions:
    if expected_sha256 is not None and sha256_hex(content) != expected_sha256:
        raise ContractError("positions SHA-256 mismatch")
    if len(content) < POSITION_HEADER.size:
        raise ContractError("positions header is truncated")
    (
        magic,
        version,
        header_bytes,
        count,
        dimensions,
        scalar,
        flags,
        snapshot_id,
        layout_id,
    ) = POSITION_HEADER.unpack_from(content)
    if magic != b"CCP1" or version != 1:
        raise ContractError("positions magic/version mismatch")
    if (
        header_bytes != POSITION_HEADER.size
        or dimensions != 3
        or scalar != 1
        or flags != 0
    ):
        raise ContractError("unsupported positions header")
    if expected_snapshot_id is not None and snapshot_id != expected_snapshot_id:
        raise ContractError("positions snapshot id mismatch")
    if expected_layout_id is not None and layout_id != expected_layout_id:
        raise ContractError("positions layout id mismatch")
    if len(content) != header_bytes + count * POSITION_RECORD.size:
        raise ContractError("positions size equation failed")

    records: list[PositionRecord] = []
    seen: set[int] = set()
    for index in range(count):
        values = POSITION_RECORD.unpack_from(
            content, header_bytes + index * POSITION_RECORD.size
        )
        record = PositionRecord(*values)
        if record.node_id in seen:
            raise ContractError(f"positions repeats node {record.node_id}")
        seen.add(record.node_id)
        if not all(
            math.isfinite(value)
            for value in (record.x, record.y, record.z, record.radius)
        ):
            raise ContractError(f"positions node {record.node_id} is non-finite")
        if record.radius <= 0.0 or record.flags & ~0x0F:
            raise ContractError(f"positions node {record.node_id} has invalid metadata")
        records.append(record)
    return DecodedPositions(snapshot_id, layout_id, tuple(records))
