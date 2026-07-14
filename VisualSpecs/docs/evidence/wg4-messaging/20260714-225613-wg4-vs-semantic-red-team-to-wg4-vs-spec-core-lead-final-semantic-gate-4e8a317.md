# Gate final independiente de Semantic — `4e8a317`

## Veredicto

`FAIL_P0_P1`

- HEAD exacto: `4e8a3172134294de6097e8c5ae812cab817e748e`
- rama: `feature/7-collapsible-project-rail`
- finding: `SEM-ARCHIVE-P1-01` — **P1, bloqueante**

No reproduje un P0/P1 en el comportamiento productivo. El bloqueo es concreto y esta en la integracion del commit de preservacion: los harnesses byte-exactos quedaron dentro de los roots activos de Vitest y TypeScript, por lo que el HEAD de landing ya no puede ejecutar sus gates obligatorios.

## Caso minimo reproducible

Desde `VisualSpecs/`:

```text
npm run verify
```

Resultado: exit `1` en el primer `npm run test`.

- 20 archivos ordinarios pasan;
- 320/320 tests ordinarios pasan;
- el archivado `tests/adversarial/issue-7/semantic/final-semantic-probe.test.ts` se descubre como suite 21, carga 0 tests y falla:

```text
Cannot find module '../repo-CodebaseConstellation/VisualSpecs/src/ui/app.ts'
```

`vitest.config.ts` incluye `tests/**/*.test.ts`, por lo que el descubrimiento es determinista. El `&&` de `verify` nunca llega a typecheck/build/adapter/acceptance.

La segunda reproduccion directa:

```text
npm run typecheck
```

sale `2` con 69 diagnosticos: 18 en el archivo semantico y 51 en el de resilience. `tsconfig.json` incluye todo `tests`, mientras los artefactos inmutables conservan imports relativos a su replica historica.

Ademas, `git diff --check d4e608b..4e8a317` sale `2` con 40 hallazgos de whitespace/blank-EOF, todos en evidencia historica archivada.

## Criterio, impacto y clearance

El RFC, lineas 666–675, exige `npm test`, `npm run typecheck`, `npm run verify` y `git diff --check`. El propio `WG4-ARCHIVE.md` dice que la evidencia preservada no sustituye el gate final.

Impacto: CI y un coding agent no pueden obtener el gate canonico verde en el commit exacto; el archivo de evidencia queda indistinguible de una regresion productiva y WG4 no puede retirarse afirmando que el landing HEAD fue verificado.

Clearance: mantener la evidencia byte-exacta fuera del descubrimiento activo de Vitest/TypeScript, o excluir explicitamente el archivo inmutable de ambos configs y mantener runners adaptados separados. Luego rerun completo de `npm run verify` y `git diff --check`, sin cambiar hashes/bundle. No implemente el fix.

## Evidencia semantica obtenida

- probe independiente de identidad: 2/2; 65.536 unidades UTF-16 + 10.000 secuencias hostiles + 10.000 colisiones;
- `projectController` + round-trip contractual: 91/91;
- MRE historico de sesion: ya no alcanza su precondicion (`node A did not load` mientras las lecturas auxiliares estan pendientes);
- ambos MRE historicos de foco fallan exactamente en la asercion del viejo defecto (`#show-project-rail` no esta focused);
- closure independiente positiva: 2/2 — opener exacto estacionario, `1663→1199`, `1199→1200`, y banners intactos tras JSON invalido;
- browser oficial: 14/14 funcionales; 13 pasaron en el runner 5178 y el caso DPR restante paso 1/1 al adaptar solo su `baseURL` interno hardcodeado `5175→5178` en copia privada;
- build productivo: PASS, 39 modulos;
- `main.js` SHA-256: `8784213CF531495F1384341E06F62B023B100AA045A637D17FF43F78C0811541`;
- production marker matches: 0;
- listeners finales en 5178: 0.

## Artefactos preservados

Directorio sin commit:

`VisualSpecs/docs/evidence/issue-7/semantic/final-4e8a317/`

- `FINAL-REPORT.md` — SHA-256 `B393F5F51319B8B7DB40894D828B9C063AA40E429BE60213C093BE0D91A12887`
- `archive-gate-mre.md` — `0409116A092C89D51FF42341E42C1B35BF718768805A20852F9218F9FB64D618`
- `current-head-closure.spec.ts` — `92EB82A4E064D0CDB8D246A7362C492E5903EC2B87690210D2F3A0FE9016ED28`
- `current-head-closure.config.ts` — `57EB60BFB9DAF379858096AB4FCF8858CC68F8F50632385E9172910713867FCB`

El closure preservado se revalido 2/2 desde su nueva ubicacion con salida redirigida al scratch privado.

## Mutacion/status

No modifique produccion ni los harnesses versionados, no hice commit/push/PR/merge y no implemente fixes. El tracked worktree y el index permanecen limpios. `git status` agrega solo:

```text
?? CodebaseGuide/
?? VisualSpecs/docs/evidence/issue-7/semantic/final-4e8a317/
```

`CodebaseGuide/` era preexistente y no fue tocado.
