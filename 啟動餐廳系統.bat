@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在啟動餐廳系統(網頁重製版)...

rem 找 Python(python 或 py 都可以)
where python >nul 2>&1
if %errorlevel%==0 (set PYCMD=python) else (
  where py >nul 2>&1
  if %errorlevel%==0 (set PYCMD=py) else (
    echo 找不到 Python,請先安裝 Python 後再執行。
    pause
    goto :eof
  )
)

rem 若 8137 已被占用(伺服器已在跑),只開瀏覽器
powershell -NoProfile -Command "try{Invoke-WebRequest -Uri http://localhost:8137/ -UseBasicParsing -TimeoutSec 2|Out-Null;exit 0}catch{exit 1}" >nul 2>&1
if %errorlevel%==0 (
  echo 伺服器已在執行,直接開啟瀏覽器。
  start "" http://localhost:8137/
  goto :eof
)

echo 請勿關閉此視窗。瀏覽器將自動開啟 http://localhost:8137/
start "" http://localhost:8137/
%PYCMD% server.py 8137
pause
