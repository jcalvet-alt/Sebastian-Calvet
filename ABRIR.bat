@echo off
title Conteo de Hacienda - Dron
cd /d "%~dp0"
echo. > "%~dp0ABRIR_LOG.txt"
echo Iniciando... >> "%~dp0ABRIR_LOG.txt"

set "RUNTIME=%~dp0runtime"
set "PY=%RUNTIME%\python\python.exe"
set "UVI=%RUNTIME%\python\Scripts\uvicorn.exe"

if not exist "%PY%" (
    echo [1/4] Descargando Python portable... >> "%~dp0ABRIR_LOG.txt"
    echo [1/4] Descargando Python portable (12MB)...
    if not exist "%RUNTIME%\python" mkdir "%RUNTIME%\python"
    curl -L -o "%RUNTIME%\python-embed.zip" "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip" >> "%~dp0ABRIR_LOG.txt" 2>&1
    if errorlevel 1 (
        echo ERROR curl. Intentando PowerShell... >> "%~dp0ABRIR_LOG.txt"
        powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile '%RUNTIME%\python-embed.zip'" >> "%~dp0ABRIR_LOG.txt" 2>&1
    )
    echo Descomprimiendo... >> "%~dp0ABRIR_LOG.txt"
    echo Descomprimiendo...
    powershell -Command "Expand-Archive -Path '%RUNTIME%\python-embed.zip' -DestinationPath '%RUNTIME%\python' -Force" >> "%~dp0ABRIR_LOG.txt" 2>&1
    del "%RUNTIME%\python-embed.zip"
    (
        echo python311.zip
        echo .
        echo .\Lib\site-packages
        echo.
        echo import site
    ) > "%RUNTIME%\python\python311._pth"
    echo Python portable OK >> "%~dp0ABRIR_LOG.txt"
)

if not exist "%PY%" (
    echo ERROR: python.exe no encontrado en %PY% >> "%~dp0ABRIR_LOG.txt"
    echo ERROR: python.exe no encontrado.
    echo Revisa ABRIR_LOG.txt para mas detalles.
    pause
    exit /b 1
)

echo Python OK >> "%~dp0ABRIR_LOG.txt"

if not exist "%RUNTIME%\python\Scripts\pip.exe" (
    echo [2/4] Instalando pip...
    echo [2/4] Instalando pip... >> "%~dp0ABRIR_LOG.txt"
    curl -L -o "%RUNTIME%\get-pip.py" "https://bootstrap.pypa.io/get-pip.py" >> "%~dp0ABRIR_LOG.txt" 2>&1
    "%PY%" "%RUNTIME%\get-pip.py" --quiet --no-warn-script-location >> "%~dp0ABRIR_LOG.txt" 2>&1
    del "%RUNTIME%\get-pip.py"
    echo pip OK >> "%~dp0ABRIR_LOG.txt"
)

"%PY%" -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [3/4] Instalando dependencias (3-5 minutos)...
    echo [3/4] Instalando dependencias... >> "%~dp0ABRIR_LOG.txt"
    "%PY%" -m pip install -r "%~dp0backend\requirements.txt" --quiet --no-progress-bar --no-warn-script-location >> "%~dp0ABRIR_LOG.txt" 2>&1
    if errorlevel 1 (
        echo ERROR al instalar dependencias >> "%~dp0ABRIR_LOG.txt"
        echo ERROR al instalar dependencias. Revisa ABRIR_LOG.txt
        pause
        exit /b 1
    )
    echo Dependencias OK >> "%~dp0ABRIR_LOG.txt"
)

if not exist "%~dp0models\yolov8n_coco.onnx" (
    if not exist "%~dp0models\cattle.onnx" (
        echo [4/4] Descargando modelo...
        "%PY%" "%~dp0scripts\download_placeholder.py" >> "%~dp0ABRIR_LOG.txt" 2>&1
    )
)

echo Arrancando servidor... >> "%~dp0ABRIR_LOG.txt"
echo.
echo Todo listo. Abriendo la app...
echo Para cerrar: cerrar esta ventana.
echo.
start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:8000"
cd /d "%~dp0backend"
"%UVI%" main:app --port 8000
pause
