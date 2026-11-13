import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const toModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8')
const api = read('../src/lib/api.ts').replace('import.meta.env.DEV', 'true').replace('import.meta.env.VITE_API_BASE_URL', 'undefined').replace('import.meta.env.VITE_CALENDAR_URL', 'undefined')
const lib = await import(toModule(read('../src/lib/liberaciones.ts').replace("from './api'", `from '${toModule(api)}'`)))

const C1 = '446794000018976759', C2 = '446794000015629019'
const t = (o = {}) => lib.fromTiempo({ id: 80, fecha: '2026-11-11', horas: 12, importe: 10800, moneda: 'MXN', tarea: 'Asesoría', facturable: 1, status: 'capturado', liberado: 0, facturado: 0, prebill_id: null, cliente_id: C1, proyecto_id: 3, ...o })
const g = (o = {}) => lib.fromGasto({ id: 31, fecha: '2026-11-10', monto: 2500, moneda: 'MXN', categoria_nombre: 'Mensajería', facturable: 1, status: 'capturado', liberado: 0, facturado: 0, prebill_id: null, cliente_id: C1, proyecto_id: 1, ...o })
const c = (o = {}) => lib.fromCargo({ id: 14, fecha: '2026-11-01', monto: 25000, moneda: 'MXN', concepto: 'Iguala 2026-11', status: 'capturado', liberado: 0, facturado: 0, prebill_id: null, proyecto_id: 25, ...o })

test('vista previa: rango, cliente y mismas reglas que la API', () => {
  const rows = [t(), g(), { ...c(), cliente_id: C2 }, t({ id: 81, facturable: 0, status: 'no_facturable' }), g({ id: 32, status: 'no_facturable', facturable: 0 }), t({ id: 82, fecha: '2026-10-31' }), t({ id: 83, prebill_id: 9 })]
  const one = lib.preview(rows, { desde: '2026-11-01', hasta: '2026-11-30', clienteId: C1 })
  assert.deepEqual(one.items.map(p => p.key), ['gasto-31', 'tiempo-80'])
  assert.equal(one.byKind.tiempo.count, 1); assert.equal(one.byKind.tiempo.horas, 12); assert.deepEqual(one.byKind.gasto.money, { MXN: 2500 })
  const all = lib.preview(rows, { desde: '2026-11-01', hasta: '2026-11-30', clienteId: null })
  assert.deepEqual(all.items.map(p => p.key), ['cargo-14', 'gasto-31', 'tiempo-80']); assert.equal(all.clientes, 2)
})

test('pendientes: pide solo lo no liberado y completa el cliente de los cargos', async () => {
  const urls = []
  globalThis.fetch = async url => { urls.push(url); return { ok: true, status: 200, json: async () => url.includes('cargos') ? [{ id: 14, proyecto_id: 25, fecha: '2026-11-01', monto: 1, concepto: 'x' }] : [] } }
  const rows = await lib.fetchPendientes('636939444', id => id === 25 ? C2 : null)
  assert.deepEqual(urls.sort(), ['/api/636939444/cargos-fijos?liberado=0', '/api/636939444/gastos?liberado=0', '/api/636939444/tiempos?liberado=0'])
  assert.equal(rows[0].cliente_id, C2)
})

test('liberar: POST con cliente o con todos; red caída es incierta; 400 de la API no', async () => {
  let call
  globalThis.fetch = async (url, options) => { call = { url, options }; return { ok: true, status: 200, json: async () => ({ tiempos_liberados: 1, gastos_liberados: 1, cargos_fijos_liberados: 0, todos: false }) } }
  await lib.liberar('636939444', { desde: '2026-11-01', hasta: '2026-11-30', cliente_id: C1 })
  assert.equal(call.url, '/api/636939444/liberaciones'); assert.equal(call.options.method, 'POST')
  assert.deepEqual(JSON.parse(call.options.body), { desde: '2026-11-01', hasta: '2026-11-30', cliente_id: C1 })
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(lib.liberar('1', { desde: '2026-11-01', hasta: '2026-11-30', todos: true }), e => e.uncertain === true)
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'Sin cliente se liberan TODOS', stage: 'validation', outcome_unknown: false }) })
  await assert.rejects(lib.liberar('1', { desde: '2026-11-01', hasta: '2026-11-30' }), e => e.uncertain === false && /TODOS/.test(e.message))
})

test('rango de mes y disponible para Prebill', async () => {
  assert.deepEqual(lib.monthRange(0, new Date(2026, 10, 13)), { desde: '2026-11-01', hasta: '2026-11-30' })
  assert.deepEqual(lib.monthRange(-1, new Date(2026, 0, 5)), { desde: '2025-12-01', hasta: '2025-12-31' })
  let url
  globalThis.fetch = async u => { url = u; return { ok: true, status: 200, json: async () => ({ tiempos: [], gastos: [], cargos_fijos: [] }) } }
  await lib.fetchDisponible('1', C1, 'USD')
  assert.equal(url, `/api/1/liberado-disponible?cliente_id=${C1}&moneda=USD`)
})
