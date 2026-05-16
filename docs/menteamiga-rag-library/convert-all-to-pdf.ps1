$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $root "pdf"
$tempHtmlDir = Join-Path $root ".tmp-html"
$browserProfileDir = Join-Path $root ".tmp-browser-profile"

function Convert-MarkdownToSimpleHtml {
  param(
    [string]$MarkdownPath,
    [string]$HtmlPath
  )

  $lines = Get-Content -Path $MarkdownPath
  $htmlLines = New-Object System.Collections.Generic.List[string]
  $inList = $false
  $inParagraph = $false

  foreach ($rawLine in $lines) {
    $line = $rawLine.TrimEnd()

    if ([string]::IsNullOrWhiteSpace($line)) {
      if ($inParagraph) {
        $htmlLines.Add("</p>")
        $inParagraph = $false
      }
      if ($inList) {
        $htmlLines.Add("</ul>")
        $inList = $false
      }
      continue
    }

    if ($line.StartsWith("# ")) {
      if ($inParagraph) { $htmlLines.Add("</p>"); $inParagraph = $false }
      if ($inList) { $htmlLines.Add("</ul>"); $inList = $false }
      $content = [System.Net.WebUtility]::HtmlEncode($line.Substring(2))
      $htmlLines.Add("<h1>$content</h1>")
      continue
    }

    if ($line.StartsWith("## ")) {
      if ($inParagraph) { $htmlLines.Add("</p>"); $inParagraph = $false }
      if ($inList) { $htmlLines.Add("</ul>"); $inList = $false }
      $content = [System.Net.WebUtility]::HtmlEncode($line.Substring(3))
      $htmlLines.Add("<h2>$content</h2>")
      continue
    }

    if ($line.StartsWith("### ")) {
      if ($inParagraph) { $htmlLines.Add("</p>"); $inParagraph = $false }
      if ($inList) { $htmlLines.Add("</ul>"); $inList = $false }
      $content = [System.Net.WebUtility]::HtmlEncode($line.Substring(4))
      $htmlLines.Add("<h3>$content</h3>")
      continue
    }

    if ($line.StartsWith("- ")) {
      if ($inParagraph) {
        $htmlLines.Add("</p>")
        $inParagraph = $false
      }
      if (-not $inList) {
        $htmlLines.Add("<ul>")
        $inList = $true
      }
      $content = [System.Net.WebUtility]::HtmlEncode($line.Substring(2))
      $htmlLines.Add("<li>$content</li>")
      continue
    }

    if ($inList) {
      $htmlLines.Add("</ul>")
      $inList = $false
    }

    $content = [System.Net.WebUtility]::HtmlEncode($line)
    if (-not $inParagraph) {
      $htmlLines.Add("<p>$content")
      $inParagraph = $true
    } else {
      $htmlLines[$htmlLines.Count - 1] = $htmlLines[$htmlLines.Count - 1] + "<br />$content"
    }
  }

  if ($inParagraph) {
    $htmlLines.Add("</p>")
  }
  if ($inList) {
    $htmlLines.Add("</ul>")
  }

  $title = [System.Net.WebUtility]::HtmlEncode([System.IO.Path]::GetFileNameWithoutExtension($MarkdownPath))
  $document = @"
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>$title</title>
  <style>
    @page { size: A4; margin: 22mm 18mm; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      color: #1f2430;
      font-size: 11pt;
      line-height: 1.45;
    }
    h1, h2, h3 {
      color: #3c2d70;
      page-break-after: avoid;
      margin-bottom: 8px;
    }
    h1 { font-size: 22pt; }
    h2 { font-size: 16pt; margin-top: 22px; }
    h3 { font-size: 13pt; margin-top: 18px; }
    p { margin: 8px 0; }
    ul { margin: 6px 0 10px 20px; }
    li { margin: 4px 0; }
  </style>
</head>
<body>
$(($htmlLines -join [Environment]::NewLine))
</body>
</html>
"@

  Set-Content -Path $HtmlPath -Value $document -Encoding UTF8
}

function Get-BrowserPath {
  $candidates = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Test-WordAvailable {
  try {
    $word = New-Object -ComObject Word.Application -ErrorAction Stop
    $word.Quit()
    return $true
  } catch {
    return $false
  }
}

function Convert-HtmlToPdfWithWord {
  param(
    [string]$HtmlPath,
    [string]$PdfPath
  )

  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  try {
    $document = $word.Documents.Open($HtmlPath, $false, $true)
    $document.ExportAsFixedFormat($PdfPath, 17)
    $document.Close()
  } finally {
    $word.Quit()
  }
}

if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

if (-not (Test-Path $tempHtmlDir)) {
  New-Item -ItemType Directory -Path $tempHtmlDir | Out-Null
}

if (-not (Test-Path $browserProfileDir)) {
  New-Item -ItemType Directory -Path $browserProfileDir | Out-Null
}

$markdownFiles = Get-ChildItem -Path $root -Filter *.md |
  Where-Object { $_.Name -ne "README.md" }

$pandoc = Get-Command pandoc -ErrorAction SilentlyContinue
$wordAvailable = Test-WordAvailable
$browserPath = Get-BrowserPath

if (-not $pandoc -and -not $wordAvailable -and -not $browserPath) {
  throw "No se encontro pandoc, Word ni un navegador Edge/Chrome compatible para generar PDFs."
}

foreach ($file in $markdownFiles) {
  $pdfPath = Join-Path $outputDir ($file.BaseName + ".pdf")
  Write-Host "Convirtiendo $($file.Name) -> $pdfPath"

  if ($pandoc) {
    pandoc $file.FullName -o $pdfPath
    continue
  }

  $htmlPath = Join-Path $tempHtmlDir ($file.BaseName + ".html")
  Convert-MarkdownToSimpleHtml -MarkdownPath $file.FullName -HtmlPath $htmlPath

  if ($wordAvailable) {
    Convert-HtmlToPdfWithWord -HtmlPath $htmlPath -PdfPath $pdfPath
    continue
  }

  $htmlUri = [System.Uri]::new($htmlPath).AbsoluteUri
  & $browserPath --headless --disable-gpu --no-first-run --no-default-browser-check "--user-data-dir=$browserProfileDir" "--print-to-pdf=$pdfPath" $htmlUri | Out-Null
}

Write-Host "Conversion finalizada. PDFs generados en $outputDir"
