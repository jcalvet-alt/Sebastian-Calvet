"""Vegetation index calculation for multispectral imagery."""
import numpy as np


def safe_divide(numerator, denominator):
    with np.errstate(divide='ignore', invalid='ignore'):
        result = np.where(denominator != 0, numerator / denominator, np.nan)
    return result.astype(np.float32)


def calculate_ndvi(nir, red):
    """Normalized Difference Vegetation Index."""
    return safe_divide(nir - red, nir + red)


def calculate_ndre(nir, red_edge):
    """Normalized Difference Red Edge Index — sensitive to chlorophyll."""
    return safe_divide(nir - red_edge, nir + red_edge)


def calculate_gndvi(nir, green):
    """Green NDVI — better for dense canopy."""
    return safe_divide(nir - green, nir + green)


def calculate_savi(nir, red, L=0.5):
    """Soil Adjusted Vegetation Index."""
    return safe_divide((nir - red) * (1 + L), nir + red + L)


def calculate_evi(nir, red, blue):
    """Enhanced Vegetation Index."""
    with np.errstate(divide='ignore', invalid='ignore'):
        denom = nir + 6 * red - 7.5 * blue + 1
        result = np.where(denom != 0, 2.5 * (nir - red) / denom, np.nan)
    return result.astype(np.float32)


def calculate_cire(nir, red_edge):
    """Chlorophyll Index Red Edge."""
    with np.errstate(divide='ignore', invalid='ignore'):
        result = np.where(red_edge != 0, (nir / red_edge) - 1, np.nan)
    return result.astype(np.float32)


def normalize_band(band):
    """Normalize a band to 0-1 range, handling uint16 from Mavic 3 M."""
    band = band.astype(np.float32)
    if band.max() > 1.0:
        band = band / 65535.0 if band.max() > 255 else band / 255.0
    return band


def calculate_all_indices(bands: dict) -> dict:
    """
    Calculate all available indices from a band dictionary.
    bands keys: 'blue', 'green', 'red', 'red_edge', 'nir'
    """
    normalized = {k: normalize_band(v) for k, v in bands.items()}
    indices = {}

    b = normalized.get('blue')
    g = normalized.get('green')
    r = normalized.get('red')
    re = normalized.get('red_edge')
    nir = normalized.get('nir')

    if nir is not None and r is not None:
        indices['NDVI'] = calculate_ndvi(nir, r)
        indices['SAVI'] = calculate_savi(nir, r)
    if nir is not None and re is not None:
        indices['NDRE'] = calculate_ndre(nir, re)
        indices['CIre'] = calculate_cire(nir, re)
    if nir is not None and g is not None:
        indices['GNDVI'] = calculate_gndvi(nir, g)
    if nir is not None and r is not None and b is not None:
        indices['EVI'] = calculate_evi(nir, r, b)

    return indices
