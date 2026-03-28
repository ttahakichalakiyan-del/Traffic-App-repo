@echo off
REM Build CmdStan 2.33.1 with MSVC toolchain for Prophet
REM Run from: C:\Traffic App\apps\ml-engine\

SET VCVARS="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
SET CMDSTAN="C:\Traffic App\apps\ml-engine\venv\Lib\site-packages\prophet\stan_model\cmdstan-2.33.1"
SET USERBIN=C:\Users\ART\bin

echo === Setting up MSVC x64 environment ===
call %VCVARS% x64
if errorlevel 1 (
    echo ERROR: vcvarsall.bat failed
    exit /b 1
)

echo === MSVC environment ready ===
cl.exe 2>&1 | findstr "Version"

echo === Adding GNU make to PATH ===
SET PATH=%USERBIN%;%PATH%
mingw32-make --version | findstr "GNU Make"

echo === Building CmdStan 2.33.1 ===
cd /d %CMDSTAN%
mingw32-make build -j1
if errorlevel 1 (
    echo ERROR: CmdStan build failed with error %errorlevel%
    exit /b 1
)

echo === CmdStan build COMPLETE ===
dir bin\*.exe 2>nul
