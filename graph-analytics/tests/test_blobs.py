from __future__ import annotations

import unittest

from constellation_analytics.blobs import (
    EdgeRecord,
    PositionRecord,
    decode_positions,
    encode_edges,
    encode_positions,
)


class BlobGoldenTests(unittest.TestCase):
    def test_positions_header_and_record_match_golden_bytes(self) -> None:
        content = encode_positions(
            1,
            2,
            [PositionRecord(5, 1.0, -2.5, 0.25, 0.5, 3, 1, 7)],
        )
        self.assertEqual(
            content.hex(),
            "4343503101002000010000000301000001000000000000000200000000000000"
            "05000000000000000000803f000020c00000803e0000003f0300010007000000",
        )
        decoded = decode_positions(
            content,
            expected_snapshot_id=1,
            expected_layout_id=2,
        )
        self.assertEqual(decoded.records[0].node_id, 5)
        self.assertEqual(decoded.records[0].cluster_id, 7)

    def test_edges_header_and_record_match_golden_bytes(self) -> None:
        content = encode_edges(
            1,
            2,
            2,
            [EdgeRecord(9, 0, 1, 4, 3, 1.5)],
        )
        self.assertEqual(
            content.hex(),
            "4343453101002000010000001800000001000000000000000200000000000000"
            "09000000000000000000000001000000040003000000c03f",
        )


if __name__ == "__main__":
    unittest.main()
