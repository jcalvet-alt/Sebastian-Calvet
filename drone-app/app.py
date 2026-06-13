"""
DroneMap - Procesamiento multiespectral y prescripción variable
Mavic 3 Multispectral → Ortomosaico → Índices → Malezas → Prescripción
"""
import os
import json
import uuid
import shutil
import zipfile
import threading
import tempfile
import time
import requests
import numpy as np
from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename

from processing.raster_utils import (
    load_geotiff_bands, index_to_png_base64,
    get_raster_bounds_wgs84, export_index_geotiff
)
from processing.indices import calculate_all_indices
from processing.weed_detection import detect_weeds, create_full_field_prescription
from processing.prescription import (
    export_shapefile, export_geojson, export_kmz,
    export_isoxml, export_john_deere

)

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024 * 1024  # 2 GB

BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
OUTPUT_DIR = os.path.join(BASE_DIR, 'outputs')
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# In-memory job store
jobs = {}


# ─── ODM / WebODM Integration ────────────────────────────────────────────────

def odm_process(job_id: str, image_paths: list[str], odm_url: str, odm_token: str):
    """Submit raw photos to WebODM/NodeODM and wait for the orthomosaic."""
    job = jobs[job_id]
    try:
        job['status'] = 'uploading_to_odm'
        job['progress'] = 5

        # Create task
        headers = {}
        if odm_token:
            headers['Authorization'] = f'JWT {odm_token}'

        task_resp = requests.post(
            f'{odm_url}/api/projects/1/tasks/',
            headers=headers,
            json={
                'name': f'dronemap_{job_id}',
                'options': [
                    {'name': 'dsm', 'value': True},
                    {'name': 'orthophoto-resolution', 'value': 5},
                    {'name': 'feature-quality', 'value': 'high'},
                ]
            }
        )
        if not task_resp.ok:
            raise RuntimeError(f'ODM task creation failed: {task_resp.text}')

        task_id = task_resp.json()['id']
        job['odm_task_id'] = task_id
        job['progress'] = 10

        # Upload images in chunks of 10
        for i in range(0, len(image_paths), 10):
            chunk = image_paths[i:i+10]
            files = [('images', (os.path.basename(p), open(p, 'rb'), 'image/jpeg'))
                     for p in chunk]
            requests.post(
                f'{odm_url}/api/projects/1/tasks/{task_id}/upload/',
                headers=headers, files=files
            )
            for _, f in files:
                f[1].close()
            pct = 10 + int((i / len(image_paths)) * 20)
            job['progress'] = pct

        # Commit task
        requests.post(f'{odm_url}/api/projects/1/tasks/{task_id}/commit/',
                      headers=headers)

        # Poll for completion
        job['status'] = 'processing_odm'
        while True:
            info = requests.get(
                f'{odm_url}/api/projects/1/tasks/{task_id}/',
                headers=headers
            ).json()
            status = info.get('status', {}).get('code', 0)
            running_progress = info.get('running_progress', 0)
            job['progress'] = 30 + int(running_progress * 40)
            job['odm_status'] = info.get('status', {}).get('notes', '')

            if status == 40:  # COMPLETED
                break
            elif status in (30, 50):  # FAILED / CANCELED
                raise RuntimeError(f"ODM processing failed: {info.get('status', {}).get('notes')}")
            time.sleep(10)

        # Download orthomosaic
        job['status'] = 'downloading_orthomosaic'
        job['progress'] = 72
        dl = requests.get(
            f'{odm_url}/api/projects/1/tasks/{task_id}/download/odm_orthophoto/odm_orthophoto.tif',
            headers=headers, stream=True
        )
        ortho_path = os.path.join(UPLOAD_DIR, job_id, 'orthomosaic.tif')
        with open(ortho_path, 'wb') as f:
            for chunk in dl.iter_content(chunk_size=8192):
                f.write(chunk)

        job['orthomosaic_path'] = ortho_path
        _process_orthomosaic(job_id)

    except Exception as e:
        jobs[job_id]['status'] = 'error'
        jobs[job_id]['error'] = str(e)


# ─── Orthomosaic Processing ───────────────────────────────────────────────────

