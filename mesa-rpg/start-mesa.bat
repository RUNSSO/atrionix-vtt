@echo off
REM Vai para a pasta do projeto
cd /d "%~dp0"

REM Inicia o servidor Node em segundo plano
start "" cmd /k "node server.js"

REM Aguarda 1 segundo para o servidor iniciar
timeout /t 1 > nul

REM Abre o navegador padrão na URL correta
start "" "http://localhost:3000"

REM Fecha este terminal
exit
