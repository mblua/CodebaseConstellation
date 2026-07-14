#!/usr/bin/env bash
# Resilience premortem harness for plan #1 (enforce PR-only main + branch names).
# Read-only wrt repo-CodebaseConstellation: copies the validator into a scratch
# git repo and reproduces CI conditions offline. No GitHub state is touched.
set -u

REPO="C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/repo-CodebaseConstellation"
SCRATCH="C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/__agent_vs-resilience-red-team/premortem/scratch"
V="scripts/validate-branch-name.mjs"

rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"; cd "$SCRATCH" || exit 1

git init -q -b main .
git config user.email red@team.local
git config user.name red-team
mkdir -p scripts .github
cp "$REPO/$V" scripts/

# C_root: ancient history (pre-cutoff)
echo root > root.txt
git add -A >/dev/null; git commit -qm "root: ancient pre-cutoff commit"
C_ROOT=$(git rev-parse HEAD)

# C_CUTOFF: the recorded pre-enforcement main (analogue of b5b2725)
echo cutoff > cutoff-marker.txt
git add -A >/dev/null; git commit -qm "feat: last pre-enforcement main"
C_CUTOFF=$(git rev-parse HEAD)

# C_ENFORCE: enforcement merged into main (adds the cutoff sha file)
echo "$C_CUTOFF" > .github/branch-name-enforcement.cutoff.sha
git add -A >/dev/null; git commit -qm "ci: enforce PR-only main and branch names (#1)"

# Simulate the CI clone: actions/checkout with fetch-depth:0 populates
# refs/remotes/origin/* for every head, so origin/main resolves.
git update-ref refs/remotes/origin/main "$(git rev-parse main)"

echo "=== SETUP ==="
echo "cutoff sha recorded on origin/main = $C_CUTOFF"
echo "post-merge main                    = $(git rev-parse main)"
echo

run() { # run <label> <branch>
  echo "--- $1"
  echo "\$ node scripts/validate-branch-name.mjs --branch '$2'"
  node scripts/validate-branch-name.mjs --branch "$2"
  echo "exit=$?"
  echo
}

echo "=== BASELINE: post-cutoff branches (checked out from current main) ==="
git checkout -q -b ci/1-enforce-main-pr-branch-names main
run "B1 compliant name, contains cutoff" "ci/1-enforce-main-pr-branch-names"
git checkout -q -b Bad_NAME--x main
run "B2 non-compliant name, contains cutoff (expected FAIL)" "Bad_NAME--x"
run "B3 leading zero (expected FAIL)" "feat/01-foo"
run "B4 slug 51 chars (expected FAIL)" "feat/1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
run "B5 unknown type (expected FAIL)" "wip/1-foo"

echo "=== F5: GRANDFATHER BYPASS (branch history lacks cutoff) ==="
git checkout -q --orphan orphan-any-name-i-want
git rm -rqf . 2>/dev/null
echo payload > payload.txt
git add -A >/dev/null; git commit -qm "orphan payload"
run "F5a orphan branch, arbitrary name" "orphan-any-name-i-want"

git checkout -q -b stale/pre-cutoff-JUNK_name "$C_ROOT"
echo x > x.txt; git add -A >/dev/null; git commit -qm "old work"
run "F5b branch cut before cutoff, arbitrary name" "stale/pre-cutoff-JUNK_name"

echo "=== F4: GitHub 'Revert' button branch name vs revert/** exemption ==="
git checkout -q -b "revert-2-ci/1-enforce-main-pr-branch-names" main
run "F4 GitHub UI revert branch (revert-<PR#>-<head>)" "revert-2-ci/1-enforce-main-pr-branch-names"
run "F4b hand-made revert/ branch (the only one the regex exempts)" "revert/undo-2"

echo "=== F1: exempt families -> validator says exempt, but workflow never runs ==="
for b in hotfix/prod-down "release/1.2" "dependabot/cargo/serde-1.0.2" "gh-readonly-queue/main/pr-3"; do
  run "F1 exempt-by-validator: $b" "$b"
done

echo "=== F-num: huge issue number coercion ==="
run "issue number 1e20 (no token -> fail closed, but note the URL it would build)" "feat/99999999999999999999-x"
node -e 'const n=Number("99999999999999999999");console.log("URL would be: https://api.github.com/repos/mblua/CodebaseConstellation/issues/"+n)'
echo

echo "=== workflow branches-ignore vs validator EXEMPT (same list?) ==="
grep -n "branches-ignore" -A 7 "$REPO/.github/workflows/validate-branch-name.yml"
