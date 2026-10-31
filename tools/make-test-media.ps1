# Membuat foto uji (3200x1800, detail halus) untuk menguji aplikasi
# Jalankan: powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-test-media.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root 'test-photo.jpg'

$w = 3200; $h = 1800
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $rect,
  [System.Drawing.Color]::FromArgb(255, 255, 138, 101),
  [System.Drawing.Color]::FromArgb(255, 58, 123, 213),
  [float]45)
$g.FillRectangle($grad, $rect)

# Lingkaran dekoratif
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 255, 255, 255)), 6
for ($i = 0; $i -lt 8; $i++) {
  $g.DrawEllipse($pen, (200 + $i * 340), (1250 + ($i % 3) * 60), 220, 220)
}
$pen.Dispose()

# Baris teks halus untuk menguji ketajaman
$font = New-Object System.Drawing.Font('Consolas', 42)
$white = [System.Drawing.Brushes]::White
for ($i = 0; $i -lt 10; $i++) {
  $g.DrawString("WA HD sharpness test $i - 0123456789 ABCDEFGHIJ", $font, $white, 80, (80 + $i * 120))
}
$font.Dispose()

# Simpan JPEG kualitas 95
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]95)
$bmp.Save($outPath, $codec, $ep)
$ep.Dispose(); $grad.Dispose(); $g.Dispose(); $bmp.Dispose()
Write-Host "OK  $outPath"
