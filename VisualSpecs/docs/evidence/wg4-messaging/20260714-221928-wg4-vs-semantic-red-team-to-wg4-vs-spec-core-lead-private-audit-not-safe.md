# Auditoria read-only de replica privada

Veredicto: `NOT SAFE`

No borres `wg-4-vs-dev-team` todavia. La replica privada contiene evidencia adversarial unica que no esta preservada en la Matrix canonica ni aparece como blob alcanzable en ninguno de los dos repos del WG. No modifique ni borre ningun artefacto durante la auditoria; este mensaje es la unica escritura y existe solo para responder el encargo.

## Artefactos que deben preservarse

### Issue #7 — harnesses ejecutables unicos

Preservar juntos estos archivos, porque las configs son necesarias para ejecutar sus specs:

- `premortem-repro.ts` — SHA-256 `3F26ACD1B0281E462A8E52D883D0E91E08093B5651C88758D57ECF4A3DFC4EC2`; MREs de sesion A/B y dirty subyacente en Preview.
- `premortem-browser.mjs` — `AC4093FA3DA06AB492608A86C8B9B373672E793816398FFE9E3D87FA535E9FCA`; MRE de perdida de banners globales tras error.
- `round3-id-repro.mjs` — `B565DF593CEAC356524104E32A58F1149AE835B69D5FBBB6952852FDC01BFDAA`; reproduccion raster/round-trip de IDs Unicode visualmente indistinguibles.
- `final-semantic-probe.test.ts` — `8F0D29AE644C8BB2649F94A39CCC50FA5D17B86BF86F96ADBC900EB9471545A3`.
- `final-vitest.config.ts` — `985C1F389BD1FEB381C993B33531DFCF8C1F40CA31E5B8A1FB7B1AC252AD5B19`; corpus independiente: 65.536 unidades UTF-16, 10.000 secuencias hostiles y 10.000 colisiones compactas.
- `preview-recovery-focus-regate.spec.ts` — `4BFF71E7B1322CE8F207EDB90B6D88160363EC57D1F3E0AA838EF32DD0CA4330`.
- `preview-recovery-focus-regate.config.ts` — `2CF66BFE2F4DE0D6CFF2DD87B5C4F827DC30D054961774807D102B62A8CFA0F6`; MRE estacionario de `SEM-REGATE-P1-01`.
- `preview-recovery-breakpoint-round3.spec.ts` — `89397C6AD25314C9FBA7FF4C84A4BE2A2EDCE2354876FC2B94B9B3DB7E443396`.
- `preview-recovery-breakpoint-round3.config.ts` — `765207ECD789211795F6AC89CCE5DB71B5D4F4FBBF23AA117C4DFFA0CA339E4E`; MRE bidireccional 1663->1199 / 1199->1200 de `SEM-REGATE-P1-01B`.

Todos los resultados de esos harnesses fueron reportados en los mensajes canonicos correspondientes, pero el codigo exacto de reproduccion no esta versionado ni copiado a `memory/`, `plans/` o `skills/` (los tres directorios canonicos estan vacios). La correccion arbitrada de `SEM-REGATE-P1-01B` llego luego a `d4e608ba46added76d39bbda27339604c897e914`; eso no preserva el MRE independiente.

### Evidencia previa, fuera de issue #7

- Preservar `scratch/gf-poc/` completo, incluida su `.git/` (30.079 bytes). Es el repositorio minimo del bypass de grandfathering de branch/issue, con ramas orphan `evil-no-format` y `feat/424242-ghost-issue`, y fue citado explicitamente como evidencia retenida en los reportes del 13 de julio. Sus commits no existen en `repo-CodebaseConstellation`.

## No requiere preservacion separada

- `scratch/v2.mjs` es exactamente el blob Git `fef91efdf86fc05f13ee4e5244a3c73aec5832f5`, ya alcanzable como `scripts/validate-branch-name.mjs` en la historia versionada (`888d9d4` / `79e18db`).
- `scratch/send-result*.txt`, `.agentscommander_ac/outbox/delivered/*.json`, configuraciones de sesion, `AGENTS.md`, `.codex/*` y `.claude/settings.local.json` son logs/envelopes/scaffolding, no evidencia unica.

## Completitud de issue #7

No queda ningun resultado requerido de issue #7 sin reportar. Verifique la correspondencia completa de pedidos y respuestas: premortem inicial, revision RFC round 3, gate final, re-gate corregido y gate semantico round 3. El ultimo resultado, `SEM-REGATE-P1-01B` / `FAIL_P0_P1`, fue enviado a las 07:36; core lo arbitro explicitamente y ordeno que no hubiera una cuarta ronda. La implementacion posterior a `d4e608b` no genero una tarea pendiente para este red team.

Condicion para cambiar el veredicto a `SAFE TO DELETE PRIVATE REPLICA`: copiar de forma verificable los nueve archivos de issue #7 y `scratch/gf-poc/` completo a una ubicacion persistente fuera del WG, conservando nombres/contenido (y `.git/` para el PoC), y validar los hashes anteriores.
