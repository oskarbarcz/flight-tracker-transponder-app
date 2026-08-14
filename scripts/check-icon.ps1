# Proves bun stamped assets/icon.ico and the file properties into the PE.
# Neither survives cross-compilation, so bun drops them silently rather than
# failing the build, and a stripped executable still runs and still passes the
# smoke test. Nothing but this step would notice.

param(
  [string] $Exe = './dist/flight-tracker-transponder.exe'
)

Add-Type -AssemblyName System.Drawing

$path = (Resolve-Path $Exe).Path
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)

if ($null -eq $icon) {
  throw 'the executable carries no icon at all'
}

# Counting brand-coloured pixels rather than merely finding an icon: an
# executable with no icon of its own still reports Windows' generic one.
$bitmap = $icon.ToBitmap()
$hits = 0

for ($y = 0; $y -lt $bitmap.Height; $y++) {
  for ($x = 0; $x -lt $bitmap.Width; $x++) {
    $pixel = $bitmap.GetPixel($x, $y)

    if ($pixel.A -gt 128 -and
        [Math]::Abs($pixel.R - 0x68) -le 24 -and
        [Math]::Abs($pixel.G - 0x75) -le 24 -and
        [Math]::Abs($pixel.B - 0xF5) -le 24) {
      $hits++
    }
  }
}

if ($hits -eq 0) {
  throw 'the icon is not ours, so bun dropped assets/icon.ico'
}

Write-Host "icon check passed: $hits pixels of #6875F5"

# Which VERSIONINFO field bun maps each property onto is not documented, so
# assert against the whole block and print it: the first green run tells us
# the real mapping, and these can tighten afterwards.
$info = (Get-Item $path).VersionInfo
$blob = @(
  $info.CompanyName,
  $info.FileDescription,
  $info.ProductName,
  $info.LegalCopyright,
  $info.ProductVersion
) -join ' | '

if ($blob -notmatch 'oskarbarcz') {
  throw "file properties lack the publisher: $blob"
}
if ($blob -notmatch 'Flight Tracker') {
  throw "file properties lack the product: $blob"
}

Write-Host "file properties: $blob"
exit 0
