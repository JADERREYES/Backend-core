$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $root "pdf"

if (-not (Get-Command pandoc -ErrorAction SilentlyContinue)) {
  throw "Pandoc no esta instalado o no esta disponible en PATH."
}

if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$markdownFiles = Get-ChildItem -Path $root -Filter *.md |
  Where-Object { $_.Name -ne "README.md" }

foreach ($file in $markdownFiles) {
  $pdfPath = Join-Path $outputDir ($file.BaseName + ".pdf")
  Write-Host "Convirtiendo $($file.Name) -> $pdfPath"
  pandoc $file.FullName -o $pdfPath
}

Write-Host "Conversion finalizada. PDFs generados en $outputDir"
