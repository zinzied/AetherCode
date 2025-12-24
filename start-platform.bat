@echo off
echo Starting AetherCode Platform...
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed! Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Install backend dependencies
echo Installing backend dependencies...
cd backend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Error: Failed to install backend dependencies!
    pause
    exit /b 1
)

REM Install frontend dependencies
echo Installing frontend dependencies...
cd ../frontend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Error: Failed to install frontend dependencies!
    pause
    exit /b 1
)

REM Start backend and frontend in parallel
echo Starting servers...
echo.
echo The platform will be available at:
echo Frontend: http://localhost:5173
echo Backend: http://localhost:3001
echo.
echo Press Ctrl+C to stop the servers
echo.

start cmd /k "cd ../backend && npm run dev"
start cmd /k "cd ../frontend && npm run dev"

REM Wait for frontend to start and open browser
timeout /t 5 >nul
explorer "http://localhost:5173"
