@echo off
setlocal

REM Generate JaReader's bundled dictionary from the local Shogakukan v3 MDX.

python "%~dp0convert-mdx-dict.py" --output "%~dp0..\assets\dictionary\dict-data.json"
exit /b %ERRORLEVEL%
