// Typed, distinguishable load errors (§3.4). The UI shows `message`; tests match
// on the class. Every one of them names what was wrong and where.

export class VisualSpecsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

/** The bytes were not JSON. Carries the engine's message; no character offset is
 *  promised — `JSON.parse` does not expose one portably (§3.4). */
export class InvalidJsonError extends VisualSpecsError {
  constructor(message: string) {
    super('invalid-json', `The file is not valid JSON: ${message}`);
  }
}

/** Valid JSON, wrong shape — including caps and dangerous keys. */
export class SchemaError extends VisualSpecsError {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    const head = problems[0] ?? 'unknown problem';
    const rest = problems.length > 1 ? ` (+${problems.length - 1} more)` : '';
    super('schema', `This document does not match the Visual Specs contract: ${head}${rest}`);
    this.problems = problems;
  }
}

/** Valid JSON, valid shape, broken graph: dangling ids, cycles, duplicate ids. */
export class IntegrityError extends VisualSpecsError {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    const head = problems[0] ?? 'unknown problem';
    const rest = problems.length > 1 ? ` (+${problems.length - 1} more)` : '';
    super('integrity', `The graph in this document is not well formed: ${head}${rest}`);
    this.problems = problems;
  }
}

/** Unknown MAJOR. Names both versions so the user knows what to do. */
export class IncompatibleVersionError extends VisualSpecsError {
  readonly documentVersion: string;
  readonly supportedVersion: string;

  constructor(documentVersion: string, supportedVersion: string) {
    super(
      'incompatible-version',
      `This document declares formatVersion ${documentVersion}; this build of Visual Specs reads ${supportedVersion}.x. ` +
        `A newer major version may mean anything, so it is refused rather than half-read.`,
    );
    this.documentVersion = documentVersion;
    this.supportedVersion = supportedVersion;
  }
}
