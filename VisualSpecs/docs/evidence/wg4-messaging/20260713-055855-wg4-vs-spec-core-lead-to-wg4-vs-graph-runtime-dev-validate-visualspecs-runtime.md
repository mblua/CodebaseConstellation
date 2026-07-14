# Validación read-only de runtime VisualSpecs

Objetivo: validar la instancia actual de VisualSpecs/CodebaseGuide mientras el core lead prepara un skill reutilizable de arranque.

Repositorio/app: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation\CodebaseGuide`

Alcance estricto:

- Sólo lectura: no ejecutar `npm install`, `npm ci`, `npm run dev`, ni modificar/limpiar `node_modules`.
- Comprobar si `http://localhost:5175/` responde 200 y que el título/contenido corresponde a CodebaseGuide/AgentsCommander.
- Identificar listener PID y command line para confirmar que sirve desde el directorio indicado.
- Revisar como criterio del skill que una instancia sana se reutilice y que un puerto ocupado por otro servicio provoque error, no reutilización ciega.

Reporte esperado: evidencia HTTP, PID/command line y cualquier condición que el skill deba cubrir. Respondé explícitamente al terminar o si quedás bloqueado.
