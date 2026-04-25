@AGENTS.md
# CLAUDE.md

## Objetivo del asistente en este repositorio

Actúa como asistente técnico para mantener y evolucionar esta app sin romper la arquitectura existente, sin degradar la seguridad, sin alterar la estética actual y reduciendo al mínimo el consumo innecesario de tokens.

Antes de modificar código, entiende el contexto del archivo, respeta los patrones existentes y limita cada cambio al alcance solicitado.

---

## Reglas generales de trabajo

1. No hagas refactors grandes salvo que se pidan explícitamente.
2. No cambies nombres de variables, funciones, rutas, modelos, tablas, componentes o estilos si no es necesario.
3. No introduzcas nuevas dependencias sin justificarlo claramente.
4. No elimines código aparentemente no usado sin comprobar referencias.
5. No cambies contratos de API, estructuras de datos, nombres de campos o formatos de respuesta sin indicarlo expresamente.
6. Si una tarea afecta a varias capas, divide el trabajo en pasos pequeños.
7. Prioriza soluciones simples, mantenibles y coherentes con el código actual.
8. No generes documentación extensa salvo que se solicite.
9. No generes tests, mocks, fixtures o archivos auxiliares salvo que sean necesarios para la tarea.
10. Si falta contexto crítico, pregunta antes de hacer cambios destructivos.

---

## Seguridad de la app

### Principios obligatorios

1. Nunca expongas secretos, claves, tokens, credenciales, API keys, connection strings ni variables sensibles.
2. Nunca hardcodees secretos en el código fuente.
3. Usa siempre variables de entorno para datos sensibles.
4. No muestres valores de `.env`, credenciales o configuraciones privadas en respuestas, logs o comentarios.
5. No añadas logs que impriman datos personales, tokens, contraseñas, headers sensibles, cookies o payloads completos.
6. No relajes validaciones, permisos, autenticación ni autorización para “hacer que funcione”.
7. No uses permisos globales si puede aplicarse control granular.
8. No desactives CORS, CSRF, rate limiting, validaciones o comprobaciones de seguridad salvo instrucción explícita.
9. No introduzcas rutas públicas a recursos internos sin control de acceso.
10. No guardes datos personales innecesarios.

### Autenticación y autorización

1. Verifica siempre quién puede leer, crear, modificar o eliminar cada recurso.
2. Las operaciones sensibles deben comprobar permisos en backend, no solo en frontend.
3. No confíes en datos enviados desde el cliente para permisos, roles, importes, IDs de usuario o estados críticos.
4. Si hay roles o permisos existentes, reutilízalos.
5. No crees bypasses temporales de login, permisos o validaciones.

### Datos y base de datos

1. Valida entradas antes de escribir en base de datos.
2. Sanitiza datos que puedan mostrarse en UI.
3. Evita queries inseguras o construidas con strings concatenados.
4. Mantén la integridad de claves, relaciones y formatos existentes.
5. No cambies nombres de columnas/campos sin migración explícita.
6. No borres datos de producción ni incluyas scripts destructivos sin confirmación expresa.
7. Cualquier migración debe ser reversible o explicar claramente su impacto.

### Frontend y exposición de datos

1. No muestres datos internos que el usuario no deba ver.
2. No incluyas información sensible en localStorage, sessionStorage o URLs.
3. No uses el frontend como única barrera de seguridad.
4. Evita exponer errores técnicos completos al usuario final.
5. Los mensajes de error deben ser útiles pero no revelar detalles internos.

---

## Reducción de consumo de tokens

### Antes de responder

1. No repitas el enunciado del usuario.
2. No expliques conceptos básicos si no se piden.
3. No hagas listados largos salvo que aporten valor directo.
4. No muestres archivos completos si solo cambian unas líneas.
5. No generes código alternativo innecesario.
6. No propongas tres soluciones si una solución clara es suficiente.

### Al modificar código

1. Lee solo los archivos necesarios.
2. Edita solo las secciones necesarias.
3. Devuelve preferentemente un resumen breve de cambios.
4. Cuando muestres código, muestra únicamente el bloque modificado o el diff relevante.
5. No reescribas componentes completos salvo que sea imprescindible.
6. No abras muchos archivos por exploración si ya hay suficiente contexto.
7. Evita análisis largos de arquitectura salvo que la tarea lo requiera.

### Tareas repetitivas

1. Si una tarea se repite, identifica el patrón y propón una regla reutilizable.
2. No vuelvas a explicar el mismo procedimiento en cada iteración.
3. Usa checklists breves para validar cambios repetitivos.
4. Para cambios masivos, trabaja por lotes pequeños y consistentes.
5. Si hay una convención existente, aplícala sin volver a justificarla cada vez.

### Formato de respuesta preferido

Usa este formato por defecto:

```md
Hecho.

Cambios:
- ...
- ...

Archivos tocados:
- ...

Notas:
- ...
```

Si no hay notas relevantes, omite la sección “Notas”.

---

## Mantener estética actual de la app

### Principios visuales

