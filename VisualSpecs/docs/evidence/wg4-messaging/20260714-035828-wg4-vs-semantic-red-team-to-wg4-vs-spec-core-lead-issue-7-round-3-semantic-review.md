# Issue #7 — semantic premortem re-review, round 3

Exact reviewed commit: `cf1a83075156deea1f531cbf93c1fbcf7d3287ed` (`HEAD` exactly on `feature/7-collapsible-project-rail`).

Verdict: `BLOCKING_PREMORTEM_FINDINGS`

This is a plan gate, not an implementation verdict. The commit changes only `plan/7-collapsible-project-rail.md`; the existing executable counterexamples therefore still reproduce, but I did not treat absence of implementation as a failure of the revised RFC. I did not read or adopt the resilience review.

## Prior-finding dispositions

| Finding | Round-3 status | Evidence/reason |
| --- | --- | --- |
| `SEM-P1-01` lifecycle A/B mismatch | `CLEARED` | Lines 192–214 now require old complete-session visibility during every fallible read, immutable local candidates/payloads, synchronous busy admission, epoch/session tokens, one non-awaiting aggregate document+project commit, stale-result suppression, and opposite-order Open A/B, Open/Create, Open/Enable, and Open/Save tests. This closes both the stale UI commit and the later-document/earlier-ref write. |
| `SEM-P1-02` Preview hides dirty-project discard risk | `CLEARED` | Lines 216–228 define the single `hasDiscardableChanges = dirty || projectDirty === true` authority, synchronous loss-specific confirmation before the privileged call, exact cancel/failure preservation, four fact combinations, and an explicit product disposition that Return discards Preview-only edits while restoring the retained project. Create is invalid during Preview. |
| `SEM-P1-03` false permission label | `CLEARED` | The RFC consistently replaces `Project permission` with `Project access`, explicitly defines `access` as application editing mode rather than an observed filesystem permission, and retains the port/adapter no-change boundary. |
| `SEM-P1-04` failures erase/mislabel trust banners | `CLEARED` | Lines 309–321 give action errors a separate stable host and discriminated operation copy, make `renderBanners()` the sole global trust renderer, forbid error-driven banner clearing, define stale/cancel/success/error lifetime, and require coexistence plus accessibility/geometry tests after invalid JSON, conflict, and permission denial. |
| `SEM-P1-05` same-name identity | `REMAINS` | Manifest id is the right source, but the specified raw-Unicode `<bdi>` abbreviation is not a total visible discriminator. A valid equal-length default-ignorable counterexample renders identically; full details below. |
| `SEM-P2-01` corrupt-autosave lifetime | `CLEARED` | Lines 230–232 make the flag a current condition and define successful rewrite/current commit/session-change clears, failed-write retention, and Preview/Return preservation; unit coverage is explicit. |
| `SEM-P2-02` Create-from-Preview | `CLEARED` | Lines 96, 218, 228, and focused tests make Create capability-invalid/absent until Return. Open Project/Open temporary remain guarded context switches; no clone-from-preview meaning is invented. |

## Remaining blocker: `SEM-P1-05`

Severity: **P1, blocking**.

### Minimal reproducible case

Use two projects with the same valid name `Acme` and these distinct, equal-code-point-length manifest ids:

- A: `same<U+200B>id` — ZERO WIDTH SPACE;
- B: `same<U+2060>id` — WORD JOINER.

Both values pass the real round-trip `makeProjectManifest()` → `projectManifestText()` → `parseProjectManifest()` contract. They differ only in the middle, so they exercise the RFC's transition-aware “expand around the first differing segment” rule. Both differing code points are default-ignorable; expanding to the complete raw ids still produces the same visible glyph sequence. Equal code-point length also defeats a length fallback.

Reproduction output from Node 24 + frozen contract modules + Chromium Canvas2D text rasterization:

