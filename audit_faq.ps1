$blogDir = "C:\Users\91703\OneDrive\Desktop\Worthscale\blog"
$all = Get-ChildItem "$blogDir\*.html"
$s=0; $ns=0; $is=0; $ph=0; $ac=0
$noSchemaList = @()
foreach ($f in $all) {
  $c = [System.IO.File]::ReadAllText($f.FullName)
  if ($c -match '"@type":"FAQPage"') { $s++ } else { $ns++; $noSchemaList += $f.Name }
  if ($c -match 'itemprop="mainEntity"') { $is++ }
  if ($c -match 'Frequently Asked') { $ph++ }
  if ($c -match 'faq-accordion') { $ac++ }
}
Write-Host "FAQSchema=$s NoSchema=$ns ItemScope=$is HasFAQ=$ph Accordion=$ac"
Write-Host "--- Missing FAQPage schema ---"
$noSchemaList | ForEach-Object { Write-Host $_ }
