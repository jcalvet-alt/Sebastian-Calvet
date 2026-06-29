@echo off
echo ===========================================
echo  Conteo de Hacienda - DJI Mavic 3M
echo ===========================================
echo.
echo Carpeta: %~dp0
echo.

cd /d "%~dp0"

echo Paso 1: Verificando carpeta...
if not exist "%~dp0backend\main.py" (
    echo.
    echo ERROR: No encuentro los archivos de la app.
    echo Asegurate de haber DESCOMPRIMIDO el ZIP antes de ejecutar.
    echo No ejecutes este archivo desde adentro del ZIP.
    echo.
    pause
    exit /b 1
)
echo Archivos OK.

set "RUNTIME=%~dp0runtime"
set "PY=%RUNTIME%\python\python.exe"
set "UVI=%RUNTIME%\python\Scripts\uvicorn.exe"

echo Paso 2: Verificando Python portable...
if not exist "%PY%" (
    echo Descargando Python portable (12MB)...
    if not exist "%RUNTIME%\python" mkdir "%RUNTIME%\python"
    curl -L --progress-bar -o "%RUNTIME%\py.zip" "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"
    if errorlevel 1 (
        echo Curl fallo. Intentando PowerShell...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile '%RUNTIME%\py.zip'"
    )
    echo Descomprimiendo Python...
    powershell -Command "Expand-Archive '%RUNTIME%\py.zip' '%RUNTIME%\python' -Force"
    del "%RUNTIME%\py.zip"
    (echo python311.zip & echo . & echo .\Lib\site-packages & echo. & echo import site) > "%RUNTIME%\python\python311._pth"
)

if not exist "%PY%" (
    echo.
    echo ERROR: No se pudo instalar Python portable.
    echo Verifica tu conexion a internet.
    pause
    exit /b 1
)
echo Python OK: %PY%

echo Paso 3: Verificando pip...
if not exist "%RUNTIME%\python\Scripts\pip.exe" (
    echo Instalando pip...
    curl -L -o "%RUNTIME%\get-pip.py" "https://bootstrap.pypa.io/get-pip.py"
    if errorlevel 1 powershell -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%RUNTIME%\get-pip.py'"
    "%PY%" "%RUNTIME%\get-pip.py" --quiet --no-warn-script-location
    del "%RUNTIME%\get-pip.py"
)
echo pip OK.

echo Paso 4: Verificando dependencias...
"%PY%" -c "import fastapi" 2>nul
if errorlevel 1 (
    echo Instalando dependencias (3-5 minutos, por favor espera)...
    "%PY%" -m pip install -r "%~dp0backend\requirements.txt" --no-progress-bar --no-warn-script-location
    if errorlevel 1 (
        echo.
        echo ERROR al instalar dependencias.
        pause
        exit /b 1
    )
)
echo Dependencias OK.

echo Paso 5: Verificando modelo...
if not exist "%~dp0models\yolov8n_coco.onnx" (
    if not exist "%~dp0models\cattle.onnx" (
        echo Descargando modelo (6MB)...
        "%PY%" "%~dp0scripts\download_placeholder.py"
    )
)
echo Modelo OK.

echo.
echo Todo listo. Abriendo navegador en 3 segundos...
echo Para cerrar la app: cerrar esta ventana.
echo.
start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:8000"
cd /d "%~dp0backend"
"%UVI%" main:app --port 8000
pause
