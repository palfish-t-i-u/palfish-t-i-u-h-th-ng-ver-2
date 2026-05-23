# Chay backend PalFish GMV (Windows) — Miniconda Python
Set-Location $PSScriptRoot
$python  = "C:\Users\ductd\miniconda3\python.exe"
$envFile = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: Khong tim thay backend/.env"
    Write-Host "  Chay: Copy-Item .env.example .env  roi dien SUPABASE_SERVICE_ROLE_KEY"
    exit 1
}

# Load tung bien tu .env vao process hien tai (fix uvicorn --reload tren Windows)
Write-Host "Loading .env ..."
Get-Content $envFile | Where-Object { $_ -match "^[^#\s].+=." } | ForEach-Object {
    $parts = $_ -split "=", 2
    $k = $parts[0].Trim()
    $v = $parts[1].Trim()
    [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
    Write-Host "  SET $k"
}

$url = [System.Environment]::GetEnvironmentVariable("SUPABASE_URL", "Process")
$key = [System.Environment]::GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY", "Process")

if (-not $url -or -not $key -or $key -eq "YOUR_SERVICE_ROLE_KEY") {
    Write-Host "ERROR: SUPABASE_SERVICE_ROLE_KEY chua duoc dien vao .env"
    exit 1
}

Write-Host ""
Write-Host "OK — SUPABASE_URL : $url"
Write-Host "OK — KEY length   : $($key.Length)"
Write-Host ""
Write-Host "Starting http://127.0.0.1:8000 ..."
& $python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
