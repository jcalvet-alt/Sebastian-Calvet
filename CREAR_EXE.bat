@echo off
echo ================================================
echo  Generador del ejecutable - Posicion NK
echo ================================================
echo.

REM Instalar PyInstaller si no esta instalado
pip install pyinstaller --quiet
if errorlevel 1 (
    echo ERROR: No se pudo instalar PyInstaller.
    echo Asegurate de tener Python instalado: https://python.org
    pause
    exit /b 1
)

echo Generando PosicionNK.exe ... (puede tardar 1-2 minutos)
echo.

pyinstaller --onefile --windowed --name "PosicionNK" lanzador.py

if errorlevel 1 (
    echo.
    echo ERROR al generar el ejecutable.
    pause
    exit /b 1
)

echo.
echo ================================================
echo  Listo! El archivo PosicionNK.exe esta en:
echo  dist\PosicionNK.exe
echo ================================================
echo.
pause