def _process_orthomosaic(job_id: str):
    """Load orthomosaic, calculate indices, store results."""
    job = jobs[job_id]
    try:
        job['status'] = 'calculating_indices'
        job['progress'] = 75

        ortho_path = job['orthomosaic_path']
        band_files = job.get('band_files', [ortho_path])

        bands, transform, crs = load_geotiff_bands(band_files)
        job['bands'] = list(bands.keys())

        indices = calculate_all_indices(bands)
        job['indices_available'] = list(indices.keys())

        # Get raster dimensions
        first_band = next(iter(bands.values()))
        h, w = first_band.shape
        bounds = get_raster_bounds_wgs84(transform, crs, w, h)

        job['bounds'] = bounds
        job['transform'] = [transform.a, transform.b, transform.c,
                            transform.d, transform.e, transform.f]
        job['crs'] = str(crs)
        job['raster_shape'] = [h, w]

        # Store indices and transform for later use
        out_dir = os.path.join(OUTPUT_DIR, job_id)
        os.makedirs(out_dir, exist_ok=True)

        previews = {}
        for name, arr in indices.items():
            # Save GeoTIFF
            tif_bytes = export_index_geotiff(arr, transform, crs, name)
            with open(os.path.join(out_dir, f'{name}.tif'), 'wb') as f:
                f.write(tif_bytes)
            # PNG preview
            previews[name] = index_to_png_base64(arr, vmin=-1, vmax=1)

        job['previews'] = previews
        job['status'] = 'ready_for_detection'
        job['progress'] = 90

        # Cache indices in memory (for fast re-run of detection)
        job['_indices'] = indices
        job['_transform'] = transform
        job['_crs'] = crs

    except Exception as e:
        jobs[job_id]['status'] = 'error'
        jobs[job_id]['error'] = str(e)
        import traceback
        jobs[job_id]['traceback'] = traceback.format_exc()


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/upload/geotiff', methods=['POST'])
def upload_geotiff():
    """Upload pre-processed GeoTIFF orthomosaic(s)."""
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400

    job_id = str(uuid.uuid4())[:8]
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    files = request.files.getlist('files')
    saved = []
    for f in files:
        fname = secure_filename(f.filename)
        dest = os.path.join(job_dir, fname)
        f.save(dest)
        saved.append(dest)

    jobs[job_id] = {
        'id': job_id,
        'status': 'processing',
        'progress': 50,
        'band_files': saved,
        'orthomosaic_path': saved[0],
        'mode': 'geotiff'
    }

    thread = threading.Thread(target=_process_orthomosaic, args=(job_id,))
    thread.daemon = True
    thread.start()

    return jsonify({'job_id': job_id})


@app.route('/api/upload/photos', methods=['POST'])
def upload_photos():
    """Upload raw drone photos for ODM processing."""
    odm_url = request.form.get('odm_url', 'http://localhost:3000').rstrip('/')
    odm_token = request.form.get('odm_token', '')

    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400

    job_id = str(uuid.uuid4())[:8]
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    files = request.files.getlist('files')
    saved = []
    for f in files:
        fname = secure_filename(f.filename)
        dest = os.path.join(job_dir, fname)
        f.save(dest)
        saved.append(dest)

    jobs[job_id] = {
        'id': job_id,
        'status': 'queued',
        'progress': 0,
        'mode': 'raw_photos',
        'photo_count': len(saved)
    }

    thread = threading.Thread(
        target=odm_process, args=(job_id, saved, odm_url, odm_token)
    )
    thread.daemon = True
    thread.start()

    return jsonify({'job_id': job_id})


@app.route('/api/job/<job_id>/status')
def job_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify({
        'id': job_id,
        'status': job.get('status'),
        'progress': job.get('progress', 0),
        'error': job.get('error'),
        'odm_status': job.get('odm_status'),
        'bands': job.get('bands', []),
        'indices_available': job.get('indices_available', []),
        'bounds': job.get('bounds'),
        'mode': job.get('mode'),
        'photo_count': job.get('photo_count'),
    })


@app.route('/api/job/<job_id>/preview/<index_name>')
def get_preview(job_id, index_name):
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    previews = job.get('previews', {})
    if index_name not in previews:
        return jsonify({'error': 'Index not found'}), 404
    return jsonify({'image': previews[index_name], 'bounds': job.get('bounds')})


