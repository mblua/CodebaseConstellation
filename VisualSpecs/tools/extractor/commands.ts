// A transport contract with TWO backends (§10.4). This is the relation that makes
// the map worth reading, and it is where an earlier draft was most wrong: it
// called the relation "Tauri IPC" and matched a bare `invoke("name")`. The
// repository does not work that way.
//
// What is actually there:
//
//   * `src/shared/ipc.ts` defines a FACADE — `transport.invoke<T>(cmd, args)` —
//     and every command call in the frontend goes through it.
//   * `createDefaultTransport()` returns `isTauri ? new TauriTransport() : new
//     WsTransport()`. So a call site is NOT unconditionally Tauri IPC. It is a
//     COMMAND CONTRACT with two backends, selected at runtime by platform.
//   * Backend 1 — Tauri: `#[tauri::command]` PLUS registration in
//     `generate_handler![…]`. Tauri requires that registration; an unregistered
//     attribute is not callable, so two pieces of evidence are not enough.
//   * Backend 2 — the web router: a `match cmd` arm in `src-tauri/src/web/commands.rs`,
//     reached over the WebSocket transport.
//
// | Emit           | Requires                                                        | Confidence |
// |----------------|-----------------------------------------------------------------|------------|
// | tauri-command  | literal call + `#[tauri::command]` on `fn <name>` + registration | resolved   |
// | web-command    | literal call + a matching arm in the web router                  | resolved   |
// | *nothing*      | fewer pieces, or a non-literal command name                     | unresolved |
//
// A command bound to BOTH backends produces TWO logical edges with different
// targets. That is not double-counting: they are two different facts, and seeing
// both is the point.

import ts from 'typescript';
import type { Evidence, VisualSpecsEdge, Unresolved } from '../../src/contract/types.ts';
import { lineOfIndex } from './manifests.ts';
import { fileNodeId } from './ownership.ts';
import { readTextFile } from './repo.ts';
import { stripComments } from './rust/usetree.ts';

export interface CommandsOptions {
  /** The facade whose calls carry a command name. Configurable, not hard-coded. */
  invokeFacade: string;
  /** Also treat a bare `invoke("name")` as a call, for repos using the Tauri API directly. */
  allowBareInvoke: boolean;
}

export interface CommandsResult {
  edges: VisualSpecsEdge[];
  unresolved: Unresolved[];
  stats: {
    invokeCallSites: number;
    invokeCallSiteFiles: string[];
    literalCommands: number;
    nonLiteralCallSites: number;
    /** Literal `.invoke("x")` calls on a receiver that is NOT the facade — a test
     *  double, or a transport implementation. Counted, never drawn. */
    nonFacadeLiteralInvokeCalls: number;
    tauriCommandAttributes: number;
    tauriCommandAttributeFiles: number;
    registeredCommands: number;
    webRouterArms: number;
    registeredButUncalledCommands: string[];
    attributedButUnregisteredCommands: string[];
    commandsBoundToBothBackends: number;
  };
}

interface CallSite {
  file: string;
  line: number;
  command: string;
}

interface Definition {
  file: string;
  line: number;
}

