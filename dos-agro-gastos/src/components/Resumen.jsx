function fmtARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function fmtUSD(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function sumarEnARS(lista) {
  return lista.reduce((s, g) => {
    if (g.moneda === 'ARS') return s + g.monto
    if (g.moneda === 'USD' && g.tipoCambio) return s + g.monto * g.tipoCambio
    return s
  }, 0)
}

function sumarEnUSD(lista) {
  return lista.reduce((s, g) => {
    if (g.moneda === 'USD') return s + g.monto
    if (g.moneda === 'ARS' && g.tipoCambio) return s + g.monto / g.tipoCambio
    return s
  }, 0)
}

export default function Resumen({ gastos }) {
  const impagos = gastos.filter(g => g.estado === 'impago')
  const parciales = gastos.filter(g => g.estado === 'parcial')

  const totalARS = sumarEnARS(gastos)
  const totalUSD = sumarEnUSD(gastos)
  const impagoARS = sumarEnARS(impagos)
  const impagoUSD = sumarEnUSD(impagos)
  const parcialPendienteARS = parciales.reduce((s, g) => s + (g.monto - (g.montoParcial || 0)), 0)

  const cards = [
    {
      label: 'Total gastos en $',
      valor: fmtARS(totalARS),
      color: 'text-gray-800',
      bg: 'bg-white',
    },
    {
      label: 'Total gastos en U$S',
      valor: fmtUSD(totalUSD),
      color: 'text-blue-700',
      bg: 'bg-blue-50',
      sub: 'Convertido al TC de cada gasto',
    },
    {
      label: 'Impago en $',
      valor: fmtARS(impagoARS),
      color: 'text-red-700',
      bg: 'bg-red-50',
      sub: parcialPendienteARS > 0 ? `+ pend. parcial ${fmtARS(parcialPendienteARS)}` : null,
    },
    {
      label: 'Impago en U$S',
      valor: fmtUSD(impagoUSD),
      color: 'text-red-700',
      bg: 'bg-red-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
