@echo off
chcp 65001 >nul
title Conteo de Hacienda - Dron

echo.
echo  Conteo de Hacienda - DJI Mavic 3M
echo  ====================================
echo.

:: Ir a la carpeta donde está este .bat (por si se ejecuta desde otro lado)
cd /d "%~dp0"

:: ── Buscar Python: primero el lanzador "py", despues "python" ──────────
set PYTHON=
where py >nul 2>&1 && set PYTHON=py
if "%PYTHON%"=="" (
    where python >nul 2>&1 && set PYTHON=python
)

:: ── Si no hay Python, instalarlo con winget ────────────────────────────
if "%PYTHON%"=="" (
    echo Python no encontrado. Instalando...
    winget install -e --id Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements
    :: Refrescar variables de entorno
    for /f "tokens=*" %%i in ('where /r "%LOCALAPPDATA%\Programs\Python" python.exe 2^>nul') do set PYTHON=%%i
    if "%PYTHON%"=="" (
        echo.
        echo ERROR: No se pudo instalar Python automaticamente.
        echo Por favor descargalo de https://www.python.org/downloads/
        echo Marca "Add Python to PATH" y vuelve a ejecutar este archivo.
        pause
        exit /b 1
    )
)

echo Python encontrado: %PYTHON%
echo.

:: ── Crear entorno virtual ──────────────────────────────────────────────
if not exist ".venv\Scripts\python.exe" (
    echo [1/3] Preparando entorno...
    %PYTHON% -m venv .venv
    if errorlevel 1 (
        echo ERROR al crear entorno virtual.
        pause
        exit /b 1
    )
)

set VENV_PYTHON="%~dp0.venv\Scripts\python.exe"
set VENV_PIP="%~dp0.venv\Scripts\pip.exe"
set VENV_UVICORN="%~dp0.venv\Scripts\uvicorn.exe"

:: ── Instalar dependencias ──────────────────────────────────────────────
%VENV_PYTHON% -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [2/3] Instalando componentes (primera vez, puede tardar 3-5 minutos)...
    %VENV_PIP% install -r backend\requirements.txt --quiet
    if errorlevel 1 (
        echo ERROR al instalar componentes. Verificar conexion a internet.
        pause
        exit /b 1
    )
    echo Componentes instalados.
)

:: ── Descargar modelo ───────────────────────────────────────────────────
if not exist "models\yolov8n_coco.onnx" (
    if not exist "models\cattle.onnx" (
        echo [3/3] Descargando modelo de deteccion (6MB, requiere internet)...
        %VENV_PYTHON% scripts\download_placeholder.py
        if errorlevel 1 (
            echo ERROR al descargar el modelo.
            pause
            exit /b 1
        )
    )
)

:: ── Arrancar ───────────────────────────────────────────────────────────
echo.
echo Todo listo! Abriendo la aplicacion...
echo Para cerrar: cerrar esta ventana.
echo.

start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:8000"

cd backend
%VENV_UVICORN% main:app --port 8000

pause
