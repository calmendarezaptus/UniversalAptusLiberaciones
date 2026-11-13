# Liberaciones

Marca tiempos, gastos y honorarios fijos de un periodo como **listos para entrar a una Prebill**
(`POST /liberaciones`). Mismo stack y diseño que las capturas (React + Vite + TypeScript, Tailwind
CSS v4, shadcn/ui `new-york`), tema por omisión **Violeta** (proyecto Consolidado).

## Qué hace

- **Periodo** (desde / hasta, atajos de mes actual y anterior) y **alcance**: un cliente o todos los
  clientes. En "un cliente" solo aparecen los que tienen algo por liberar en el periodo.
- **Vista previa** de lo que se liberaría, con totales por tipo y moneda (horas en tiempos), con las
  mismas reglas que la API: los no facturables y lo que ya está en una Prebill nunca se liberan.
- **Liberar** pide confirmación con el resumen; con **todos los clientes** además hay que escribir
  `LIBERAR`. No se puede deshacer. Al terminar muestra los conteos que devolvió Aptus.
- **Ya disponible para Prebill** del cliente elegido, por moneda (`/liberado-disponible`).

## Llamadas al backend (función `aptus_overview_services`)

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/{org}/tiempos?liberado=0`, `/{org}/gastos?liberado=0`, `/{org}/cargos-fijos?liberado=0` | Vista previa |
| GET | `/{org}/clientes`, `/{org}/proyectos` | Nombres y cliente de los cargos (caché 12 h) |
| GET | `/{org}/liberado-disponible?cliente_id=&moneda=` | Disponible para Prebill |
| POST | `/{org}/liberaciones` | `{ desde, hasta, cliente_id }` o `{ desde, hasta, todos: true }` |

`cliente_id` es el ID del contacto en Books (así lo usa la API).

## Variables de entorno (opcionales)

| Variable | Por omisión |
|---|---|
| `VITE_API_BASE_URL` | `https://overviewforaptusfinancials-730085095.development.catalystserverless.com/server/aptus_overview_services` |
| `VITE_CALENDAR_URL` | `https://universal-aptus-calendar.onslate.com/` |

## Comandos

```bash
npm install
npm run dev
npm test         # pruebas de src/lib/liberaciones.ts
npm run build    # dist/ para la Slate
```

Proyecto de Catalyst **Consolidado**: `04-consolidado/PROYECTO.md` en el repositorio `AptusWidgets`.
