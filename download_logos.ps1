$logos = [ordered]@{
  "accenture"           = "accenture.com"
  "adani"               = "adani.com"
  "airtel"              = "airtel.in"
  "apple"               = "apple.com"
  "asian-paints"        = "asianpaints.com"
  "axis-bank"           = "axisbank.com"
  "bajaj"               = "bajaj.com"
  "berkshire-hathaway"  = "berkshirehathaway.com"
  "bharatpe"            = "bharatpe.com"
  "blackrock"           = "blackrock.com"
  "boat"                = "boat-lifestyle.com"
  "coca-cola"           = "coca-cola.com"
  "flipkart"            = "flipkart.com"
  "itc"                 = "itcportal.com"
  "jio"                 = "jio.com"
  "lenskart"            = "lenskart.com"
  "lic"                 = "licindia.in"
  "mamaearth"           = "mamaearth.in"
  "nykaa"               = "nykaa.com"
  "ola"                 = "olacabs.com"
  "patanjali"           = "patanjali.com"
  "paytm"               = "paytm.com"
  "physics-wallah"      = "pw.live"
  "swiggy"              = "swiggy.com"
  "tata"                = "tata.com"
  "vedanta"             = "vedantalimited.com"
  "zepto"               = "zeptonow.com"
  "zerodha"             = "zerodha.com"
  "zomato"              = "zomato.com"
}

$dir = "C:\Users\91703\OneDrive\Desktop\Worthscale\assets\logos"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$ok = 0; $fail = @()

foreach ($name in $logos.Keys) {
  $domain = $logos[$name]
  $outPath = "$dir\$name.png"

  # Try Clearbit first (clean 128px logos)
  $clearbitUrl = "https://logo.clearbit.com/$domain"
  try {
    Invoke-WebRequest -Uri $clearbitUrl -OutFile $outPath -UseBasicParsing -TimeoutSec 12 -ErrorAction Stop
    # Clearbit returns 404 as a PNG with a placeholder - check file size > 500 bytes
    $size = (Get-Item $outPath).Length
    if ($size -gt 500) {
      Write-Host "OK (clearbit): $name ($size bytes)"
      $ok++
      continue
    }
  } catch { }

  # Fallback: Google favicon at 64px
  $googleUrl = "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://$domain&size=64"
  try {
    Invoke-WebRequest -Uri $googleUrl -OutFile $outPath -UseBasicParsing -TimeoutSec 12 -ErrorAction Stop
    $size = (Get-Item $outPath).Length
    Write-Host "OK (google): $name ($size bytes)"
    $ok++
  } catch {
    Write-Host "FAILED: $name - $_"
    $fail += $name
  }
}

Write-Host ""
Write-Host "=== DONE: $ok ok, $($fail.Count) failed ==="
if ($fail.Count -gt 0) { $fail | ForEach-Object { Write-Host "FAILED: $_" } }
