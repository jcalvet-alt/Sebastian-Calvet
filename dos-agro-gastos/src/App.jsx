import { useState, useEffect } from 'react'
import GastoForm from './components/GastoForm'
import GastoTable from './components/GastoTable'
import Resumen from './components/Resumen'
import './index.css'

const STORAGE_KEY = 'dos-agro-gastos'

export default function App() {
  const [gastos, setGastos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    } catch {
      return []
    }
  })
  const [filtroActividad, setFiltroActividad] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gastos))
  }, [gastos])

  function agregarGasto(gasto) {
    if (editando !== null) {
      setGastos(prev => prev.map(g => g.id === editando ? { ...gasto, id: editando } : g))
      setEditando(null)
    } else {
      setGastos(prev => [...prev, { ...gasto, id: Date.now() }])
    }
    setModalOpen(false)
  }

  function eliminarGasto(id) {
    if (confirm('¿Eliminar este gasto?')) {
      setGastos(prev => prev.filter(g => g.id !== id))
    }
  }

  function editarGasto(gasto) {
    setEditando(gasto.id)
    setModalOpen(true)
  }

  function actualizarEstado(id, nuevoEstado, montoParcial) {
    setGastos(prev => prev.map(g =>
      g.id === id ? { ...g, estado: nuevoEstado, montoParcial: montoParcial ?? g.montoParcial } : g
    ))
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
          <button
            onClick={() => { setEditando(null); setModalOpen(true) }}
            className="bg-white text-green-800 font-semibold px-4 py-2 rounded-lg shadow hover:bg-green-50 transition text-sm"
          >
            + Nuevo gasto
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
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
