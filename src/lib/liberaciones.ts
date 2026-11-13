import { API_BASE } from './api'

export type Kind = 'tiempo' | 'gasto' | 'cargo'
export const KINDS: Kind[] = ['tiempo', 'gasto', 'cargo']
export const KIND_PLURAL: Record<Kind, string> = { tiempo: 'Tiempos', gasto: 'Gastos', cargo: 'Honorarios fijos' }
export const KIND_LABEL: Record<Kind, string> = { tiempo: 'Tiempo', gasto: 'Gasto', cargo: 'Honorario fijo' }

// Registro pendiente de liberar (tiempo, gasto o cargo fijo de ReportesSandbox en una sola forma).
export interface Pendiente {
  key: string; kind: Kind; id: number; fecha: string; titulo: string; monto: number; moneda: string
  horas: number | null; facturable: boolean; status: string; liberado: number; facturado: number; prebill_id: number | null
  cliente_id: string | null; proyecto_id: number; proyecto_nombre: string
}

type Row = Record<string, any>
const base = (kind: Kind, r: Row) => ({
  key: `${kind}-${r.id}`, kind, id: Number(r.id), fecha: String(r.fecha || ''), moneda: r.moneda || 'MXN',
  status: String(r.status || ''), liberado: Number(r.liberado || 0), facturado: Number(r.facturado || 0), prebill_id: r.prebill_id ?? null,
  cliente_id: r.cliente_id == null ? null : String(r.cliente_id), proyecto_id: Number(r.proyecto_id), proyecto_nombre: r.proyecto_nombre || '',
})
export const fromTiempo = (r: Row): Pendiente => ({ ...base('tiempo', r), titulo: r.tarea || 'Tiempo', monto: Number(r.importe ?? Number(r.horas || 0) * Number(r.tarifa_aplicada || 0)), horas: Number(r.horas || 0), facturable: Number(r.facturable) === 1 })
export const fromGasto = (r: Row): Pendiente => ({ ...base('gasto', r), titulo: r.categoria_nombre || 'Gasto', monto: Number(r.monto || 0), horas: null, facturable: Number(r.facturable) === 1 })
export const fromCargo = (r: Row): Pendiente => ({ ...base('cargo', r), titulo: r.concepto || 'Cargo fijo', monto: Number(r.monto || 0), horas: null, facturable: true })

async function list(org: string, resource: string): Promise<Row[]> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(org)}/${resource}`)
  const data = await response.json().catch(() => null)
  if (!response.ok || !Array.isArray(data)) throw new Error(data?.error || `No se pudo cargar ${resource}.`)
  return data
}

// Lo que todavía no está liberado (la API filtra por liberado=0). El cliente de los cargos fijos
// sale del catálogo de proyectos porque su API no lo trae.
export async function fetchPendientes(org: string, clientOfProject: (proyectoId: number) => string | null): Promise<Pendiente[]> {
  const [tiempos, gastos, cargos] = await Promise.all([list(org, 'tiempos?liberado=0'), list(org, 'gastos?liberado=0'), list(org, 'cargos-fijos?liberado=0')])
  return [
    ...tiempos.map(fromTiempo), ...gastos.map(fromGasto),
    ...cargos.map(fromCargo).map(c => ({ ...c, cliente_id: c.cliente_id ?? clientOfProject(c.proyecto_id) })),
  ]
}

// Mismas reglas que la API: no facturables nunca se liberan; lo que ya está en una Prebill o
// facturado tampoco. Es una vista previa: el conteo final lo devuelve Aptus al liberar.
export function isReleasable(p: Pendiente): boolean {
  if (p.liberado === 1 || p.facturado === 1 || p.prebill_id != null) return false
  if (p.status === 'no_facturable' || !p.facturable) return false
  return true
}

export function preview(rows: Pendiente[], { desde, hasta, clienteId }: { desde: string; hasta: string; clienteId: string | null }) {
  const items = rows.filter(p => isReleasable(p) && p.fecha >= desde && p.fecha <= hasta && (clienteId === null || p.cliente_id === clienteId))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind))
  const byKind = Object.fromEntries(KINDS.map(kind => {
    const own = items.filter(p => p.kind === kind)
    const money: Record<string, number> = {}
    for (const p of own) money[p.moneda] = (money[p.moneda] || 0) + p.monto
    return [kind, { count: own.length, horas: own.reduce((s, p) => s + (p.horas || 0), 0), money }]
  })) as Record<Kind, { count: number; horas: number; money: Record<string, number> }>
  return { items, byKind, clientes: new Set(items.map(p => p.cliente_id)).size }
}

export interface LiberacionResult {
  desde: string; hasta: string; cliente_id?: string; todos: boolean
  tiempos_liberados: number; gastos_liberados: number; cargos_fijos_liberados: number
}

type Uncertain = Error & { uncertain?: boolean }
const fail = (message: string, uncertain: boolean) => Object.assign(new Error(message), { uncertain }) as Uncertain

export async function liberar(org: string, payload: { desde: string; hasta: string; cliente_id?: string; todos?: true }): Promise<LiberacionResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/${encodeURIComponent(org)}/liberaciones`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120000),
    })
  } catch {
    throw fail('Se perdió la respuesta. Actualiza la vista previa para ver qué quedó liberado.', true)
  }
  const data = await response.json().catch(() => null)
  if (!response.ok && !data && response.status >= 400 && response.status < 500) {
    throw fail(response.status === 404 ? 'La función de Catalyst no tiene la ruta de liberaciones (HTTP 404). Despliega la versión actual de aptus_overview_services.' : `El servidor rechazó la petición (HTTP ${response.status}).`, false)
  }
  if (!response.ok || !Number.isInteger(data?.tiempos_liberados)) {
    const uncertain = data?.outcome_unknown === true || !data?.stage || response.ok
    throw fail(`${data?.error || 'No se pudo confirmar la liberación.'}${uncertain ? ' Actualiza la vista previa para ver qué quedó liberado.' : ''}`, uncertain)
  }
  return data as LiberacionResult
}

export interface Disponible { tiempos: Row[]; gastos: Row[]; cargos_fijos: Row[] }

// Lo ya liberado, sin facturar y sin Prebill, para un cliente y una moneda (paso 2 de una Prebill).
export async function fetchDisponible(org: string, clienteId: string, moneda: string, signal?: AbortSignal): Promise<Disponible> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(org)}/liberado-disponible?cliente_id=${encodeURIComponent(clienteId)}&moneda=${encodeURIComponent(moneda)}`, { signal })
  const data = await response.json().catch(() => null)
  if (!response.ok || !Array.isArray(data?.tiempos) || !Array.isArray(data?.gastos) || !Array.isArray(data?.cargos_fijos)) throw new Error(data?.error || 'No se pudo cargar lo disponible para Prebill.')
  return data as Disponible
}

export const formatMoney = (value: number, moneda = '') => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + (moneda ? ' ' + moneda : '')
export const moneyText = (money: Record<string, number>) => Object.entries(money).map(([c, v]) => formatMoney(v, c)).join(' · ') || '—'

export function monthRange(offset = 0, today = new Date()): { desde: string; hasta: string } {
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { desde: iso(first), hasta: iso(last) }
}
