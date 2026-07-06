import { useState } from 'react'

const BADGE = {
  pagado: 'bg-green-100 text-green-800',
  parcial: 'bg-yellow-100 text-yellow-800',
  impago: 'bg-red-100 text-red-800',
}
const LABEL = { pagado: 'Pagado', parcial: 'Parcial', impago: 'Impago' }

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
  const enUSD = g.moneda === 'USD' ? g.monto : (g.tipoCambio ? g.monto / g.tipoCambio : null)
  return (
    <div className="text-right">
      <div className="font-mono text-gray-800 font-medium">
        {g.moneda === 'USD' ? fmtUSD(g.monto) : fmtARS(g.monto)}
      </div>
      {enUSD !== null && g.moneda === 'ARS' && (
        <div className="text-xs text-blue-500 font-mono">≈ {fmtUSD(enUSD)}</div>
      )}
      {g.tipoCambio && <div className="text-xs text-gray-400">TC carga ${g.tipoCambio.toLocaleString('es-AR')}</div>}
      {g.tipoCambioPago && <div className="text-xs text-green-500">TC pago ${g.tipoCambioPago.toLocaleString('es-AR')}</div>}
    </div>
  )
}

function EstadoCell({ gasto, onActualizarEstado, onAbrirPago }) {
  const [open, setOpen] = useState(false)

  function aplicar(estado) {
    setOpen(false)
    if (estado === 'pagado' || estado === 'parcial') {
      onAbrirPago(gasto, estado)
    } else {
      onActualizarEstado(gasto.id, estado, null)
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={`px-2 py-1 rounded-full text-xs font-semibold ${BADGE[gasto.estado]} cursor-pointer hover:opacity-80 transition whitespace-nowrap`}>
        {LABEL[gasto.estado]}
        {gasto.estado === 'parcial' && gasto.montoParcial ? ` ${fmtARS(gasto.montoParcial)}` : ''}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-36 right-0">
          {['pagado', 'parcial', 'impago'].map(e => (
            <button key={e} onClick={() => aplicar(e)}
              className={`block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg font-medium ${BADGE[e]}`}>
              {LABEL[e]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PagosImputados({ pagos, ingresos }) {
  if (!pagos || pagos.length === 0) return null
  return (
    <div className="mt-1 space-y-0.5">
      {pagos.map(p => {
        const ing = ingresos.find(i => i.id === p.ingreso_id)
        return (
          <div key={p.id} className="text-xs text-indigo-600 bg-indigo-50 rounded px-2 py-0.5 inline-block mr-1">
            ← {ing ? ing.concepto : 'Ingreso'}: {fmtARS(p.monto)}
          </div>
        )
      })}
    </div>
  )
}

export default function GastoTable({ gastos, pagos, ingresos, onEliminar, onEditar, onActualizarEstado, onAbrirPago }) {
  if (gastos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-sm">No hay gastos registrados.</p>
        <p className="text-xs mt-1">Presioná "+ Nuevo gasto" para comenzar.</p>
      </div>
    )
  }

  function pagosDeGasto(gastoId) {
    return (pagos || []).filter(p => p.gasto_id === gastoId)
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
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{g.concepto}</div>
                  <PagosImputados pagos={pagosDeGasto(g.id)} ingresos={ingresos || []} />
                </td>
                <td className="px-4 py-3"><MontoCell g={g} /></td>
                <td className="px-4 py-3 text-center text-gray-600">{fmtFecha(g.vencimiento)}</td>
                <td className="px-4 py-3 text-gray-600">{g.formaPago}</td>
                <td className="px-4 py-3 text-center">
                  <EstadoCell gasto={g} onActualizarEstado={onActualizarEstado} onAbrirPago={onAbrirPago} />
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
            <div>
              <p className="font-semibold text-gray-800">{g.concepto}</p>
              <PagosImputados pagos={pagosDeGasto(g.id)} ingresos={ingresos || []} />
            </div>
            <div className="flex items-center justify-between">
              <MontoCell g={g} />
              <EstadoCell gasto={g} onActualizarEstado={onActualizarEstado} onAbrirPago={onAbrirPago} />
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
