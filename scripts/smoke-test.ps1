# Proves the compiled executable starts at all and reports the version CI
# expects, which is the cheapest guard against a build that linked but cannot
# run. Both integrity and release call this after compiling.

param(
  [string] $Exe = './dist/flight-tracker-transponder.exe'
)

$output = & $Exe --version 2>&1
$code = $LASTEXITCODE
$expected = (Get-Content package.json | ConvertFrom-Json).version

if ($code -ne 0) {
  throw "--version exited with $code, output: $output"
}
if ($output -notmatch [regex]::Escape($expected)) {
  throw "expected version $expected, got: $output"
}

Write-Host "smoke test passed: the executable reports $output"
exit 0
