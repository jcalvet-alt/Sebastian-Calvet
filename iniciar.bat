@echo off
chcp 65001 >nul
title Conteo de Hacienda — Dron

echo.
echo  ================================================
echo   Conteo de Hacienda - DJI Mavic 3M
echo  ================================================
echo.

:: Verificar que Python esté instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python no está instalado.
    echo  Descargalo desde https://www.python.org/downloads/
    echo  Marcá la opción "Add Python to PATH" durante la instalación.
    pause
    exit /b 1
)

:: Crear entorno virtual si no existe
if not exist ".venv" (
    echo  [1/3] Creando entorno virtual...
    python -m venv .venv
)

:: Activar entorno virtual
call .venv\Scripts\activate.bat

:: Instalar dependencias si hace falta
if not exist ".venv\Lib\site-packages\fastapi" (
    echo  [2/3] Instalando dependencias (solo la primera vez, puede tardar unos minutos)...
    pip install -r backend\requirements.txt --quiet
    if errorlevel 1 (
        echo  ERROR al instalar dependencias.
        pause
        exit /b 1
    )
)

:: Descargar modelo placeholder si no existe
if not exist "models\yolov8n_coco.onnx" (
    if not exist "models\cattle.onnx" (
        echo  [3/3] Descargando modelo de prueba (requiere internet, ~6MB)...
        python scripts\download_placeholder.py
        if errorlevel 1 (
            echo  ERROR al descargar el modelo.
            pause
            exit /b 1
        )
    )
)

echo.
echo  Todo listo! Abriendo la aplicación...
echo  Para cerrar el servidor, cerrá esta ventana.
echo.

:: Abrir el navegador después de 2 segundos
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:8000"

:: Arrancar el servidor
cd backend
uvicorn main:app --port 8000

pause
