# Membuat ikon PWA untuk WA HD - Status Quality
# Konsep: gradien hijau + cincin status putih + huruf "HD" (font Plus Jakarta Sans)
# Jalankan: powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-icons.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Font khusus untuk teks ikon (diunduh oleh tools\fetch-fonts.mjs)
$script:fontFamily = $null
$ttf = Join-Path $PSScriptRoot 'PlusJakartaSans-ExtraBold.ttf'
if (Test-Path $ttf) {
  $pfc = New-Object System.Drawing.Text.PrivateFontCollection
  $pfc.AddFontFile($ttf)
  $script:fontFamily = $pfc.Families[0]
  Write-Host ("Ikon memakai font: " + $script:fontFamily.Name)
} else {
  Write-Host "TTF tidak ditemukan - ikon memakai Segoe UI Bold"
}

function New-RoundPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Draw-Icon([int]$size, [string]$outPath, [bool]$fullBleed, [double]$scale) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  # Latar gradien hijau segar (diagonal)
  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $c1 = [System.Drawing.Color]::FromArgb(255, 0x35, 0xDB, 0x72)
  $c2 = [System.Drawing.Color]::FromArgb(255, 0x0C, 0x9A, 0x4F)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, [float]45)
  if ($fullBleed) {
    $g.FillRectangle($grad, $rect)
  } else {
    $rp = New-RoundPath 0 0 ($size - 1) ($size - 1) ([Math]::Round($size * 0.235))
    $g.FillPath($grad, $rp)
    $rp.Dispose()
  }
  $grad.Dispose()

  $cx = [single]($size / 2)
  $cy = [single]($size / 2)

  # Cincin status putih (metafora "Status" ala story)
  $ringR = [single]($size * 0.345 * $scale)
  $ringW = [single]([Math]::Max(2, $size * 0.042 * $scale))
  $ringPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(232, 255, 255, 255)), $ringW
  $g.DrawEllipse($ringPen, ($cx - $ringR), ($cy - $ringR), ($ringR * 2), ($ringR * 2))
  $ringPen.Dispose()

  # Teks "HD" putih di tengah cincin, dipaskan ke lebar target
  if ($script:fontFamily) {
    $trial = New-Object System.Drawing.Font($script:fontFamily, [float]100, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  } else {
    $trial = New-Object System.Drawing.Font('Segoe UI', [float]100, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  }
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $msz = $g.MeasureString('HD', $trial, [System.Drawing.PointF]::Empty, $fmt)
  $targetW = $size * 0.40 * $scale
  $fontPx = [Math]::Min(100 * $targetW / $msz.Width, $size * 0.27 * $scale)
  $trial.Dispose()
  if ($script:fontFamily) {
    $font = New-Object System.Drawing.Font($script:fontFamily, [float]$fontPx, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  } else {
    $font = New-Object System.Drawing.Font('Segoe UI', [float]$fontPx, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  }
  $white = [System.Drawing.Brushes]::White
  $tr = New-Object System.Drawing.RectangleF([float]0, [float](-$size * 0.01), [float]$size, [float]$size)
  $g.DrawString('HD', $font, $white, $tr, $fmt)
  $font.Dispose(); $fmt.Dispose()

  $g.Dispose()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "OK  $outPath ($size px)"
}

Draw-Icon 192 (Join-Path $outDir 'icon-192.png') $false 1.0
Draw-Icon 512 (Join-Path $outDir 'icon-512.png') $false 1.0
Draw-Icon 512 (Join-Path $outDir 'maskable-512.png') $true 0.62
Draw-Icon 180 (Join-Path $outDir 'apple-touch-icon.png') $true 0.85
Write-Host 'Selesai. Semua ikon dibuat.'
