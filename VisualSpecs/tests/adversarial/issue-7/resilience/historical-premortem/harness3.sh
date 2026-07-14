#!/usr/bin/env bash
# Round-2 re-verification. Read-only copy of the CURRENT validator (HEAD 79e18db).
set -u
REPO="C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/repo-CodebaseConstellation"
S="C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/__agent_vs-resilience-red-team/premortem/scratch3"
rm -rf "$S"; mkdir -p "$S/scripts"; cd "$S" || exit 1
git init -q -b main .; git config user.email r@r; git config user.name r
cp "$REPO/scripts/validate-branch-name.mjs" scripts/
echo x>a; git add -A>/dev/null; git commit -qm base >/dev/null
unset GH_TOKEN GITHUB_TOKEN GITHUB_REPOSITORY GITHUB_REF_NAME

f(){ printf '%-46s -> ' "$1"; node scripts/validate-branch-name.mjs --branch "$1" >/tmp/o 2>&1; printf 'exit=%s | %s\n' "$?" "$(head -1 /tmp/o)"; }

echo "=== F-A / F-C: exempt families must all pass (exit 0) ==="
for b in main "release/1.2" "hotfix/prod-down" "hotfix/enforcement-probe" "dependabot/cargo/serde-1" "revert/undo" "revert-2-ci/1-enforce-main-pr-branch-names" "gh-readonly-queue/main/pr-3"; do f "$b"; done

echo
echo "=== F-C detail: GitHub UI revert now exempt; spoof probe ==="
f "revert-2-anything-here"
f "revert-1-arbitrary_JUNK_name"   # SPOOFABLE: any 'revert-<n>-' bypasses naming
f "revert-0-x"                     # leading-zero PR num -> NOT exempt -> format fail
f "revert-abc"                     # no number -> NOT exempt -> format fail

echo
echo "=== F-B removed: junk names no longer grandfathered (must FAIL now) ==="
f "stale/pre-cutoff-JUNK_name"
f "orphan-any-name-i-want"

echo
echo "=== format sanity (compliant + rejects) ==="
f "ci/1-enforce-main-pr-branch-names"
f "feat/1-x"; f "FEAT/1-x"; f "feat/01-x"; f "feat/1--x"; f "feat/1-x_y"

echo
echo "=== F-D: issue number kept as string (no Number() precision loss) ==="
echo "-- previously Number('9007199254740993') = $(node -e 'console.log(Number("9007199254740993"))')  (off by one)"
printf 'feat/9007199254740993-x --check-issue (no token) -> '
node scripts/validate-branch-name.mjs --branch "feat/9007199254740993-x" --check-issue 2>&1; echo "exit=$?"
printf 'feat/99999999999999999999-x --check-issue (no token) -> '
node scripts/validate-branch-name.mjs --branch "feat/99999999999999999999-x" --check-issue 2>&1; echo "exit=$?"

echo
echo "=== fail-closed: compliant + --check-issue, no token ==="
node scripts/validate-branch-name.mjs --branch "feat/1-x" --check-issue 2>&1; echo "exit=$?"

echo
echo "=== P1 identity: TARGET_REPO from GITHUB_REPOSITORY env (informational) ==="
printf 'GITHUB_REPOSITORY=attacker/evil, feat/1-x --check-issue (no token) -> '
GITHUB_REPOSITORY="attacker/evil" node scripts/validate-branch-name.mjs --branch "feat/1-x" --check-issue 2>&1 | head -1
echo "(note: message names the target repo; in real CI GitHub sets this to the running repo)"
