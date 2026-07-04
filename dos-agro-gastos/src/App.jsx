import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'
import GastoForm from './components/GastoForm'
import GastoTable from './components/GastoTable'
import Resumen from './components/Resumen'
import './index.css'

function toLocal(g) {
  return {
    id: g.id,
    actividad: g.actividad,
    concepto: g.concepto,
    monto: g.monto,
    vencimiento: g.vencimiento,
    formaPago: g.forma_pago,
    estado: g.estado,
    montoParcial: g.monto_parcial,
    moneda: g.moneda ?? 'ARS',
    tipoCambio: g.tipo_cambio ?? null,
  }
}

function toRemote(g) {
  return {
    actividad: g.actividad,
    concepto: g.concepto,
    monto: g.monto,
    vencimiento: g.vencimiento || null,
    forma_pago: g.formaPago,
    estado: g.estado,
    monto_parcial: g.montoParcial || null,
    moneda: g.moneda ?? 'ARS',
    tipo_cambio: g.tipoCambio ?? null,
  }
}

export default function App() {
  const [gastos, setGastos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtroActividad, setFiltroActividad] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)

  const cargarGastos = useCallback(async () => {
    const { data, error } = await supabase
      .from('gastos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { setError(error.message); return }
    setGastos(data.map(toLocal))
    setCargando(false)
  }, [])

  useEffect(() => {
    cargarGastos()

    const channel = supabase
      .channel('gastos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, cargarGastos)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [cargarGastos])

  async function agregarGasto(gasto) {
    if (editando !== null) {
      const { error } = await supabase
        .from('gastos')
        .update(toRemote(gasto))
        .eq('id', editando)
      if (error) { alert('Error al guardar: ' + error.message); return }
      setEditando(null)
    } else {
      const { error } = await supabase
        .from('gastos')
        .insert(toRemote({ ...gasto, estado: 'impago' }))
      if (error) { alert('Error al guardar: ' + error.message); return }
    }
    setModalOpen(false)
    cargarGastos()
  }

  async function eliminarGasto(id) {
    if (!confirm('¿Eliminar este gasto?')) return
    const { error } = await supabase.from('gastos').delete().eq('id', id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    cargarGastos()
  }

  function editarGasto(gasto) {
    setEditando(gasto.id)
    setModalOpen(true)
  }

  function exportarExcel() {
    const filas = gastos.map(g => {
      const enUSD = g.moneda === 'USD'
        ? g.monto
        : (g.tipoCambio ? g.monto / g.tipoCambio : null)
      return {
        'Actividad': g.actividad === 'ganaderia' ? 'Ganadería' : 'Agricultura',
        'Concepto': g.concepto,
        'Moneda': g.moneda,
        'Monto': g.monto,
        'TC BNA': g.tipoCambio ?? '',
        'Monto USD': enUSD ? parseFloat(enUSD.toFixed(2)) : '',
        'Vencimiento': g.vencimiento || '',
        'Forma de pago': g.formaPago,
        'Estado': g.estado === 'pagado' ? 'Pagado' : g.estado === 'parcial' ? 'Pago parcial' : 'Impago',
        'Monto pagado': g.estado === 'parcial' ? g.montoParcial : g.estado === 'pagado' ? g.monto : 0,
      }
    })
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [16, 30, 10, 14, 12, 12, 14, 16, 14, 14].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos')
    const fecha = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `DosAgro_Gastos_${fecha}.xlsx`)
  }

  async function actualizarEstado(id, nuevoEstado, montoParcial) {
    const update = { estado: nuevoEstado, monto_parcial: montoParcial ?? null }
    const { error } = await supabase.from('gastos').update(update).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    cargarGastos()
  }

  const gastosFiltrados = gastos.filter(g => {
    const okActividad = filtroActividad === 'todas' || g.actividad === filtroActividad
    const okEstado = filtroEstado === 'todos' || g.estado === filtroEstado
    return okActividad && okEstado
  })

  const gastoEditando = editando !== null ? gastos.find(g => g.id === editando) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Dos Agro</h1>
            <p className="text-green-200 text-sm">Registro de Gastos</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportarExcel}
              className="bg-green-700 border border-green-500 text-white font-semibold px-4 py-2 rounded-lg shadow hover:bg-green-600 transition text-sm"
              title="Exportar a Excel"
            >
              ↓ Excel
            </button>
            <button
              onClick={() => { setEditando(null); setModalOpen(true) }}
              className="bg-white text-green-800 font-semibold px-4 py-2 rounded-lg shadow hover:bg-green-50 transition text-sm"
            >
              + Nuevo gasto
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            Error de conexión: {error}
          </div>
        )}

        {cargando ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">Cargando gastos...</p>
          </div>
        ) : (
          <>
            <Resumen gastos={gastos} />

            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">Actividad:</label>
                <select
                  value={filtroActividad}
                  onChange={e => setFiltroActividad(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="todas">Todas</option>
                  <option value="ganaderia">Ganadería</option>
                  <option value="agricultura">Agricultura</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">Estado:</label>
                <select
                  value={filtroEstado}
                  onChange={e => setFiltroEstado(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="todos">Todos</option>
                  <option value="impago">Impago</option>
                  <option value="parcial">Pago parcial</option>
                  <option value="pagado">Pagado</option>
                </select>
              </div>
              <div className="ml-auto text-sm text-gray-500">
                {gastosFiltrados.length} gasto{gastosFiltrados.length !== 1 ? 's' : ''}
              </div>
            </div>

            <GastoTable
              gastos={gastosFiltrados}
              onEliminar={eliminarGasto}
              onEditar={editarGasto}
              onActualizarEstado={actualizarEstado}
            />
          </>
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">
                  {editando !== null ? 'Editar gasto' : 'Nuevo gasto'}
                </h2>
                <button
                  onClick={() => { setModalOpen(false); setEditando(null) }}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <GastoForm
                onGuardar={agregarGasto}
                onCancelar={() => { setModalOpen(false); setEditando(null) }}
                inicial={gastoEditando}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
