#!/usr/bin/env node
// Validates a git branch name against the project convention.
// Shared by local manual checks and .github/workflows/validate-branch-name.yml.
//
// Usage:
//   node scripts/validate-branch-name.mjs --branch <name> [--check-issue]
//   node scripts/validate-branch-name.mjs                  (auto-detects current branch)
//
// Exit codes:
//   0 -> valid or exempt
//   1 -> invalid format, slug too long, issue missing/closed, timeout, or internal error

import { execFileSync } from 'node:child_process';

const PATTERN = /^(bug|chore|ci|docs|feat|feature|fix|refactor|style|test)\/([1-9][0-9]*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const MAX_SLUG = 50;
const TARGET_REPO = process.env.GITHUB_REPOSITORY || 'mblua/CodebaseConstellation';
const API_TIMEOUT_MS = 10_000;
const EXEMPT = [
  /^main$/,
  /^release\//,
  /^hotfix\//,
  /^dependabot\//,
  /^revert\//,
  /^revert-[1-9][0-9]*-/,
  /^gh-readonly-queue\//,
];

function parseArgs(argv) {
  const out = { branch: null, checkIssue: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--branch') out.branch = argv[++i];
    else if (argv[i] === '--check-issue') out.checkIssue = true;
  }
  return out;
}

class ValidationError extends Error {}

function fail(message) {
  throw new ValidationError(message);
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function resolveBranch() {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return git(['symbolic-ref', '--short', 'HEAD']);
  } catch {
    fail('Could not resolve current branch (detached HEAD?). Pass --branch <name>.');
  }
}

function isExempt(branch) {
  return EXEMPT.some((pattern) => pattern.test(branch));
}

function validateFormat(branch) {
  const match = PATTERN.exec(branch);
  if (!match) {
    fail(
      `Branch "${branch}" does not match the naming convention.\n` +
        '  Expected: <type>/<issue-number>-<slug>\n' +
        '    <type>   in { bug | chore | ci | docs | feat | feature | fix | refactor | style | test }\n' +
        '    <issue>  = open GitHub issue number (no leading zeros)\n' +
        `    <slug>   = lowercase-kebab-case, [a-z0-9]+(-[a-z0-9]+)*, <= ${MAX_SLUG} chars\n` +
        '  Example:  ci/1-enforce-main-pr-branch-names',
    );
  }
  const [, , issueString, slug] = match;
  if (slug.length > MAX_SLUG) {
    fail(`Slug is ${slug.length} chars (max ${MAX_SLUG}). Shorten it.`);
  }
  return { issue: issueString, slug };
}

async function verifyIssueOpen(issue) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    fail(`Missing GH_TOKEN / GITHUB_TOKEN in environment - cannot verify issue #${issue}.`);
  }

  const url = `https://api.github.com/repos/${TARGET_REPO}/issues/${issue}`;
  let response;
  let data;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'codebaseconstellation-branch-validator',
      },
    });
    if (response.status === 404) {
      fail(`Issue #${issue} not accessible in ${TARGET_REPO} (missing or auth-denied).`);
    }
    if (!response.ok) {
      fail(`GitHub API error (${response.status}) while fetching issue #${issue}.`);
    }
    data = await response.json();
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      fail(`Timed out (${API_TIMEOUT_MS} ms) fetching issue #${issue} from GitHub API.`);
    }
    if (error instanceof SyntaxError) {
      fail(`Invalid JSON response from GitHub API for issue #${issue}.`);
    }
    fail(`Network error fetching issue #${issue}: ${error?.message || error}`);
  }

  if (data.pull_request) fail(`#${issue} is a pull request, not an issue.`);
  if (data.state !== 'open') {
    fail(`Issue #${issue} is ${data.state}. Branch must reference an OPEN issue.`);
  }
}

(async () => {
  try {
    const args = parseArgs(process.argv.slice(2));
    const branch = args.branch || resolveBranch();

    if (isExempt(branch)) {
      console.log(`[branch-name] exempt: ${branch}`);
      return;
    }
    const { issue } = validateFormat(branch);
    if (args.checkIssue) await verifyIssueOpen(issue);

    console.log(`[branch-name] OK: ${branch}`);
  } catch (error) {
    const prefix = error instanceof ValidationError ? '' : 'Unexpected error: ';
    console.error(`[branch-name] ${prefix}${error?.message || error}`);
    process.exitCode = 1;
  }
})();
