# arbitrage-colombia — CLAUDE.md

## Qué hace este proyecto

Sistema de 3 agentes automatizados que identifica oportunidades de arbitraje de productos en Colombia:
- Compra barata en MercadoLibre Colombia
- Vende en Facebook Marketplace Bucaramanga

## Stack

- Node.js 20+ · CommonJS
- Supabase (base de datos compartida entre agentes)
- MercadoLibre API pública (no requiere auth)
- google-trends-api (tendencias Colombia)
- node-telegram-bot-api (alertas)
- node-cron (schedules)
- PM2 (proceso en VPS DigitalOcean)

## Los 3 agentes

| Agente | Cron | Tabla Supabase |
|--------|------|----------------|
| Trend Spotter | cada 24h (6am) | trending_products |
| Evergreen Validator | cada 7 días (lunes 7am) | evergreen_products |
| Gap Finder | cada 4h | arbitrage_gaps |

## Reglas de negocio — NO cambiar sin confirmación explícita

- Precio máximo de compra: $150.000 COP (`MAX_PRECIO_COMPRA`)
- Gap mínimo para alertar: 40% (`MIN_GAP_PORCENTAJE`)
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

## IMPORTANTE

Ante cualquier problema de planificación, estructura o decisión de arquitectura, usar
`/superpowers:writing-plans` antes de ejecutar.

Ante ejecución de tareas complejas o multi-paso, usar `/superpowers:execute-plan`
para mantener coherencia.

## Variables de entorno

Ver `.env.example` para todas las variables requeridas.
Nunca commitear `.env` — está en `.gitignore`.
