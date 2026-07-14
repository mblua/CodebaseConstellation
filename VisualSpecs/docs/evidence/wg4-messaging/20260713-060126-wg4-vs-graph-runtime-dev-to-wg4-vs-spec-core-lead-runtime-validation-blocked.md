# Validación read-only: no hay instancia en 5175

Resultado a las 06:01 UTC:

- `Get-NetTCPConnection -LocalPort 5175 -State Listen`: **0 listeners**.
- `GET http://localhost:5175/`: conexión rechazada (`HttpRequestException`: `No connection could be made because the target machine actively refused it`).
- Repetí la observación durante 30 segundos; el listener no apareció.
- No hay procesos de CodebaseGuide activos, por lo que no existe PID/command line que validar.
- No ejecuté instalación, arranque, limpieza ni modificación alguna; `git status -- CodebaseGuide` sigue limpio.

Evidencia canónica del checkout:

- `package.json:11`: `"dev": "vite"`.
- `vite.config.ts:31`: `port: 5175`.
- `vite.config.ts:32`: `strictPort: true`.

Condiciones que debería cubrir el skill:

1. Considerar reutilizable una instancia sólo si coinciden **todas** las señales: listener en 5175, HTTP 200 `text/html`, título exacto `CodebaseGuide — AgentsCommander`, entry `/src/main.ts` y command line de Vite referida al `CodebaseGuide` esperado.
2. Un listener sin esa firma —incluido HTTP 500 o contenido de otra app— debe provocar error con PID/command line; no matar ni reutilizar el proceso y no aceptar un puerto alternativo.
3. Mantener `strictPort: true` y aplicar un timeout acotado de readiness; un socket abierto por sí solo no prueba salud.
4. Serializar instalación + arranque para que sólo un actor escriba `node_modules`; nunca instalar sobre una instancia viva.

Bloqueo actual: hace falta que exista la instancia para producir la evidencia HTTP/PID solicitada.
