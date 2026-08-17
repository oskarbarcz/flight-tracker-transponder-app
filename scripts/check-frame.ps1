param(
  [string] $Exe = './dist/mypreflight-transponder.exe'
)

$path = (Resolve-Path $Exe).Path

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $path
$psi.Arguments = '--print-frame'
$psi.RedirectStandardOutput = $true
$psi.UseShellExecute = $false
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8

$proc = [System.Diagnostics.Process]::Start($psi)
$out = $proc.StandardOutput.ReadToEnd()
$proc.WaitForExit()

if ($proc.ExitCode -ne 0) {
  throw "--print-frame exited with $($proc.ExitCode)"
}

$lines = $out -split "`n"

if ($lines.Count -lt 10) {
  throw "expected a full frame, got $($lines.Count) lines"
}

$glyphs = @{
  'box corner'      = 0x256D
  'box corner end'  = 0x256F
  'box side'        = 0x2502
  'heavy rule'      = 0x2550
  'connected dot'   = 0x25CF
  'escape'          = 0x1B
}

foreach ($name in $glyphs.Keys) {
  if ($out.IndexOf([char]$glyphs[$name]) -lt 0) {
    throw "the frame is missing its $name, so the output was mangled on the way out"
  }
}

if ($out.IndexOf([char]0xFFFD) -ge 0) {
  throw 'the frame contains replacement characters, so it was not valid UTF-8'
}

Write-Host "frame check passed: $($lines.Count) lines, box drawing and colour intact"
exit 0