export function extractCommands(
  root: string,
  files: readonly string[],
  options: CommandsOptions,
): CommandsResult {
  const edges: VisualSpecsEdge[] = [];
  const unresolved: Unresolved[] = [];

  const calls: CallSite[] = [];
  const callFiles = new Set<string>();
  let nonLiteral = 0;
  let callSites = 0;
  let nonFacadeLiteralCalls = 0;

  // --- frontend call sites, from the AST, not a regex ------------------------
  for (const file of files) {
    if (!/\.(ts|tsx|mts|cts)$/i.test(file)) continue;
    const text = readTextFile(root, file);
    if (!text.includes('invoke')) continue;

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const kind = classifyCall(node.expression, options);
        if (kind !== 'none') {
          const first = node.arguments[0];
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          const literal = first !== undefined && ts.isStringLiteralLike(first);

          if (kind === 'facade') {
            callSites += 1;
            callFiles.add(file);
            if (literal) {
              calls.push({ file, line, command: (first as ts.StringLiteralLike).text });
            } else {
              nonLiteral += 1;
              unresolved.push({
                kind: 'tauri-command',
                reason: 'command name is not a string literal',
                evidence: [
                  { path: file, line, note: truncate(node.getText(source).replace(/\s+/g, ' '), 120) },
                ],
                detail: { from: file },
              });
            }
          } else if (!literal) {
            // An invoke-shaped call on some OTHER receiver, with a variable command
            // name. This is the facade's own internal dispatch —
            // `currentTransport().invoke<T>(cmd, args)` at ipc.ts:105 — and the
            // transports' own implementations. §10.4 is explicit that this "is
            // precisely the case that must land in `unresolved`, not become a
            // phantom edge". An INVISIBLE call is not an unresolved one, so it is
            // recorded here even though it is not a facade call site.
            nonLiteral += 1;
            unresolved.push({
              kind: 'tauri-command',
              reason: 'command name is not a string literal',
              evidence: [
                { path: file, line, note: truncate(node.getText(source).replace(/\s+/g, ' '), 120) },
              ],
              detail: { from: file, viaFacade: false },
            });
          } else {
            // A LITERAL invoke on a non-facade receiver: a test double, or a
            // transport implementation calling itself. It does not reach a backend
            // through the configured facade, so drawing an edge from it would be a
            // relation that does not exist. Counted, never drawn.
            nonFacadeLiteralCalls += 1;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  // --- backend 1: Tauri ------------------------------------------------------
  const tauriDefs = new Map<string, Definition>();
  const tauriFiles = new Set<string>();
  let tauriAttributes = 0;
  const registered = new Map<string, Definition>();

  for (const file of files) {
    if (!file.endsWith('.rs')) continue;
    const raw = readTextFile(root, file);
    const text = stripComments(raw); // the 135th `#[tauri::command]` is inside a comment

    // Anchored: the attribute must START a line (after whitespace). An unanchored
    // grep also matches prose, and that is exactly how "135" happened (§10.5).
    const attrRe = /^[ \t]*#\[tauri::command[^\]]*\]/gm;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(text)) !== null) {
      tauriAttributes += 1;
      tauriFiles.add(file);
      const fn = findFollowingFn(text, m.index + m[0].length);
      if (fn === null) continue;
      tauriDefs.set(fn.name, { file, line: lineOfIndex(text, fn.index) });
    }

    // Registration: Tauri requires it. An attribute alone is not a callable command.
    const handlerRe = /generate_handler!\s*\[/g;
    let h: RegExpExecArray | null;
    while ((h = handlerRe.exec(text)) !== null) {
      const close = matchBracket(text, h.index + h[0].length - 1);
      if (close === -1) continue;
      const body = text.slice(h.index + h[0].length, close);
      for (const entry of body.split(',')) {
        const name = entry.trim().split('::').pop()?.trim();
        if (name === undefined || name === '' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
        registered.set(name, { file, line: lineOfIndex(text, h.index) });
      }
    }
  }

  // --- backend 2: the web router --------------------------------------------
  const webArms = new Map<string, Definition>();
  for (const file of files) {
    if (!file.endsWith('.rs')) continue;
    const raw = readTextFile(root, file);
    if (!raw.includes('match cmd')) continue;
    const text = stripCfgTestModules(stripComments(raw)); // the shipped router only

    const matchRe = /match\s+cmd\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = matchRe.exec(text)) !== null) {
      const open = m.index + m[0].length - 1;
      const close = matchBracket(text, open);
      if (close === -1) continue;
      const body = text.slice(open + 1, close);
      const armRe = /"([^"\\]+)"\s*(?:\|\s*"[^"\\]+"\s*)*=>/g;
      let arm: RegExpExecArray | null;
      while ((arm = armRe.exec(body)) !== null) {
        // `"a" | "b" => …` binds every name in the alternation.
        const names = [...(arm[0].match(/"([^"\\]+)"/g) ?? [])].map((s) => s.slice(1, -1));
        for (const name of names) {
          if (webArms.has(name)) continue;
          webArms.set(name, { file, line: lineOfIndex(text, open + 1 + arm.index) });
        }
      }
    }
  }

  // --- emit ------------------------------------------------------------------
  const called = new Set<string>();
  const bothBackends = new Set<string>();

  for (const call of calls) {
    called.add(call.command);
    const tauri = tauriDefs.get(call.command);
    const reg = registered.get(call.command);
    const web = webArms.get(call.command);

    let emitted = false;

    if (tauri !== undefined && reg !== undefined) {
      const evidence: Evidence[] = [
        { path: call.file, line: call.line, note: `${options.invokeFacade}("${call.command}")` },
        { path: tauri.file, line: tauri.line, note: `#[tauri::command] fn ${call.command}` },
        { path: reg.file, line: reg.line, note: 'registered in tauri::generate_handler![…]' },
      ];
      edges.push({
        id: `tauri-command:${fileNodeId(call.file)}->${fileNodeId(tauri.file)}#${call.command}`,
        kind: 'tauri-command',
        sourceId: fileNodeId(call.file),
        targetId: fileNodeId(tauri.file),
        label: call.command,
        confidence: 'resolved',
        metadata: { command: call.command, binding: 'tauri' },
        evidence,
      });
      emitted = true;
    } else if (tauri !== undefined && reg === undefined) {
      unresolved.push({
        kind: 'tauri-command',
        reason:
          'the command has a #[tauri::command] attribute but is not registered in generate_handler!, so it is not callable over the Tauri backend',
        evidence: [
          { path: call.file, line: call.line, note: `${options.invokeFacade}("${call.command}")` },
          { path: tauri.file, line: tauri.line, note: `#[tauri::command] fn ${call.command}` },
        ],
        detail: { command: call.command },
      });
    }

    if (web !== undefined && tauri === undefined) {
      // Verified in this repository: `subscribe_session` and `get_pty_size` are
      // web-router only — they are NOT `#[tauri::command]`. They resolve as
      // web-command and are UNRESOLVED as Tauri, and saying so is the whole point
      // of the coverage discipline (§10.4).
      unresolved.push({
        kind: 'tauri-command',
        reason:
          'the command is called and routed over the web backend, but no #[tauri::command] defines it, so it is not callable over Tauri',
        evidence: [
          { path: call.file, line: call.line, note: `${options.invokeFacade}("${call.command}")` },
          { path: web.file, line: web.line, note: `match arm "${call.command}" in the WebSocket router` },
        ],
        detail: { command: call.command },
      });
    }

    if (web !== undefined) {
      edges.push({
        id: `web-command:${fileNodeId(call.file)}->${fileNodeId(web.file)}#${call.command}`,
        kind: 'web-command',
        sourceId: fileNodeId(call.file),
        targetId: fileNodeId(web.file),
        label: call.command,
        confidence: 'resolved',
        metadata: { command: call.command, binding: 'web' },
        evidence: [
          { path: call.file, line: call.line, note: `${options.invokeFacade}("${call.command}")` },
          { path: web.file, line: web.line, note: `match arm "${call.command}" in the WebSocket router` },
        ],
      });
      emitted = true;
      if (tauri !== undefined && reg !== undefined) bothBackends.add(call.command);
    }

    if (!emitted && tauri === undefined) {
      unresolved.push({
        kind: 'web-command',
        reason: 'the command is called but no backend defines it (no Tauri command, no web router arm)',
        evidence: [{ path: call.file, line: call.line, note: `${options.invokeFacade}("${call.command}")` }],
        detail: { command: call.command },
      });
    }
  }

  dedupeById(edges);
  edges.sort((a, b) => (a.id < b.id ? -1 : 1));
  unresolved.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));

  // A registered-but-uncalled command is a FINDING, not an unresolved relation.
  // An earlier draft of the architecture asserted `"unusedCommands": []`. It was
  // never measured, and it is false.
  const registeredButUncalled = [...registered.keys()].filter((c) => !called.has(c)).sort();
  const attributedButUnregistered = [...tauriDefs.keys()].filter((c) => !registered.has(c)).sort();

  return {
    edges,
    unresolved,
    stats: {
      invokeCallSites: callSites,
      invokeCallSiteFiles: [...callFiles].sort(),
      literalCommands: new Set(calls.map((c) => c.command)).size,
      nonLiteralCallSites: nonLiteral,
      nonFacadeLiteralInvokeCalls: nonFacadeLiteralCalls,
      tauriCommandAttributes: tauriAttributes,
      tauriCommandAttributeFiles: tauriFiles.size,
      registeredCommands: registered.size,
      webRouterArms: webArms.size,
      registeredButUncalledCommands: registeredButUncalled,
      attributedButUnregisteredCommands: attributedButUnregistered,
      commandsBoundToBothBackends: bothBackends.size,
    },
  };
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

