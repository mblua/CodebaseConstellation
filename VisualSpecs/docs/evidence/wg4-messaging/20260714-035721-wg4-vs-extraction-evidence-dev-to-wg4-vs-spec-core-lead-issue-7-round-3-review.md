# Issue #7 — extraction/evidence constructive round-3 re-review

To: `CodebaseConstellation_iac:wg-4-vs-dev-team/vs-spec-core-lead`

From: `CodebaseConstellation_iac:wg-4-vs-dev-team/vs-extraction-evidence-dev`

Exact commit reviewed: `cf1a83075156deea1f531cbf93c1fbcf7d3287ed`

## Verdicts

1. **Project name + short visible/full accessible canonical manifest `project.id`: DISSENT — one reproducible P1 remains.** The selection of canonical manifest id, exclusion of root paths, application-only exposure, and no-new-persistence boundary are sound. The proposed literal prefix/suffix plus code-point collision expansion is not yet a truthful *visible* discriminator for every manifest id the current contract accepts.
2. **Wide `>=1664` / Hybrid `1200..1663` / Narrow `<1200`, including Hybrid Explorer suppression and evidence reachability: SUPPORT.** I found no P0/P1 invariant violation in this refinement.

No P0 was found. The identity finding below is the only P1 I found within the requested two-refinement scope.

## Blocking finding `EXT-R3-P1-01`: distinct valid ids can remain visually identical

### Minimal reproducible case

Create two otherwise valid manifests with the same project name and these different canonical ids:

```text
A: project-alpha
B: project-\u200Balpha
```

U+200B is ZERO WIDTH SPACE. Both ids pass the current manifest parser. `parseProjectManifest()` delegates `project.id` to `stringField()`, which requires only a non-empty string; the generic JSON scan permits strings up to `maxStringLength = 100_000` and imposes no UUID, normalization, printable-character, bidi-control, or default-ignorable constraint.

Render the two values as the plan proposes:

```html
<bdi dir="auto">project-alpha</bdi>
<bdi dir="auto">project-&#x200B;alpha</bdi>
```

Chromium measured both at exactly `92.5px` in the same 16px Arial style. Their `textContent` and code-point sequences differ, but the visible strings are indistinguishable. `<bdi>` isolates directional context; it does not escape or make internal zero-width/default-ignorable/bidi-control characters visible.

The proposed collision logic cannot close this case:

- if the zero-width code point participates in the short token, the JS strings differ and the formatter may falsely conclude the visible tokens differ;
- if it lies in an omitted middle, expansion around the first differing code point eventually includes U+200B but still produces no visible difference;
- even rendering the complete literal id does not make this particular difference visible.

The same class includes bidi controls, other default-ignorables, whitespace-only ids, and canonically equivalent-looking sequences such as NFC/NFD forms.

### Approved invariant/criterion violated

- RFC P1: collapsed state exposes a canonical manifest-id discriminator and same-name projects remain distinguishable.
- Round-3 refinement: the discriminator is untrusted/bidi-safe and visibly distinct after a same-name project transition.

### Evidence

Parser reproduction output:

```json
{"a":"project-alpha","b":"project-​alpha","aLength":13,"bLength":14,"idsDiffer":true,"withoutZeroWidthEqual":true,"bCodePoints":["70","72","6f","6a","65","63","74","2d","200b","61","6c","70","68","61"]}
```

Chromium reproduction output:

```json
{"aText":"project-alpha","bText":"project-​alpha","aWidth":92.5,"bWidth":92.5,"aRendered":"project-alpha","bRendered":"project-​alpha"}
```

Relevant sources:

- `VisualSpecs/src/contract/projectManifest.ts`: `project.id` uses `stringField()`; only non-empty is required.
- `VisualSpecs/src/contract/limits.ts`: generic `maxStringLength = 100_000`.
- RFC structured-session-identity section and P1 same-name distinguishability invariant.

### Impact and severity

**P1.** A malicious or accidental manifest can make two different canonical project identities look identical in the compact and expanded presentation. The user may attribute dirty/repair/recovery state or the winning Save/Enable action to the wrong project after a context switch. This directly defeats the reason for adding the discriminator; a full raw literal/title does not repair the visible ambiguity.

### Required closure

Keep `manifestProjectId` as the exact validated raw id and keep all no-persistence/no-root/no-command-key boundaries, but derive the visible discriminator from an **injective, visibly ASCII representation of the exact id**, then abbreviate/collision-expand that representation. Acceptable shapes include a rigorously escaped code-unit representation (escaping backslash plus every character outside a conservative printable ASCII alphabet) or another exact encoding whose expansion can distinguish any two JS strings. A digest-only token needs an explicit collision story; an exact escaped representation can always expand deterministically without changing the manifest contract.

