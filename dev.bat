@echo off
setlocal
rem DocuLight 2.0 dev launcher. Starts the API (Express) and web (Vite) together.
rem
rem This file only locates the repository root and hands off to scripts\dev.mjs,
rem where all the logic lives. See that file for why.
rem
rem Press Ctrl+C to stop; both processes and their children are cleaned up.
rem
rem ASCII only below. cmd reads a .bat with the console codepage, so non-ASCII
rem bytes here get mangled -- measured 2026-09-04: a probe batch with Korean in
rem it had those bytes leak out of their line and run as commands.

rem Switch the console to UTF-8 so the Korean text node writes stays readable,
rem then put it back -- the codepage belongs to the console, not to us.
rem
rem Whether this is needed at all is UNMEASURED: node may write straight to the
rem Windows console in Unicode regardless of the codepage, and this session had
rem no real TTY to settle it. Kept because the safe direction is to keep it.
rem Note that `npm run dev:all` does NOT do this -- on Windows prefer dev.bat.
rem
rem Ctrl+C answered with Y at cmd's "Terminate batch job?" prompt skips the
rem restore below. Run `chcp 949` yourself if the console looks wrong after.
set "DL_OLDCP="
for /f "tokens=2 delims=:" %%c in ('chcp') do for /f "tokens=1" %%d in ("%%c") do set "DL_OLDCP=%%d"
chcp 65001 > nul

node "%~dp0scripts\dev.mjs" %*
set "DL_EXIT=%errorlevel%"

if defined DL_OLDCP chcp %DL_OLDCP% > nul
endlocal & exit /b %DL_EXIT%
