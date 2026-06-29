"""
Módulo de detección de ganado bovino con tiling + NMS global.

El modelo ONNX se carga una sola vez al arrancar el servidor.
Si no hay modelo propio, se usa YOLOv8n entrenado en COCO (clase 'cow').
"""

import os
import time
import logging
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np
import onnxruntime as ort

logger = logging.getLogger(__name__)

# Clase 'cow' en COCO es la 19 (índice base-0)
COCO_COW_CLASS_ID = 19

# Ruta al modelo ONNX. Se puede sobreescribir con la variable CATTLE_MODEL_PATH.
DEFAULT_MODEL_PATH = Path(__file__).parent.parent / "models" / "cattle.onnx"
PLACEHOLDER_MODEL_PATH = Path(__file__).parent.parent / "models" / "yolov8n_coco.onnx"


class CattleDetector:
    def __init__(self, model_path: str | None = None, img_size: int = 640):
        """
        Carga el modelo ONNX.
        Si model_path es None, busca cattle.onnx y después yolov8n_coco.onnx.
        """
        self.img_size = img_size
        self.model_path = self._resolve_model(model_path)
        self.is_coco_placeholder = "coco" in self.model_path.name.lower()

        logger.info(f"Cargando modelo: {self.model_path}")
        providers = ["CPUExecutionProvider"]
        self.session = ort.InferenceSession(str(self.model_path), providers=providers)

        # Nombre del tensor de entrada (varía según exportación)
        self.input_name = self.session.get_inputs()[0].name
        logger.info(f"Modelo cargado. Tensor de entrada: {self.input_name}")

    def _resolve_model(self, path: str | None) -> Path:
        """Determina qué modelo usar."""
        env_path = os.environ.get("CATTLE_MODEL_PATH")
        candidates = [
            Path(path) if path else None,
            Path(env_path) if env_path else None,
            DEFAULT_MODEL_PATH,
            PLACEHOLDER_MODEL_PATH,
        ]
        for c in candidates:
            if c and c.exists():
                return c
        raise FileNotFoundError(
            "No se encontró ningún modelo ONNX. "
            "Ejecutá scripts/download_placeholder.py para descargar el modelo de prueba, "
            "o colocá tu modelo en models/cattle.onnx"
        )

    # ------------------------------------------------------------------ #
    #  Tiling                                                              #
    # ------------------------------------------------------------------ #

    def _generate_tiles(
        self, img_h: int, img_w: int, tile_size: int = 640, overlap: float = 0.2
    ) -> List[Tuple[int, int, int, int]]:
        """
        Genera coordenadas (x1, y1, x2, y2) de cada tile.
        Siempre incluye un tile que cubre la imagen completa escalada,
        para no perder animales en los bordes de mosaico.
        """
        stride = int(tile_size * (1 - overlap))
        tiles = []
        y = 0
        while y < img_h:
            x = 0
            while x < img_w:
                x2 = min(x + tile_size, img_w)
                y2 = min(y + tile_size, img_h)
                x1 = max(0, x2 - tile_size)
                y1 = max(0, y2 - tile_size)
                tiles.append((x1, y1, x2, y2))
                if x2 == img_w:
                    break
                x += stride
            if y2 == img_h:
                break
            y += stride
        return tiles

    # ------------------------------------------------------------------ #
    #  Preprocesamiento                                                    #
    # ------------------------------------------------------------------ #

    def _preprocess(self, img_bgr: np.ndarray) -> np.ndarray:
        """Redimensiona y normaliza un tile para ONNX (NCHW float32)."""
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img_rgb, (self.img_size, self.img_size))
        tensor = img_resized.astype(np.float32) / 255.0
        tensor = np.transpose(tensor, (2, 0, 1))  # HWC → CHW
        return np.expand_dims(tensor, axis=0)     # CHW → NCHW

    # ------------------------------------------------------------------ #
    #  Inferencia sobre un tile                                            #
    # ------------------------------------------------------------------ #

    def _infer_tile(
        self, tile_bgr: np.ndarray, conf_threshold: float
    ) -> List[dict]:
        """
        Corre el modelo sobre un tile y devuelve detecciones crudas
        en coordenadas relativas al tile (píxeles del tile).
        """
        th, tw = tile_bgr.shape[:2]
        tensor = self._preprocess(tile_bgr)
        outputs = self.session.run(None, {self.input_name: tensor})

        # YOLOv8 ONNX exportado con ultralytics devuelve shape (1, 84, N)
        # 84 = 4 coords + 80 clases COCO
        raw = outputs[0]  # (1, 84, N) o (1, N, 84) según versión
        if raw.ndim == 3 and raw.shape[1] < raw.shape[2]:
            # Formato (1, 84, N) → transponer a (1, N, 84)
            raw = raw.transpose(0, 2, 1)
        raw = raw[0]  # quitar batch → (N, 84)

        detections = []
        for det in raw:
            coords = det[:4]   # cx, cy, w, h (normalizados a img_size)
            class_scores = det[4:]

            if self.is_coco_placeholder:
                # Solo nos interesa 'cow' (clase 19)
                if COCO_COW_CLASS_ID >= len(class_scores):
                    continue
                score = float(class_scores[COCO_COW_CLASS_ID])
                cls = COCO_COW_CLASS_ID
            else:
                cls = int(np.argmax(class_scores))
                score = float(class_scores[cls])

            if score < conf_threshold:
                continue

            # Coordenadas en píxeles del tile (imagen redimensionada a img_size)
            cx, cy, w, h = coords
            # Escalar de img_size al tamaño real del tile
            scale_x = tw / self.img_size
            scale_y = th / self.img_size
            x1 = (cx - w / 2) * scale_x
            y1 = (cy - h / 2) * scale_y
            x2 = (cx + w / 2) * scale_x
            y2 = (cy + h / 2) * scale_y

            detections.append({"bbox": [x1, y1, x2, y2], "score": score, "class": cls})

        return detections

    # ------------------------------------------------------------------ #
    #  NMS global                                                           #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _nms(detections: List[dict], iou_threshold: float = 0.4) -> List[dict]:
        """Non-Maximum Suppression sobre todas las detecciones fusionadas."""
        if not detections:
            return []

        boxes = np.array([d["bbox"] for d in detections], dtype=np.float32)
        scores = np.array([d["score"] for d in detections], dtype=np.float32)

        x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]

        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
            iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
            order = order[1:][iou <= iou_threshold]

        return [detections[i] for i in keep]

    # ------------------------------------------------------------------ #
    #  Método público                                                       #
    # ------------------------------------------------------------------ #

    def detect(
        self,
        image_bytes: bytes,
        conf_threshold: float = 0.25,
        tile_size: int = 640,
        overlap: float = 0.2,
    ) -> dict:
        """
        Recibe los bytes de una imagen y devuelve detecciones + conteo.
        """
        t0 = time.time()

        # Decodificar imagen
        arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("No se pudo decodificar la imagen. ¿Está corrupta?")

        img_h, img_w = img.shape[:2]
        megapixels = (img_h * img_w) / 1_000_000
        if megapixels > 50:
            logger.warning(
                f"Imagen muy grande ({megapixels:.1f} MP). "
                "El procesamiento puede tardar varios minutos en CPU."
            )

        # Generar tiles y correr inferencia
        tiles = self._generate_tiles(img_h, img_w, tile_size, overlap)
        all_detections = []

        for tx1, ty1, tx2, ty2 in tiles:
            tile = img[ty1:ty2, tx1:tx2]
            tile_dets = self._infer_tile(tile, conf_threshold)
            # Traducir coordenadas de tile a imagen completa
            for det in tile_dets:
                bx1, by1, bx2, by2 = det["bbox"]
                det["bbox"] = [bx1 + tx1, by1 + ty1, bx2 + tx1, by2 + ty1]
                all_detections.append(det)

        # NMS global para eliminar duplicados entre tiles solapados
        final = self._nms(all_detections, iou_threshold=0.4)

        elapsed = time.time() - t0
        logger.info(
            f"Imagen {img_w}x{img_h} | {len(tiles)} tiles | "
            f"{len(final)} detecciones | {elapsed:.2f}s"
        )

        return {
            "count": len(final),
            "detections": [
                {
                    "bbox": [round(v, 1) for v in d["bbox"]],
                    "score": round(d["score"], 4),
                    "class": d["class"],
                }
                for d in final
            ],
            "image_size": {"width": img_w, "height": img_h},
            "tiles_used": len(tiles),
            "processing_time_sec": round(elapsed, 2),
            "model_is_placeholder": self.is_coco_placeholder,
        }
