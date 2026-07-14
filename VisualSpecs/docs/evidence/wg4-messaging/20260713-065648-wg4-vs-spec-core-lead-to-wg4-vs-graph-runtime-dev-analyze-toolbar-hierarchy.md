# Analizar jerarquía y flujo de controles en VisualSpecs

Esta es una continuación directa de la app que acabás de levantar. No cambies código.

Objetivo: explicar con evidencia por qué la interfaz muestra primero la fila global `Explorer / Details / Fit / zoom / Expand all / Collapse all / Reset layout / Open JSON temporarily / Export JSON`, y debajo la fila de ciclo de proyecto `Create Project / Open Project / Enable editing / Rename / Save / Add JSON / imports / restore`; evaluar si esa jerarquía contradice el flujo principal de comenzar creando o abriendo un proyecto; proponer una reorganización concreta.

Repositorio: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Aplicación viva: `http://127.0.0.1:5175/`

Alcance:

1. Inspeccioná los componentes, estilos, estado y documentación inmediata que definen ambas filas.
2. Reconstruí el flujo actual para: estado inicial sin proyecto, crear proyecto, abrir proyecto y abrir JSON temporal.
3. Identificá qué controles son globales, cuáles dependen de documento y cuáles dependen de proyecto persistente.
4. Proponé una estructura preferida con orden, agrupaciones, estados vacíos y progressive disclosure. Incluí una alternativa si existe un tradeoff real.
5. Señalá archivos que cambiarían y riesgos de regresión, pero no edites nada.

Respuesta esperada: diagnóstico basado en archivos/líneas o símbolos, explicación del diseño actual, propuesta concreta de jerarquía, criterios de aceptación observables y tradeoffs.
