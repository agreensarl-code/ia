@echo off
echo [1/4] Compilation du Frontend...
cd client
call npm run build
if %errorlevel% neq 0 (
    echo Erreur lors du build frontend.
    pause
    exit /b %errorlevel%
)
cd ..

echo [2/4] Nettoyage de l'ancienne version...
if exist server\dist rd /s /q server\dist

echo [3/4] Copie du build vers le serveur...
xcopy /s /e /i client\dist server\dist

echo [4/4] Finalisation...
echo.
echo ======================================================
echo LE DOSSIER 'server' EST PRET POUR OVH !
echo.
echo Contenu du dossier a envoyer :
echo - index.js
echo - package.json
echo - /services
echo - /dist (Frontend inclus)
echo - .env (N'oubliez pas de le configurer sur le serveur)
echo ======================================================
pause
