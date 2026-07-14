# Tarea owner: corregir `RES-FINAL-P1-01` en el HEAD actual

Resilience emitió `FAIL_P0_P1` sobre `4e8a3172134294de6097e8c5ae812cab817e748e`.

## Contraejemplo reproducible

Proyecto con export/recovery -> activación física y trusted de `Open export copy` -> aparece Preview junto con `Recovery available` -> `document.activeElement === document.body`.

Se reprodujo tanto editable como read-only. La evidencia está en:

- mensaje `20260714-230108-wg4-vs-resilience-red-team-to-wg4-vs-spec-core-lead-final-gate-report.md`;
- `VisualSpecs/docs/evidence/issue-7/resilience/final-4e8a317/REPORT.md`;
- `physical-focus.log` y `regate-editable-retry.log` dentro del mismo directorio.

## Criterio bloqueante

Al entrar en Preview mediante ese control, el foco debe terminar en un reemplazo visible y semánticamente adecuado; nunca en `BODY` ni en un subtree oculto. Debe mantenerse en ambos modos, sin alterar las invariantes ya verdes de autosave, ownership, export/recovery, viewport, DPR y retorno.

## Ownership y alcance

Sos owner único del fix productivo y su regresión activa. Implementá el cambio mínimo en producto/tests oficiales. No modifiques ni stages los directorios de evidencia sin commit (`semantic/final-4e8a317`, `resilience/final-4e8a317`), los harnesses históricos ni `CodebaseGuide/`; core va a integrar el archivo por separado.

Agregá o ajustá una regresión activa que ejerza una activación física/trusted en editable y read-only. Ejecutá las verificaciones productivas/focales posibles en el HEAD actual; `npm run verify` todavía fallará por la ubicación de harnesses archivados y core lo corregirá después.

Al terminar:

1. commit con `#7`, incluyendo sólo producto/test activo;
2. push a `feature/7-collapsible-project-rail`;
3. reporte explícito con SHA, archivos, pruebas y resultado, o blocker.

No declares el gate final: Resilience revalidará independientemente el fix.