/**
 * The facade is a RULE, not a hard-coded regex — and it has two tiers, because one
 * tier cannot be both safe and complete.
 *
 *  'facade'      — the configured receiver and method, e.g. `transport.invoke`.
 *                  These are the command CALL SITES. Only these produce edges.
 *  'invoke-like' — the same METHOD on a different receiver, e.g.
 *                  `currentTransport().invoke(cmd, args)`. Never an edge, because a
 *                  transport implementation calling itself does not reach a
 *                  backend. But a non-literal one still goes to `unresolved`,
 *                  because §10.4 requires that call to be visible.
 *
 * Matching the method alone would have drawn command edges out of `transport-ws.ts`
 * and a test fake — relations that do not exist. Matching the receiver alone would
 * have made the facade's own dispatch invisible. Neither is acceptable, so the rule
 * distinguishes them.
 */
function classifyCall(
  expression: ts.Expression,
  options: CommandsOptions,
): 'facade' | 'invoke-like' | 'none' {
  const dot = options.invokeFacade.lastIndexOf('.');
  const receiver = dot === -1 ? null : options.invokeFacade.slice(0, dot);
  const method = dot === -1 ? options.invokeFacade : options.invokeFacade.slice(dot + 1);

  if (ts.isPropertyAccessExpression(expression)) {
    if (expression.name.getText() !== method) return 'none';
    if (receiver !== null && expression.expression.getText() === receiver) return 'facade';
    return 'invoke-like';
  }
  if (ts.isIdentifier(expression) && expression.getText() === method) {
    // A bare `invoke("name")` — for repositories that call the Tauri API directly.
    return options.allowBareInvoke ? 'facade' : 'none';
  }
  return 'none';
}

