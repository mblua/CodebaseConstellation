# Preservacion de evidencia semantica completada

Resultado: los artefactos privados unicos quedaron preservados dentro de las dos rutas autorizadas de `repo-CodebaseConstellation`. No ejecute el gate final, no hice commit y no toque otras rutas.

Repositorio verificado:

- rama: `feature/7-collapsible-project-rail`
- HEAD sin cambio: `d4e608ba46added76d39bbda27339604c897e914`

## Inventario de harnesses

Copie sin modificar contenido estos nueve archivos a `VisualSpecs/tests/adversarial/issue-7/semantic/`:

1. `premortem-repro.ts`
2. `premortem-browser.mjs`
3. `final-semantic-probe.test.ts`
4. `final-vitest.config.ts`
5. `preview-recovery-focus-regate.spec.ts`
6. `preview-recovery-focus-regate.config.ts`
7. `preview-recovery-breakpoint-round3.spec.ts`
8. `preview-recovery-breakpoint-round3.config.ts`
9. `round3-id-repro.mjs`

Verificacion independiente posterior a la copia: `HARNESS_COUNT=9` y `ALL_SOURCE_COPY_HASHES_MATCH=True`. Para cada archivo coinciden tanto bytes como SHA-256 de origen/copia. Los hashes individuales y los resultados ya reportados estan en `VisualSpecs/docs/evidence/issue-7/semantic/README.md`.

El README tambien documenta la condicion de replay: las copias son inmutables y conservan rutas historicas absolutas/relativas; cualquier adaptacion futura debe hacerse sobre una copia descartable para no invalidar los hashes.

## Bundle del PoC Git

Artefacto: `VisualSpecs/docs/evidence/issue-7/semantic/gf-poc.bundle`

- fuente: replica `scratch/gf-poc/` completa;
- worktree fuente: limpio en `evil-no-format`;
- untracked: ninguno, por lo que no hizo falta sidecar;
- objetos alcanzables: 5 commits;
- `git fsck --full --no-reflogs --unreachable`: sin salida de objetos inalcanzables;
- bytes: `1457`;
- SHA-256: `0C5D9F2DFE361D306039A5E66CAA72A60A19197D60DFD41B636292C4D0DE4345`;
- `git bundle verify`: PASS, historia completa SHA-1;
- `git bundle list-heads`: 7 refs, exactamente:

```text
07f5a3c0e62bad65153fee16c9a8af439dc3c90f refs/heads/child
f4694ac34e166d3e2d22d0f69843a9818e9621c7 refs/heads/evil-no-format
07f5a3c0e62bad65153fee16c9a8af439dc3c90f refs/heads/evil2
187dcf09050e3584cb85addf4ea8a9f726af9e11 refs/heads/feat/424242-ghost-issue
81555a94e6c2024ceb11e7368cd398bce4bfd6d9 refs/heads/master
81555a94e6c2024ceb11e7368cd398bce4bfd6d9 refs/remotes/origin/main
f4694ac34e166d3e2d22d0f69843a9818e9621c7 HEAD
```

La copia temporal usada para generar el bundle fue validada dentro de la ruta de evidencia y eliminada; `TEMP_PRESENT=False`. La carpeta final de evidencia contiene solo `README.md` y `gf-poc.bundle`.

README: 5.858 bytes, SHA-256 `1F962F8D124FEDC1BC164DDD482D4C31BFC892595C91F0EE97E78A4C04309A0E`.

## `git status` limitado a las dos rutas

```text
?? VisualSpecs/docs/evidence/issue-7/semantic/README.md
?? VisualSpecs/docs/evidence/issue-7/semantic/gf-poc.bundle
?? VisualSpecs/tests/adversarial/issue-7/semantic/final-semantic-probe.test.ts
?? VisualSpecs/tests/adversarial/issue-7/semantic/final-vitest.config.ts
?? VisualSpecs/tests/adversarial/issue-7/semantic/premortem-browser.mjs
?? VisualSpecs/tests/adversarial/issue-7/semantic/premortem-repro.ts
?? VisualSpecs/tests/adversarial/issue-7/semantic/preview-recovery-breakpoint-round3.config.ts
?? VisualSpecs/tests/adversarial/issue-7/semantic/preview-recovery-breakpoint-round3.spec.ts
?? VisualSpecs/tests/adversarial/issue-7/semantic/preview-recovery-focus-regate.config.ts
?? VisualSpecs/tests/adversarial/issue-7/semantic/preview-recovery-focus-regate.spec.ts
?? VisualSpecs/tests/adversarial/issue-7/semantic/round3-id-repro.mjs
```

Condicion operativa: la evidencia privada ya tiene copia verificada, pero WG4 todavia no debe borrarse porque, siguiendo tu instruccion de no hacer commit, estas copias siguen untracked dentro del repo del propio WG. Una vez que core las incluya en su commit/preservacion externa y confirme el objeto alcanzable, desde mi ownership semantico no quedara evidencia privada pendiente.
