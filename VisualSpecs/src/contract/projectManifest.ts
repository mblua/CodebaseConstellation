import { SchemaError } from './errors.ts';
import { DEFAULT_LIMITS, type Limits } from './limits.ts';
import { canonicalStringify, deepClone, isJsonObject, parseJson, scanJson } from './json.ts';
import type { JsonObject, JsonValue } from './types.ts';
import { isDocRevision, type DocRevision } from './revision.ts';

export const PROJECT_SCHEMA = 'visual-specs.project';
export const PROJECT_FORMAT_VERSION = '1.0';
export const PROJECT_CURRENT_FILE = 'data/current.json';
export const PROJECT_AUTOSAVE_VIEW_FILE = 'data/autosave-view.json';
export const PROJECT_DIR = '.visual-specs';

export interface VisualSpecsProjectManifestV1 {
  schema: typeof PROJECT_SCHEMA;
  formatVersion: typeof PROJECT_FORMAT_VERSION;
  project: {
    id: string;
    name: string;
    createdAtUtc: string;
    updatedAtUtc: string;
  };
  current: {
    docId: string;
    revision: DocRevision;
    committedAtUtc: string;
  };
  files: {
    current: typeof PROJECT_CURRENT_FILE;
    autosaveView: typeof PROJECT_AUTOSAVE_VIEW_FILE;
  };
  migration?: {
    createdBy: 'visual-specs';
    acceptsLegacyGeneratorNames?: readonly string[];
  };
}

export interface ParsedProjectManifest {
  manifest: VisualSpecsProjectManifestV1;
  raw: JsonObject;
}

export function parseProjectManifest(
  text: string,
  limits: Limits = DEFAULT_LIMITS,
): ParsedProjectManifest {
  const raw = parseJson(text, limits);
  const scan = scanJson(raw, limits);
  const problems: string[] = [];
  if (scan.dangerousKeyPaths.length > 0) {
    throw new SchemaError(
      scan.dangerousKeyPaths.map((p) => `dangerous key at ${p} (prototype pollution)`),
    );
  }
  if (scan.nonFinitePaths.length > 0) {
    throw new SchemaError(scan.nonFinitePaths.map((p) => `non-finite number at ${p}`));
  }
  if (scan.oversizedStringPaths.length > 0) {
    throw new SchemaError(
      scan.oversizedStringPaths.map((p) => `string at ${p} is longer than the cap`),
    );
  }
  if (!isJsonObject(raw)) throw new SchemaError(['project.json root is not an object']);

  if (raw['schema'] !== PROJECT_SCHEMA) problems.push(`schema must be ${PROJECT_SCHEMA}`);
  if (raw['formatVersion'] !== PROJECT_FORMAT_VERSION) {
    problems.push(`formatVersion must be ${PROJECT_FORMAT_VERSION}`);
  }

  const project = raw['project'];
  const current = raw['current'];
  const files = raw['files'];
  if (!isJsonObject(project)) problems.push('project is missing or is not an object');
  if (!isJsonObject(current)) problems.push('current is missing or is not an object');
  if (!isJsonObject(files)) problems.push('files is missing or is not an object');
  if (problems.length > 0) throw new SchemaError(problems);

  const projectObject = project as JsonObject;
  const currentObject = current as JsonObject;
  const filesObject = files as JsonObject;

  const id = stringField(projectObject, 'id', 'project.id', problems);
  const name = stringField(projectObject, 'name', 'project.name', problems);
  const createdAtUtc = utcField(projectObject, 'createdAtUtc', 'project.createdAtUtc', problems);
  const updatedAtUtc = utcField(projectObject, 'updatedAtUtc', 'project.updatedAtUtc', problems);
  if (name !== null && (name.trim() !== name || name.length < 1 || name.length > 120)) {
    problems.push('project.name must be trimmed and 1..120 characters');
  }

  const docId = stringField(currentObject, 'docId', 'current.docId', problems);
  const revisionValue = currentObject['revision'];
  const revision = isDocRevision(revisionValue) ? revisionValue : null;
  if (revision === null) problems.push('current.revision must be sha256:<64 lowercase hex>');
  const committedAtUtc = utcField(
    currentObject,
    'committedAtUtc',
    'current.committedAtUtc',
    problems,
  );

  if (filesObject['current'] !== PROJECT_CURRENT_FILE) {
    problems.push(`files.current must be ${PROJECT_CURRENT_FILE}`);
  }
  if (filesObject['autosaveView'] !== PROJECT_AUTOSAVE_VIEW_FILE) {
    problems.push(`files.autosaveView must be ${PROJECT_AUTOSAVE_VIEW_FILE}`);
  }

  const migration = parseMigration(raw['migration'], problems);

  if (problems.length > 0) throw new SchemaError(problems);
  if (
    id === null ||
    name === null ||
    createdAtUtc === null ||
    updatedAtUtc === null ||
    docId === null ||
    revision === null ||
    committedAtUtc === null
  ) {
    throw new SchemaError(['project manifest is incomplete']);
  }

  const manifest: VisualSpecsProjectManifestV1 = {
    schema: PROJECT_SCHEMA,
    formatVersion: PROJECT_FORMAT_VERSION,
    project: { id, name, createdAtUtc, updatedAtUtc },
    current: { docId, revision, committedAtUtc },
    files: {
      current: PROJECT_CURRENT_FILE,
      autosaveView: PROJECT_AUTOSAVE_VIEW_FILE,
    },
  };
  if (migration !== undefined) manifest.migration = migration;
  return { manifest, raw };
}

