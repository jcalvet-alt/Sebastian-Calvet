import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import GastoForm from './components/GastoForm'
import GastoTable from './components/GastoTable'
import Resumen from './components/Resumen'
import IngresoForm from './components/IngresoForm'
import IngresoTable from './components/IngresoTable'
import ResumenIngresos from './components/ResumenIngresos'
import PagoModal from './components/PagoModal'

async function fetchTC() {
  try {
    const r = await fetch('https://api.bluelytics.com.ar/v2/latest')
    const d = await r.json()
    return d.oficial.value_sell
  } catch {
    return null
  }
}

export default function App() {
  const [tab, setTab] = useState('gastos')
  const [gastos, setGastos] = useState([])
  const [ingresos, setIngresos] = useState([])
  const [pagos, setPagos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [showIngresoForm, setShowIngresoForm] = useState(false)
  const [editandoIngreso, setEditandoIngreso] = useState(null)
  const [pagoModal, setPagoModal] = useState(null)

  const [filtroActividad, setFiltroActividad] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  async function cargarTodo() {
    try {
      const [{ data: g, error: ge }, { data: i, error: ie }, { data: p, error: pe }] = await Promise.all([
        supabase.from('gastos').select('*').order('created_at', { ascending: false }),
        supabase.from('ingresos').select('*').order('created_at', { ascending: false }),
        supabase.from('pagos').select('*'),
      ])
      if (ge) throw ge
      if (ie) throw ie
      if (pe) throw pe
      setGastos(g || [])
      setIngresos(i || [])
      setPagos(p || [])
      setError(null)
    } catch (e) {
      setError('Error de conexión: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarTodo()

    const ch = supabase.channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, cargarTodo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingresos' }, cargarTodo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, cargarTodo)
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [])

  async function agregarGasto(datos) {
    const { error } = await supabase.from('gastos').insert([{
      actividad: datos.actividad,
      concepto: datos.concepto,
      monto: datos.monto,
      moneda: datos.moneda || 'ARS',
      tipo_cambio: datos.tipoCambio,
      vencimiento: datos.vencimiento || null,
      forma_pago: datos.formaPago,
      estado: 'impago',
    }])
    if (!error) { setShowForm(false); cargarTodo() }
  }

  async function editarGasto(datos) {
    const { error } = await supabase.from('gastos').update({
      actividad: datos.actividad,
      concepto: datos.concepto,
      monto: datos.monto,
      moneda: datos.moneda || 'ARS',
      tipo_cambio: datos.tipoCambio,
      vencimiento: datos.vencimiento || null,
      forma_pago: datos.formaPago,
    }).eq('id', editando.id)
    if (!error) { setEditando(null); cargarTodo() }
  }

  async function eliminarGasto(id) {
    if (!confirm('¿Eliminar este gasto?')) return
    await supabase.from('gastos').delete().eq('id', id)
    cargarTodo()
  }

  async function actualizarEstadoGasto(id, estado, montoParcial) {
    const tc = estado === 'pagado' || estado === 'parcial' ? await fetchTC() : null
    const updates = { estado }
    if (montoParcial !== null) updates.monto_parcial = montoParcial
    if (tc) updates.tipo_cambio_pago = tc
    await supabase.from('gastos').update(updates).eq('id', id)
    cargarTodo()
  }

  async function confirmarPago({ estado, montoParcial, imputaciones }) {
    const gasto = pagoModal.gasto
    const tc = await fetchTC()
    const updates = { estado }
    if (montoParcial !== null) updates.monto_parcial = montoParcial
    if (tc) updates.tipo_cambio_pago = tc
    await supabase.from('gastos').update(updates).eq('id', gasto.id)

    if (imputaciones && imputaciones.length > 0) {
      await supabase.from('pagos').insert(
        imputaciones.map(imp => ({
          gasto_id: gasto.id,
          ingreso_id: imp.ingreso_id,
          monto: imp.monto,
        }))
      )
      for (const imp of imputaciones) {
        const ing = ingresos.find(i => i.id === imp.ingreso_id)
        if (ing) {
          const nuevoUtilizado = (ing.monto_utilizado || 0) + imp.monto
          await supabase.from('ingresos').update({ monto_utilizado: nuevoUtilizado }).eq('id', imp.ingreso_id)
        }
      }
    }

    setPagoModal(null)
    cargarTodo()
  }

  async function agregarIngreso(datos) {
    const { error } = await supabase.from('ingresos').insert([{
      actividad: datos.actividad,
      concepto: datos.concepto,
      monto: datos.monto,
      moneda: datos.moneda || 'ARS',
      tipo_cambio: datos.tipoCambio,
      fecha: datos.fecha || null,
      forma_cobro: datos.formaCobro,
      estado: 'pendiente',
    }])
    if (!error) { setShowIngresoForm(false); cargarTodo() }
  }

  async function editarIngreso(datos) {
    const { error } = await supabase.from('ingresos').update({
      actividad: datos.actividad,
      concepto: datos.concepto,
      monto: datos.monto,
      moneda: datos.moneda || 'ARS',
      tipo_cambio: datos.tipoCambio,
      fecha: datos.fecha || null,
      forma_cobro: datos.formaCobro,
    }).eq('id', editandoIngreso.id)
    if (!error) { setEditandoIngreso(null); cargarTodo() }
  }

  async function eliminarIngreso(id) {
    if (!confirm('¿Eliminar este ingreso?')) return
    await supabase.from('ingresos').delete().eq('id', id)
    cargarTodo()
  }

  async function actualizarEstadoIngreso(id, estado, montoParcial) {
    const tc = estado === 'cobrado' || estado === 'parcial' ? await fetchTC() : null
    const updates = { estado }
    if (montoParcial !== null) updates.monto_parcial = montoParcial
    if (tc) updates.tipo_cambio_cobro = tc
    await supabase.from('ingresos').update(updates).eq('id', id)
    cargarTodo()
  }

  function mapGasto(g) {
    return {
      id: g.id,
      actividad: g.actividad,
      concepto: g.concepto,
      monto: g.monto,
      moneda: g.moneda || 'ARS',
      tipoCambio: g.tipo_cambio,
      tipoCambioPago: g.tipo_cambio_pago,
      vencimiento: g.vencimiento,
      formaPago: g.forma_pago,
      estado: g.estado,
      montoParcial: g.monto_parcial,
      created_at: g.created_at,
    }
  }

  function mapIngreso(i) {
    return {
      id: i.id,
      actividad: i.actividad,
      concepto: i.concepto,
      monto: i.monto,
      moneda: i.moneda || 'ARS',
      tipoCambio: i.tipo_cambio,
      tipoCambioCobro: i.tipo_cambio_cobro,
      fecha: i.fecha,
      formaCobro: i.forma_cobro,
      estado: i.estado,
      montoParcial: i.monto_parcial,
      montoUtilizado: i.monto_utilizado,
      created_at: i.created_at,
    }
  }

  function mapPago(p) {
    return { id: p.id, gasto_id: p.gasto_id, ingreso_id: p.ingreso_id, monto: p.monto }
  }

  const gastosMapped = gastos.map(mapGasto)
  const ingresosMapped = ingresos.map(mapIngreso)
  const pagosMapped = pagos.map(mapPago)

  const gastosFiltrados = gastosMapped.filter(g => {
    if (filtroActividad !== 'todas' && g.actividad !== filtroActividad) return false
    if (filtroEstado !== 'todos' && g.estado !== filtroEstado) return false
    return true
  })

  const ingresosFiltrados = ingresosMapped.filter(g => {
    if (filtroActividad !== 'todas' && g.actividad !== filtroActividad) return false
    if (filtroEstado !== 'todos' && g.estado !== filtroEstado) return false
    return true
  })

  function exportarExcel() {
    const fmtFecha = f => {
      if (!f) return ''
      if (f.includes('T')) {
        const d = new Date(f)
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
      }
      const [y, m, d] = f.split('-')
      return `${d}/${m}/${y}`
    }

    const gastosRows = gastosMapped.map(g => ({
      'Actividad': g.actividad === 'ganaderia' ? 'Ganadería' : 'Agricultura',
      'Concepto': g.concepto,
      'Moneda': g.moneda,
      'Monto': g.monto,
      'TC Carga': g.tipoCambio || '',
      'TC Pago': g.tipoCambioPago || '',
      'F. Carga': fmtFecha(g.created_at),
      'Vencimiento': fmtFecha(g.vencimiento),
      'Forma de Pago': g.formaPago || '',
      'Estado': g.estado,
      'Monto Parcial': g.montoParcial || '',
    }))

    const ingresosRows = ingresosMapped.map(i => ({
      'Actividad': i.actividad === 'ganaderia' ? 'Ganadería' : 'Agricultura',
      'Concepto': i.concepto,
      'Moneda': i.moneda,
      'Monto': i.monto,
      'TC Carga': i.tipoCambio || '',
      'TC Cobro': i.tipoCambioCobro || '',
      'F. Carga': fmtFecha(i.created_at),
      'Fecha Cobro': fmtFecha(i.fecha),
      'Forma de Cobro': i.formaCobro || '',
      'Estado': i.estado,
      'Monto Parcial': i.montoParcial || '',
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gastosRows), 'Gastos')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingresosRows), 'Ingresos')
    XLSX.writeFile(wb, 'DosAgro.xlsx')
  }

  const gastosParaForm = editando ? {
    actividad: editando.actividad,
    concepto: editando.concepto,
    monto: editando.monto,
    moneda: editando.moneda,
    tipoCambio: editando.tipoCambio || '',
    vencimiento: editando.vencimiento || '',
    formaPago: editando.formaPago || '',
  } : null

  const ingresosParaForm = editandoIngreso ? {
    actividad: editandoIngreso.actividad,
    concepto: editandoIngreso.concepto,
    monto: editandoIngreso.monto,
    moneda: editandoIngreso.moneda,
    tipoCambio: editandoIngreso.tipoCambio || '',
    fecha: editandoIngreso.fecha || '',
    formaCobro: editandoIngreso.formaCobro || '',
  } : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-800 text-white px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Dos Agro</h1>
            <p className="text-green-200 text-xs">Gestión económica</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportarExcel}
              className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1">
              ↓ Excel
            </button>
            {tab === 'gastos' ? (
              <button onClick={() => setShowForm(true)}
                className="bg-white text-green-800 hover:bg-green-50 px-3 py-2 rounded-lg text-sm font-medium transition">
                + Nuevo gasto
              </button>
            ) : (
              <button onClick={() => setShowIngresoForm(true)}
                className="bg-white text-green-800 hover:bg-green-50 px-3 py-2 rounded-lg text-sm font-medium transition">
                + Nuevo ingreso
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto mt-3 flex gap-1">
          {[['gastos', 'Gastos'], ['ingresos', 'Ingresos']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setFiltroActividad('todas'); setFiltroEstado('todos') }}
              className={`px-4 py-1.5 rounded-t-lg text-sm font-medium transition ${tab === key ? 'bg-white text-green-800' : 'text-green-200 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-400">Cargando...</div>
        ) : (
          <>
            {tab === 'gastos' ? (
              <Resumen gastos={gastosMapped} />
            ) : (
              <ResumenIngresos ingresos={ingresosMapped} />
            )}

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-500">Actividad:</label>
                <select value={filtroActividad} onChange={e => setFiltroActividad(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="todas">Todas</option>
                  <option value="agricultura">Agricultura</option>
                  <option value="ganaderia">Ganadería</option>
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-500">Estado:</label>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="todos">Todos</option>
                  {tab === 'gastos' ? (
                    <>
                      <option value="impago">Impago</option>
                      <option value="parcial">Parcial</option>
                      <option value="pagado">Pagado</option>
                    </>
                  ) : (
                    <>
                      <option value="pendiente">Pendiente</option>
                      <option value="parcial">Parcial</option>
                      <option value="cobrado">Cobrado</option>
                    </>
                  )}
                </select>
              </div>
              <span className="text-xs text-gray-400 ml-auto">
                {tab === 'gastos' ? `${gastosFiltrados.length} gastos` : `${ingresosFiltrados.length} ingresos`}
              </span>
            </div>

            {tab === 'gastos' ? (
              <GastoTable
                gastos={gastosFiltrados}
                pagos={pagosMapped}
                ingresos={ingresosMapped}
                onEliminar={eliminarGasto}
                onEditar={g => setEditando(g)}
                onActualizarEstado={actualizarEstadoGasto}
                onAbrirPago={(gasto, estadoInicial) => setPagoModal({ gasto, estadoInicial })}
              />
            ) : (
              <IngresoTable
                ingresos={ingresosFiltrados}
                onEliminar={eliminarIngreso}
                onEditar={i => setEditandoIngreso(i)}
                onActualizarEstado={actualizarEstadoIngreso}
              />
            )}
          </>
        )}
      </div>

      {(showForm || editando) && (
        <GastoForm
          inicial={gastosParaForm}
          onGuardar={editando ? editarGasto : agregarGasto}
          onCancelar={() => { setShowForm(false); setEditando(null) }}
        />
      )}

      {(showIngresoForm || editandoIngreso) && (
        <IngresoForm
          inicial={ingresosParaForm}
          onGuardar={editandoIngreso ? editarIngreso : agregarIngreso}
          onCancelar={() => { setShowIngresoForm(false); setEditandoIngreso(null) }}
        />
      )}

      {pagoModal && (
        <PagoModal
          gasto={pagoModal.gasto}
          ingresos={ingresosMapped}
          onConfirmar={confirmarPago}
          onCancelar={() => setPagoModal(null)}
        />
      )}
    </div>
  )
}
