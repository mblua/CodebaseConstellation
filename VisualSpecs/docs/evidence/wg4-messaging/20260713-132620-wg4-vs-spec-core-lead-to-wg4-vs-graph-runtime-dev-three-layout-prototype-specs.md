# Definir tres layouts de prototipo para selección

Continuación directa del análisis de jerarquía de VisualSpecs. No cambies código ni detengas el servidor.

Objetivo: producir tres briefs visuales suficientemente concretos y distintos para convertirlos en un tablero de mockups A/B/C basado en la interfaz actual.

Repositorio: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Aplicación: `http://127.0.0.1:5175/`

Estado a representar en los tres: documento embebido `AgentsCommander`, sin proyecto persistente, modo explícito `Example / Not persisted`; Create Project y Open Project deben preceder semántica y visualmente a los controles del mapa; Open JSON y Export deben pertenecer a Document; autosave y acciones exclusivas de proyecto no deben aparecer.

Desarrollá estas tres direcciones, manteniendo el dark theme y el canvas/Explorer/Details reconocibles:

1. **A — Context Bar:** cabecera horizontal workspace/document primero; toolbar pura de mapa debajo; advanced project data contextual.
2. **B — Project Rail:** rail lateral compacto dedicado a contexto y ciclo de proyecto, con el toolbar de mapa ocupando la parte superior del workspace.
3. **C — Guided Overlay:** mapa embebido visible, pero con un onboarding contextual no modal/prominente que ofrece Create/Open/Open JSON y luego colapsa a una cabecera compacta.

Para cada alternativa entregá:

- jerarquía exacta y ubicación de bloques;
- textos cortos y verbatim que deban aparecer en el mockup;
- controles visibles en este estado inicial;
- qué sucede después de abrir proyecto read-only y editable;
- principal ventaja, renuncia y riesgo responsive;
- indicaciones visuales listas para un prompt de `ui-mockup`.

No implementes. Respondé explícitamente con los tres briefs y una recomendación argumentada, sin convertir las opciones en meros cambios cosméticos.