Also tighten “full accessible name/title”: `title` alone must not be the only full-value accessibility mechanism. Bind the labeled full raw/escaped identity through an actual accessible name/description or visually-hidden text, with `title` only supplementary.

Required fixtures should cover at least:

- U+200B/default-ignorable difference;
- bidi override/isolate controls inside the id;
- NFC vs NFD lookalikes;
- whitespace/control and markup-looking ids;
- equal default prefix/suffix with a differing middle;
- very long ids at the existing contract cap.

This closure remains entirely presentation-only. Changing `project.id` validation to UUID-only would be a contract/schema change and is outside the current no-change boundary unless separately reviewed.

## Refinement 2 assessment: SUPPORT

The three-band model closes the intermediate-width conflict without suppressing evidence truth:

- Wide preserves the accepted 1680 measured canvas budget.
- Hybrid makes only Project an overlay, removes the Explorer grid column while Project is open, and explicitly retains the Explorer preference. Closing Project restores Explorer from that preference rather than manufacturing a preference change.
- Details retains its independent docked preference in Hybrid; opening/restoring surfaces does not dispatch graph selection/view commands.
- Narrow keeps one exclusive overlay over the full-width canvas and preserves all desktop preferences.
- The transition table explicitly covers 1199/1200 and 1663/1664 in both directions, project-id/null-project transitions, exact focus replacement, and rapid resize convergence.
- `bannerHost` remains stable workspace chrome outside hideable/overlay subtrees; action errors no longer own or clear it.
- Evidence stays in ordinary Details DOM. The plan requires selection preservation and assertions for confidence plus `.evidence` `path:line` after rail/canvas transitions.

Existing code supports the planned boundary: drawer layout currently toggles presentation without issuing selection commands; `renderDetail()` reads selection and renders edge confidence/evidence; Canvas2D pointer conversion reads a fresh `getBoundingClientRect()`; `Controller.resize()` delegates without changing viewport.

I found no P0/P1 counterexample for temporary Hybrid Explorer suppression, preference preservation, global trust/banner reachability, or Details evidence reachability.

### Non-blocking verification improvement

The enumerated browser matrix proves Details evidence at 1680 and 800, while the Hybrid section currently emphasizes Explorer restoration and banner occlusion. Add one explicit `1440` or `1663` Hybrid case:

1. select a known evidence-bearing edge;
2. open Project and assert Explorer is presentation-hidden with its stored preference unchanged;
3. open/inspect docked Details while Project is open, then close Project;
4. assert selection, confidence, and the same `.evidence` `path:line` survive, Explorer restores, and its toggle's `aria-expanded` reflects actual presentation during suppression and restored presentation afterward.

I classify this as P2/test completeness because the RFC already states the corresponding P1 invariant and has cross-band evidence tests; it does not change my `SUPPORT` verdict.

## Files/sections inspected

- `plan/7-collapsible-project-rail.md` at `cf1a830…`: structured session identity; three-band responsive model; exhaustive overlay table; global trust/warning/evidence surfaces; focus/ARIA; P1 invariants; unit/UI/renderer/responsive evidence matrices; round-3 decision record.
- Delta `38964c1..cf1a830` and commit/name-only diff.
- `VisualSpecs/src/contract/projectManifest.ts` and `limits.ts`.
- `VisualSpecs/src/app/projectController.ts`, `controller.ts`, and `ports/projectStore.ts`.
- `VisualSpecs/src/ui/app.ts`, `ui/dom.ts`, and `ui/detail.ts`.
- `VisualSpecs/src/adapters/canvas2d/Canvas2DRenderer.ts`.
- Project storage/controller/architecture and existing acceptance evidence tests.

## Commands and verification

- `git show --stat --oneline cf1a83075156deea1f531cbf93c1fbcf7d3287ed` — exact commit confirmed; plan-only commit.
- `git diff 38964c1 cf1a830 -- plan/7-collapsible-project-rail.md` — round-3 delta inspected.
- `git diff --name-only 38964c1 cf1a830` — only `plan/7-collapsible-project-rail.md`.
- Node 24.13 with TypeScript stripping imported the real manifest parser and reproduced both ids as valid/distinct.
- Headless Chromium via installed Playwright rendered both `<bdi>` values at identical width (`92.5px`).
- `npm test -- tests/contract/projectStorage.test.ts tests/app/projectController.test.ts tests/architecture/boundaries.test.ts` — **54/54 passed** across 3 files.
- `npm run typecheck` — **passed**.
- `git diff --check` — **passed**.
- Targeted acceptance Playwright was attempted but correctly refused to start because port `5175` is occupied and `reuseExistingServer: false`; I did not stop the persistent server during this planning/review assignment, per the RFC guard.
- Worktree has no tracked change; only the pre-existing untracked `CodebaseGuide/` remains.

No production implementation was made.
