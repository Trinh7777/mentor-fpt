@echo off
chcp 65001 >nul
echo ============================================================
echo   UNIFS PRO 2.0 - FPT UNIVERSITY AI ACADEMIC ECOSYSTEM
echo ============================================================
if exist "venv\Scripts\python.exe" (
    venv\Scripts\python.exe run.py
) else (
    python run.py
)
pause
