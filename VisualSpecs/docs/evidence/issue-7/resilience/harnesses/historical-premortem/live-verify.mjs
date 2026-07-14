// Independent READ-ONLY live verification for the final operational gate.
// Unauthenticated GitHub public API (no token, no mutation).
const R = 'mblua/CodebaseConstellation';
const B = `https://api.github.com/repos/${R}`;
const H = { Accept: 'application/vnd.github+json', 'User-Agent': 'vs-resilience-red-team-gate', 'X-GitHub-Api-Version': '2022-11-28' };
async function get(url) {
  const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(20000) });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
}
const CAND = '888d9d4a4548e002b19652bf756f57827806bc75';
const FAILH = '78c27a8d327c782e21841b9f3e8631d9dc155b2a';
const EXH = '46c3be76a1a5e2c7fdbe0c810301d066b26cee10';

function checkRuns(cr) {
  if (!cr || !cr.check_runs) return `(status/no check_runs) ${JSON.stringify(cr).slice(0,120)}`;
  return cr.check_runs.map(c => `${c.name}=${c.conclusion ?? c.status} app:${c.app?.id}(${c.app?.slug}) sha:${(c.head_sha||'').slice(0,7)}`).join(' | ') || '(none)';
}

(async () => {
  const repo = await get(B);
  console.log('REPO', repo.status, repo.body && `${repo.body.full_name} visibility=${repo.body.visibility} default=${repo.body.default_branch}`);

  const i1 = await get(`${B}/issues/1`);
  console.log('ISSUE#1', i1.status, i1.body && `state=${i1.body.state} isPR=${!!i1.body.pull_request} title="${i1.body.title}"`);

  for (const n of [2,3,4]) {
    const p = await get(`${B}/pulls/${n}`);
    const b = p.body || {};
    console.log(`PR#${n}`, p.status, `state=${b.state} merged=${b.merged} mergeable_state=${b.mergeable_state} head=${(b.head?.sha||'').slice(0,7)} base=${b.base?.ref} headref=${b.head?.ref}`);
  }

  console.log('CAND check-runs :', checkRuns((await get(`${B}/commits/${CAND}/check-runs`)).body));
  console.log('FAIL check-runs :', checkRuns((await get(`${B}/commits/${FAILH}/check-runs`)).body));
  console.log('EXEMPT check-runs:', checkRuns((await get(`${B}/commits/${EXH}/check-runs`)).body));

  const br = await get(`${B}/branches?per_page=100`);
  console.log('BRANCHES', br.status, Array.isArray(br.body) ? br.body.map(x=>`${x.name}${x.protected?'*':''}`).join(', ') : JSON.stringify(br.body).slice(0,120));

  // Rulesets almost certainly require auth; try anyway to see what an anonymous actor sees.
  const rs = await get(`${B}/rulesets`);
  console.log('RULESETS(list)', rs.status, Array.isArray(rs.body) ? rs.body.map(x=>`${x.id}:${x.name}:${x.enforcement}`).join(' | ') : JSON.stringify(rs.body).slice(0,160));
  const rid = await get(`${B}/rulesets/18856687`);
  console.log('RULESET(18856687)', rid.status, JSON.stringify(rid.body).slice(0,200));

  // rate check
  const rl = await get('https://api.github.com/rate_limit');
  console.log('RATE remaining', rl.body?.resources?.core?.remaining);
})();
