# Corrección de objetivo: VisualSpecs es CodebaseGuide

La inspección del checkout muestra dos frontends. Para este pedido, la app que corresponde a VisualSpecs es `CodebaseGuide/`, no `web/`: su `src/` contiene `contract`, `domain`, `projection`, `ports`, `app`, `ui` y `adapters`, exactamente el límite arquitectónico de VisualSpecs; además su README declara el mapa editable/expandible y Vite fija `http://localhost:5175`.

Por favor:

- levantá `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation\CodebaseGuide` con su comando canónico;
- verificá `http://localhost:5175/` por HTTP y reportá PID/proceso;
- no detengas una instancia ajena de `web/` en 5173; sólo limpiá procesos que hayas iniciado vos si corresponde;
- respondé explícitamente con la URL y la evidencia final.
