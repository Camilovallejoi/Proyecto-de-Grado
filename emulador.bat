@echo off
rem Abre el emulador Android con una ventana pequena que cabe en la pantalla.
rem El emulador reescribe el tamano de su ventana al cerrarse, por eso se fija de nuevo antes de cada arranque.
set "AVD=%USERPROFILE%\.android\avd\Medium_Phone.avd"

tasklist | find /i "qemu-system" >nul && (
  echo Ya hay un emulador abierto. Cierralo desde su ventana antes de abrir otro.
  exit /b 1
)

attrib -R "%AVD%\emulator-user.ini" >nul 2>&1
(
  echo window.x = 60
  echo window.y = 20
  echo window.scale = 0.30
  echo resizable.config.id = -1
  echo posture = 0
) > "%AVD%\emulator-user.ini"
attrib +R "%AVD%\emulator-user.ini" >nul 2>&1

start "" "%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone_API_37.0 -gpu host
echo Abriendo el emulador. Espera 1 o 2 minutos hasta ver la pantalla de inicio del telefono.
