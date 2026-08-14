# Proves bun stamped assets/icon.ico and the file properties into the PE, and
# that the icon Windows actually resolves is the large one rather than a small
# frame stretched into a large slot.
#
# Neither the icon nor the properties survives cross-compilation, so bun drops
# them silently rather than failing the build — a Mac-built executable keeps
# bun's own steamed-bun logo — and a stripped executable still runs and still
# passes the smoke test. Nothing but this step would notice.
#
# The size assertion exists because the first version of this check did not have
# one, and a real bug walked straight past it. Bun writes each frame of the .ico
# as RT_ICON 1, 2, 3… in file order and then leaves its own `IDI_MYICON` group
# behind, still claiming "one 256x256 icon, image id 1". Named resources sort
# ahead of numbered ones, so that stale group is the one Windows resolves the
# app icon through: whatever sits at id 1 becomes the icon at every size. With
# the frames written smallest-first that was the 16x16, and the taskbar spent
# its life stretching sixteen pixels across forty-eight. ExtractAssociatedIcon
# only ever hands back 32x32, and a stretched 16x16 is still brand-coloured, so
# the old pixel count passed happily.

param(
  [string] $Exe = './dist/flight-tracker-transponder.exe'
)

Add-Type -AssemblyName System.Drawing

# What the shell itself calls to resolve a file's icon at a given size, so this
# asks the question Explorer and the taskbar ask rather than a proxy for it.
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

      # Counting brand-coloured pixels rather than merely finding an icon: an
      # executable with no icon of its own still reports Windows' generic one.
      if ($pixel.A -gt 128 -and
          [Math]::Abs($pixel.R - 0x68) -le 24 -and
          [Math]::Abs($pixel.G - 0x75) -le 24 -and
          [Math]::Abs($pixel.B - 0xF5) -le 24) {
        $brand++
      }

      # Distinct partly-transparent colours: how much genuine antialiasing the
      # frame carries. A 256px frame rendered from the vector has hundreds. The
      # same frame stretched out of a 16px one has only the 16px one's, so this
      # is what separates a real large icon from an inflated small one.
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

# The 256px frame this repository generates carries ~248 distinct edge colours;
# the 16px one carries ~62, and stretching it cannot invent more. Anything under
# 150 means Windows resolved a small frame into the large slot again.
if ($measured.Edges -lt 150) {
  throw (
    "the 256x256 app icon carries only $($measured.Edges) distinct edge colours, " +
    'so it is a small frame stretched large: assets/icon.ico must list its ' +
    'biggest frame first, because bun maps the first frame onto RT_ICON id 1 ' +
    "and its leftover IDI_MYICON group resolves the app icon through that id"
  )
}

Write-Host "app icon at 256x256: $($measured.Brand) pixels of #6875F5, $($measured.Edges) distinct edge colours"

# The small sizes have to resolve too, and be ours: this is the pair the
# taskbar and Explorer's list view actually draw.
foreach ($size in 32, 48) {
  $small = Get-AppIcon -Size $size
  $smallMeasured = Measure-Icon -Bitmap $small

  if ($smallMeasured.Brand -eq 0) {
    throw "the ${size}x${size} app icon is not ours"
  }

  Write-Host "app icon at ${size}x${size}: $($smallMeasured.Brand) pixels of #6875F5"
}

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
