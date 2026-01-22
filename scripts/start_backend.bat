@echo off
setlocal

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%.."

if not exist backend\ (
    echo [EROARE] Directorul backend/ nu a fost gasit.
    goto :error
)

set VENV_PATH=backend\.venv
set REQUIREMENTS_FILE=backend\requirements.txt
set MARKER_FILE=%VENV_PATH%\.deps_installed

if not exist %VENV_PATH%\Scripts\activate.bat (
    echo [INFO] Creez mediu virtual backend\.venv...
    python -m venv %VENV_PATH%
    if errorlevel 1 goto :error
)

call %VENV_PATH%\Scripts\activate.bat
if errorlevel 1 goto :error

if not exist "%MARKER_FILE%" (
    echo [INFO] Instalez dependintele pentru prima data...
    pip install -r %REQUIREMENTS_FILE%
    if errorlevel 1 goto :error
    echo done > "%MARKER_FILE%"
)

echo [INFO] Pornesc serverul FastAPI pe http://localhost:8000 ...
uvicorn backend.app:app --reload

goto :end

:error
echo.
echo [EROARE] Initializarea backend-ului a esuat.
popd
exit /b 1

:end
popd
endlocal
