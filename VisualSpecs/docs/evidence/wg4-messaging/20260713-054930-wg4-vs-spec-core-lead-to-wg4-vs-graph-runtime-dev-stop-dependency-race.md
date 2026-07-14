# Coordinación urgente: detener carrera sobre node_modules

Detecté una carrera reproducible sobre `CodebaseGuide/node_modules`: mientras ejecutaba `npm ci`, archivos de Vite/PostCSS/Vitest/Playwright desaparecieron durante la extracción (`TAR_ENTRY_ERROR ENOENT`), y el servidor devolvió 500 por un chunk faltante. Esto indica dos instalaciones concurrentes sobre el mismo checkout compartido.

Detené cualquier `npm install`/`npm ci` o servidor de `CodebaseGuide` que hayas iniciado y respondé cuando el árbol quede libre. No vuelvas a tocar `CodebaseGuide/node_modules` en este turno; yo voy a realizar una única reinstalación y el arranque final. Conservá cualquier proceso de `web/` en 5173 que no sea tuyo.
