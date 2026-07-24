param(
  [string]$Source = "assets/android-icon-background.png",
  [string]$BackgroundColor = "#faf9f6"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function Convert-HexColor {
  param([string]$Hex)

  $value = $Hex.TrimStart("#")
  if ($value.Length -ne 6) {
    throw "Expected a 6 character hex color, got '$Hex'."
  }

  return [System.Drawing.Color]::FromArgb(
    [Convert]::ToInt32($value.Substring(0, 2), 16),
    [Convert]::ToInt32($value.Substring(2, 2), 16),
    [Convert]::ToInt32($value.Substring(4, 2), 16)
  )
}

function Save-InsetPng {
  param(
    [System.Drawing.Image]$SourceImage,
    [string]$Output,
    [int]$Size,
    [double]$Scale,
    [AllowNull()][object]$Fill
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    if ($null -ne $Fill) {
      $graphics.Clear([System.Drawing.Color]$Fill)
    } else {
      $graphics.Clear([System.Drawing.Color]::Transparent)
    }

    $innerSize = [int][Math]::Round($Size * $Scale)
    $offset = [int][Math]::Round(($Size - $innerSize) / 2)
    $dest = New-Object System.Drawing.Rectangle($offset, $offset, $innerSize, $innerSize)
    $graphics.DrawImage($SourceImage, $dest)
  } finally {
    $graphics.Dispose()
  }

  $fullPath = Join-Path (Get-Location) $Output
  $directory = Split-Path $fullPath -Parent
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }

  try {
    $bitmap.Save($fullPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }
}

function Save-ScaledPng {
  param(
    [System.Drawing.Image]$SourceImage,
    [string]$Output,
    [int]$Size,
    [double]$Scale,
    [AllowNull()][object]$Fill
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    if ($null -ne $Fill) {
      $graphics.Clear([System.Drawing.Color]$Fill)
    } else {
      $graphics.Clear([System.Drawing.Color]::Transparent)
    }

    $ratio = [Math]::Min($Size / $SourceImage.Width, $Size / $SourceImage.Height)
    $innerWidth = [int][Math]::Round($SourceImage.Width * $ratio * $Scale)
    $innerHeight = [int][Math]::Round($SourceImage.Height * $ratio * $Scale)
    $offsetX = [int][Math]::Round(($Size - $innerWidth) / 2)
    $offsetY = [int][Math]::Round(($Size - $innerHeight) / 2)
    $dest = New-Object System.Drawing.Rectangle($offsetX, $offsetY, $innerWidth, $innerHeight)
    $graphics.DrawImage($SourceImage, $dest)
  } finally {
    $graphics.Dispose()
  }

  $fullPath = Join-Path (Get-Location) $Output
  $directory = Split-Path $fullPath -Parent
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }

  try {
    $bitmap.Save($fullPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }
}

$sourcePath = Resolve-Path $Source
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$background = Convert-HexColor $BackgroundColor

try {
  Save-InsetPng -SourceImage $sourceImage -Output "assets/icon.png" -Size 1024 -Scale 0.84 -Fill $background
  Save-InsetPng -SourceImage $sourceImage -Output "assets/splash-icon.png" -Size 1024 -Scale 0.88 -Fill $null
  Save-InsetPng -SourceImage $sourceImage -Output "assets/android-icon-foreground.png" -Size 1024 -Scale 0.78 -Fill $null

  $androidIconSizes = @{
    "mdpi" = 108
    "hdpi" = 162
    "xhdpi" = 216
    "xxhdpi" = 324
    "xxxhdpi" = 432
  }
  foreach ($entry in $androidIconSizes.GetEnumerator()) {
    $density = $entry.Key
    $size = [int]$entry.Value
    Save-ScaledPng -SourceImage $sourceImage -Output "android/app/src/main/res/mipmap-$density/ic_launcher.png" -Size $size -Scale 0.84 -Fill $background
    Save-ScaledPng -SourceImage $sourceImage -Output "android/app/src/main/res/mipmap-$density/ic_launcher_round.png" -Size $size -Scale 0.84 -Fill $background
    Save-ScaledPng -SourceImage $sourceImage -Output "android/app/src/main/res/mipmap-$density/ic_launcher_foreground.png" -Size $size -Scale 0.78 -Fill $null
    $legacyIcon = Join-Path (Get-Location) "android/app/src/main/res/mipmap-$density/ic_launcher.webp"
    $legacyRound = Join-Path (Get-Location) "android/app/src/main/res/mipmap-$density/ic_launcher_round.webp"
    $legacyBackground = Join-Path (Get-Location) "android/app/src/main/res/mipmap-$density/ic_launcher_background.webp"
    $legacyMono = Join-Path (Get-Location) "android/app/src/main/res/mipmap-$density/ic_launcher_monochrome.webp"
    $legacyForeground = Join-Path (Get-Location) "android/app/src/main/res/mipmap-$density/ic_launcher_foreground.webp"
    if (Test-Path $legacyIcon) { Remove-Item $legacyIcon -Force }
    if (Test-Path $legacyRound) { Remove-Item $legacyRound -Force }
    if (Test-Path $legacyBackground) { Remove-Item $legacyBackground -Force }
    if (Test-Path $legacyMono) { Remove-Item $legacyMono -Force }
    if (Test-Path $legacyForeground) { Remove-Item $legacyForeground -Force }
  }

  $splashSizes = @{
    "mdpi" = 288
    "hdpi" = 432
    "xhdpi" = 576
    "xxhdpi" = 864
    "xxxhdpi" = 1152
  }
  foreach ($entry in $splashSizes.GetEnumerator()) {
    $density = $entry.Key
    $size = [int]$entry.Value
    Save-ScaledPng -SourceImage $sourceImage -Output "android/app/src/main/res/drawable-$density/splashscreen_logo.png" -Size $size -Scale 0.88 -Fill $null
  }
} finally {
  $sourceImage.Dispose()
}

Write-Output "Generated app assets and Android resource PNGs from $Source."
