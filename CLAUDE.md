# arbitrage-colombia — CLAUDE.md

## Qué hace este proyecto

Sistema de 3 agentes automatizados que identifica oportunidades de arbitraje de productos en Colombia:
- Compra barata en MercadoLibre Colombia
- Vende en Facebook Marketplace Bucaramanga

## Dónde corre

**Localmente en macOS via launchd** — NO en VPS.
Razón: MercadoLibre bloquea IPs de datacenter. Se requiere IP residencial.

Servicio: `~/Library/LaunchAgents/com.arbitrage-colombia.plist`
Logs: `~/Library/Logs/arbitrage-colombia.log`

## Stack

- Node.js 20+ · CommonJS
- Supabase (base de datos compartida entre agentes)
- MercadoLibre API con OAuth2 (client_credentials)
- google-trends-api (tendencias Colombia)
- node-telegram-bot-api (alertas)
- node-cron (schedules)
- launchd (macOS — reemplaza PM2/VPS)

## Los 3 agentes

| Agente | Cron | Tabla Supabase |
|--------|------|----------------|
| Trend Spotter | cada 24h (6am) | trending_products |
| Evergreen Validator | cada 7 días (lunes 7am) | evergreen_products |
| Gap Finder | cada 4h | arbitrage_gaps |

## Reglas de negocio — NO cambiar sin confirmación explícita

- Precio máximo de compra: $150.000 COP (`MAX_PRECIO_COMPRA`)
- Gap mínimo para alertar: 50% (`MIN_GAP_PORCENTAJE`)
- Ventas mínimas históricas: 10 unidades (`MIN_VENTAS_HISTORICAS`)
- Solo productos con envío a Bucaramanga (Mercado Envíos, `shipping: 'me2'`)
- Categorías excluidas: motos (MCO1505), inmuebles (MCO1000), animales (MCO2225), joyería/oro (MCO3937), armas, adultos

## Convenciones de código — OBLIGATORIAS

- Siempre `async/await`, nunca callbacks
- Errores siempre a `logger.js`, nunca `console.log`
- Variables de entorno siempre desde `.env` (nunca hardcodeadas)
- Clientes compartidos solo en `/shared`, nunca duplicar
- Cada agente completamente independiente (no importar de otro agente)

## Flujo de datos

```
google-trends.js ─┐
                   ├─→ trend-spotter/index.js ──→ trending_products
mercadolibre.js  ─┘

mercadolibre.js  ─┐
                   ├─→ evergreen-validator/index.js ──→ evergreen_products
google-trends.js ─┘

trending_products  ─┐
                     ├─→ gap-finder/index.js → analyzer.js → notifier.js → Telegram
evergreen_products ─┘
```

## REGLA AUTOMÁTICA — Actualización continua

Después de cada tarea completada, cada cambio de arquitectura, cada decisión técnica, o cada actualización al código, actualizar automáticamente:
- **CLAUDE.md**: contexto general del proyecto (este archivo)
- **memory.md** (si existe): estado actual, qué se completó, qué falta, decisiones tomadas y por qué

No esperar instrucción del usuario para hacer esto. Es obligatorio después de cada acción significativa.

## Estado de implementación

| Fase | Tareas | Estado |
|------|--------|--------|
| Phase 1 — Scaffolding + shared | Tasks 1-7 | ✅ COMPLETA |
| Phase 2 — Trend Spotter | Tasks 8-10 | ✅ COMPLETA (24/24 tests) |
| Phase 2 — Evergreen Validator | Tasks 11-13 | ✅ COMPLETA (31/31 tests) |
| Phase 2 — Gap Finder | Tasks 14-16 | ✅ COMPLETA (42/42 tests) |
| Phase 3 — Cron + PM2 | Tasks 17-19 | ✅ COMPLETA |
| OAuth2 ML auth | — | ✅ COMPLETA (46/46 tests) |
| macOS launchd migration | — | ✅ COMPLETA |

### Decisiones técnicas adicionales (Phase 2)
- `Promise.allSettled` en `getAllMLTrending` y `getAllEvergreenFromML` — paralleliza keywords sin fallar si uno falla
- `jest.doMock()` dentro de `beforeEach` para el describe block de index — evita contaminar describe blocks previos que usan top-level `jest.mock()`
- `getEvergreenFromML` propaga `keyword` en el resultado para que `getTrendStability` reciba la keyword fuente, no el título del producto
- Deduplicación por `nombre` en `evergreen-validator/index.js` antes de insertar — evita duplicados de múltiples keywords
- `analyzer.js` usa `reduce` para encontrar el ítem más barato (no sort+find) — evita ambigüedad con precios iguales
- `notifier.js`: fallo de Telegram después de DB exitoso es no-fatal (warn, no throw) — evita abortar el loop del Gap Finder
- Fórmula de gap: `((promedio - minimo) / promedio) * 100` — qué tan por debajo del promedio de mercado está el vendedor más barato
- No hay límite de alertas — se envían TODAS las que pasen el filtro de 50%

## IMPORTANTE

Ante cualquier problema de planificación, estructura o decisión de arquitectura, usar
`/superpowers:writing-plans` antes de ejecutar.

Ante ejecución de tareas complejas o multi-paso, usar `/superpowers:execute-plan`
para mantener coherencia.

## Variables de entorno

Ver `.env.example` para todas las variables requeridas.
Nunca commitear `.env` — está en `.gitignore`.
