"""
Backend FastAPI — App de conteo de hacienda desde fotos de dron.
Endpoint principal: POST /detect
"""

import logging
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from detector import CattleDetector

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)

# Estado global del detector (se inicializa una sola vez al arrancar)
detector: CattleDetector | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Carga el modelo al arrancar y libera recursos al cerrar."""
    global detector
    try:
        detector = CattleDetector()
        logger.info("Detector listo.")
    except FileNotFoundError as e:
        logger.error(str(e))
        # El servidor arranca igual; el endpoint /detect va a devolver 503
    yield
    detector = None


app = FastAPI(
    title="Conteo de Hacienda — Dron DJI Mavic 3M",
    description="API para detección y conteo de bovinos en fotos aéreas.",
    version="1.0.0",
    lifespan=lifespan,
)

# Permitir que el frontend (abierto directamente como archivo) llame al backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir el frontend estático desde /app
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/app", StaticFiles(directory=str(frontend_path), html=True), name="frontend")


@app.get("/")
async def root():
    """Redirige al frontend."""
    return FileResponse(str(frontend_path / "index.html"))


@app.get("/health")
async def health():
    """Verificación rápida de que el servidor está vivo y el modelo cargado."""
    return {
        "status": "ok",
        "model_loaded": detector is not None,
        "model_is_placeholder": detector.is_coco_placeholder if detector else None,
    }


@app.post("/detect")
async def detect(
    file: Annotated[UploadFile, File(description="Foto en formato JPG, PNG o TIFF")],
    conf_threshold: Annotated[float, Form(description="Umbral de confianza (0-1)")] = 0.25,
    tile_size: Annotated[int, Form(description="Tamaño del tile en píxeles")] = 640,
    overlap: Annotated[float, Form(description="Solapamiento entre tiles (0-0.5)")] = 0.2,
):
    """
    Recibe una imagen, corre detección con tiling y devuelve:
    - count: cantidad de animales detectados
    - detections: lista de {bbox, score, class}
    - image_size, tiles_used, processing_time_sec
    """
    if detector is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Modelo no cargado. Ejecutá scripts/download_placeholder.py "
                "y reiniciá el servidor."
            ),
        )

    # Validar tipo de archivo
    allowed = {"image/jpeg", "image/png", "image/tiff", "image/webp"}
    if file.content_type and file.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no soportado: {file.content_type}. Usá JPG, PNG o TIFF.",
        )

    # Validar parámetros
    if not (0.01 <= conf_threshold <= 0.99):
        raise HTTPException(status_code=400, detail="conf_threshold debe estar entre 0.01 y 0.99")
    if tile_size not in (320, 640, 1280):
        raise HTTPException(status_code=400, detail="tile_size debe ser 320, 640 o 1280")
    if not (0.0 <= overlap <= 0.5):
        raise HTTPException(status_code=400, detail="overlap debe estar entre 0 y 0.5")

    try:
        image_bytes = await file.read()
        if len(image_bytes) == 0:
            raise HTTPException(status_code=400, detail="El archivo está vacío.")

        result = detector.detect(
            image_bytes,
            conf_threshold=conf_threshold,
            tile_size=tile_size,
            overlap=overlap,
        )
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error inesperado durante la detección")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
