@echo off
set OPENCODE_DEV_CWD=%cd%
bun run --cwd packages\opencode dev %*