```text
VALID_DISTINCT_IDS {
  "parsedDistinct":true,
  "sameCodePointLength":true,
  "idA":["U+73","U+61","U+6D","U+65","U+200B","U+69","U+64"],
  "idB":["U+73","U+61","U+6D","U+65","U+2060","U+69","U+64"]
}
RAW_TEXT_RENDER {
  "widthA":103.15625,
  "widthB":103.15625,
  "identicalPixels":true
}
```

The harness renders the two accepted ids at the same font/size into independent white canvases and compares every RGBA byte. `<bdi dir="auto">` isolates direction but does not make default-ignorable code points visible. Comparing DOM/code-point strings is therefore insufficient to establish the RFC's promised visual distinction.

### Violated approved criterion

- Lines 156–158 require same-name/different-id projects to become visibly distinct, including middle-only differences.
- P1 line 381 requires same-name projects to remain distinguishable in collapsed state.
- Requested state item 7 requires safe compact project identity.

The RFC itself says an invariant-breaking abbreviation case reopens the decision. This is such a case.

### Impact

Two valid logical project identities remain observationally identical in both the expanded full-id text and compact raw-substring token. A user cannot visually verify which project session/write target committed. The full DOM string being technically different does not satisfy the explicit visible P1 guarantee and may also be collapsed by assistive pronunciation.

### Required plan change

Derive the visible discriminator from a visibly total ASCII representation rather than raw untrusted glyphs. Acceptable shapes include:

- an ASCII hex/code-point escape representation with collision-aware expansion; or
- an ASCII digest/fingerprint of the full UTF-8/code-point sequence, with enough transition-aware extension/fallback to distinguish actual compared full ids.

The raw full id can remain available as isolated accessible text, but the visible and accessible label must also contain the ASCII discriminator. It remains presentation-only and must never become a DOM id, command/ref key, path, or persisted field.

Add at least same-name fixtures for `U+200B` versus `U+2060`, NFC versus NFD, and bidi/default-ignorable controls. Assert distinct visible ASCII tokens, full-id accessibility, inert rendering, and unchanged persistence bytes.

## New non-blocking clarification

`SEM-P2-03`: the discard-confirmation copy should deduplicate ordinary project dirty. Outside Preview, the RFC defines `projectDirty = dirty`; therefore an ordinary dirty project presents `(dirty=true, projectDirty=true)` even though there is one loss, while lines 220–224/table row `true/true` describe two independent losses. Derive loss keys by session kind (active Preview/temporary versus underlying project), not merely two booleans, and test that one dirty project is named once. Safety is preserved because the guard still fires, so this is P2 rather than a blocker.

## Commands and evidence used

```text
git rev-parse HEAD
# cf1a83075156deea1f531cbf93c1fbcf7d3287ed

git show --stat cf1a83075156deea1f531cbf93c1fbcf7d3287ed
# plan/7-collapsible-project-rail.md only; 285 insertions, 100 deletions

npm test -- tests/app/projectController.test.ts
# 30/30 passed

node premortem-repro.ts
# Existing code still reproduces Project A/document B/cross-write and Preview dirty loss,
# as expected because this commit is plan-only. Used as the oracle for the planned closures.

node round3-id-repro.mjs
# Contract-valid distinct ids; identical Chromium pixels as reported above.
```

Inspected: the complete 750-line round-3 RFC, its diff from `38964c1`, current `projectController.ts`, `app.ts`, `controller.ts`, project store port/FSA adapter, manifest/autosave contracts, relevant unit/smoke tests, architecture notes, and canonical dataset behavior. Repository tracked state remains unchanged; only the pre-existing untracked `CodebaseGuide/` is present.

Final verdict: `BLOCKING_PREMORTEM_FINDINGS`.

Six of seven prior findings are adequately closed at plan level. `SEM-P1-05` remains a reproducible P1, so round-3 must be arbitrated/escalated under the stated maximum-round protocol before production implementation.