1. Mantén la estética actual de la app.
2. No cambies paleta de colores, tipografías, tamaños, espaciados, bordes, sombras o estilos globales salvo petición expresa.
3. Reutiliza componentes existentes antes de crear nuevos.
4. Reutiliza clases, tokens de diseño, variables CSS y patrones visuales existentes.
5. No introduzcas estilos inline si existen clases o componentes equivalentes.
6. No mezcles estilos nuevos con sistemas visuales distintos.
7. Evita rediseños completos cuando solo se pide funcionalidad.
8. Cualquier nueva pantalla debe parecer parte de la app actual.

### UX y comportamiento

1. Respeta flujos existentes de navegación.
2. No cambies textos, iconos, jerarquía visual o disposición salvo que sea necesario.
3. Mantén consistencia en botones, inputs, modales, tablas, cards, menús y formularios.
4. Evita añadir animaciones, efectos o elementos visuales nuevos sin motivo.
5. Mantén la app clara, rápida y usable en móvil y escritorio.
6. Si añades estados de carga, error o vacío, usa el patrón existente.

### CSS y diseño global

1. Antes de crear CSS nuevo, busca si existe una clase, componente o variable reutilizable.
2. No dupliques estilos globales.
3. No cambies estilos globales para solucionar un problema local.
4. No alteres `theme`, variables CSS, Tailwind config o layout global sin instrucción expresa.
5. Si un cambio visual puede afectar a toda la app, adviértelo antes.

---

## Control de calidad antes de terminar

Antes de dar una tarea por finalizada, revisa:

1. ¿El cambio cumple exactamente lo pedido?
2. ¿Se ha evitado tocar código no relacionado?
3. ¿Se mantiene la seguridad?
4. ¿Se mantiene la estética actual?
5. ¿Hay datos sensibles expuestos?
6. ¿Se han respetado nombres, rutas, modelos y contratos existentes?
7. ¿La solución añade complejidad innecesaria?
8. ¿La respuesta final es breve y útil?

---

## Reglas para errores y debugging

1. No ocultes errores reales con `try/catch` genéricos.
2. No sustituyas errores por valores por defecto si eso puede ocultar problemas de datos.
3. No uses `console.log` permanente para depuración.
4. Si añades logs temporales, elimínalos antes de finalizar.
5. Los errores de usuario deben ser claros.
6. Los errores internos deben registrarse de forma segura sin exponer datos sensibles.

---

## Reglas para dependencias

1. No añadas librerías nuevas si se puede resolver con lo existente.
2. Si una dependencia es necesaria, explica por qué.
3. Comprueba que encaja con el stack actual.
4. Evita paquetes abandonados, innecesariamente grandes o con riesgos de seguridad.
5. No actualices dependencias masivamente salvo petición expresa.

---

## Reglas para rendimiento

1. Evita renders innecesarios.
2. No hagas llamadas repetidas a APIs si los datos pueden reutilizarse.
3. No cargues datos masivos si solo se necesita una parte.
4. Usa paginación, filtros o carga diferida cuando proceda.
5. No introduzcas cálculos pesados en render si pueden memoizarse o moverse.
6. Mantén el código simple antes que sobreoptimizado.

---

## Reglas para cambios en producción

1. No asumas que puedes tocar datos de producción.
2. No ejecutes acciones destructivas.
3. No borres usuarios, registros, tablas, buckets, índices o recursos cloud sin instrucción explícita.
4. No cambies configuraciones de despliegue sin explicar impacto.
5. No modifiques permisos cloud/IAM salvo que se pida claramente.

---

## Instrucciones específicas para Cursor/Claude

1. Antes de editar, inspecciona el archivo relevante y sus dependencias cercanas.
2. No hagas cambios amplios por iniciativa propia.
3. Si detectas una mejora no solicitada, menciónala como sugerencia, no la implementes automáticamente.
4. Prioriza patches pequeños.
5. Cuando el usuario pida “arregla esto”, busca la causa raíz antes de aplicar parches superficiales.
6. Si hay riesgo de romper otra parte de la app, explica el riesgo brevemente.
7. Si el cambio afecta a seguridad, backend, permisos o datos, extrema la revisión.
8. Si el cambio afecta a UI, compara con componentes existentes y mantén el diseño actual.

---

## Respuesta final obligatoria tras cada tarea

Responde de forma breve, sin explicaciones innecesarias:

```md
Hecho.

Cambios:
- ...
- ...

Archivos tocados:
- ...
```

Añade “Pendiente” solo si hay algo que no se pudo completar:

```md
Pendiente:
- ...
```

---

## Prohibiciones explícitas

No hagas lo siguiente salvo instrucción expresa:

1. Refactorizar módulos completos.
2. Cambiar estética global.
3. Añadir dependencias.
4. Eliminar validaciones.
5. Desactivar seguridad.
6. Exponer secretos.
7. Crear archivos innecesarios.
8. Reescribir archivos completos.
9. Cambiar estructura de carpetas.
10. Modificar contratos de API.
11. Cambiar nombres de campos usados por AppSheet, DynamoDB, APIs o integraciones.
12. Añadir logs permanentes con datos sensibles.
13. Generar respuestas largas cuando basta un resumen.

---

## Criterio principal

La prioridad es mantener una app segura, estable, coherente visualmente y eficiente de mantener. Cada cambio debe ser pequeño, justificado y alineado con el estado actual del proyecto.

