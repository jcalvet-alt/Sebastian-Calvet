"""Export prescription maps in multiple formats."""
import io
import os
import json
import zipfile
import tempfile
import shutil
from datetime import datetime
import geopandas as gpd
import numpy as np
from lxml import etree


def export_shapefile(gdf: gpd.GeoDataFrame, name: str = "prescripcion") -> bytes:
    """Export as zipped Shapefile — universal for all monitors."""
    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, name)
        export_gdf = gdf.copy()
        # Truncate long column names (shapefile limit: 10 chars)
        export_gdf.columns = [c[:10] for c in export_gdf.columns]
        export_gdf.to_file(path + '.shp', driver='ESRI Shapefile')

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for ext in ['.shp', '.shx', '.dbf', '.prj', '.cpg']:
                fp = path + ext
                if os.path.exists(fp):
                    zf.write(fp, name + ext)
        buf.seek(0)
        return buf.read()


def export_geojson(gdf: gpd.GeoDataFrame) -> bytes:
    """Export as GeoJSON."""
    gdf_wgs = gdf.to_crs('EPSG:4326')
    return gdf_wgs.to_json(ensure_ascii=False).encode('utf-8')


def export_kmz(gdf: gpd.GeoDataFrame, name: str = "prescripcion") -> bytes:
    """Export as KMZ (zipped KML) for Google Earth / Trimble displays."""
    gdf_wgs = gdf.to_crs('EPSG:4326')

    kml_ns = 'http://www.opengis.net/kml/2.2'
    root = etree.Element('kml', xmlns=kml_ns)
    doc = etree.SubElement(root, 'Document')
    etree.SubElement(doc, 'name').text = name

    # Styles
    for zone_type, color in [('MALEZA', 'ff0000ff'), ('SIN_APLICAR', 'ff00ff00')]:
        style = etree.SubElement(doc, 'Style', id=zone_type)
        poly_style = etree.SubElement(style, 'PolyStyle')
        etree.SubElement(poly_style, 'color').text = color
        etree.SubElement(poly_style, 'fill').text = '1'
        etree.SubElement(poly_style, 'outline').text = '1'

    for _, row in gdf_wgs.iterrows():
        pm = etree.SubElement(doc, 'Placemark')
        zone = row.get('zone_type', 'MALEZA')
        etree.SubElement(pm, 'name').text = f"Zona {row.get('zone_id', '')}"
        etree.SubElement(pm, 'description').text = (
            f"Tipo: {zone}\nAplicar: {'Sí' if row.get('apply') else 'No'}\n"
            f"Dosis: {row.get('dose_pct', 0)}%"
        )
        etree.SubElement(pm, 'styleUrl').text = f'#{zone}'

        geom = row.geometry
        if geom.geom_type == 'Polygon':
            polys = [geom]
        else:
            polys = list(geom.geoms)

        mp = etree.SubElement(pm, 'MultiGeometry') if len(polys) > 1 else pm
        for poly in polys:
            poly_el = etree.SubElement(mp if len(polys) > 1 else pm, 'Polygon')
            outer = etree.SubElement(poly_el, 'outerBoundaryIs')
            ring = etree.SubElement(outer, 'LinearRing')
            coords = etree.SubElement(ring, 'coordinates')
            coords.text = ' '.join(f'{x},{y},0' for x, y in poly.exterior.coords)

    kml_bytes = etree.tostring(root, pretty_print=True, xml_declaration=True, encoding='UTF-8')

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(name + '.kml', kml_bytes)
    buf.seek(0)
    return buf.read()


