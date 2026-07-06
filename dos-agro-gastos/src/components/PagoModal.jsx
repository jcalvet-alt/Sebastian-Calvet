import { useState } from 'react'

function fmtARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function fmtUSD(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}
function fmt(monto, moneda) {
  return moneda === 'USD' ? fmtUSD(monto) : fmtARS(monto)
}

export default function PagoModal({ gasto, ingresos, onConfirmar, onCancelar }) {
  const [estado, setEstado] = useState('pagado')
  const [montoParcial, setMontoParcial] = useState('')
  const [imputaciones, setImputaciones] = useState([{ ingreso_id: '', monto: '' }])

  const montoTotal = estado === 'pagado'
    ? gasto.monto
    : (parseFloat(montoParcial) || 0)

  const totalImputado = imputaciones.reduce((s, i) => s + (parseFloat(i.monto) || 0), 0)
  const restante = montoTotal - totalImputado

  const ingresosDisponibles = ingresos.filter(ing => {
    const disponible = ing.monto - (ing.montoUtilizado || 0)
    return disponible > 0
  })

  function setImputacion(idx, campo, valor) {
    setImputaciones(prev => prev.map((im, i) => i === idx ? { ...im, [campo]: valor } : im))
  }

  function agregarFila() {
    setImputaciones(prev => [...prev, { ingreso_id: '', monto: '' }])
  }

  function quitarFila(idx) {
    setImputaciones(prev => prev.filter((_, i) => i !== idx))
  }

  function handleConfirmar() {
    const imputacionesValidas = imputaciones.filter(i => i.ingreso_id && parseFloat(i.monto) > 0)
    const montoParcialFinal = estado === 'parcial' ? parseFloat(montoParcial) : null
    onConfirmar({
      estado,
      montoParcial: montoParcialFinal,
      imputaciones: imputacionesValidas.map(i => ({
        ingreso_id: parseInt(i.ingreso_id),
        monto: parseFloat(i.monto),
      })),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">Registrar pago</h2>
            <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>

          {/* Info gasto */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800">{gasto.concepto}</p>
            <p className="text-gray-500">Total: <span className="font-mono font-medium text-gray-700">{fmt(gasto.monto, gasto.moneda)}</span></p>
          </div>

          {/* Tipo de pago */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de pago</label>
            <div className="flex gap-3">
              {[['pagado', 'Pago total'], ['parcial', 'Pago parcial']].map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estadoPago" value={val}
                    checked={estado === val} onChange={() => setEstado(val)}
                    className="accent-green-700" />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Monto parcial */}
          {estado === 'parcial' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto pagado</label>
              <input type="number" value={montoParcial} onChange={e => setMontoParcial(e.target.value)}
                placeholder="0.00" min="0" step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          )}

          {/* Imputar a ingresos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Imputar a ingresos <span className="text-gray-400 font-normal">(opcional)</span></label>
              <button onClick={agregarFila} className="text-xs text-green-700 hover:text-green-800 font-medium">+ Agregar</button>
            </div>

            {ingresosDisponibles.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No hay ingresos con saldo disponible.</p>
            ) : (
              <div className="space-y-2">
                {imputaciones.map((imp, idx) => {
                  const ingSelected = ingresos.find(i => i.id === parseInt(imp.ingreso_id))
                  const disponible = ingSelected ? ingSelected.monto - (ingSelected.montoUtilizado || 0) : 0
                  return (
                    <div key={idx} className="flex gap-2 items-start">
                      <select value={imp.ingreso_id} onChange={e => setImputacion(idx, 'ingreso_id', e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                        <option value="">Seleccionar ingreso...</option>
                        {ingresosDisponibles.map(ing => {
                          const disp = ing.monto - (ing.montoUtilizado || 0)
                          return (
                            <option key={ing.id} value={ing.id}>
                              {ing.concepto} — disp. {fmt(disp, ing.moneda)}
                            </option>
                          )
                        })}
                      </select>
                      <input type="number" value={imp.monto} onChange={e => setImputacion(idx, 'monto', e.target.value)}
                        placeholder="Monto" min="0" step="0.01"
                        className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      {imputaciones.length > 1 && (
                        <button onClick={() => quitarFila(idx)} className="text-gray-300 hover:text-red-500 text-lg leading-none pt-1">×</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Resumen imputación */}
            {totalImputado > 0 && (
              <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>Monto a pagar:</span>
                  <span className="font-mono font-medium">{fmt(montoTotal, gasto.moneda)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total imputado:</span>
                  <span className="font-mono font-medium">{fmt(totalImputado, gasto.moneda)}</span>
                </div>
                <div className={`flex justify-between font-semibold ${restante < 0 ? 'text-red-600' : restante === 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  <span>Restante sin imputar:</span>
                  <span className="font-mono">{fmt(restante, gasto.moneda)}</span>
                </div>
              </div>
            )}
          </div>

          {restante < 0 && (
            <p className="text-xs text-red-500">El total imputado supera el monto del pago.</p>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onCancelar}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button onClick={handleConfirmar}
              disabled={restante < 0 || (estado === 'parcial' && !montoParcial)}
              className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition disabled:opacity-40 disabled:cursor-not-allowed">
              Confirmar pago
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