function findFollowingFn(text: string, from: number): { name: string; index: number } | null {
  // Skip other attributes and whitespace between the attribute and the signature.
  const window = text.slice(from, from + 2000);
  const re = /(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/;
  const m = re.exec(window);
  if (m === null) return null;
  return { name: m[1] as string, index: from + m.index };
}

/** `#[cfg(test)] mod tests { … }` is not the shipped router. */
export function stripCfgTestModules(text: string): string {
  let out = text;
  for (;;) {
    const m = /#\[cfg\(test\)\]\s*(?:pub\s+)?mod\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/.exec(out);
    if (m === null) return out;
    const open = m.index + m[0].length - 1;
    const close = matchBracket(out, open);
    if (close === -1) return out;
    out = out.slice(0, m.index) + out.slice(close + 1);
  }
}

function matchBracket(text: string, open: number): number {
  const opener = text[open];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : opener === '(' ? ')' : null;
  if (closer === null) return -1;
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function dedupeById(edges: VisualSpecsEdge[]): void {
  const byId = new Map<string, VisualSpecsEdge>();
  for (const edge of edges) {
    const seen = byId.get(edge.id);
    if (seen === undefined) {
      byId.set(edge.id, edge);
      continue;
    }
    for (const ev of edge.evidence ?? []) {
      if (!(seen.evidence ?? []).some((e) => e.path === ev.path && e.line === ev.line && e.note === ev.note)) {
        (seen.evidence ??= []).push(ev);
      }
    }
  }
  edges.length = 0;
  for (const edge of byId.values()) edges.push(edge);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
