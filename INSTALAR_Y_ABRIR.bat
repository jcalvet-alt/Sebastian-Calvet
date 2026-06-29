@echo off
title Conteo de Hacienda - Dron

:: Pararse en la carpeta del .bat
cd /d "%~dp0"

echo.
echo Conteo de Hacienda - DJI Mavic 3M
echo ====================================
echo.

:: Buscar Python (lanzador py o python directo)
set "PYTHON="
where py >nul 2>&1
if not errorlevel 1 set "PYTHON=py"
if "%PYTHON%"=="" (
    where python >nul 2>&1
    if not errorlevel 1 set "PYTHON=python"
)
if "%PYTHON%"=="" (
    echo ERROR: Python no encontrado.
    echo Instalalo desde https://www.python.org/downloads/
    echo Marcando "Add Python to PATH" durante la instalacion.
    pause
    exit /b 1
)
echo Python: %PYTHON%

:: Crear entorno virtual
if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual...
    %PYTHON% -m venv .venv
    if errorlevel 1 (
        echo ERROR al crear entorno virtual.
        pause
        exit /b 1
    )
)

set "VP=%~dp0.venv\Scripts\python.exe"
set "VPIP=%~dp0.venv\Scripts\pip.exe"
set "VUVI=%~dp0.venv\Scripts\uvicorn.exe"

echo Entorno virtual OK.

:: Instalar dependencias
"%VP%" -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo Instalando dependencias (primera vez, 3-5 minutos)...
    "%VP%" -m pip install --upgrade pip --quiet --no-progress-bar
    "%VP%" -m pip install -r "%~dp0backend\requirements.txt" --quiet --no-progress-bar
    if errorlevel 1 (
        echo.
        echo ERROR al instalar dependencias.
        echo Verifica tu conexion a internet e intentalo de nuevo.
        pause
        exit /b 1
    )
    echo Dependencias instaladas OK.
)

:: Descargar modelo
if not exist "%~dp0models\yolov8n_coco.onnx" (
    if not exist "%~dp0models\cattle.onnx" (
        echo Descargando modelo (6MB)...
        "%VP%" "%~dp0scripts\download_placeholder.py"
        if errorlevel 1 (
            echo ERROR al descargar el modelo.
            pause
            exit /b 1
        )
    )
)

echo.
echo Todo listo. Abriendo en el navegador...
echo Para cerrar la app: cerrar esta ventana.
echo.

start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:8000"

cd /d "%~dp0backend"
"%VUVI%" main:app --port 8000

pause
