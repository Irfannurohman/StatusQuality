# Membuat ikon PWA dari logo sumber (tools\logo-source.png)
# Jalankan: powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-icons-from-logo.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$srcPath = Join-Path $PSScriptRoot 'logo-source.png'
$src = [System.Drawing.Image]::FromFile($srcPath)
Write-Host ("Logo sumber: " + $src.Width + "x" + $src.Height)

function Resize-Icon([int]$size, [string]$outPath, [double]$zoom) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  # Gambar sumber persegi, di-zoom terpusat sesuai $zoom
  $drawSize = [single]($size * $zoom)
  $off = [single](($size - $drawSize) / 2)
  $dstRect = New-Object System.Drawing.RectangleF([single]$off, [single]$off, [single]$drawSize, [single]$drawSize)
  $g.DrawImage($src, $dstRect)
  $g.Dispose()

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "OK  $outPath ($size px, zoom $zoom)"
}

# Ikon standar: apa adanya (sudah memuat sudut membulat + glow)
Resize-Icon 512 (Join-Path $outDir 'icon-512.png') 1.0
Resize-Icon 192 (Join-Path $outDir 'icon-192.png') 1.0
# Maskable & apple-touch: diperbesar agar persegi penuh menutup kanvas (zona aman masker)
Resize-Icon 512 (Join-Path $outDir 'maskable-512.png') 1.16
Resize-Icon 180 (Join-Path $outDir 'apple-touch-icon.png') 1.16

$src.Dispose()
Write-Host 'Selesai. Semua ikon dibuat dari logo sumber.'
