#!/usr/bin/env bash
# Script de inicio para Linux / Mac
set -e

echo ""
echo " ================================================"
echo "  Conteo de Hacienda - DJI Mavic 3M"
echo " ================================================"
echo ""

# Ir al directorio del script (por si se ejecuta desde otro lado)
cd "$(dirname "$0")"

# Verificar Python
if ! command -v python3 &>/dev/null; then
    echo " ERROR: Python3 no está instalado."
    echo " Instalalo con: sudo apt install python3 python3-venv  (Ubuntu/Debian)"
    echo "             o: brew install python                    (Mac)"
    exit 1
fi

# Crear entorno virtual si no existe
if [ ! -d ".venv" ]; then
    echo " [1/3] Creando entorno virtual..."
    python3 -m venv .venv
fi

# Activar entorno virtual
source .venv/bin/activate

# Instalar dependencias si hace falta
if ! python -c "import fastapi" &>/dev/null; then
    echo " [2/3] Instalando dependencias (solo la primera vez)..."
    pip install -r backend/requirements.txt --quiet
fi

# Descargar modelo si no existe
if [ ! -f "models/yolov8n_coco.onnx" ] && [ ! -f "models/cattle.onnx" ]; then
    echo " [3/3] Descargando modelo de prueba (~6MB)..."
    python scripts/download_placeholder.py
fi

echo ""
echo " Todo listo! Abriendo la aplicación en http://localhost:8000"
echo " Presioná Ctrl+C para cerrar el servidor."
echo ""

# Abrir navegador después de 2 segundos (funciona en Ubuntu y Mac)
(sleep 2 && (
    xdg-open http://localhost:8000 2>/dev/null ||
    open http://localhost:8000 2>/dev/null ||
    true
)) &

# Arrancar servidor
cd backend
uvicorn main:app --port 8000
