"""Utilities for loading and exporting raster data."""
import os
import io
import base64
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge as rasterio_merge
from PIL import Image


BAND_NAME_PATTERNS = {
    'blue':     ['blue', 'b', 'band1', '_b_', '_blue'],
    'green':    ['green', 'g', 'band2', '_g_', '_green'],
    'red':      ['red', 'r', 'band3', '_r_', '_red'],
    'red_edge': ['rededge', 'red_edge', 're', 'band4', '_re_', 'redge', 'nir1'],
    'nir':      ['nir', 'band5', '_nir_', 'nearinfrared'],
}


def match_band(filename: str) -> str | None:
    """Guess band name from filename."""
    fname = os.path.splitext(filename)[0].lower()
    for band, patterns in BAND_NAME_PATTERNS.items():
        for p in patterns:
            if p in fname:
                return band
    return None


def load_geotiff_bands(file_paths: list[str]) -> tuple[dict, object, object]:
    """
    Load bands from a list of single-band GeoTIFFs or one multi-band GeoTIFF.
    Returns (bands_dict, transform, crs).
    """
    bands = {}
    transform = None
    crs = None

    if len(file_paths) == 1:
        with rasterio.open(file_paths[0]) as src:
            transform = src.transform
            crs = src.crs
            count = src.count
            if count >= 5:
                # Assume: B, G, R, RE, NIR order (DJI Terra default)
                order = ['blue', 'green', 'red', 'red_edge', 'nir']
                for i, name in enumerate(order[:count], 1):
                    bands[name] = src.read(i).astype(np.float32)
            elif count == 3:
                # RGB
                bands['red'] = src.read(1).astype(np.float32)
                bands['green'] = src.read(2).astype(np.float32)
                bands['blue'] = src.read(3).astype(np.float32)
            else:
                bands['band1'] = src.read(1).astype(np.float32)
    else:
        # Multiple single-band files
        for fp in file_paths:
            band_name = match_band(os.path.basename(fp))
            if band_name is None:
                continue
            with rasterio.open(fp) as src:
                if transform is None:
                    transform = src.transform
                    crs = src.crs
                bands[band_name] = src.read(1).astype(np.float32)

    return bands, transform, crs


def index_to_png_base64(index_array: np.ndarray, colormap: str = 'RdYlGn',
                         vmin: float = -1, vmax: float = 1) -> str:
    """Convert a 2D index array to a base64 PNG for display."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import matplotlib.colors as mcolors

    data = np.clip(index_array, vmin, vmax)
    norm = (data - vmin) / (vmax - vmin)
    norm = np.nan_to_num(norm, nan=0)

    cmap = plt.get_cmap(colormap)
    rgba = (cmap(norm) * 255).astype(np.uint8)

    # Make NaN pixels transparent
    nan_mask = ~np.isfinite(index_array)
    rgba[nan_mask, 3] = 0

    img = Image.fromarray(rgba, 'RGBA')

    # Resize for preview (max 1024px on longest axis)
    max_dim = 1024
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


def get_raster_bounds_wgs84(transform, crs, width, height) -> list:
    """Return [west, south, east, north] in WGS84."""
    import rasterio.warp
    left = transform.c
    top = transform.f
    right = left + transform.a * width
    bottom = top + transform.e * height

    (west, east), (south, north) = rasterio.warp.transform(
        crs, 'EPSG:4326',
        [left, right], [bottom, top]
    )
    return [min(west, east), min(south, north), max(west, east), max(south, north)]


def export_index_geotiff(index_array: np.ndarray, transform, crs, name: str) -> bytes:
    """Export an index array as a single-band float32 GeoTIFF."""
    import io as _io
    buf = _io.BytesIO()
    h, w = index_array.shape
    with rasterio.open(
        buf, 'w',
        driver='GTiff',
        height=h, width=w,
        count=1,
        dtype=np.float32,
        crs=crs,
        transform=transform,
        compress='lzw'
    ) as dst:
        dst.write(index_array, 1)
    buf.seek(0)
    return buf.read()
