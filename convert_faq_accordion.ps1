$blogDir = "C:\Users\91703\OneDrive\Desktop\Worthscale\blog"
$files = Get-ChildItem "$blogDir\*.html" | Where-Object { $_.Name -ne "index.html" }
$processed = 0
$skipped = 0

foreach ($f in $files) {
  $html = [System.IO.File]::ReadAllText($f.FullName)

  # Skip if already has accordion
  if ($html -match 'class="faq-accordion"') { $skipped++; continue }

  # Skip if no FAQ section
  if ($html -notmatch 'Frequently Asked Questions') { $skipped++; continue }

  $newHtml = $html

  # ---- PATTERN A: itemscope/itemprop microdata ----
  if ($html -match 'itemprop="mainEntity"') {
    # Find all Q&A pairs using itemscope pattern
    $qaMatches = [System.Text.RegularExpressions.Regex]::Matches(
      $html,
      '<div\s+itemscope\s+itemprop="mainEntity"[^>]*>[\s\S]*?itemprop="name">([\s\S]*?)</h3>[\s\S]*?itemprop="text">([\s\S]*?)</p>[\s\S]*?</div>\s*</div>',
      [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    if ($qaMatches.Count -gt 0) {
      # Build accordion items
      $accordionItems = ""
      foreach ($m in $qaMatches) {
        $q = $m.Groups[1].Value.Trim()
        $a = $m.Groups[2].Value.Trim()
        $accordionItems += "      <div class=`"faq-item`">`n        <div class=`"faq-q`">$q</div>`n        <div class=`"faq-a`"><p>$a</p></div>`n      </div>`n"
      }
      $accordion = "<div class=`"faq-accordion`">`n$($accordionItems)      </div>"

      # Replace the outer FAQPage div with accordion
      $newHtml = [System.Text.RegularExpressions.Regex]::Replace(
        $newHtml,
        '<div\s+itemscope\s+itemtype="https://schema\.org/FAQPage">[\s\S]*?</div>\s*(?=\s*</div>\s*</article>)',
        $accordion,
        [System.Text.RegularExpressions.RegexOptions]::Singleline
      )
    }
  }

  # ---- PATTERN B: plain <h3>Question</h3><p>Answer</p> pairs ----
  elseif ($html -match '<h2>Frequently Asked Questions</h2>') {
    # Split at FAQ heading
    $faqHeading = '<h2>Frequently Asked Questions</h2>'
    $idx = $newHtml.IndexOf($faqHeading)
    if ($idx -ge 0) {
      $afterFaq = $newHtml.Substring($idx + $faqHeading.Length)

      # Find all h3/p pairs
      $qaMatches = [System.Text.RegularExpressions.Regex]::Matches(
        $afterFaq,
        '<h3>([\s\S]*?)</h3>\s*<p>([\s\S]*?)</p>',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
      )

      if ($qaMatches.Count -gt 0) {
        # Build accordion items
        $accordionItems = ""
        foreach ($m in $qaMatches) {
          $q = $m.Groups[1].Value.Trim()
          $a = $m.Groups[2].Value.Trim()
          $accordionItems += "      <div class=`"faq-item`">`n        <div class=`"faq-q`">$q</div>`n        <div class=`"faq-a`"><p>$a</p></div>`n      </div>`n"
        }
        $accordion = "<div class=`"faq-accordion`">`n$($accordionItems)      </div>"

        # Replace all h3/p pairs after FAQ heading with accordion
        # First find where the FAQ section ends (before </div> closing article-content)
        $faqSectionPattern = '(<h2>Frequently Asked Questions</h2>)\s*((<h3>[\s\S]*?</h3>\s*<p>[\s\S]*?</p>\s*)+)'
        $newHtml = [System.Text.RegularExpressions.Regex]::Replace(
          $newHtml,
          $faqSectionPattern,
          "`$1`n      $accordion`n",
          [System.Text.RegularExpressions.RegexOptions]::Singleline
        )
      }
    }
  }

  # Write the file if changed
  if ($newHtml -ne $html) {
    [System.IO.File]::WriteAllText($f.FullName, $newHtml, [System.Text.Encoding]::UTF8)
    $processed++
    Write-Host "DONE: $($f.Name)"
  } else {
    $skipped++
    Write-Host "SKIP: $($f.Name)"
  }
}

Write-Host "`nProcessed: $processed  Skipped: $skipped"
