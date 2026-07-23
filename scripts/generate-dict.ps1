$ErrorActionPreference = "Stop"

$ProjectDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$Output = Join-Path $ProjectDir "assets\dictionary\dict-data.json"
$TmpDir = Join-Path $ProjectDir ".dict-tmp"
$YimVersion = "23.8.21.0"
$YimUrl = "https://github.com/Chalkim/yomichan-import/releases/download/$YimVersion/yomichan-import_windows.zip"

function Find-EpwingRoot {
  $excludedRoots = @(".dict-tmp", ".expo", ".git", "android", "node_modules")
  $searchRoots = Get-ChildItem -LiteralPath $ProjectDir -Directory -Force |
    Where-Object { $excludedRoots -notcontains $_.Name }

  $startFiles = foreach ($root in $searchRoots) {
    Get-ChildItem -LiteralPath $root.FullName -Recurse -Filter "START.ebz" -File -ErrorAction SilentlyContinue
  }

  foreach ($start in $startFiles) {
    $candidate = $start.Directory.Parent
    if ($null -eq $candidate) { continue }

    $catalog = Join-Path $candidate.FullName "CATALOGS.ebz"
    $honmon = Get-ChildItem -LiteralPath $candidate.FullName -Recurse -Filter "HONMON.ebz" -File |
      Select-Object -First 1

    if ((Test-Path -LiteralPath $catalog) -and $honmon) {
      return $candidate.FullName
    }
  }

  throw "EPWING source not found. Expected a directory containing CATALOGS.ebz, START.ebz, and HONMON.ebz."
}

Write-Host "=== Step 1: Locate EPWING source ==="
$EpwingDir = Find-EpwingRoot
Write-Host "EPWING: $EpwingDir"

Write-Host ""
Write-Host "=== Step 2: Download yomichan-import ==="
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null
$ZipDownload = Join-Path $TmpDir "yomichan-import.zip"
$YimExe = Get-ChildItem -LiteralPath $TmpDir -Recurse -Filter "yomichan.exe" -File -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (-not $YimExe) {
  curl.exe -L -o $ZipDownload $YimUrl
  tar.exe -xf $ZipDownload -C $TmpDir
  $YimExe = Get-ChildItem -LiteralPath $TmpDir -Recurse -Filter "yomichan.exe" -File |
    Select-Object -First 1
}

if (-not $YimExe) {
  throw "yomichan.exe was not found after extracting yomichan-import."
}

Write-Host "yomichan-import: $($YimExe.FullName)"

Write-Host ""
Write-Host "=== Step 3: Convert EPWING to Yomichan zip ==="
$YomichanZip = Join-Path $TmpDir "shogakukan-yomichan.zip"
if (Test-Path -LiteralPath $YomichanZip) {
  Remove-Item -LiteralPath $YomichanZip -Force
}
& $YimExe.FullName -format epwing -title "Shogakukan" $EpwingDir $YomichanZip

if (-not (Test-Path -LiteralPath $YomichanZip)) {
  throw "Yomichan zip was not created: $YomichanZip"
}

Write-Host ""
Write-Host "=== Step 4: Convert to JaReader JSON ==="
$Converter = Join-Path $PSScriptRoot "convert-yomichan-dict.py"
python $Converter $YomichanZip $Output

$Count = node -e "const fs=require('fs'); const a=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(a.length)" $Output
$Size = "{0:N1}" -f ((Get-Item -LiteralPath $Output).Length / 1MB)
Write-Host ""
Write-Host "Dictionary generated: $Output"
Write-Host "Entries: $Count"
Write-Host "Size: $Size MB"

if ([int]$Count -lt 50000) {
  throw "Generated dictionary looks too small ($Count entries). Keeping files for inspection in $TmpDir"
}
