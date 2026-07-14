# Preservar evidencia unica de Resilience antes de borrar WG4

El usuario autorizo ejecutar todas las tareas necesarias para volver descartable WG4. Trabaja en `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`, rama `feature/7-collapsible-project-rail`.

Ownership: sos owner exclusivo de los artefactos adversariales de resiliencia. Copia, sin modificar su contenido, todos los harnesses/configs/scripts unicos enumerados en tu auditoria a `VisualSpecs/tests/adversarial/issue-7/resilience/`. Copia resultados parciales y capturas unicas a `VisualSpecs/docs/evidence/issue-7/resilience/`. Inclui un README/manifest que registre hashes, commit objetivo, que el round 3 de `95c53fc` quedo incompleto y que esos resultados no constituyen PASS.

No copies `evidence-95c53fc/`, worktrees, junctions ni `node_modules`: el source queda preservado por Git y esas dependencias son recreables. No corras aun el gate final y no hagas commit; no toques otras rutas. Verifica que cada hash copiado coincida con el original y responde con inventario, hashes y `git status` limitado a tus dos rutas.
