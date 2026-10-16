# Run from any directory with Windows PowerShell. Preserves the supplied artwork.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Split-Path -Parent $projectRoot
$iconDirectory = Join-Path $projectRoot 'public/icons'
$brandingDirectory = Join-Path $projectRoot 'public/branding'
New-Item -ItemType Directory -Force -Path $iconDirectory, $brandingDirectory | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'logotipo vida horizontal.png') -Destination (Join-Path $brandingDirectory 'vida-horizontal.png')
$sourceIcon = [System.Drawing.Image]::FromFile((Join-Path $sourceRoot 'logo pwa icon.png'))
try {
    $variants = @(
        @{ Name = 'icon-192.png'; Size = 192; Scale = 1.0 },
        @{ Name = 'icon-512.png'; Size = 512; Scale = 1.0 },
        @{ Name = 'apple-touch-icon.png'; Size = 180; Scale = 1.0 },
        @{ Name = 'icon-maskable-512.png'; Size = 512; Scale = 0.8 }
    )
    foreach ($variant in $variants) {
        $size = $variant.Size
        $canvas = [System.Drawing.Bitmap]::new($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($canvas)
        try {
            $graphics.Clear([System.Drawing.Color]::White)
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $ratio = $size * $variant.Scale / [Math]::Max($sourceIcon.Width, $sourceIcon.Height)
            $width = [int][Math]::Round($sourceIcon.Width * $ratio)
            $height = [int][Math]::Round($sourceIcon.Height * $ratio)
            $bounds = [System.Drawing.Rectangle]::new([int](($size - $width) / 2), [int](($size - $height) / 2), $width, $height)
            $graphics.DrawImage($sourceIcon, $bounds)
            $canvas.Save((Join-Path $iconDirectory $variant.Name), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $canvas.Dispose()
        }
    }
} finally {
    $sourceIcon.Dispose()
}
Write-Output 'Logotipo horizontal e icones PWA atualizados em public/.'
