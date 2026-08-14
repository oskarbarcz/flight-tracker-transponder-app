# Renders one dashboard frame out of the compiled executable and checks it
# arrived intact.
#
# This is the only thing that puts the terminal UI through the real binary on
# Windows: the app builds a dashboard only when stdout is a TTY, which no CI
# runner provides, so --version alone exercises none of it.
#
# Scope, honestly: stdout here is a pipe, so this proves the bytes the program
# emits are well-formed UTF-8 with its escapes intact. It cannot prove conhost
# renders them - that needs a human running --print-frame in a real console.

param(
  [string] $Exe = './dist/flight-tracker-transponder.exe'
)

$path = (Resolve-Path $Exe).Path

# Decoding is pinned to UTF-8 rather than left to the console default, so a
# failure here means the executable emitted the wrong bytes, not that
# PowerShell guessed the wrong code page reading them.
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

# Referenced by code point so this file stays pure ASCII.
$glyphs = @{
  'box corner'      = 0x250C  # the top left of a module box
  'box side'        = 0x2502
  'heavy rule'      = 0x2550  # under the wordmark
  'connected dot'   = 0x25CF
  'escape'          = 0x1B    # colour survived too
}

foreach ($name in $glyphs.Keys) {
  if ($out.IndexOf([char]$glyphs[$name]) -lt 0) {
    throw "the frame is missing its $name, so the output was mangled on the way out"
  }
}

# U+FFFD is what a decoder substitutes for bytes it could not make sense of,
# and is the clearest single sign the encoding went wrong.
if ($out.IndexOf([char]0xFFFD) -ge 0) {
  throw 'the frame contains replacement characters, so it was not valid UTF-8'
}

Write-Host "frame check passed: $($lines.Count) lines, box drawing and colour intact"
exit 0
