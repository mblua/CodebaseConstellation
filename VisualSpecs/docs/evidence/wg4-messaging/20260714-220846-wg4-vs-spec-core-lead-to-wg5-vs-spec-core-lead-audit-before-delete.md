# Audit request: wg-5 deletion safety

The user wants to delete both `wg-4-vs-dev-team` and `wg-5-vs-dev-team` without losing any work. Audit **wg-5 only**, read-only: do not commit, push, fetch, clean, delete, stop processes, or modify files.

Scope: every `repo-*` directory directly under:

`C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-5-vs-dev-team`

For each repo, report:

1. absolute path, branch, HEAD, upstream and remotes;
2. complete `git status --porcelain=v2 --branch --untracked-files=all`;
3. stashes and worktrees;
4. local commits reachable from any local branch but not `origin` (`git rev-list --branches --not --remotes=origin`), plus commits reachable only through reflogs/stashes if any;
5. local branches/tags without an equivalent origin ref, and any upstream divergence;
6. ignored files that are not obviously reproducible dependency/build/cache output. Pay special attention to `.local`, exports, screenshots, databases, reports, patches, logs carrying unique evidence, and generated extraction JSON;
7. whether the repo remote already resolves to `https://github.com/mblua/VisualSpecs.git` when applicable.

Also report:

- any process/listener whose command line or executable path is rooted under wg-5;
- any unique user artifact in your own replica root, `TASK.md`, or wg-5 messaging that would be lost and is not represented in Git or a canonical Matrix artifact;
- whether other replica-private roots cannot be audited under access rules (do not read them).

Return a concrete table and an explicit verdict: `SAFE TO DELETE` or `NOT SAFE`, naming every blocker. This explicit report is required; do not infer completion from files alone.
