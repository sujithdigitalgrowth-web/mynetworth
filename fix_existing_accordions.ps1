# Fix the 5 pre-existing accordion files:
# Remove inline onclick handlers and wrap in faq-accordion div
$blogDir = "C:\Users\91703\OneDrive\Desktop\Worthscale\blog"
$filesToFix = @("accenture-net-worth.html","adani-net-worth.html","airtel-net-worth.html","apple-net-worth.html","asian-paints-net-worth.html")

foreach ($fn in $filesToFix) {
  $path = "$blogDir\$fn"
  $html = [System.IO.File]::ReadAllText($path)

  # Remove inline onclick from faq-q divs
  $html = $html -replace ' onclick="this\.parentElement\.classList\.toggle\(''open''\)"', ''

  # Wrap the FAQPage outer div content in faq-accordion if not already done
  # Pattern: <div itemscope itemtype="https://schema.org/FAQPage">...content...</div>
  # Replace outer div with faq-accordion div, keeping inner faq-item structure
  if ($html -match 'class="faq-accordion"') {
    # Already has accordion wrapper
  } else {
    # Add faq-accordion class or wrap
    $html = $html -replace '<div\s+itemscope\s+itemtype="https://schema\.org/FAQPage">', '<div class="faq-accordion" itemscope itemtype="https://schema.org/FAQPage">'
  }

  [System.IO.File]::WriteAllText($path, $html, [System.Text.Encoding]::UTF8)
  Write-Host "FIXED: $fn"
}
