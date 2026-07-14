# Gate final independiente de Semantic sobre HEAD actual

Ejecuta el gate adversarial final sobre `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`, rama `feature/7-collapsible-project-rail`, commit exacto `4e8a3172134294de6097e8c5ae812cab817e748e`.

Usa copias temporales privadas de los harnesses preservados y adapta solo imports/cwd/output/puerto para apuntar al `VisualSpecs` actual. Reserva el puerto 5178 y salida privada; no modifiques los originales versionados ni produccion. Ejecuta el probe Vitest completo y los MRE Playwright de recovery/focus/breakpoint relevantes, mas cualquier comprobacion independiente necesaria de identidad, estado, banners, DOM/foco y round-trip. Si un harness historico es mecanicamente incompatible, documenta y repara solo el runner sin debilitar assertions.

Copia el reporte final y evidencia minima reproducible a `VisualSpecs/docs/evidence/issue-7/semantic/final-4e8a317/` (sin commit). Termina con `PASS`, `PASS_WITH_NON_BLOCKING_FINDINGS` o `FAIL_P0_P1`, evidencia y conteos. No implementes fixes productivos.
