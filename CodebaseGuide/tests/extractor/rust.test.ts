// The Rust use-tree parser (§10.3). Grouped use-trees are real and common — 516 of
// them in AgentsCommander — and a per-line regex mis-parses every one.

import { describe, expect, it } from 'vitest';
import {
  parseModDeclarations,
  parseTree,
  parseUseStatements,
  stripComments,
} from '../../tools/extractor/rust/usetree.ts';
import { stripCfgTestModules } from '../../tools/extractor/commands.ts';

const paths = (source: string): string[][] =>
  parseUseStatements(source).flatMap((s) => s.leaves.map((l) => l.path));

describe('use-tree parsing', () => {
  it('parses a plain path', () => {
    expect(paths('use crate::a::b;')).toEqual([['crate', 'a', 'b']]);
  });

  it('parses a flat group', () => {
    expect(paths('use crate::{a, b};')).toEqual([
      ['crate', 'a'],
      ['crate', 'b'],
    ]);
  });

  it('parses a NESTED group — the case a per-line regex gets wrong', () => {
    expect(parseTree('crate::a::{b, c::{d, e}, f as g}').map((l) => l.path)).toEqual([
      ['crate', 'a', 'b'],
      ['crate', 'a', 'c', 'd'],
      ['crate', 'a', 'c', 'e'],
      ['crate', 'a', 'f'],
    ]);
  });

  it('parses a multi-line group', () => {
    const source = `
use crate::{
    solver::{run as run_solver, Options},
    util::{self, helper},
};
`;
    expect(paths(source)).toEqual([
      ['crate', 'solver', 'run'],
      ['crate', 'solver', 'Options'],
      ['crate', 'util'],
      ['crate', 'util', 'helper'],
    ]);
  });

  it('marks a glob, and never guesses what it brings in', () => {
    const leaves = parseUseStatements('use crate::foo::*;').flatMap((s) => s.leaves);
    expect(leaves).toEqual([{ path: ['crate', 'foo'], glob: true }]);
  });

  it('handles pub use, super, self, and an alias', () => {
    expect(paths('pub use super::a as b;')).toEqual([['super', 'a']]);
    expect(paths('pub(crate) use self::x;')).toEqual([['self', 'x']]);
  });

  it('reports the line of the `use` keyword', () => {
    const statements = parseUseStatements('\n\nuse crate::a;\n');
    expect(statements[0]?.line).toBe(3);
  });

  it('ignores a `use` inside a comment or a string', () => {
    expect(paths('// use crate::ghost;\nuse crate::real;')).toEqual([['crate', 'real']]);
    expect(paths('/* use crate::ghost; */ use crate::real;')).toEqual([['crate', 'real']]);
    const s = 'let x = "use crate::ghost;";\nuse crate::real;';
    expect(paths(s)).toEqual([['crate', 'real']]);
  });
});

describe('mod declarations', () => {
  it('finds `mod foo;` — which has a backing file', () => {
    expect(parseModDeclarations('mod a;\npub mod b;').map((d) => d.name)).toEqual(['a', 'b']);
  });

  it('IGNORES `mod tests { … }` — an inline module has no backing file, and inventing one is a lie', () => {
    const source = '#[cfg(test)]\nmod tests {\n  fn x() {}\n}\n';
    expect(parseModDeclarations(source)).toEqual([]);
  });
});

describe('comment stripping preserves line numbers', () => {
  it('keeps newlines so a reported line still points at the right source line', () => {
    const source = 'a\n// comment\nuse crate::x;\n';
    const stripped = stripComments(source);
    expect(stripped.split('\n')).toHaveLength(source.split('\n').length);
    expect(parseUseStatements(source)[0]?.line).toBe(3);
  });
});

describe('#[cfg(test)] modules are not the shipped router', () => {
  it('removes them entirely, so a decoy match arm never becomes a command', () => {
    const source = `
pub fn route(cmd: &str) -> u8 {
    match cmd { "real" => 1, _ => 0 }
}

#[cfg(test)]
mod tests {
    fn decoy(cmd: &str) -> u8 {
        match cmd { "never_shipped" => 9, _ => 0 }
    }
}
`;
    const shipped = stripCfgTestModules(source);
    expect(shipped).toContain('"real"');
    expect(shipped).not.toContain('never_shipped');
  });
});
