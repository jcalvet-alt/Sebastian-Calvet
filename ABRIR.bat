@echo off
title Conteo de Hacienda - Dron
cd /d "%~dp0"

:: Guardar toda la salida en un log
set "LOG=%~dp0ABRIR_LOG.txt"
echo Inicio: %date% %time% > "%LOG%"

call :MAIN >> "%LOG%" 2>&1
if errorlevel 1 (
    echo.
    echo Ocurrio un error. Revisa el archivo ABRIR_LOG.txt en la carpeta del proyecto.
    echo Ruta: %~dp0ABRIR_LOG.txt
    echo.
    type "%LOG%"
    pause
    exit /b 1
)
exit /b 0

:MAIN
echo CD: %~dp0
echo.
echo Conteo de Hacienda - DJI Mavic 3M
echo ====================================
echo.

set "RUNTIME=%~dp0runtime"
set "PY=%RUNTIME%\python\python.exe"
set "UVI=%RUNTIME%\python\Scripts\uvicorn.exe"

:: ── 1. Descargar Python portable si no existe ─────────────────────────
if not exist "%PY%" (
    echo [1/4] Descargando Python portable...
    if not exist "%RUNTIME%\python" mkdir "%RUNTIME%\python"

    set "PY_ZIP=%RUNTIME%\python-embed.zip"
    curl -L -o "%RUNTIME%\python-embed.zip" "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"
    if errorlevel 1 (
        echo ERROR: curl fallo. Intentando con PowerShell...
        powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile '%RUNTIME%\python-embed.zip'"
        if errorlevel 1 (
            echo ERROR: No se pudo descargar Python.
            exit /b 1
        )
    )

    echo Descomprimiendo...
    powershell -Command "Expand-Archive -Path '%RUNTIME%\python-embed.zip' -DestinationPath '%RUNTIME%\python' -Force"
    if errorlevel 1 (
        echo ERROR al descomprimir.
        exit /b 1
    )
    del "%RUNTIME%\python-embed.zip"

    :: Habilitar site-packages
    (
        echo python311.zip
        echo .
        echo .\Lib\site-packages
        echo.
        echo import site
    ) > "%RUNTIME%\python\python311._pth"

    echo Python portable OK.
)

echo Python: %PY%
if not exist "%PY%" (
    echo ERROR: python.exe no existe en la ruta esperada.
    exit /b 1
)

:: ── 2. Instalar pip ───────────────────────────────────────────────────
if not exist "%RUNTIME%\python\Scripts\pip.exe" (
    echo [2/4] Instalando pip...
    curl -L -o "%RUNTIME%\get-pip.py" "https://bootstrap.pypa.io/get-pip.py"
    if errorlevel 1 (
        powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%RUNTIME%\get-pip.py'"
    )
    "%PY%" "%RUNTIME%\get-pip.py" --quiet --no-warn-script-location
    del "%RUNTIME%\get-pip.py"
    echo pip OK.
)

:: ── 3. Instalar dependencias ──────────────────────────────────────────
"%PY%" -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [3/4] Instalando dependencias (3-5 minutos)...
    "%PY%" -m pip install -r "%~dp0backend\requirements.txt" --quiet --no-progress-bar --no-warn-script-location
    if errorlevel 1 (
        echo ERROR al instalar dependencias.
        exit /b 1
    )
    echo Dependencias OK.
)

:: ── 4. Descargar modelo ───────────────────────────────────────────────
if not exist "%~dp0models\yolov8n_coco.onnx" (
    if not exist "%~dp0models\cattle.onnx" (
        echo [4/4] Descargando modelo...
        "%PY%" "%~dp0scripts\download_placeholder.py"
        if errorlevel 1 (
            echo ERROR al descargar modelo.
            exit /b 1
        )
    )
)

:: ── Arrancar ──────────────────────────────────────────────────────────
echo.
echo Todo listo. Abriendo navegador...
start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:8000"
cd /d "%~dp0backend"
"%UVI%" main:app --port 8000
exit /b 0
