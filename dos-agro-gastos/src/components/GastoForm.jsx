import { useState } from 'react'

const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Cuenta corriente', 'Otro']

const vacio = {
  actividad: 'ganaderia',
  concepto: '',
  monto: '',
  vencimiento: '',
  formaPago: 'Transferencia',
  estado: 'impago',
  montoParcial: '',
}

export default function GastoForm({ onGuardar, onCancelar, inicial }) {
  const [form, setForm] = useState(inicial ? {
    ...inicial,
    monto: inicial.monto?.toString() ?? '',
    montoParcial: inicial.montoParcial?.toString() ?? '',
  } : { ...vacio })

  function set(k, v) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.concepto.trim() || !form.monto) return
    onGuardar({
      ...form,
      monto: parseFloat(form.monto),
      montoParcial: form.montoParcial ? parseFloat(form.montoParcial) : null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Actividad</label>
        <div className="flex gap-3">
          {['ganaderia', 'agricultura'].map(act => (
            <label key={act} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="actividad"
                value={act}
                checked={form.actividad === act}
                onChange={() => set('actividad', act)}
                className="accent-green-700"
              />
              <span className="capitalize text-sm">{act === 'ganaderia' ? 'Ganadería' : 'Agricultura'}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
        <input
          type="text"
          value={form.concepto}
          onChange={e => set('concepto', e.target.value)}
          placeholder="Ej: Fertilizante, Veterinario, Flete..."
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monto ($)</label>
          <input
            type="number"
            value={form.monto}
            onChange={e => set('monto', e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vencimiento</label>
          <input
            type="date"
            value={form.vencimiento}
            onChange={e => set('vencimiento', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pago</label>
        <select
          value={form.formaPago}
          onChange={e => set('formaPago', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancelar}
          className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition"
        >
          Guardar
        </button>
      </div>
    </form>
  )
}
