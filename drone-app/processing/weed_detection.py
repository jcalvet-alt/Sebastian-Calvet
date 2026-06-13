"""Weed patch detection from vegetation indices."""
import math
import numpy as np
from scipy import ndimage
import geopandas as gpd
from shapely.geometry import shape, MultiPolygon
from shapely.ops import unary_union
import rasterio
from rasterio.features import shapes as rio_shapes
from rasterio.transform import Affine


def _pixel_area_m2(transform, crs, shape) -> float:
    """Return approximate pixel area in m²."""
    try:
        import pyproj
        _crs = pyproj.CRS(str(crs))
        if _crs.is_geographic:
            h, w = shape
            lat_center = transform.f + transform.e * (h / 2)
            m_per_deg_lon = 111320.0 * math.cos(math.radians(abs(lat_center)))
            m_per_deg_lat = 111320.0
            return abs(transform.a) * m_per_deg_lon * abs(transform.e) * m_per_deg_lat
        else:
            return abs(transform.a) * abs(transform.e)
    except Exception:
        return abs(transform.a) * abs(transform.e)


def detect_weeds(indices: dict, params: dict, transform: Affine, crs) -> gpd.GeoDataFrame:
    """
    Detect weed zones from vegetation indices.

    params:
        vegetation_index: 'NDVI' or 'NDRE' (used to build vegetation mask)
        veg_threshold: min index value to be considered vegetation (default 0.1)
        weed_index: index used to detect weeds within vegetation
        weed_method: 'threshold' | 'statistical'
        weed_threshold: fixed threshold (for 'threshold' method)
        weed_std_factor: how many std below mean = weed (for 'statistical')
        min_area_m2: minimum weed patch area in m²
        buffer_m: buffer to add around patches (m)
        use_ndre: also require NDRE anomaly (if available)
    """
    veg_idx_name = params.get('vegetation_index', 'NDVI')
    veg_threshold = float(params.get('veg_threshold', 0.1))
    weed_idx_name = params.get('weed_index', 'NDVI')
    weed_method = params.get('weed_method', 'statistical')
    weed_threshold = float(params.get('weed_threshold', 0.3))
    weed_std_factor = float(params.get('weed_std_factor', 1.5))
    min_area_m2 = float(params.get('min_area_m2', 50.0))
    buffer_m = float(params.get('buffer_m', 2.0))

    veg_idx = indices.get(veg_idx_name)
    weed_idx = indices.get(weed_idx_name)

    if veg_idx is None or weed_idx is None:
        raise ValueError(f"Índice '{veg_idx_name}' o '{weed_idx_name}' no disponible. Verificá que el ortomosaico tenga las bandas necesarias.")

    # --- Vegetation mask ---
    veg_mask = np.where(np.isfinite(veg_idx), veg_idx > veg_threshold, False)

    # --- Weed detection within vegetation ---
    if weed_method == 'threshold':
        # Pixels below threshold inside vegetation = weeds
        weed_mask = veg_mask & np.where(np.isfinite(weed_idx), weed_idx < weed_threshold, False)
    else:
        # Statistical: pixels significantly below field mean
        valid_vals = weed_idx[veg_mask & np.isfinite(weed_idx)]
        if len(valid_vals) == 0:
            return gpd.GeoDataFrame({'geometry': [], 'area_ha': [], 'apply': [], 'dose_pct': [], 'zone_id': []}, crs=crs)
        mean_val = float(np.mean(valid_vals))
        std_val = float(np.std(valid_vals))
        cutoff = mean_val - weed_std_factor * std_val
        weed_mask = veg_mask & np.where(np.isfinite(weed_idx), weed_idx < cutoff, False)

    # --- Morphological cleanup ---
    struct = ndimage.generate_binary_structure(2, 2)
    weed_mask = ndimage.binary_closing(weed_mask, structure=struct, iterations=3)
    weed_mask = ndimage.binary_opening(weed_mask, structure=struct, iterations=2)

    # --- Pixel area in m² ---
    px_area = _pixel_area_m2(transform, crs, veg_idx.shape)
    min_pixels = max(1, int(min_area_m2 / max(px_area, 1e-6)))

    # --- Connected component labeling and size filter ---
    labeled, num_features = ndimage.label(weed_mask)
    sizes = ndimage.sum(weed_mask, labeled, range(1, num_features + 1))
    keep = np.zeros_like(labeled, dtype=bool)
    for i, sz in enumerate(sizes, 1):
        if sz >= min_pixels:
            keep |= (labeled == i)

    if not keep.any():
        return gpd.GeoDataFrame({'geometry': [], 'area_ha': [], 'apply': [], 'dose_pct': [], 'zone_id': []}, crs=crs)

    # --- Raster to vector ---
    mask_uint8 = keep.astype(np.uint8)
    geoms = []
    for geom, val in rio_shapes(mask_uint8, mask=mask_uint8, transform=transform):
        if val == 1:
            geoms.append(shape(geom))

    if not geoms:
        return gpd.GeoDataFrame({'geometry': [], 'area_ha': [], 'apply': [], 'dose_pct': [], 'zone_id': []}, crs=crs)

    gdf = gpd.GeoDataFrame(geometry=geoms, crs=crs)

    # Buffer patches
    if buffer_m > 0:
        gdf_proj = gdf.to_crs(gdf.estimate_utm_crs())
        gdf_proj['geometry'] = gdf_proj.geometry.buffer(buffer_m)
        gdf = gdf_proj.to_crs(crs)

    # Dissolve overlapping patches
    merged = unary_union(gdf.geometry)
    if merged.geom_type == 'Polygon':
        final_geoms = [merged]
    else:
        final_geoms = list(merged.geoms)

    result = gpd.GeoDataFrame(geometry=final_geoms, crs=crs)
    result['area_ha'] = result.to_crs(result.estimate_utm_crs()).geometry.area / 10000
    result['apply'] = 1
    result['dose_pct'] = 100
    result['zone_id'] = range(1, len(result) + 1)

    return result


def create_full_field_prescription(weed_zones: gpd.GeoDataFrame, field_boundary=None) -> gpd.GeoDataFrame:
    """
    Combine weed zones (apply=1) with non-weed zones (apply=0)
    to create a complete variable-rate prescription map.
    """
    if field_boundary is None:
        field_boundary = weed_zones.union_all().convex_hull

    from shapely.geometry import Polygon
    no_spray = field_boundary.difference(weed_zones.union_all())

    records = []
    for i, row in weed_zones.iterrows():
        records.append({
            'geometry': row.geometry,
            'zone_type': 'MALEZA',
            'apply': 1,
            'dose_pct': 100,
            'zone_id': row.zone_id
        })

    if no_spray and not no_spray.is_empty:
        if no_spray.geom_type == 'Polygon':
            no_spray_geoms = [no_spray]
        else:
            no_spray_geoms = list(no_spray.geoms)
        for geom in no_spray_geoms:
            records.append({
                'geometry': geom,
                'zone_type': 'SIN_APLICAR',
                'apply': 0,
                'dose_pct': 0,
                'zone_id': 0
            })

    return gpd.GeoDataFrame(records, crs=weed_zones.crs)
