param(
  [string] $Exe = './dist/mypreflight-transponder.exe'
)

Add-Type -AssemblyName System.Drawing

Add-Type -Namespace 'FlightTracker' -Name 'Shell' -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern int PrivateExtractIcons(
  string file, int index, int cx, int cy, System.IntPtr[] icons, int[] ids, int count, int flags);

[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool DestroyIcon(System.IntPtr icon);
'@

$path = (Resolve-Path $Exe).Path

function Get-AppIcon {
  param([int] $Size)

  $handles = New-Object System.IntPtr[] 1
  $ids = New-Object int[] 1
  $found = [FlightTracker.Shell]::PrivateExtractIcons($path, 0, $Size, $Size, $handles, $ids, 1, 0)

  if ($found -lt 1 -or $handles[0] -eq [System.IntPtr]::Zero) {
    throw "Windows could not resolve a ${Size}x${Size} icon for the executable"
  }

  $icon = [System.Drawing.Icon]::FromHandle($handles[0])
  $bitmap = $icon.ToBitmap()
  [FlightTracker.Shell]::DestroyIcon($handles[0]) | Out-Null

  return $bitmap
}

function Measure-Icon {
  param([System.Drawing.Bitmap] $Bitmap)

  $brand = 0
  $edges = New-Object 'System.Collections.Generic.HashSet[string]'

  for ($y = 0; $y -lt $Bitmap.Height; $y++) {
    for ($x = 0; $x -lt $Bitmap.Width; $x++) {
      $pixel = $Bitmap.GetPixel($x, $y)

      if ($pixel.A -gt 128 -and
          [Math]::Abs($pixel.R - 0x68) -le 24 -and
          [Math]::Abs($pixel.G - 0x75) -le 24 -and
          [Math]::Abs($pixel.B - 0xF5) -le 24) {
        $brand++
      }

      if ($pixel.A -gt 0 -and $pixel.A -lt 255) {
        $edges.Add("$($pixel.R),$($pixel.G),$($pixel.B),$($pixel.A)") | Out-Null
      }
    }
  }

  return [pscustomobject]@{ Brand = $brand; Edges = $edges.Count }
}

$large = Get-AppIcon -Size 256
$measured = Measure-Icon -Bitmap $large

if ($large.Width -ne 256 -or $large.Height -ne 256) {
  throw "asked for a 256x256 app icon and got $($large.Width)x$($large.Height)"
}

if ($measured.Brand -eq 0) {
  throw 'the icon is not ours, so bun dropped assets/icon.ico'
}

if ($measured.Edges -lt 150) {
  throw (
    "the 256x256 app icon carries only $($measured.Edges) distinct edge colours, " +
    'so it is a small frame stretched large: assets/icon.ico must list its ' +
    'biggest frame first, because bun maps the first frame onto RT_ICON id 1 ' +
    "and its leftover IDI_MYICON group resolves the app icon through that id"
  )
}

Write-Host "app icon at 256x256: $($measured.Brand) pixels of #6875F5, $($measured.Edges) distinct edge colours"

foreach ($size in 32, 48) {
  $small = Get-AppIcon -Size $size
  $smallMeasured = Measure-Icon -Bitmap $small

  if ($smallMeasured.Brand -eq 0) {
    throw "the ${size}x${size} app icon is not ours"
  }

  Write-Host "app icon at ${size}x${size}: $($smallMeasured.Brand) pixels of #6875F5"
}

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
if ($blob -notmatch 'MyPreflight') {
  throw "file properties lack the product: $blob"
}

Write-Host "file properties: $blob"
exit 0
