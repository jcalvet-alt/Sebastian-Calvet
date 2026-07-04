function fmtARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function fmtUSD(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function Resumen({ gastos }) {
  const impagos = gastos.filter(g => g.estado === 'impago')

  const totalARS = gastos.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0)
  const totalUSD = gastos.filter(g => g.moneda === 'USD').reduce((s, g) => s + g.monto, 0)
  const impagoARS = impagos.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0)
  const impagoUSD = impagos.filter(g => g.moneda === 'USD').reduce((s, g) => s + g.monto, 0)

  // Total unificado en USD: USD directo + ARS convertidos al TC del gasto
  const totalUnificadoUSD =
    gastos.filter(g => g.moneda === 'USD').reduce((s, g) => s + g.monto, 0) +
    gastos.filter(g => g.moneda === 'ARS' && g.tipoCambio).reduce((s, g) => s + g.monto / g.tipoCambio, 0)

  const cards = [
    { label: 'Total gastos en $', valor: fmtARS(totalARS), color: 'text-gray-800', bg: 'bg-white' },
    { label: 'Total gastos en U$S', valor: fmtUSD(totalUSD), color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Impago en $', valor: fmtARS(impagoARS), color: 'text-red-700', bg: 'bg-red-50' },
    { label: 'Impago en U$S', valor: fmtUSD(impagoUSD), color: 'text-red-700', bg: 'bg-red-50' },
    { label: 'Total $ + U$S en USD', valor: fmtUSD(totalUnificadoUSD), color: 'text-indigo-700', bg: 'bg-indigo-50', sub: 'ARS conv. al TC de cada gasto' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map(c => (
        <div key={c.label} className={`${c.bg} rounded-xl p-4 shadow-sm border border-gray-100`}>
          <p className="text-xs text-gray-500 font-medium mb-1">{c.label}</p>
          <p className={`text-base font-bold font-mono ${c.color} leading-tight`}>{c.valor}</p>
          {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}