@app.route('/api/job/<job_id>/detect', methods=['POST'])
def detect_weeds_route(job_id):
    """Run weed detection with given parameters."""
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    if job.get('status') not in ('ready_for_detection', 'detection_done'):
        return jsonify({'error': 'Job not ready'}), 400

    params = request.get_json() or {}

    try:
        indices = job.get('_indices')
        transform = job.get('_transform')
        crs = job.get('_crs')

        if indices is None:
            # Reload from disk
            out_dir = os.path.join(OUTPUT_DIR, job_id)
            import rasterio
            from rasterio.transform import Affine
            indices = {}
            for fname in os.listdir(out_dir):
                if fname.endswith('.tif'):
                    name = fname[:-4]
                    with rasterio.open(os.path.join(out_dir, fname)) as src:
                        if transform is None:
                            transform = src.transform
                            crs = src.crs
                        indices[name] = src.read(1).astype(np.float32)

        weed_zones = detect_weeds(indices, params, transform, crs)

        if len(weed_zones) == 0:
            return jsonify({
                'weed_count': 0,
                'total_area_ha': 0,
                'geojson': '{"type":"FeatureCollection","features":[]}'
            })

        full_presc = create_full_field_prescription(weed_zones)
        job['_prescription'] = full_presc
        job['_weed_zones'] = weed_zones
        job['status'] = 'detection_done'

        weed_area = float(weed_zones['area_ha'].sum())
        geojson_str = weed_zones.to_crs('EPSG:4326').to_json()

        return jsonify({
            'weed_count': len(weed_zones),
            'total_area_ha': round(weed_area, 4),
            'geojson': geojson_str
        })

    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


@app.route('/api/job/<job_id>/download/<fmt>')
def download_prescription(job_id, fmt):
    """Download prescription in the requested format."""
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404

    presc = job.get('_prescription')
    weed_zones = job.get('_weed_zones')
    if presc is None or weed_zones is None:
        return jsonify({'error': 'No detection results. Run detection first.'}), 400

    product = request.args.get('product', 'Herbicida')
    lote = request.args.get('lote', 'prescripcion')

    try:
        if fmt == 'shapefile':
            data = export_shapefile(presc, lote)
            return send_file(
                __import__('io').BytesIO(data),
                mimetype='application/zip',
                as_attachment=True,
                download_name=f'{lote}_shapefile.zip'
            )
        elif fmt == 'geojson':
            data = export_geojson(presc)
            return send_file(
                __import__('io').BytesIO(data),
                mimetype='application/geo+json',
                as_attachment=True,
                download_name=f'{lote}.geojson'
            )
        elif fmt == 'kmz':
            data = export_kmz(presc, lote)
            return send_file(
                __import__('io').BytesIO(data),
                mimetype='application/vnd.google-earth.kmz',
                as_attachment=True,
                download_name=f'{lote}.kmz'
            )
        elif fmt == 'isoxml':
            data = export_isoxml(presc, product)
            return send_file(
                __import__('io').BytesIO(data),
                mimetype='application/zip',
                as_attachment=True,
                download_name=f'{lote}_ISOXML.zip'
            )
        elif fmt == 'johndeere':
            data = export_john_deere(presc, lote)
            return send_file(
                __import__('io').BytesIO(data),
                mimetype='application/zip',
                as_attachment=True,
                download_name=f'{lote}_JohnDeere.zip'
            )
        elif fmt == 'index_tif':
            idx_name = request.args.get('index', 'NDVI')
            out_dir = os.path.join(OUTPUT_DIR, job_id)
            tif_path = os.path.join(out_dir, f'{idx_name}.tif')
            if not os.path.exists(tif_path):
                return jsonify({'error': f'Index {idx_name} not found'}), 404
            return send_file(tif_path, as_attachment=True,
                             download_name=f'{lote}_{idx_name}.tif')
        else:
            return jsonify({'error': f'Unknown format: {fmt}'}), 400

    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


@app.route('/api/job/<job_id>/download/weed_zones')
def download_weed_zones(job_id):
    """Download weed zones only (without full field) as Shapefile."""
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    weed_zones = job.get('_weed_zones')
    if weed_zones is None:
        return jsonify({'error': 'No detection results'}), 400
    data = export_shapefile(weed_zones, 'manchones_malezas')
    return send_file(
        __import__('io').BytesIO(data),
        mimetype='application/zip',
        as_attachment=True,
        download_name='manchones_malezas.zip'
    )


if __name__ == '__main__':
    app.run(debug=True, port=5050, host='0.0.0.0')
