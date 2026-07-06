import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'
import GastoForm from './components/GastoForm'
import GastoTable from './components/GastoTable'
import Resumen from './components/Resumen'
import IngresoForm from './components/IngresoForm'
import IngresoTable from './components/IngresoTable'
import ResumenIngresos from './components/ResumenIngresos'
import './index.css'

async function fetchTC() {
  try {
    const res = await fetch('https://api.bluelytics.com.ar/v2/latest')
    const data = await res.json()
    return data.oficial.value_sell
  } catch { return null }
}

function gastoToLocal(g) {
  return {
    id: g.id, actividad: g.actividad, concepto: g.concepto, monto: g.monto,
    vencimiento: g.vencimiento, formaPago: g.forma_pago, estado: g.estado,
    montoParcial: g.monto_parcial, moneda: g.moneda ?? 'ARS',
    tipoCambio: g.tipo_cambio ?? null, tipoCambioPago: g.tipo_cambio_pago ?? null,
  }
}
function gastoToRemote(g) {
  return {
    actividad: g.actividad, concepto: g.concepto, monto: g.monto,
    vencimiento: g.vencimiento || null, forma_pago: g.formaPago,
    estado: g.estado, monto_parcial: g.montoParcial || null,
    moneda: g.moneda ?? 'ARS', tipo_cambio: g.tipoCambio ?? null,
  }
}

function ingresoToLocal(g) {
  return {
    id: g.id, actividad: g.actividad, concepto: g.concepto, monto: g.monto,
    fecha: g.fecha, formaCobro: g.forma_cobro, estado: g.estado,
    montoParcial: g.monto_parcial, moneda: g.moneda ?? 'ARS',
    tipoCambio: g.tipo_cambio ?? null, tipoCambioCobro: g.tipo_cambio_cobro ?? null,
  }
}
function ingresoToRemote(g) {
  return {
    actividad: g.actividad, concepto: g.concepto, monto: g.monto,
    fecha: g.fecha || null, forma_cobro: g.formaCobro,
    estado: g.estado, monto_parcial: g.montoParcial || null,
    moneda: g.moneda ?? 'ARS', tipo_cambio: g.tipoCambio ?? null,
  }
}