def export_isoxml(gdf: gpd.GeoDataFrame, product_name: str = "Herbicida") -> bytes:
    """
    Export as ISO 11783-10 (ISOBUS) TaskData XML.
    Compatible with: John Deere, AGCO, CNH, Trimble, Topcon, Raven, etc.
    """
    gdf_wgs = gdf.to_crs('EPSG:4326')
    now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S')

    ISO = 'urn:iso:std:iso:11783:-10:schema'
    XSI = 'http://www.w3.org/2001/XMLSchema-instance'

    root = etree.Element('ISO11783_TaskData', attrib={
        'VersionMajor': '4',
        'VersionMinor': '0',
        'ManagementSoftwareManufacturer': 'DroneMap',
        'ManagementSoftwareVersion': '1.0',
        'DataTransferOrigin': '1',
        '{' + XSI + '}noNamespaceSchemaLocation': 'ISOBUS-TaskData.xsd'
    })

    # Farm / Client / Field
    farm = etree.SubElement(root, 'FRM', A='FRM1', B='Establecimiento')
    field = etree.SubElement(root, 'PFD', A='PFD1', B='Lote', C='FRM1',
                             D=str(gdf_wgs.union_all().area * 111320 ** 2 / 10000)[:8])

    # Product
    product = etree.SubElement(root, 'PDT', A='PDT1', B=product_name,
                               C='1', E='1')

    # Treatment zones
    tzn_ids = []
    for _, row in gdf_wgs.iterrows():
        zone_id = str(row.get('zone_id', 0))
        dose = str(row.get('dose_pct', 0))
        tzn_id = f'TZN{zone_id}'
        tzn_ids.append((tzn_id, row))

    # Task
    task = etree.SubElement(root, 'TSK', A='TSK1', B=f'Prescripcion_{now[:10]}',
                            C='FRM1', D='PFD1', G='4')

    # Treatment zones and polygon geometries
    for tzn_id, row in tzn_ids:
        dose_pct = int(row.get('dose_pct', 0))
        tzn = etree.SubElement(task, 'TZN', A=tzn_id,
                               B='0' if dose_pct == 0 else '1')
        # Variable rate treatment
        vrp = etree.SubElement(tzn, 'VRP', A='PDT1', B=str(dose_pct),
                               C='ml/ha' if dose_pct > 0 else '0')

        geom = row.geometry
        polys = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
        for poly in polys:
            pln = etree.SubElement(tzn, 'PLN', A='1')
            lsg = etree.SubElement(pln, 'LSG', A='1')
            for x, y in poly.exterior.coords:
                etree.SubElement(lsg, 'PNT',
                                 A='2',
                                 C=f'{y:.8f}',
                                 D=f'{x:.8f}')

    tree = etree.ElementTree(root)
    buf = io.BytesIO()
    buf.write(b'<?xml version="1.0" encoding="UTF-8"?>\n')
    buf.write(etree.tostring(root, pretty_print=True))
    buf.seek(0)

    # Wrap in zip as most monitors expect TASKDATA.XML inside a zip
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('TASKDATA.XML', buf.read())
    out.seek(0)
    return out.read()


def export_john_deere(gdf: gpd.GeoDataFrame, name: str = "prescripcion") -> bytes:
    """
    John Deere Operations Center format:
    Shapefile with specific field names + RX.shp convention.
    """
    gdf_wgs = gdf.to_crs('EPSG:4326')
    jd = gdf_wgs.copy()

    # John Deere VRA Shapefile convention
    jd = jd.rename(columns={
        'dose_pct': 'RATE',
        'zone_type': 'ZONE',
        'apply': 'APPLY'
    })
    jd['PRODUCT'] = 'Herbicida'
    jd['UNITS'] = 'PCT'
    jd['NAME'] = name

    with tempfile.TemporaryDirectory() as tmpdir:
        rx_name = name + '_RX'
        jd.to_file(os.path.join(tmpdir, rx_name + '.shp'), driver='ESRI Shapefile')

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for ext in ['.shp', '.shx', '.dbf', '.prj', '.cpg']:
                fp = os.path.join(tmpdir, rx_name + ext)
                if os.path.exists(fp):
                    zf.write(fp, rx_name + ext)
        buf.seek(0)
        return buf.read()
