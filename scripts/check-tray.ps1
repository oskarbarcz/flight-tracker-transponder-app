param(
  [string] $Exe = './dist/mypreflight-transponder.exe'
)

$path = (Resolve-Path $Exe).Path
$output = & $path --tray-check 2>&1
$code = $LASTEXITCODE

Write-Host ($output -join "`n")

if ($code -ne 0) {
  throw "the tray icon could not be shown (exit $code)"
}

if (($output -join ' ') -notmatch 'tray check passed') {
  throw "the tray check did not report success: $($output -join ' ')"
}

Write-Host 'tray check passed'
exit 0