export default function App() {
  const [tab, setTab] = useState('gastos')
  const [gastos, setGastos] = useState([])
  const [ingresos, setIngresos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtroActividad, setFiltroActividad] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)

  const cargarGastos = useCallback(async () => {
    const { data, error } = await supabase.from('gastos').select('*').order('created_at', { ascending: false })
    if (error) { setError(error.message); return }
    setGastos(data.map(gastoToLocal))
    setCargando(false)
  }, [])

  const cargarIngresos = useCallback(async () => {
    const { data, error } = await supabase.from('ingresos').select('*').order('created_at', { ascending: false })
    if (error) { setError(error.message); return }
    setIngresos(data.map(ingresoToLocal))
  }, [])

  useEffect(() => {
    cargarGastos()
    cargarIngresos()
    const ch1 = supabase.channel('gastos-ch').on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, cargarGastos).subscribe()
    const ch2 = supabase.channel('ingresos-ch').on('postgres_changes', { event: '*', schema: 'public', table: 'ingresos' }, cargarIngresos).subscribe()
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [cargarGastos, cargarIngresos])

  // --- GASTOS ---
  async function agregarGasto(gasto) {
    if (editando !== null) {
      const { error } = await supabase.from('gastos').update(gastoToRemote(gasto)).eq('id', editando)
      if (error) { alert('Error: ' + error.message); return }
      setEditando(null)
    } else {
      const { error } = await supabase.from('gastos').insert(gastoToRemote({ ...gasto, estado: 'impago' }))
      if (error) { alert('Error: ' + error.message); return }
    }
    setModalOpen(false); cargarGastos()
  }

  async function eliminarGasto(id) {
    if (!confirm('¿Eliminar este gasto?')) return
    await supabase.from('gastos').delete().eq('id', id); cargarGastos()
  }

  async function actualizarEstadoGasto(id, nuevoEstado, montoParcial) {
    const update = { estado: nuevoEstado, monto_parcial: montoParcial ?? null }
    if (nuevoEstado === 'pagado' || nuevoEstado === 'parcial') {
      const tc = await fetchTC()
      if (tc) update.tipo_cambio_pago = tc
    }
    const { error } = await supabase.from('gastos').update(update).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    cargarGastos()
  }

  // --- INGRESOS ---
  async function agregarIngreso(ingreso) {
    if (editando !== null) {
      const { error } = await supabase.from('ingresos').update(ingresoToRemote(ingreso)).eq('id', editando)
      if (error) { alert('Error: ' + error.message); return }
      setEditando(null)
    } else {
      const { error } = await supabase.from('ingresos').insert(ingresoToRemote({ ...ingreso, estado: 'pendiente' }))
      if (error) { alert('Error: ' + error.message); return }
    }
    setModalOpen(false); cargarIngresos()
  }

  async function eliminarIngreso(id) {
    if (!confirm('¿Eliminar este ingreso?')) return
    await supabase.from('ingresos').delete().eq('id', id); cargarIngresos()
  }

  async function actualizarEstadoIngreso(id, nuevoEstado, montoParcial) {
    const update = { estado: nuevoEstado, monto_parcial: montoParcial ?? null }
    if (nuevoEstado === 'cobrado' || nuevoEstado === 'parcial') {
      const tc = await fetchTC()
      if (tc) update.tipo_cambio_cobro = tc
    }
    const { error } = await supabase.from('ingresos').update(update).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    cargarIngresos()
  }

  // --- EXCEL ---
  function exportarExcel() {
    const filasg = gastos.map(g => ({
      'Tipo': 'Gasto', 'Actividad': g.actividad === 'ganaderia' ? 'Ganadería' : 'Agricultura',
      'Concepto': g.concepto, 'Moneda': g.moneda, 'Monto': g.monto,
      'TC carga': g.tipoCambio ?? '', 'TC pago': g.tipoCambioPago ?? '',
      'Monto USD': g.moneda === 'USD' ? g.monto : (g.tipoCambio ? parseFloat((g.monto / g.tipoCambio).toFixed(2)) : ''),
      'Vencimiento': g.vencimiento || '', 'Forma de pago': g.formaPago,
      'Estado': g.estado === 'pagado' ? 'Pagado' : g.estado === 'parcial' ? 'Pago parcial' : 'Impago',
    }))
    const filasin = ingresos.map(g => ({
      'Tipo': 'Ingreso', 'Actividad': g.actividad === 'ganaderia' ? 'Ganadería' : 'Agricultura',
      'Concepto': g.concepto, 'Moneda': g.moneda, 'Monto': g.monto,
      'TC carga': g.tipoCambio ?? '', 'TC cobro': g.tipoCambioCobro ?? '',
      'Monto USD': g.moneda === 'USD' ? g.monto : (g.tipoCambio ? parseFloat((g.monto / g.tipoCambio).toFixed(2)) : ''),
      'Fecha': g.fecha || '', 'Forma de cobro': g.formaCobro,
      'Estado': g.estado === 'cobrado' ? 'Cobrado' : g.estado === 'parcial' ? 'Cobro parcial' : 'Pendiente',
    }))
    const ws = XLSX.utils.json_to_sheet([...filasg, ...filasin])
    ws['!cols'] = [10, 14, 30, 10, 14, 12, 12, 12, 14, 16, 14].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos e Ingresos')
    XLSX.writeFile(wb, `DosAgro_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const esGastos = tab === 'gastos'
  const lista = esGastos ? gastos : ingresos
  const listaFiltrada = lista.filter(g => {
    const okAct = filtroActividad === 'todas' || g.actividad === filtroActividad
    const okEst = filtroEstado === 'todos' || g.estado === filtroEstado
    return okAct && okEst
  })
  const itemEditando = editando !== null ? lista.find(g => g.id === editando) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Dos Agro</h1>
            <p className="text-green-200 text-sm">Gestión económica</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportarExcel}
              className="bg-green-700 border border-green-500 text-white font-semibold px-4 py-2 rounded-lg shadow hover:bg-green-600 transition text-sm">
              ↓ Excel
            </button>
            <button onClick={() => { setEditando(null); setModalOpen(true) }}
              className="bg-white text-green-800 font-semibold px-4 py-2 rounded-lg shadow hover:bg-green-50 transition text-sm">
              + {esGastos ? 'Nuevo gasto' : 'Nuevo ingreso'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 pb-0">
          {[['gastos', 'Gastos'], ['ingresos', 'Ingresos']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setFiltroEstado('todos') }}
              className={`px-5 py-2 text-sm font-semibold rounded-t-lg transition ${tab === key ? 'bg-gray-50 text-green-800' : 'text-green-200 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            Error de conexión: {error}
          </div>
        )}

        {cargando ? (
          <div className="text-center py-16 text-gray-400"><p className="text-sm">Cargando...</p></div>
        ) : (
          <>
            {esGastos ? <Resumen gastos={gastos} /> : <ResumenIngresos ingresos={ingresos} />}

            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">Actividad:</label>
                <select value={filtroActividad} onChange={e => setFiltroActividad(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="todas">Todas</option>
                  <option value="ganaderia">Ganadería</option>
                  <option value="agricultura">Agricultura</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">Estado:</label>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="todos">Todos</option>
                  {esGastos ? <>
                    <option value="impago">Impago</option>
                    <option value="parcial">Pago parcial</option>
                    <option value="pagado">Pagado</option>
                  </> : <>
                    <option value="pendiente">Pendiente</option>
                    <option value="parcial">Cobro parcial</option>
                    <option value="cobrado">Cobrado</option>
                  </>}
                </select>
              </div>
              <div className="ml-auto text-sm text-gray-500">
                {listaFiltrada.length} {esGastos ? 'gasto' : 'ingreso'}{listaFiltrada.length !== 1 ? 's' : ''}
              </div>
            </div>

            {esGastos
              ? <GastoTable gastos={listaFiltrada} onEliminar={eliminarGasto}
                  onEditar={g => { setEditando(g.id); setModalOpen(true) }}
                  onActualizarEstado={actualizarEstadoGasto} />
              : <IngresoTable ingresos={listaFiltrada} onEliminar={eliminarIngreso}
                  onEditar={g => { setEditando(g.id); setModalOpen(true) }}
                  onActualizarEstado={actualizarEstadoIngreso} />
            }
          </>
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">
                  {editando !== null ? 'Editar' : 'Nuevo'} {esGastos ? 'gasto' : 'ingreso'}
                </h2>
                <button onClick={() => { setModalOpen(false); setEditando(null) }}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              {esGastos
                ? <GastoForm onGuardar={agregarGasto} onCancelar={() => { setModalOpen(false); setEditando(null) }} inicial={itemEditando} />
                : <IngresoForm onGuardar={agregarIngreso} onCancelar={() => { setModalOpen(false); setEditando(null) }} inicial={itemEditando} />
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
