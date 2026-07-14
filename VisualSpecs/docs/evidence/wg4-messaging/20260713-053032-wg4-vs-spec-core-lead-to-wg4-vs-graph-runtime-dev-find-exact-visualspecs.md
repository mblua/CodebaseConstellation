# Corrección: localizar y levantar la VisualSpecs exacta

El usuario confirmó que la app `web/` / `Codebase Constellation` que levantaste no sirve y pidió buscar la que figura como `VisualSpecs`.

Objetivo:

1. Detené limpiamente la instancia equivocada que levantaste en `127.0.0.1:5173` (únicamente esos procesos que vos creaste).
2. Localizá la app que figure literalmente como `VisualSpecs` o `visualSpecs`, sin asumir que `web/` o `CodebaseGuide/` son alias.
3. Buscá en los árboles y refs Git disponibles de:
   - `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`
   - `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-AgentsCommander`
4. Si la encontrás en el checkout actual y el comando es inequívoco, levantala en background/ventana oculta y verificá HTTP. Si sólo existe en otro ref o requiere cambiar el checkout, no cambies branches ni descartes nada: reportá el ref/ruta/comando exactos para coordinar el siguiente paso.

Constraints: no edites código/configuración, no inventes equivalencias de nombre, preservá todo cambio existente. Reporte obligatorio: dónde aparece literalmente `VisualSpecs`, evidencia (ruta/ref), comando canónico, URL/PID/HTTP si se pudo levantar, confirmación de que 5173 quedó detenido, o blocker concreto.
