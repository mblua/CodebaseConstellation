#!/usr/bin/env bash
# Format fuzz + fail-closed evidence. Read-only wrt repo. No network expected
# (no token), so --check-issue must FAIL CLOSED, never open.
set -u
REPO="C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/repo-CodebaseConstellation"
S="C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/__agent_vs-resilience-red-team/premortem/scratch2"
rm -rf "$S"; mkdir -p "$S/scripts"; cd "$S" || exit 1
git init -q -b main .; git config user.email r@r; git config user.name r
cp "$REPO/scripts/validate-branch-name.mjs" scripts/
echo x>a; git add -A>/dev/null; git commit -qm base >/dev/null

f() { printf '%-52s -> ' "$1"; node scripts/validate-branch-name.mjs --branch "$1" >/tmp/o 2>&1; printf 'exit=%s | %s\n' "$?" "$(head -1 /tmp/o)"; }

echo "=== FORMAT FUZZ (no cutoff file present -> grandfather disabled) ==="
f "feat/1-x"
f "feat/1-x-y-z"
f "FEAT/1-x"
f "feat/1-X"
f "feat/1-"
f "feat/1--x"
f "feat/1-x-"
f "feat/1-x_y"
f "feat/1-x/y"
f "feat/0-x"
f "feat/1e3-x"
f "feat/ 1-x"
f "feat/1-x "
f "feat/1-café"
f "feature/1-ok"
f "test/123-abc"
f " feat/1-x"
f "feat/1-$(python -c 'print("a"*50)' 2>/dev/null || printf 'a%.0s' {1..50})"
f "feat/1-$(printf 'a%.0s' {1..51})"

echo
echo "=== FAIL-CLOSED: --check-issue with NO token, must NOT pass ==="
unset GH_TOKEN GITHUB_TOKEN
printf 'compliant name + --check-issue (no token) -> '
node scripts/validate-branch-name.mjs --branch "feat/1-x" --check-issue; echo "exit=$?"

echo
echo "=== huge issue number precision ==="
node -e 'for (const s of ["99999999999999999999","9007199254740993","18446744073709551616"]){console.log(s,"->",Number(s))}'
