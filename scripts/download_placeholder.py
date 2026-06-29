"""
Descarga el modelo YOLOv8n preentrenado en COCO y lo exporta a ONNX.
Corré esto UNA SOLA VEZ antes de arrancar el servidor.

Uso:
    cd Sebastian-Calvet
    python scripts/download_placeholder.py
"""

from pathlib import Path

def main():
    models_dir = Path(__file__).parent.parent / "models"
    models_dir.mkdir(exist_ok=True)
    output_path = models_dir / "yolov8n_coco.onnx"

    if output_path.exists():
        print(f"El modelo ya existe: {output_path}")
        return

    print("Descargando YOLOv8n desde Ultralytics (requiere internet)...")
    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: instalá las dependencias primero:")
        print("  pip install -r backend/requirements.txt")
        raise SystemExit(1)

    model = YOLO("yolov8n.pt")  # descarga automática ~6MB
    print(f"Exportando a ONNX en {output_path} ...")
    model.export(format="onnx", imgsz=640, opset=12, simplify=True)

    # ultralytics guarda el .onnx junto al .pt; lo movemos a models/
    import shutil
    generated = Path("yolov8n.onnx")
    if generated.exists():
        shutil.move(str(generated), str(output_path))

    print(f"\nListo! Modelo guardado en: {output_path}")
    print("Ahora podés arrancar el servidor con:")
    print("  cd backend && uvicorn main:app --reload --port 8000")


if __name__ == "__main__":
    main()
