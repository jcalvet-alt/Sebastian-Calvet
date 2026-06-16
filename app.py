import streamlit as st
import pandas as pd
import openpyxl
import io

st.set_page_config(page_title="Posición de Híbridos", layout="wide")

st.title("🌻 Gestión de Posición de Híbridos de Semillas")
st.markdown("""
Esta aplicación consolida la información de múltiples archivos Excel para calcular la **posición de híbridos**.
- **Pendiente de remitir**: órdenes de venta pendientes de envío.
- **Pedidos a NK**: órdenes realizadas al proveedor NK.
- **Posición**: diferencia entre pedidos a NK y pendiente de remitir.
""")

SHEET_PENDIENTE = "Pendiente de remitir"
SHEET_PEDIDOS_NK = "pedidos a nk"
SHEET_MAPPING = "pedidos -pend remitir"

uploaded_files = st.file_uploader(
    "📂 Subir archivos Excel (pueden ser varios)",
    type=["xlsx"],
    accept_multiple_files=True,
    help="Seleccioná uno o más archivos Excel con las 4 hojas requeridas."
)

def is_formula(val):
    return isinstance(val, str) and val.strip().startswith("=")

def read_pendiente(wb):
    """Returns dict: DescArticulo -> sum of Cantidad"""
    if SHEET_PENDIENTE not in wb.sheetnames:
        return {}
    ws = wb[SHEET_PENDIENTE]
    totals = {}
    first = True
    for row in ws.iter_rows(values_only=True):
        if first:
            first = False
            continue
        if len(row) < 13:
            continue
        desc = row[11]
        cant = row[12]
        if desc is None or (isinstance(desc, str) and desc.strip() == ""):
            continue
        if is_formula(desc):
            continue
        desc = str(desc).strip()
        try:
            cant = float(cant) if cant is not None else 0.0
        except (ValueError, TypeError):
            cant = 0.0
        totals[desc] = totals.get(desc, 0.0) + cant
    return totals

def read_pedidos_nk(wb):
    """Returns dict: Material desc. -> sum of Order quantity"""
    if SHEET_PEDIDOS_NK not in wb.sheetnames:
        return {}
    ws = wb[SHEET_PEDIDOS_NK]
    totals = {}
    first = True
    for row in ws.iter_rows(values_only=True):
        if first:
            first = False
            continue
        if len(row) < 3:
            continue
        material = row[1]
        qty = row[2]
        if material is None or (isinstance(material, str) and material.strip() == ""):
            continue
        if is_formula(material):
            continue
        material = str(material).strip()
        try:
            qty = float(qty) if qty is not None else 0.0
        except (ValueError, TypeError):
            qty = 0.0
        totals[material] = totals.get(material, 0.0) + qty
    return totals

def read_mapping(wb):
    """Returns list of (articulo_pte_remitir, articulo_nk) tuples"""
    if SHEET_MAPPING not in wb.sheetnames:
        return []
    ws = wb[SHEET_MAPPING]
    mapping = []
    seen = set()
    first = True
    for row in ws.iter_rows(values_only=True):
        if first:
            first = False
            continue
        if len(row) < 2:
            continue
        art_pte = row[0]
        art_nk = row[1]
        if art_pte is None or (isinstance(art_pte, str) and art_pte.strip() == ""):
            continue
        if art_nk is None or (isinstance(art_nk, str) and art_nk.strip() == ""):
            continue
        if is_formula(art_pte) or is_formula(art_nk):
            continue
        art_pte = str(art_pte).strip()
        art_nk = str(art_nk).strip()
        key = (art_pte, art_nk)
        if key not in seen:
            seen.add(key)
            mapping.append((art_pte, art_nk))
    return mapping

def style_posicion(val):
    if pd.isna(val):
        return ""
    if val < 0:
        return "background-color: #ffcccc; color: #cc0000; font-weight: bold"
    elif val > 0:
        return "background-color: #ccffcc; color: #006600; font-weight: bold"
    return ""

