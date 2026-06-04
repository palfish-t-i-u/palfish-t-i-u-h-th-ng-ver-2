@echo off
chcp 65001 >nul
title PalFish GMV — Clean Test Data

cd /d "E:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2"

if not exist "backend\.env" (
    echo.
    echo [ERROR] Chua co file backend\.env
    echo   Copy tu thu muc goc:
    echo     copy ..\backend\.env backend\.env
    echo.
    pause
    exit /b 1
)

echo.
python backend\scripts\clean_test_data.py --apply

echo.
pause
