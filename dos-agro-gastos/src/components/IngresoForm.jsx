import { useState, useEffect } from 'react'

const FORMAS_COBRO = ['Efectivo', 'Transferencia', 'Cheque', 'Cuenta corriente', 'Otro']

const vacio = {
  actividad: 'ganaderia',
  concepto: '',
  monto: '',
  fecha: '',
  formaCobro: 'Transferencia',
  estado: 'pendiente',
  montoParcial: '',
  moneda: 'ARS',
  tipoCambio: '',
}

async function fetchTC() {
  try {
    const res = await fetch('https://api.bluelytics.com.ar/v2/latest')
    const data = await res.json()
    return data.oficial.value_sell
  } catch {
    return null
  }
}

export default function IngresoForm({ onGuardar, onCancelar, inicial }) {
  const [form, setForm] = useState(inicial ? {
    ...inicial,
    monto: inicial.monto?.toString() ?? '',
    montoParcial: inicial.montoParcial?.toString() ?? '',
    moneda: inicial.moneda ?? 'ARS',
    tipoCambio: inicial.tipoCambio?.toString() ?? '',
  } : { ...vacio })
  const [cargandoTC, setCargandoTC] = useState(false)

  useEffect(() => {
    if (!inicial && !form.tipoCambio) {
      setCargandoTC(true)
      fetchTC().then(tc => {
        if (tc) setForm(prev => ({ ...prev, tipoCambio: tc.toString() }))
        setCargandoTC(false)
      })
    }
  }, [])

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.concepto.trim() || !form.monto) return
    onGuardar({
      ...form,
      monto: parseFloat(form.monto),
      montoParcial: form.montoParcial ? parseFloat(form.montoParcial) : null,
      tipoCambio: form.tipoCambio ? parseFloat(form.tipoCambio) : null,
    })
  }

  const montoUSD = form.monto && form.tipoCambio
    ? (form.moneda === 'ARS'
        ? (parseFloat(form.monto) / parseFloat(form.tipoCambio)).toFixed(2)
        : parseFloat(form.monto).toFixed(2))
    : null

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Actividad</label>
        <div className="flex gap-3">
          {['ganaderia', 'agricultura'].map(act => (
            <label key={act} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="actividad" value={act}
                checked={form.actividad === act}
                onChange={() => set('actividad', act)}
                className="accent-green-700" />
              <span className="text-sm">{act === 'ganaderia' ? 'Ganadería' : 'Agricultura'}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
        <input type="text" value={form.concepto} onChange={e => set('concepto', e.target.value)}
          placeholder="Ej: Venta hacienda, Venta soja, Arrendamiento..."
          required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Moneda y Monto</label>
        <div className="flex gap-2">
          <select value={form.moneda} onChange={e => set('moneda', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-24">
            <option value="ARS">$ ARS</option>
            <option value="USD">U$D</option>
          </select>
          <input type="number" value={form.monto} onChange={e => set('monto', e.target.value)}
            placeholder="0.00" min="0" step="0.01" required
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          TC BNA venta (ARS/USD)
          {cargandoTC && <span className="ml-2 text-xs text-gray-400">cargando...</span>}
        </label>
        <div className="flex gap-2 items-center">
          <input type="number" value={form.tipoCambio} onChange={e => set('tipoCambio', e.target.value)}
            placeholder="Ej: 1250.00" min="0" step="0.01"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="button" onClick={async () => {
            setCargandoTC(true)
            const tc = await fetchTC()
            if (tc) set('tipoCambio', tc.toString())
            setCargandoTC(false)
          }} className="text-xs border border-gray-300 rounded-lg px-2 py-2 hover:bg-gray-50 whitespace-nowrap">
            ↻ BNA
          </button>
        </div>
        {montoUSD && <p className="text-xs text-blue-600 mt-1 font-medium">≈ U$D {montoUSD}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
          <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Forma de cobro</label>
          <select value={form.formaCobro} onChange={e => set('formaCobro', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {FORMAS_COBRO.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancelar}
          className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
          Cancelar
        </button>
        <button type="submit"
          className="flex-1 bg-blue-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition">
          Guardar
        </button>
      </div>
    </form>
  )
}
