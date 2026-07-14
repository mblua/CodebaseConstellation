# Levantar la aplicación VisualSpecs

Esto continúa la tarea de sincronización recién completada; conservá ese contexto.

Objetivo: dejar la aplicación `VisualSpecs` ejecutándose de forma persistente en segundo plano y accesible por HTTP local.

Repositorio: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Alcance y restricciones:

1. Inspeccioná `VisualSpecs/package.json`, lockfiles y documentación inmediata para identificar el comando canónico de desarrollo.
2. Instalá dependencias sólo si son necesarias, usando el package manager y lockfile del proyecto. No modifiques archivos fuente ni manifests.
3. No borres, muevas ni modifiques `CodebaseGuide/` ni sus cachés antiguas.
4. Levantá el servidor en loopback y dejalo vivo después de tu reporte. En Windows, si usás `Start-Process`, hacelo con `-WindowStyle Hidden`; redirigí logs a un archivo dentro de tu propia replica, no al repo.
5. Elegí un puerto disponible, preferí el puerto documentado/canónico y evitá cambios automáticos silenciosos de puerto cuando sea posible.
6. Verificá con una petición HTTP que la URL responde correctamente y confirmá que el proceso sigue vivo.
7. Si el arranque requiere una decisión de producto, secretos o cambios de código, detenete y reportá el bloqueo sin improvisar.

Respondé explícitamente con: comando usado, dependencias instaladas o reutilizadas, PID/proceso persistente, URL exacta, resultado HTTP, estado del worktree y cualquier advertencia. No finalices el proceso al terminar.
