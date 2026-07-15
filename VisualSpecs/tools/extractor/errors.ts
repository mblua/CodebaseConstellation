// The extractor error contract (§10.6): every failure is deterministic, carries a
// distinct non-zero exit code, and says what to do about it.

export const EXIT = {
  ok: 0,
  usage: 1,
  notAGitRepo: 2,
  gitMissing: 3,
  unreadableFile: 4,
  /**
   * A path escapes the working root through a symlink or a junction. FATAL, and it is
   * used for exactly one thing: an `--out` that lands outside the root once symlinks
   * are followed.
   *
   * A tracked *source* symlink that escapes the repository is NOT fatal — it is
   * skipped and recorded in `unresolved` with its evidence (§11), because one bad
   * link should not stop a repository from being mapped. The first draft documented
   * this exit code as covering both, which was never true of the code.
   */
  symlinkEscape: 5,
  invalidEncoding: 6,
  badTsconfig: 7,
  /** `--out` is outside the working root by the letter of the path. */
  outOutsideRoot: 8,
  invalidOutput: 9,
  /**
   * The watch configuration is invalid — however it was spelled. Covers a malformed
   * `--config` file (bad JSON, wrong shape, unknown keys, missing/duplicate entries)
   * AND the cross-target validations that make a watch setup incoherent, such as an
   * `out` landing inside a watched repository without being git-ignored there
   * (plan/9-extract-watch.md §Config).
   */
  badConfig: 10,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class ExtractorError extends Error {
  readonly exitCode: ExitCode;
  readonly detail: Record<string, unknown>;

  constructor(exitCode: ExitCode, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ExtractorError';
    this.exitCode = exitCode;
    this.detail = detail;
  }

  /** Machine-readable, so a script can act on it without scraping stderr. */
  toJSON(): Record<string, unknown> {
    return { error: this.message, exitCode: this.exitCode, ...this.detail };
  }
}
