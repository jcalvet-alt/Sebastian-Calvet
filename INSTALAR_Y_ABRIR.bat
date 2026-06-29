@echo off
chcp 65001 >nul
title Instalador — Conteo de Hacienda

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   Conteo de Hacienda - DJI Mavic 3M         ║
echo  ║   Instalador automático                      ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: ── 1. Verificar si Python ya está instalado ──────────────────────────
python --version >nul 2>&1
if not errorlevel 1 goto :python_ok

:: ── 2. Intentar instalar Python con winget (Windows 10/11) ────────────
echo  Python no encontrado. Instalando automáticamente...
echo  (Requiere conexión a internet)
echo.

winget --version >nul 2>&1
if not errorlevel 1 (
    echo  Instalando Python 3.12 con winget...
    winget install -e --id Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements
    if errorlevel 1 goto :instalar_manual
    :: Refrescar PATH para que Python sea visible en esta sesión
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python312\;%LOCALAPPDATA%\Programs\Python\Python312\Scripts\;%PATH%"
    set "PATH=%APPDATA%\Python\Python312\Scripts\;%PATH%"
    python --version >nul 2>&1
    if not errorlevel 1 goto :python_ok
)

:instalar_manual
:: ── 3. Fallback: descargar el instalador de Python directamente ────────
echo  Descargando instalador de Python desde python.org...
curl -L -o "%TEMP%\python_installer.exe" "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"
if errorlevel 1 (
    echo.
    echo  ERROR: No se pudo descargar Python.
    echo  Por favor instalalo manualmente desde:
    echo     https://www.python.org/downloads/
    echo  Marcá "Add Python to PATH" y volvé a ejecutar este archivo.
    pause
    exit /b 1
)
echo  Instalando Python (esto abre una ventana de instalación)...
"%TEMP%\python_installer.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
:: Actualizar PATH
set "PATH=%LOCALAPPDATA%\Programs\Python\Python312\;%LOCALAPPDATA%\Programs\Python\Python312\Scripts\;%PATH%"
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: La instalación de Python falló.
    echo  Intentá instalar Python manualmente desde https://www.python.org/downloads/
    pause
    exit /b 1
)

:python_ok
echo  Python encontrado.
echo.

:: ── 4. Crear entorno virtual ───────────────────────────────────────────
if not exist ".venv" (
    echo  [1/3] Preparando entorno de Python...
    python -m venv .venv
)
call .venv\Scripts\activate.bat

:: ── 5. Instalar dependencias ───────────────────────────────────────────
if not exist ".venv\Lib\site-packages\fastapi" (
    echo  [2/3] Instalando componentes (primera vez, 2-5 minutos)...
    pip install -r backend\requirements.txt --quiet
    if errorlevel 1 (
        echo.
        echo  ERROR al instalar componentes. Verificá tu conexión a internet.
        pause
        exit /b 1
    )
)

:: ── 6. Descargar modelo ────────────────────────────────────────────────
if not exist "models\yolov8n_coco.onnx" (
    if not exist "models\cattle.onnx" (
        echo  [3/3] Descargando modelo de detección (~6MB)...
        python scripts\download_placeholder.py
        if errorlevel 1 (
            echo  ERROR al descargar el modelo.
            pause
            exit /b 1
        )
    )
)

:: ── 7. Arrancar ────────────────────────────────────────────────────────
echo.
echo  ✓ Todo listo!
echo  Abriendo la aplicación en el navegador...
echo  Para cerrar la app: cerrá esta ventana.
echo.

start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:8000"
cd backend
uvicorn main:app --port 8000

pause