export function projectManifestText(
  manifest: VisualSpecsProjectManifestV1,
  previousRaw?: JsonObject,
): string {
  const out = previousRaw === undefined ? (Object.create(null) as JsonObject) : deepClone(previousRaw);
  out['schema'] = manifest.schema;
  out['formatVersion'] = manifest.formatVersion;
  const project = preservedObject(out['project']);
  project['id'] = manifest.project.id;
  project['name'] = manifest.project.name;
  project['createdAtUtc'] = manifest.project.createdAtUtc;
  project['updatedAtUtc'] = manifest.project.updatedAtUtc;
  out['project'] = project;

  const current = preservedObject(out['current']);
  current['docId'] = manifest.current.docId;
  current['revision'] = manifest.current.revision;
  current['committedAtUtc'] = manifest.current.committedAtUtc;
  out['current'] = current;

  const files = preservedObject(out['files']);
  files['current'] = PROJECT_CURRENT_FILE;
  files['autosaveView'] = PROJECT_AUTOSAVE_VIEW_FILE;
  out['files'] = files;

  if (manifest.migration === undefined) delete out['migration'];
  else {
    const migration = preservedObject(out['migration']);
    migration['createdBy'] = manifest.migration.createdBy;
    if (manifest.migration.acceptsLegacyGeneratorNames === undefined) {
      delete migration['acceptsLegacyGeneratorNames'];
    } else {
      migration['acceptsLegacyGeneratorNames'] = [...manifest.migration.acceptsLegacyGeneratorNames];
    }
    out['migration'] = migration;
  }
  return canonicalStringify(out);
}

export function makeProjectManifest(input: {
  id: string;
  name: string;
  docId: string;
  revision: DocRevision;
  nowUtc: string;
}): VisualSpecsProjectManifestV1 {
  return {
    schema: PROJECT_SCHEMA,
    formatVersion: PROJECT_FORMAT_VERSION,
    project: {
      id: input.id,
      name: input.name,
      createdAtUtc: input.nowUtc,
      updatedAtUtc: input.nowUtc,
    },
    current: {
      docId: input.docId,
      revision: input.revision,
      committedAtUtc: input.nowUtc,
    },
    files: {
      current: PROJECT_CURRENT_FILE,
      autosaveView: PROJECT_AUTOSAVE_VIEW_FILE,
    },
    migration: {
      createdBy: 'visual-specs',
      acceptsLegacyGeneratorNames: ['codebaseguide-extract'],
    },
  };
}

export function withProjectUpdate(
  manifest: VisualSpecsProjectManifestV1,
  input: { name?: string; revision?: DocRevision; committedAtUtc?: string; updatedAtUtc: string },
): VisualSpecsProjectManifestV1 {
  return {
    ...manifest,
    project: {
      ...manifest.project,
      name: input.name ?? manifest.project.name,
      updatedAtUtc: input.updatedAtUtc,
    },
    current: {
      ...manifest.current,
      revision: input.revision ?? manifest.current.revision,
      committedAtUtc: input.committedAtUtc ?? manifest.current.committedAtUtc,
    },
  };
}

export function validateProjectName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new SchemaError(['project.name must not be empty']);
  if (trimmed.length > 120) throw new SchemaError(['project.name must be at most 120 characters']);
  return trimmed;
}

export function isIsoUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
}

function stringField(
  object: JsonObject,
  key: string,
  label: string,
  problems: string[],
): string | null {
  const value = object[key];
  if (typeof value !== 'string' || value === '') {
    problems.push(`${label} must be a non-empty string`);
    return null;
  }
  return value;
}

function utcField(
  object: JsonObject,
  key: string,
  label: string,
  problems: string[],
): string | null {
  const value = stringField(object, key, label, problems);
  if (value !== null && !isIsoUtc(value)) problems.push(`${label} must be an ISO UTC timestamp`);
  return value;
}

function parseMigration(
  value: JsonValue | undefined,
  problems: string[],
): VisualSpecsProjectManifestV1['migration'] | undefined {
  if (value === undefined) return undefined;
  if (!isJsonObject(value)) {
    problems.push('migration is not an object');
    return undefined;
  }
  const createdBy = value['createdBy'];
  if (createdBy !== 'visual-specs') {
    problems.push('migration.createdBy must be visual-specs');
    return undefined;
  }
  const accepts = value['acceptsLegacyGeneratorNames'];
  if (accepts === undefined) return { createdBy };
  if (!Array.isArray(accepts) || !accepts.every((item) => typeof item === 'string')) {
    problems.push('migration.acceptsLegacyGeneratorNames must be an array of strings');
    return undefined;
  }
  return { createdBy, acceptsLegacyGeneratorNames: accepts as string[] };
}

function preservedObject(value: JsonValue | undefined): JsonObject {
  return isJsonObject(value) ? deepClone(value) : (Object.create(null) as JsonObject);
}
