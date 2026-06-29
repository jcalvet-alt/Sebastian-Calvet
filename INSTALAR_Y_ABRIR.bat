@echo off
title Conteo de Hacienda - Dron
cd /d "%~dp0"

echo.
echo Conteo de Hacienda - DJI Mavic 3M
echo ====================================
echo.

:: ── Buscar Python real (ignorar el stub de Microsoft Store) ───────────
set "PYTHON="

:: Buscar en instalaciones locales del usuario (ruta mas comun en Windows)
for /d %%V in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if exist "%%V\python.exe" set "PYTHON=%%V\python.exe"
)

:: Buscar en instalacion global (todos los usuarios)
if "%PYTHON%"=="" (
    for /d %%V in ("%PROGRAMFILES%\Python3*") do (
        if exist "%%V\python.exe" set "PYTHON=%%V\python.exe"
    )
)

:: Usar lanzador py.exe si existe (instalado con Python)
if "%PYTHON%"=="" (
    if exist "%WINDIR%\py.exe" set "PYTHON=%WINDIR%\py.exe"
)
if "%PYTHON%"=="" (
    if exist "%WINDIR%\System32\py.exe" set "PYTHON=%WINDIR%\System32\py.exe"
)

if "%PYTHON%"=="" (
    echo ERROR: No se encontro Python instalado.
    echo.
    echo Soluciones:
    echo  1. Ve a Configuracion ^> Aplicaciones ^> Configuracion avanzada
    echo     de aplicaciones ^> Alias de ejecucion de aplicaciones
    echo     y DESACTIVA los dos alias de "python.exe" y "python3.exe"
    echo     (los que abren la Microsoft Store)
    echo.
    echo  2. Luego vuelve a ejecutar este archivo.
    echo.
    echo  O descarga Python desde: https://www.python.org/downloads/
    echo  y marca "Add Python to PATH" al instalar.
    pause
    exit /b 1
)

echo Python encontrado: %PYTHON%

:: ── Crear entorno virtual ──────────────────────────────────────────────
if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual...
    "%PYTHON%" -m venv .venv
    if errorlevel 1 (
        echo ERROR al crear entorno virtual.
        pause
        exit /b 1
    )
)

set "VP=%~dp0.venv\Scripts\python.exe"
set "VUVI=%~dp0.venv\Scripts\uvicorn.exe"

echo Entorno virtual OK.

:: ── Instalar dependencias ──────────────────────────────────────────────
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

:: ── Descargar modelo ───────────────────────────────────────────────────
if not exist "%~dp0models\yolov8n_coco.onnx" (
    if not exist "%~dp0models\cattle.onnx" (
        echo Descargando modelo de deteccion (6MB)...
        "%VP%" "%~dp0scripts\download_placeholder.py"
        if errorlevel 1 (
            echo ERROR al descargar el modelo.
            pause
            exit /b 1
        )
    )
)

:: ── Arrancar servidor ──────────────────────────────────────────────────
echo.
echo Todo listo. Abriendo en el navegador en 3 segundos...
echo Para cerrar la app: cerrar esta ventana.
echo.

start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:8000"

cd /d "%~dp0backend"
"%VUVI%" main:app --port 8000

pause
