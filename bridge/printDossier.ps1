param(
  [Parameter(Mandatory=$true)][string]$ImagePath,
  [string]$Printer = 'PM-241'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
try {
  $img = [System.Drawing.Image]::FromFile($ImagePath)
  $pd = New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName = $Printer
  if(-not $pd.PrinterSettings.IsValid){ throw "printer '$Printer' not valid" }
  $pd.DocumentName = 'STOMACK Dossier'
  $pd.OriginAtMargins = $false
  $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
  $pd.add_PrintPage({
    param($s,$e)
    $pb = $e.PageBounds
    $iw = $img.Width; $ih = $img.Height
    # fit image to the page width, preserve aspect ratio
    $scale = [double]$pb.Width / [double]$iw
    $w = [int]([Math]::Floor($iw * $scale))
    $h = [int]([Math]::Floor($ih * $scale))
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.DrawImage($img, 0, 0, $w, $h)
    $e.HasMorePages = $false
  })
  $pd.Print()
  $img.Dispose()
  Write-Output "PRINTED OK -> $Printer"
} catch {
  Write-Output ("PRINT ERROR: " + $_.Exception.Message)
  exit 1
}
