$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot
$domain = 'https://worthscale.in'

$mainPages = @(
  @{ path='/'; file='index.html'; changefreq='weekly'; priority='1.0' },
  @{ path='/app'; file='app.html'; changefreq='weekly'; priority='0.9' },
  @{ path='/net-worth-calculator'; file='net-worth-calculator.html'; changefreq='monthly'; priority='0.9' },
  @{ path='/emergency-fund-calculator'; file='emergency-fund-calculator.html'; changefreq='monthly'; priority='0.9' },
  @{ path='/house-down-payment-calculator'; file='house-down-payment-calculator.html'; changefreq='monthly'; priority='0.9' },
  @{ path='/about'; file='about.html'; changefreq='monthly'; priority='0.6' },
  @{ path='/contact'; file='contact.html'; changefreq='monthly'; priority='0.5' },
  @{ path='/share'; file='share.html'; changefreq='monthly'; priority='0.5' },
  @{ path='/privacy-policy'; file='privacy-policy.html'; changefreq='yearly'; priority='0.3' },
  @{ path='/terms'; file='terms.html'; changefreq='yearly'; priority='0.3' },
  @{ path='/sitemap'; file='sitemap.html'; changefreq='weekly'; priority='0.6' },
  @{ path='/blog'; file='blog/index.html'; changefreq='daily'; priority='0.8' }
)

$xml = New-Object System.Text.StringBuilder
[void]$xml.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$xml.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
[void]$xml.AppendLine('')
[void]$xml.AppendLine('  <!-- Main Pages -->')

foreach ($page in $mainPages) {
  if (Test-Path $page.file) {
    $lastmod = (Get-Item $page.file).LastWriteTime.ToString('yyyy-MM-dd')
    [void]$xml.AppendLine('  <url>')
    [void]$xml.AppendLine("    <loc>$domain$($page.path)</loc>")
    [void]$xml.AppendLine("    <lastmod>$lastmod</lastmod>")
    [void]$xml.AppendLine("    <changefreq>$($page.changefreq)</changefreq>")
    [void]$xml.AppendLine("    <priority>$($page.priority)</priority>")
    [void]$xml.AppendLine('  </url>')
  }
}

[void]$xml.AppendLine('')
[void]$xml.AppendLine('  <!-- Blog Pages -->')

$blogFiles = Get-ChildItem -Path 'blog' -Filter '*.html' |
  Where-Object { $_.Name -ne 'index.html' } |
  Sort-Object Name

foreach ($blogFile in $blogFiles) {
  $slug = [System.IO.Path]::GetFileNameWithoutExtension($blogFile.Name)
  $lastmod = $blogFile.LastWriteTime.ToString('yyyy-MM-dd')
  [void]$xml.AppendLine('  <url>')
  [void]$xml.AppendLine("    <loc>$domain/blog/$slug</loc>")
  [void]$xml.AppendLine("    <lastmod>$lastmod</lastmod>")
  [void]$xml.AppendLine('    <changefreq>monthly</changefreq>')
  [void]$xml.AppendLine('    <priority>0.7</priority>')
  [void]$xml.AppendLine('  </url>')
}

[void]$xml.AppendLine('')
[void]$xml.AppendLine('</urlset>')

[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) 'sitemap.xml'),
  $xml.ToString(),
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "sitemap.xml regenerated successfully with $($blogFiles.Count) blog URLs."
