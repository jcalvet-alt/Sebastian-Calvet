@echo off
title Conteo de Hacienda - Dron
cd /d "%~dp0"

echo.
echo Conteo de Hacienda - DJI Mavic 3M
echo ====================================
echo.

set "RUNTIME=%~dp0runtime"
set "PY=%RUNTIME%\python\python.exe"
set "UVI=%RUNTIME%\python\Scripts\uvicorn.exe"
set "PY_VER=3.11.9"
set "PY_ZIP=%RUNTIME%\python-embed.zip"
set "PY_PTH=%RUNTIME%\python\python311._pth"

:: ── 1. Descargar Python portable si no existe ─────────────────────────
if not exist "%PY%" (
    echo [1/4] Descargando Python portable (12MB, solo la primera vez)...

    if not exist "%RUNTIME%" mkdir "%RUNTIME%"

    :: Intentar con curl (disponible en Windows 10+)
    curl -L --progress-bar -o "%PY_ZIP%" "https://www.python.org/ftp/python/%PY_VER%/python-%PY_VER%-embed-amd64.zip"
    if errorlevel 1 (
        :: Intentar con PowerShell como alternativa
        powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/%PY_VER%/python-%PY_VER%-embed-amd64.zip' -OutFile '%PY_ZIP%'"
        if errorlevel 1 (
            echo ERROR: No se pudo descargar Python. Verifica tu conexion a internet.
            pause
            exit /b 1
        )
    )

    echo Descomprimiendo Python...
    if not exist "%RUNTIME%\python" mkdir "%RUNTIME%\python"
    powershell -Command "Expand-Archive -Path '%PY_ZIP%' -DestinationPath '%RUNTIME%\python' -Force"
    del "%PY_ZIP%"

    :: Habilitar pip y site-packages en Python embebido
    :: El archivo ._pth controla qué rutas ve Python
    (
        echo python311.zip
        echo .
        echo .\Lib\site-packages
        echo.
        echo import site
    ) > "%PY_PTH%"

    echo Python portable listo.
)

:: ── 2. Instalar pip si no existe ──────────────────────────────────────
if not exist "%RUNTIME%\python\Scripts\pip.exe" (
    echo [2/4] Instalando pip...
    curl -L --silent -o "%RUNTIME%\get-pip.py" "https://bootstrap.pypa.io/get-pip.py"
    if errorlevel 1 (
        powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%RUNTIME%\get-pip.py'"
    )
    "%PY%" "%RUNTIME%\get-pip.py" --quiet --no-warn-script-location
    del "%RUNTIME%\get-pip.py"
)

:: ── 3. Instalar dependencias si no existen ────────────────────────────
"%PY%" -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [3/4] Instalando dependencias (primera vez, 3-5 minutos)...
    "%PY%" -m pip install -r "%~dp0backend\requirements.txt" --quiet --no-progress-bar --no-warn-script-location
    if errorlevel 1 (
        echo ERROR al instalar dependencias. Verifica tu conexion a internet.
        pause
        exit /b 1
    )
    echo Dependencias instaladas.
)

:: ── 4. Descargar modelo si no existe ──────────────────────────────────
if not exist "%~dp0models\yolov8n_coco.onnx" (
    if not exist "%~dp0models\cattle.onnx" (
        echo [4/4] Descargando modelo de deteccion (6MB)...
        "%PY%" "%~dp0scripts\download_placeholder.py"
        if errorlevel 1 (
            echo ERROR al descargar el modelo.
            pause
            exit /b 1
        )
    )
)

:: ── Arrancar ──────────────────────────────────────────────────────────
echo.
echo Todo listo. Abriendo la app en el navegador...
echo Para cerrar: cerrar esta ventana.
echo.

start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:8000"

cd /d "%~dp0backend"
"%UVI%" main:app --port 8000

pause
