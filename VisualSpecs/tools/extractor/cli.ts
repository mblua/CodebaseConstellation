// npm run extract -- --repo <path> --out data/agentscommander.json
//
// Every failure is deterministic, carries a distinct non-zero exit code, and says
// what to do about it (§10.6).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { EXIT, ExtractorError } from './errors.ts';
import { assertOutputInsideRoot } from './confine.ts';
import { extract, type ExtractOptions } from './extract.ts';

const USAGE = `visual-specs-extract

  npm run extract -- --repo <path-to-repo> --out <path-to-json> [options]

Options
  --repo <path>            the repository to map. Must be a git repository.
  --out <path>             where to write the document. Must stay inside VisualSpecs/.
  --name <label>           what to call the repository (default: its directory name)
  --hierarchy <mode>       logical (default) | physical
  --invoke-facade <expr>   the call whose first argument is a command name
                           (default: transport.invoke)
  --bare-invoke            also treat invoke("name") as a command call
  --tsconfig <path>        the tsconfig that governs module resolution
                           (default: the repository's own tsconfig.json)
  --snippets               copy verbatim source lines into evidence. OFF by default:
                           it may copy a secret out of the repository into a
                           document you are about to commit.
  --stamp                  record generator.generatedAt (excluded from the
                           deterministic payload)
  -h, --help               this text
`;

function parseArgs(argv: readonly string[]): ExtractOptions {
  const flags: string[] = [];
  let repo: string | undefined;
  let out: string | undefined;
  let name: string | undefined;
  let hierarchy: 'logical' | 'physical' = 'logical';
  let invokeFacade = 'transport.invoke';
  let allowBareInvoke = false;
  let snippets = false;
  let stamp = false;
  let tsconfig: string | undefined;

  const need = (name: string, value: string | undefined): string => {
    if (value === undefined) throw new ExtractorError(EXIT.usage, `${name} needs a value`);
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    switch (arg) {
      case '-h':
      case '--help':
        process.stdout.write(USAGE);
        process.exit(EXIT.ok);
        break;
      case '--repo':
        repo = need('--repo', argv[++i]);
        break;
      case '--out':
        out = need('--out', argv[++i]);
        break;
      case '--name':
        name = need('--name', argv[++i]);
        break;
      case '--hierarchy': {
        const value = need('--hierarchy', argv[++i]);
        if (value !== 'logical' && value !== 'physical') {
          throw new ExtractorError(EXIT.usage, `--hierarchy must be logical or physical, not "${value}"`);
        }
        hierarchy = value;
        flags.push('--hierarchy', value);
        break;
      }
      case '--invoke-facade':
        invokeFacade = need('--invoke-facade', argv[++i]);
        flags.push('--invoke-facade', invokeFacade);
        break;
      case '--bare-invoke':
        allowBareInvoke = true;
        flags.push('--bare-invoke');
        break;
      case '--tsconfig':
        tsconfig = need('--tsconfig', argv[++i]);
        flags.push('--tsconfig', tsconfig);
        break;
      case '--snippets':
        snippets = true;
        flags.push('--snippets');
        break;
      case '--stamp':
        stamp = true;
        flags.push('--stamp');
        break;
      default:
        throw new ExtractorError(EXIT.usage, `unknown option: ${arg}`);
    }
  }

  if (repo === undefined) throw new ExtractorError(EXIT.usage, '--repo is required');
  if (out === undefined) throw new ExtractorError(EXIT.usage, '--out is required');

  // The default flags are recorded too, so the document always declares the
  // configuration that produced it, not just the non-default part of it.
  const declared = [
    ...(name === undefined ? [] : ['--name', name]),
    '--hierarchy',
    hierarchy,
    '--invoke-facade',
    invokeFacade,
    ...(allowBareInvoke ? ['--bare-invoke'] : []),
    ...(snippets ? ['--snippets'] : []),
    ...(tsconfig === undefined ? [] : ['--tsconfig', tsconfig]),
  ];
  void flags;

  return {
    repo,
    out,
    name,
    hierarchy,
    invokeFacade,
    allowBareInvoke,
    snippets,
    tsconfig,
    flags: declared,
    stamp,
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const workingRoot = process.cwd();
  // Lexical containment (including the Windows cross-drive case) → exit 8;
  // containment after following symlinks and junctions → exit 5. See confine.ts.
  const outPath = assertOutputInsideRoot(options.out, workingRoot);

  const { text, warnings, doc } = extract(options);

  mkdirSync(dirname(outPath), { recursive: true });
  // Re-check with the parent directory now on disk: `mkdir -p` follows a junction, so
  // the path that "did not exist yet" a moment ago may now resolve somewhere else.
  assertOutputInsideRoot(outPath, workingRoot);
  writeFileSync(outPath, text, 'utf8');

  for (const w of warnings) process.stderr.write(`warning: ${w}\n`);

  const stats = doc.stats ?? {};
  process.stdout.write(
    `${GENERATOR_LINE}\n` +
      `  repo         ${doc.source?.root ?? '?'} @ ${doc.source?.commit?.slice(0, 7) ?? 'no commit'}` +
      `${doc.source?.dirty === true ? ' (DIRTY working tree)' : ''}\n` +
      `  tracked      ${String(stats['trackedFiles'] ?? 0)} files\n` +
      `  nodes        ${String(doc.nodes.length)}  ${JSON.stringify(stats['nodesByKind'] ?? {})}\n` +
      `  edges        ${String(doc.edges.length)}  ${JSON.stringify(stats['edgesByKind'] ?? {})}\n` +
      `  unresolved   ${String(doc.unresolved?.length ?? 0)}\n` +
      `  digest       ${doc.generator?.configDigest ?? '?'}\n` +
      `  written      ${relative(workingRoot, outPath)}\n`,
  );
}

const GENERATOR_LINE = 'visual-specs-extract';

try {
  main();
} catch (err) {
  if (err instanceof ExtractorError) {
    process.stderr.write(`${JSON.stringify(err.toJSON())}\n`);
    process.exit(err.exitCode);
  }
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
}
