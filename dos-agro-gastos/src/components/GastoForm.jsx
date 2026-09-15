import { useState, useEffect } from 'react'

const TC_FALLBACK = 1000

async function fetchTC() {
  try {
    const r = await fetch('https://api.bluelytics.com.ar/v2/latest')
    const d = await r.json()
    return d.oficial.value_sell
  } catch {
    return null
  }
}

export default function GastoForm({ onGuardar, onCancelar, inicial }) {
  const [form, setForm] = useState({
    actividad: 'agricultura',
    concepto: '',
    monto: '',
    moneda: 'ARS',
    tipoCambio: '',
    vencimiento: '',
    formaPago: '',
    ...inicial,
  })
  const [tcLoading, setTcLoading] = useState(false)

  useEffect(() => {
    if (!inicial) {
      setTcLoading(true)
      fetchTC().then(tc => {
        if (tc) setForm(f => ({ ...f, tipoCambio: tc }))
        setTcLoading(false)
      })
    }
  }, [])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function refetchTC() {
    setTcLoading(true)
    const tc = await fetchTC()
    if (tc) set('tipoCambio', tc)
    setTcLoading(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.concepto || !form.monto) return
    onGuardar({
      ...form,
      monto: parseFloat(form.monto),
      tipoCambio: parseFloat(form.tipoCambio) || null,
    })
  }

  const montoUSD = form.moneda === 'ARS' && form.tipoCambio && form.monto
    ? (parseFloat(form.monto) / parseFloat(form.tipoCambio)).toFixed(2)
    : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">{inicial ? 'Editar gasto' : 'Nuevo gasto'}</h2>
            <button type="button" onClick={onCancelar} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Actividad</label>
            <div className="flex gap-4">
              {[['agricultura', 'Agricultura'], ['ganaderia', 'Ganadería']].map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="actividad" value={val} checked={form.actividad === val}
                    onChange={() => set('actividad', val)} className="accent-green-700" />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
            <input value={form.concepto} onChange={e => set('concepto', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ej: Semillas, Alimento, Combustible..." required />
          </div>

          <div className="flex gap-3">
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
              <select value={form.moneda} onChange={e => set('moneda', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="ARS">$ ARS</option>
                <option value="USD">U$S USD</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
              <input type="number" value={form.monto} onChange={e => set('monto', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="0.00" min="0" step="0.01" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de cambio BNA
              <button type="button" onClick={refetchTC} disabled={tcLoading}
                className="ml-2 text-xs text-green-700 hover:text-green-800 font-normal">
                {tcLoading ? 'Cargando...' : '↻ BNA'}
              </button>
            </label>
            <input type="number" value={form.tipoCambio} onChange={e => set('tipoCambio', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="TC actual" min="0" step="0.01" />
            {montoUSD && (
              <p className="text-xs text-blue-500 mt-1">≈ U$S {parseFloat(montoUSD).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vencimiento</label>
            <input type="date" value={form.vencimiento} onChange={e => set('vencimiento', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pago</label>
            <input value={form.formaPago} onChange={e => set('formaPago', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ej: Transferencia, Cheque, Efectivo..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancelar}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
              {inicial ? 'Guardar cambios' : 'Agregar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
