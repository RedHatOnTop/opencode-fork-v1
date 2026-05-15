# opencode-fork-v1 PowerShell Installer
# One-liner for friends:
# irm https://raw.githubusercontent.com/RedHatOnTop/opencode-fork-v1/dev/install.ps1 | iex

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/RedHatOnTop/opencode-fork-v1"
$Branch = "dev"
$InstallDir = "$env:USERPROFILE\.opencode-fork"
$BinName = "opencode.exe"

function Write-Step($msg) {
    Write-Host "`n[*] $msg" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "[+] $msg" -ForegroundColor Green
}

function Write-Err($msg) {
    Write-Host "[!] $msg" -ForegroundColor Red
}

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# ── Banner ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║     opencode-fork-v1 Installer (Windows)  ║" -ForegroundColor Magenta
Write-Host "  ╚═══════════════════════════════════════════╝" -ForegroundColor Magenta

# ── 1. Check / Install Bun ─────────────────────────────────────────────
Write-Step "Checking for Bun runtime..."

if (Test-Command "bun") {
    $bunVer = bun --version 2>$null
    Write-Success "Bun $bunVer found."
} else {
    Write-Step "Bun not found. Installing Bun..."
    try {
        irm bun.sh/install.ps1 | iex
        # Refresh PATH for current session
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        if (-not (Test-Command "bun")) {
            # Try common install location
            $bunPath = "$env:USERPROFILE\.bun\bin"
            if (Test-Path $bunPath) {
                $env:Path += ";$bunPath"
            }
        }
        if (Test-Command "bun") {
            Write-Success "Bun installed successfully."
        } else {
            Write-Err "Bun installation may have failed. Please restart your terminal and try again."
            Write-Err "You can manually install Bun from https://bun.sh"
            exit 1
        }
    } catch {
        Write-Err "Failed to install Bun: $_"
        Write-Err "Please install Bun manually from https://bun.sh and re-run this script."
        exit 1
    }
}

# ── 2. Check for Git ───────────────────────────────────────────────────
Write-Step "Checking for Git..."

if (-not (Test-Command "git")) {
    Write-Err "Git is not installed. Please install Git from https://git-scm.com and re-run."
    exit 1
}
Write-Success "Git found."

# ── 3. Clone or Update Repository ──────────────────────────────────────
Write-Step "Setting up repository at $InstallDir..."

if (Test-Path "$InstallDir\.git") {
    Write-Step "Existing installation found. Pulling latest changes..."
    Push-Location $InstallDir
    try {
        git fetch origin $Branch
        git reset --hard "origin/$Branch"
        Write-Success "Repository updated."
    } catch {
        Write-Err "Failed to update repository: $_"
        Write-Host "    Consider removing $InstallDir and re-running."
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    # Remove stale directory if it exists
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
    }

    Write-Step "Cloning repository (branch: $Branch)..."
    try {
        git clone --depth 1 --branch $Branch $RepoUrl $InstallDir
        Write-Success "Repository cloned."
    } catch {
        Write-Err "Failed to clone repository: $_"
        exit 1
    }
}

# ── 4. Install Dependencies ────────────────────────────────────────────
Write-Step "Installing dependencies..."
Push-Location $InstallDir
try {
    bun install
    Write-Success "Dependencies installed."
} catch {
    Write-Err "Failed to install dependencies: $_"
    Pop-Location
    exit 1
}

# ── 5. Build CLI Binary ────────────────────────────────────────────────
Write-Step "Building opencode CLI..."
try {
    Push-Location "packages\opencode"
    bun run build
    Pop-Location
    Write-Success "Build complete."
} catch {
    Write-Err "Failed to build: $_"
    Pop-Location
    exit 1
}

# ── 6. Add to PATH ─────────────────────────────────────────────────────
Write-Step "Adding opencode to PATH..."

$BinDir = "$InstallDir\packages\opencode\bin"
$BinPath = "$BinDir\$BinName"

if (-not (Test-Path $BinPath)) {
    # The build may produce a different binary name; check for it
    $possibleBin = Get-ChildItem -Path "$InstallDir\packages\opencode" -Filter "opencode*" -Recurse -File |
        Where-Object { $_.DirectoryName -like "*bin*" -or $_.Name -like "opencode.exe" } |
        Select-Object -First 1

    if ($possibleBin) {
        $BinPath = $possibleBin.FullName
        $BinDir = $possibleBin.DirectoryName
    } else {
        Write-Err "Could not find built binary. Check the build output above."
        Pop-Location
        exit 1
    }
}

# Create a shim directory in user's local bin
$ShimDir = "$env:USERPROFILE\.local\bin"
if (-not (Test-Path $ShimDir)) {
    New-Item -ItemType Directory -Path $ShimDir -Force | Out-Null
}

# Create a batch shim that forwards to the real binary
$ShimPath = "$ShimDir\opencode-fork.bat"
@"
@echo off
"$BinPath" %*
"@ | Set-Content -Path $ShimPath -Force

Write-Success "Shim created at $ShimPath"

# Add shim dir to user PATH if not already there
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$ShimDir*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$userPath;$ShimDir", "User")
    $env:Path += ";$ShimDir"
    Write-Success "Added $ShimDir to user PATH."
} else {
    Write-Success "$ShimDir already in PATH."
}

Pop-Location

# ── 7. Success ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║          Installation Complete!            ║" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Usage:" -ForegroundColor Yellow
Write-Host "    opencode-fork          # Start opencode" -ForegroundColor White
Write-Host "    opencode-fork --help   # Show help" -ForegroundColor White
Write-Host ""
Write-Host "  Config location: $env:USERPROFILE\.opencode\config.json" -ForegroundColor DarkGray
Write-Host "  Install location: $InstallDir" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  NOTE: Restart your terminal for PATH changes to take effect." -ForegroundColor Yellow
Write-Host ""
