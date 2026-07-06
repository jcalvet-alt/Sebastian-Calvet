import { useState } from 'react'

const BADGE = {
  pagado: 'bg-green-100 text-green-800',
  parcial: 'bg-yellow-100 text-yellow-800',
  impago: 'bg-red-100 text-red-800',
}

const LABEL = {
  pagado: 'Pagado',
  parcial: 'Parcial',
  impago: 'Impago',
}

function fmtARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function fmtUSD(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

function MontoCell({ g }) {
  const enUSD = g.moneda === 'USD'
    ? g.monto
    : (g.tipoCambio ? g.monto / g.tipoCambio : null)

  return (
    <div className="text-right">
      <div className="font-mono text-gray-800 font-medium">
        {g.moneda === 'USD' ? fmtUSD(g.monto) : fmtARS(g.monto)}
      </div>
      {enUSD !== null && g.moneda === 'ARS' && (
        <div className="text-xs text-blue-500 font-mono">≈ {fmtUSD(enUSD)}</div>
      )}
      {g.tipoCambio && (
        <div className="text-xs text-gray-400">TC carga ${g.tipoCambio.toLocaleString('es-AR')}</div>
      )}
      {g.tipoCambioPago && (
        <div className="text-xs text-green-500">TC pago ${g.tipoCambioPago.toLocaleString('es-AR')}</div>
      )}
    </div>
  )
}

function EstadoCell({ gasto, onActualizarEstado }) {
  const [open, setOpen] = useState(false)
  const [montoParcialInput, setMontoParcialInput] = useState('')

  function aplicar(estado) {
    if (estado === 'parcial') { setOpen('parcial'); return }
    onActualizarEstado(gasto.id, estado, null)
    setOpen(false)
  }

  function confirmarParcial() {
    const val = parseFloat(montoParcialInput)
    if (!val || val <= 0) return
    onActualizarEstado(gasto.id, 'parcial', val)
    setOpen(false)
    setMontoParcialInput('')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => v ? false : 'menu')}
        className={`px-2 py-1 rounded-full text-xs font-semibold ${BADGE[gasto.estado]} cursor-pointer hover:opacity-80 transition whitespace-nowrap`}
      >
        {LABEL[gasto.estado]}
        {gasto.estado === 'parcial' && gasto.montoParcial ? ` ${fmtARS(gasto.montoParcial)}` : ''}
      </button>

      {open === 'menu' && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-36 right-0">
          {['pagado', 'parcial', 'impago'].map(e => (
            <button
              key={e}
              onClick={() => aplicar(e)}
              className={`block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg font-medium ${BADGE[e]}`}
            >
              {LABEL[e]}
            </button>
          ))}
        </div>
      )}

      {open === 'parcial' && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 right-0 min-w-44">
          <p className="text-xs text-gray-600 mb-2 font-medium">Monto pagado</p>
          <input
            type="number"
            autoFocus
            value={montoParcialInput}
            onChange={e => setMontoParcialInput(e.target.value)}
            placeholder="0"
            min="0"
            step="0.01"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="flex-1 text-xs border border-gray-300 rounded py-1 hover:bg-gray-50">Cancelar</button>
            <button onClick={confirmarParcial} className="flex-1 text-xs bg-green-700 text-white rounded py-1 hover:bg-green-800">OK</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function GastoTable({ gastos, onEliminar, onEditar, onActualizarEstado }) {
  if (gastos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-sm">No hay gastos registrados.</p>
        <p className="text-xs mt-1">Presioná "+ Nuevo gasto" para comenzar.</p>
      </div>
    )
  }

  return (
    <>
      {/* Vista desktop */}
      <div className="hidden md:block bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Actividad</th>
              <th className="px-4 py-3 text-left">Concepto</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-center">Vencimiento</th>
              <th className="px-4 py-3 text-left">Forma de pago</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gastos.map(g => (
              <tr key={g.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${g.actividad === 'ganaderia' ? 'bg-amber-100 text-amber-800' : 'bg-lime-100 text-lime-800'}`}>
                    {g.actividad === 'ganaderia' ? 'Ganadería' : 'Agricultura'}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">{g.concepto}</td>
                <td className="px-4 py-3"><MontoCell g={g} /></td>
                <td className="px-4 py-3 text-center text-gray-600">{fmtFecha(g.vencimiento)}</td>
                <td className="px-4 py-3 text-gray-600">{g.formaPago}</td>
                <td className="px-4 py-3 text-center">
                  <EstadoCell gasto={g} onActualizarEstado={onActualizarEstado} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => onEditar(g)} className="text-gray-400 hover:text-blue-600 mr-2 transition" title="Editar">✏️</button>
                  <button onClick={() => onEliminar(g.id)} className="text-gray-400 hover:text-red-600 transition" title="Eliminar">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vista mobile */}
      <div className="md:hidden space-y-3">
        {gastos.map(g => (
          <div key={g.id} className="bg-white rounded-xl shadow p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${g.actividad === 'ganaderia' ? 'bg-amber-100 text-amber-800' : 'bg-lime-100 text-lime-800'}`}>
                {g.actividad === 'ganaderia' ? 'Ganadería' : 'Agricultura'}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => onEditar(g)} className="text-gray-400 hover:text-blue-600 transition">✏️</button>
                <button onClick={() => onEliminar(g.id)} className="text-gray-400 hover:text-red-600 transition">🗑️</button>
              </div>
            </div>
            <p className="font-semibold text-gray-800">{g.concepto}</p>
            <div className="flex items-center justify-between">
              <MontoCell g={g} />
              <EstadoCell gasto={g} onActualizarEstado={onActualizarEstado} />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Venc: {fmtFecha(g.vencimiento)}</span>
              <span>{g.formaPago}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