if uploaded_files:
    all_pendiente = {}
    all_pedidos_nk = {}
    all_mapping = []
    mapping_found = False
    warnings = []

    for f in uploaded_files:
        try:
            wb = openpyxl.load_workbook(f, data_only=True)
        except Exception as e:
            warnings.append(f"No se pudo abrir '{f.name}': {e}")
            continue

        pend = read_pendiente(wb)
        for k, v in pend.items():
            all_pendiente[k] = all_pendiente.get(k, 0.0) + v

        ped = read_pedidos_nk(wb)
        for k, v in ped.items():
            all_pedidos_nk[k] = all_pedidos_nk.get(k, 0.0) + v

        if not mapping_found:
            m = read_mapping(wb)
            if m:
                all_mapping = m
                mapping_found = True

        missing = []
        for sheet in [SHEET_PENDIENTE, SHEET_PEDIDOS_NK, SHEET_MAPPING]:
            if sheet not in wb.sheetnames:
                missing.append(sheet)
        if missing:
            warnings.append(f"Archivo '{f.name}' no tiene las hojas: {', '.join(missing)}")

    for w in warnings:
        st.warning(w)

    if not all_mapping:
        st.error("No se encontró la hoja de mapeo 'pedidos -pend remitir' en ningún archivo. No se puede calcular la posición.")
    else:
        rows = []
        for art_pte, art_nk in all_mapping:
            pend_val = all_pendiente.get(art_pte, 0.0)
            ped_val = all_pedidos_nk.get(art_nk, 0.0)
            posicion = ped_val - pend_val
            rows.append({
                "Artículo": art_pte,
                "Artículo NK": art_nk,
                "Pendiente de remitir": pend_val,
                "Pedidos a NK": ped_val,
                "Posición": posicion,
            })

        df = pd.DataFrame(rows)

        # Totals row
        totals_row = {
            "Artículo": "TOTAL",
            "Artículo NK": "",
            "Pendiente de remitir": df["Pendiente de remitir"].sum(),
            "Pedidos a NK": df["Pedidos a NK"].sum(),
            "Posición": df["Posición"].sum(),
        }
        df_display = pd.concat([df, pd.DataFrame([totals_row])], ignore_index=True)

        st.subheader("📊 Tabla de Posición por Artículo")
        st.markdown("La **Posición** es la diferencia entre los pedidos realizados a NK y las unidades pendientes de remitir.")

        styled = df_display.style.applymap(style_posicion, subset=["Posición"])
        styled = styled.format({
            "Pendiente de remitir": "{:,.0f}",
            "Pedidos a NK": "{:,.0f}",
            "Posición": "{:,.0f}",
        })
        st.dataframe(styled, use_container_width=True, hide_index=True)

        # Summary metrics
        col1, col2, col3 = st.columns(3)
        col1.metric("Total Pendiente de Remitir", f"{df['Pendiente de remitir'].sum():,.0f}")
        col2.metric("Total Pedidos a NK", f"{df['Pedidos a NK'].sum():,.0f}")
        posicion_total = df['Posición'].sum()
        col3.metric("Posición Total", f"{posicion_total:,.0f}", delta=f"{posicion_total:,.0f}")

        # Download
        st.subheader("⬇️ Exportar resultados")
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
            df_display.to_excel(writer, index=False, sheet_name="Posición")
            workbook = writer.book
            worksheet = writer.sheets["Posición"]
            red_fmt = workbook.add_format({"bg_color": "#ffcccc", "font_color": "#cc0000", "bold": True})
            green_fmt = workbook.add_format({"bg_color": "#ccffcc", "font_color": "#006600", "bold": True})
            pos_col = df_display.columns.get_loc("Posición")
            for row_idx, val in enumerate(df_display["Posición"], start=1):
                if pd.notna(val):
                    fmt = red_fmt if val < 0 else (green_fmt if val > 0 else None)
                    if fmt:
                        worksheet.write(row_idx, pos_col, val, fmt)
        output.seek(0)
        st.download_button(
            label="📥 Descargar tabla como Excel",
            data=output,
            file_name="posicion_hibridos.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        st.subheader("🔍 Detalle de datos cargados")
        with st.expander("Ver pendiente de remitir por artículo"):
            df_pend = pd.DataFrame(list(all_pendiente.items()), columns=["Artículo", "Cantidad pendiente"])
            df_pend = df_pend.sort_values("Cantidad pendiente", ascending=False)
            st.dataframe(df_pend, use_container_width=True, hide_index=True)

        with st.expander("Ver pedidos a NK por material"):
            df_ped = pd.DataFrame(list(all_pedidos_nk.items()), columns=["Material NK", "Cantidad pedida"])
            df_ped = df_ped.sort_values("Cantidad pedida", ascending=False)
            st.dataframe(df_ped, use_container_width=True, hide_index=True)
else:
    st.info("👆 Por favor, subí uno o más archivos Excel para comenzar.")
    st.markdown("""
    ### Estructura esperada de los archivos Excel
    Cada archivo debe contener las siguientes hojas:
    - **Pendiente de remitir**: órdenes de venta pendientes de envío
    - **pedidos a nk**: órdenes realizadas al proveedor NK
    - **pedidos -pend remitir**: tabla de mapeo entre artículos propios y artículos NK
    - **posicion de preca anticipada** *(opcional)*: posición completa con bandas
    """)
