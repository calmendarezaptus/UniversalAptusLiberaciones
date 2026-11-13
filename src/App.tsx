import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import 'animate.css'
import { Toaster } from 'sonner'
import {
  AlertTriangle, Briefcase, Calendar as CalendarIcon, CalendarRange, CheckCheck, Clock, Info, Landmark,
  Receipt, RefreshCw, Unlock, Users, Wallet,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusModal, type StatusModalType } from '@/components/StatusModal'
import { SearchSelect } from '@/components/SearchSelect'
import { ThemeMenu } from '@/components/ThemeMenu'
import { cn } from '@/lib/utils'
import { CALENDAR_URL } from '@/lib/api'
import { cardCls, gradientBtnCls, labelCls, sectionIconCls, sectionTitleCls, useTheme } from '@/lib/ui'
import { loadClientes, loadProyectos, type Cliente, type Proyecto } from '@/lib/catalogs'
import {
  fetchDisponible, fetchPendientes, formatMoney, KIND_LABEL, KIND_PLURAL, KINDS, liberar, monthRange, moneyText, preview,
  type Disponible, type Kind, type Pendiente,
} from '@/lib/liberaciones'

type Modal = { isOpen: boolean; type: StatusModalType; title: string; message: string }
type Loadable<T> = { rows: T[]; loading: boolean; error: string }
type Scope = 'cliente' | 'todos'
const empty = <T,>(): Loadable<T> => ({ rows: [], loading: false, error: '' })
const KIND_ICON: Record<Kind, typeof Clock> = { tiempo: Clock, gasto: Receipt, cargo: Landmark }
const KIND_CHIP: Record<Kind, string> = {
  tiempo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  gasto: 'bg-teal-50 text-teal-700 border-teal-200',
  cargo: 'bg-amber-50 text-amber-700 border-amber-200',
}
const CONFIRM_WORD = 'LIBERAR'

function useCatalog<T>(org: string | null, loader: (org: string, force?: boolean) => Promise<T[]>, label: string) {
  const [state, setState] = useState<Loadable<T>>(empty)
  const load = async (force = false) => {
    if (!org) return
    setState(s => ({ ...s, loading: true, error: '' }))
    try { setState({ rows: await loader(org, force), loading: false, error: '' }) }
    catch { setState({ rows: [], loading: false, error: `No se pudieron cargar ${label}.` }) }
  }
  useEffect(() => { void load() }, [org]) // eslint-disable-line react-hooks/exhaustive-deps
  return [state, load] as const
}

const toDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
const uncertainOf = (error: unknown) => error instanceof Error && 'uncertain' in error && (error as { uncertain?: boolean }).uncertain === true

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  return (
    <div className="space-y-2 min-w-0">
      <Label className={labelCls}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between text-left font-normal border-slate-200 bg-white hover:bg-slate-50 transition-all h-9 rounded-lg text-sm">
            <span className="text-slate-900 font-medium">{value}</span>
            <CalendarIcon className="h-4 w-4 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0 bg-white shadow-xl rounded-xl border-slate-200" align="start">
          <Calendar mode="single" selected={toDate(value)} onSelect={d => d && onChange(format(d, 'yyyy-MM-dd'))} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function App() {
  const [theme, setTheme] = useTheme()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [statusModal, setStatusModal] = useState<Modal>({ isOpen: false, type: 'info', title: '', message: '' })

  useEffect(() => {
    const orgId = new URLSearchParams(window.location.search).get('organization_id')
    if (!orgId) setStatusModal({ isOpen: true, type: 'error', title: 'Error de Inicialización', message: 'No se detectó la organización relacionada. Es necesario incluir el parámetro "organization_id" en la URL.' })
    else setOrganizationId(orgId)
  }, [])

  const [clientes, reloadClientes] = useCatalog<Cliente>(organizationId, loadClientes, 'los clientes')
  const [proyectos] = useCatalog<Proyecto>(organizationId, loadProyectos, 'los proyectos')

  // Filtros
  const [{ desde, hasta }, setRange] = useState(() => monthRange(-1))
  const [scope, setScope] = useState<Scope>('cliente')
  const [selectedCliente, setSelectedCliente] = useState('')

  // Pendientes de liberar (tiempos, gastos y cargos fijos con liberado=0)
  const [pendientes, setPendientes] = useState<Loadable<Pendiente>>(empty)
  const loadPendientes = async () => {
    if (!organizationId) return
    setPendientes(s => ({ ...s, loading: true, error: '' }))
    const clientOf = (id: number) => proyectos.rows.find(p => p.ID === String(id))?.cliente_id || null
    try { setPendientes({ rows: await fetchPendientes(organizationId, clientOf), loading: false, error: '' }) }
    catch (error) { setPendientes({ rows: [], loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar lo pendiente de liberar.' }) }
  }
  useEffect(() => { if (!proyectos.loading) void loadPendientes() }, [organizationId, proyectos.loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const clienteId = scope === 'todos' ? null : (selectedCliente || null)
  const rangeError = desde > hasta ? 'La fecha inicial no puede ser posterior a la final.' : ''
  const view = useMemo(() => preview(pendientes.rows, { desde, hasta, clienteId: scope === 'todos' ? null : clienteId ?? '__none__' }), [pendientes.rows, desde, hasta, scope, clienteId])
  const clienteName = (id: string | null) => clientes.rows.find(c => c.ID === id)?.display || id || 'Sin cliente'
  const proyectoName = (p: Pendiente) => proyectos.rows.find(x => x.ID === String(p.proyecto_id))?.display || p.proyecto_nombre

  // Solo se ofrecen los clientes que tienen algo por liberar en el rango, con su conteo.
  const clientOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of preview(pendientes.rows, { desde, hasta, clienteId: null }).items) if (p.cliente_id) counts.set(p.cliente_id, (counts.get(p.cliente_id) || 0) + 1)
    return clientes.rows.filter(c => counts.has(c.ID)).map(c => ({ ...c, secondary: `${counts.get(c.ID)} por liberar` }))
  }, [clientes.rows, pendientes.rows, desde, hasta])

  // Disponible para Prebill (ya liberado, sin Prebill) del cliente elegido
  const [moneda, setMoneda] = useState('MXN')
  const [disponible, setDisponible] = useState<{ data: Disponible | null; loading: boolean; error: string }>({ data: null, loading: false, error: '' })
  const [dispReload, setDispReload] = useState(0)
  useEffect(() => {
    if (!organizationId || scope !== 'cliente' || !selectedCliente) { setDisponible({ data: null, loading: false, error: '' }); return }
    const controller = new AbortController()
    setDisponible(s => ({ ...s, loading: true, error: '' }))
    fetchDisponible(organizationId, selectedCliente, moneda, controller.signal)
      .then(data => { if (!controller.signal.aborted) setDisponible({ data, loading: false, error: '' }) })
      .catch(error => { if (!controller.signal.aborted) setDisponible({ data: null, loading: false, error: error instanceof Error ? error.message : 'Error' }) })
    return () => controller.abort()
  }, [organizationId, scope, selectedCliente, moneda, dispReload])

  // Liberar
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)

  const canRelease = !!organizationId && !rangeError && !pendientes.loading && !pendientes.error && view.items.length > 0
    && (scope === 'todos' || !!selectedCliente)

  async function handleLiberar() {
    if (!organizationId || savingRef.current || !canRelease) return
    if (scope === 'todos' && confirmText.trim().toUpperCase() !== CONFIRM_WORD) return
    savingRef.current = true
    setIsSaving(true)
    try {
      const result = await liberar(organizationId, scope === 'todos' ? { desde, hasta, todos: true } : { desde, hasta, cliente_id: selectedCliente })
      setConfirmOpen(false); setConfirmText('')
      setStatusModal({
        isOpen: true, type: 'success', title: 'Liberación completada',
        message: `${scope === 'todos' ? 'Todos los clientes' : clienteName(selectedCliente)}, del ${desde} al ${hasta}: ${result.tiempos_liberados} tiempo(s), ${result.gastos_liberados} gasto(s) y ${result.cargos_fijos_liberados} honorario(s) fijo(s) quedaron listos para Prebill.`,
      })
      await loadPendientes()
      setDispReload(n => n + 1)
    } catch (error) {
      setConfirmOpen(false)
      setStatusModal({ isOpen: true, type: 'error', title: uncertainOf(error) ? 'Resultado por verificar' : 'No se completó la liberación', message: error instanceof Error ? error.message : 'Error al liberar.' })
      // Liberar es idempotente: repetirlo no duplica nada. Se recarga la vista previa para ver el estado real.
      if (uncertainOf(error)) await loadPendientes()
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  function handleCancel() {
    const params = new URLSearchParams(window.location.search)
    const org = organizationId || params.get('organization_id') || ''
    try {
      const target = new URL(params.get('origin') || CALENDAR_URL)
      if (!target.searchParams.get('organization_id') && org) target.searchParams.set('organization_id', org)
      target.searchParams.set('_t', Date.now().toString())
      window.location.href = target.toString()
    } catch {
      window.location.href = `${CALENDAR_URL}?organization_id=${encodeURIComponent(org)}&_t=${Date.now()}`
    }
  }

  const stripIcon = 'w-12 h-12 rounded-full bg-white/15 flex items-center justify-center shrink-0 border border-white/25'
  const divider = <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-16 bg-white/20 hidden md:block"></div>
  const scopeText = scope === 'todos' ? 'TODOS los clientes' : clienteName(selectedCliente)

  return (
    <div className="min-h-screen bg-slate-50/50 p-2 sm:p-4 lg:p-8 flex justify-center items-start font-sans w-full">
      <Toaster position="top-center" richColors />
      <Card className="w-full bg-gradient-to-b from-[#FAF8FF] to-white border border-slate-200 rounded-[20px] overflow-hidden p-3 sm:p-5 lg:p-8 relative animate__animated animate__fadeIn animate__faster">

        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-theme-from/5 rounded-full blur-[80px] animate-blob pointer-events-none z-0"></div>
        <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] bg-theme-to/5 rounded-full blur-[100px] animate-blob animation-delay-2000 pointer-events-none z-0"></div>
        <div className="absolute top-0 left-0 right-0 h-15 bg-gradient-to-b from-theme-light to-transparent pointer-events-none z-0"></div>

        {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 lg:mb-8 gap-0 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-theme-from to-theme-to flex items-center justify-center shrink-0 shadow-sm border border-black/5 text-white">
              <Unlock className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Liberaciones</h1>
                <ThemeMenu theme={theme} setTheme={setTheme} />
              </div>
              <p className="text-slate-500 text-sm mt-0.5">Marca lo capturado como listo para entrar a una Prebill</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-4 lg:mt-0 w-full lg:w-auto">
            <Button variant="outline" type="button" onClick={handleCancel}
              className="flex-1 lg:flex-none lg:w-auto h-11 sm:h-12 px-6 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium">
              Cancelar
            </Button>
            <Button onClick={() => { setConfirmText(''); setConfirmOpen(true) }} disabled={!canRelease || isSaving}
              className={cn('flex-1 lg:flex-none lg:w-auto h-11 sm:h-12 px-6 rounded-lg shadow-sm font-medium flex items-center justify-center gap-2 border-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed', gradientBtnCls)}>
              <CheckCheck className="w-4 h-4" />
              {isSaving ? 'Liberando…' : `Liberar (${view.items.length})`}
            </Button>
          </div>
        </div>

        {[clientes, proyectos].filter(c => c.error).map(c => <p key={c.error} role="alert" className="relative z-10 mb-2 text-xs text-red-700">{c.error}</p>)}
        {pendientes.error && <p role="alert" className="relative z-10 mb-2 text-xs text-red-700">{pendientes.error}</p>}

        <div inert={isSaving} aria-busy={isSaving} className="space-y-4 relative z-10">
          {/* ── Periodo y alcance ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <div className={cn(cardCls, 'flex flex-col')}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <CalendarRange className={sectionIconCls} />
                  <span className={sectionTitleCls}>Periodo</span>
                </div>
                <div className="flex gap-1.5">
                  {[{ l: 'Mes anterior', o: -1 }, { l: 'Mes actual', o: 0 }].map(({ l, o }) => (
                    <button key={l} type="button" onClick={() => setRange(monthRange(o))}
                      className="text-[11px] font-medium px-2 py-1 rounded-md border border-theme-border bg-theme-light text-theme-text hover:bg-theme-border transition-colors">{l}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DateField label="Desde *" value={desde} onChange={v => setRange(r => ({ ...r, desde: v }))} />
                <DateField label="Hasta *" value={hasta} onChange={v => setRange(r => ({ ...r, hasta: v }))} />
              </div>
              {rangeError && <p role="alert" className="mt-2 text-xs text-red-700">{rangeError}</p>}
            </div>

            <div className={cn(cardCls, 'flex flex-col')}>
              <div className="flex items-center gap-2 mb-4">
                <Users className={sectionIconCls} />
                <span className={sectionTitleCls}>Alcance</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                  {([{ key: 'cliente', label: 'Un cliente' }, { key: 'todos', label: 'Todos los clientes' }] as const).map(({ key, label }) => (
                    <button key={key} type="button" onClick={() => setScope(key)}
                      className={cn('flex-1 px-2 py-2 text-xs font-semibold rounded-md transition-all',
                        scope === key ? 'bg-gradient-to-r from-theme-from to-theme-to text-white shadow-sm' : 'text-slate-500 hover:text-theme-text hover:bg-theme-light')}>
                      {label}
                    </button>
                  ))}
                </div>
                {scope === 'cliente' ? (
                  <SearchSelect label="Cliente *" icon={<Briefcase className="w-3.5 h-3.5 text-slate-400" />}
                    options={clientOptions} value={selectedCliente} onChange={setSelectedCliente}
                    loading={clientes.loading || pendientes.loading} placeholder="Seleccionar cliente" searchPlaceholder="Buscar cliente..."
                    emptyText="Ningún cliente tiene algo por liberar en este periodo." onRefresh={() => { void reloadClientes(true); void loadPendientes() }} />
                ) : (
                  <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Se liberará lo de {view.clientes} cliente(s). Pedirá escribir {CONFIRM_WORD} para confirmar.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Resumen ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-xl overflow-hidden shadow-sm bg-gradient-to-r from-theme-from to-theme-to">
            {KINDS.map((kind, i) => {
              const Icon = KIND_ICON[kind]
              const t = view.byKind[kind]
              return (
                <div key={kind} className="p-6 flex items-center gap-5 relative">
                  <div className={stripIcon}><Icon className="w-6 h-6 text-white" /></div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/90 mb-1">{KIND_PLURAL[kind]} por liberar</p>
                    <span className="text-2xl font-bold text-white">{t.count}{kind === 'tiempo' && t.count ? <span className="text-sm font-medium text-white/80"> · {formatMoney(t.horas)} h</span> : null}</span>
                    <p className="text-[11px] text-white/80 truncate">{moneyText(t.money)}</p>
                  </div>
                  {i < 2 && divider}
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* ── Vista previa ─────────────────────────────────────────── */}
            <div className={cn(cardCls, 'lg:col-span-2 min-w-0')}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Info className={sectionIconCls} />
                  <span className={cn(sectionTitleCls, 'text-theme-text')}>Qué se liberaría</span>
                </div>
                <button type="button" onClick={() => void loadPendientes()} disabled={pendientes.loading} aria-label="Actualizar"
                  className="shrink-0 w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-50">
                  <RefreshCw className={cn('w-3.5 h-3.5 text-slate-500', pendientes.loading && 'animate-spin')} />
                </button>
              </div>
              {pendientes.loading ? <p className="text-sm text-slate-500 py-4">Cargando…</p>
                : scope === 'cliente' && !selectedCliente ? <p className="text-sm text-slate-500 py-4">Elige un cliente para ver qué se liberaría.</p>
                : view.items.length === 0 ? <p className="text-sm text-slate-500 py-4">No hay nada por liberar en este periodo.</p>
                : (
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                        <tr>
                          <th className="text-left py-2 pr-3 font-semibold">Tipo</th>
                          <th className="text-left py-2 pr-3 font-semibold">Fecha</th>
                          {scope === 'todos' && <th className="text-left py-2 pr-3 font-semibold">Cliente</th>}
                          <th className="text-left py-2 pr-3 font-semibold">Proyecto</th>
                          <th className="text-left py-2 pr-3 font-semibold">Concepto</th>
                          <th className="text-right py-2 font-semibold">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {view.items.map(p => {
                          const Icon = KIND_ICON[p.kind]
                          return (
                            <tr key={p.key}>
                              <td className="py-2 pr-3"><span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full border', KIND_CHIP[p.kind])}><Icon className="w-3 h-3" />{KIND_LABEL[p.kind]}</span></td>
                              <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{p.fecha}</td>
                              {scope === 'todos' && <td className="py-2 pr-3 text-slate-600 truncate max-w-[160px]">{clienteName(p.cliente_id)}</td>}
                              <td className="py-2 pr-3 text-slate-600 truncate max-w-[200px]" title={proyectoName(p)}>{proyectoName(p)}</td>
                              <td className="py-2 pr-3 text-slate-800 truncate max-w-[220px]" title={p.titulo}>{p.titulo}{p.horas != null ? <span className="text-slate-400"> · {formatMoney(p.horas)} h</span> : null}</td>
                              <td className="py-2 text-right font-semibold text-slate-700 whitespace-nowrap">{formatMoney(p.monto, p.moneda)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              <p className="mt-3 text-[11px] text-slate-500">Los tiempos y gastos no facturables nunca se liberan, ni lo que ya está en una Prebill. El conteo final lo confirma Aptus al liberar.</p>
            </div>

            {/* ── Disponible para Prebill ──────────────────────────────── */}
            <div className={cn(cardCls, 'min-w-0 flex flex-col')}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Wallet className={sectionIconCls} />
                  <span className={cn(sectionTitleCls, 'text-theme-text')}>Ya disponible para Prebill</span>
                </div>
                <Select value={moneda} onValueChange={setMoneda}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{['MXN', 'USD', 'EUR'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {scope !== 'cliente' || !selectedCliente ? <p className="text-xs text-slate-500">Elige un cliente para ver lo que ya está liberado y sin Prebill.</p>
                : disponible.loading ? <p className="text-xs text-slate-500">Cargando…</p>
                : disponible.error ? <p role="alert" className="text-xs text-red-700">{disponible.error}</p>
                : disponible.data && (
                  <ul className="space-y-2 text-sm">
                    {([['tiempo', disponible.data.tiempos], ['gasto', disponible.data.gastos], ['cargo', disponible.data.cargos_fijos]] as const).map(([kind, rows]) => {
                      const total = rows.reduce((s, r) => s + Number(kind === 'tiempo' ? r.importe ?? Number(r.horas || 0) * Number(r.tarifa_aplicada || 0) : r.monto || 0), 0)
                      const Icon = KIND_ICON[kind]
                      return (
                        <li key={kind} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-slate-600"><Icon className="w-4 h-4 text-slate-400" />{KIND_PLURAL[kind]}: <b className="text-slate-800">{rows.length}</b></span>
                          <span className="font-semibold text-slate-700">{formatMoney(total, moneda)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              <ul className="mt-4 space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                <li className="flex gap-2"><span className="text-theme-text font-bold">•</span>Liberar no se puede deshacer desde aquí.</li>
                <li className="flex gap-2"><span className="text-theme-text font-bold">•</span>Repetirlo para el mismo periodo no duplica nada.</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Confirmación ────────────────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={open => { if (!isSaving) setConfirmOpen(open) }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCheck className="w-5 h-5 text-theme-text" />Confirmar liberación</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-600">
            <p>Se liberará lo de <b className="text-slate-900">{scopeText}</b> del <b>{desde}</b> al <b>{hasta}</b>:</p>
            <ul className="space-y-1">
              {KINDS.map(kind => (
                <li key={kind} className="flex justify-between gap-2"><span>{KIND_PLURAL[kind]}: <b>{view.byKind[kind].count}</b></span><span className="font-medium text-slate-800">{moneyText(view.byKind[kind].money)}</span></li>
              ))}
            </ul>
            <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />No se puede deshacer: quedan listos para entrar a una Prebill.
            </p>
            {scope === 'todos' && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-word" className="text-xs text-slate-700">Para liberar a todos los clientes escribe <b>{CONFIRM_WORD}</b></Label>
                <Input id="confirm-word" value={confirmText} onChange={e => setConfirmText(e.target.value)} autoComplete="off" placeholder={CONFIRM_WORD} />
              </div>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={isSaving} className="text-slate-500">Cancelar</Button>
            <Button onClick={() => void handleLiberar()} disabled={isSaving || (scope === 'todos' && confirmText.trim().toUpperCase() !== CONFIRM_WORD)}
              className={cn('border-0 disabled:opacity-50', gradientBtnCls)}>
              {isSaving ? 'Liberando…' : 'Liberar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StatusModal
        isOpen={statusModal.isOpen}
        onClose={statusModal.type === 'error' && !organizationId ? undefined : () => setStatusModal(prev => ({ ...prev, isOpen: false }))}
        type={statusModal.type} title={statusModal.title} message={statusModal.message}
      />
    </div>
  )
}

export default App
