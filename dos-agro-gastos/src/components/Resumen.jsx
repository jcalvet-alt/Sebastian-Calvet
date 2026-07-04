function fmtARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function fmtUSD(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function toUSD(g) {
  if (g.moneda === 'USD') return g.monto
  if (g.tipoCambio) return g.monto / g.tipoCambio
  return null
}

export default function Resumen({ gastos }) {
  const total = gastos.reduce((s, g) => s + g.monto, 0)
  const pagado = gastos.filter(g => g.estado === 'pagado').reduce((s, g) => s + g.monto, 0)
  const parcial = gastos.filter(g => g.estado === 'parcial').reduce((s, g) => s + (g.montoParcial || 0), 0)
  const impago = gastos.filter(g => g.estado === 'impago').reduce((s, g) => s + g.monto, 0)
  const pendienteParcial = gastos.filter(g => g.estado === 'parcial').reduce((s, g) => s + (g.monto - (g.montoParcial || 0)), 0)

  const usdVals = gastos.map(toUSD).filter(v => v !== null)
  const totalUSD = usdVals.length > 0 ? usdVals.reduce((s, v) => s + v, 0) : null

  const impagoUSD = gastos
    .filter(g => g.estado === 'impago')
    .map(toUSD)
    .filter(v => v !== null)
    .reduce((s, v) => s + v, 0)

  const cards = [
    { label: 'Total gastos', valor: total, usd: totalUSD, color: 'text-gray-800', bg: 'bg-white' },
    { label: 'Pagado', valor: pagado, color: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Pago parcial', valor: parcial, color: 'text-yellow-700', bg: 'bg-yellow-50', sub: `Pendiente: ${fmtARS(pendienteParcial)}` },
    { label: 'Impago', valor: impago, usd: impagoUSD || null, color: 'text-red-700', bg: 'bg-red-50' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className={`${c.bg} rounded-xl p-4 shadow-sm border border-gray-100`}>
          <p className="text-xs text-gray-500 font-medium mb-1">{c.label}</p>
          <p className={`text-base font-bold font-mono ${c.color} leading-tight`}>{fmtARS(c.valor)}</p>
          {c.usd !== null && c.usd !== undefined && (
            <p className="text-xs text-blue-500 font-mono mt-0.5">≈ {fmtUSD(c.usd)}</p>
          )}
          {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}
