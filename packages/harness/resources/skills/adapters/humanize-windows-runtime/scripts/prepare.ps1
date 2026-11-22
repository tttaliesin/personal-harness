[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$SkillRoot,
    [Parameter(Mandatory)]
    [string]$ScratchRoot,
    [Parameter(Mandatory)]
    [string]$InputText,
    [Parameter(Mandatory)]
    [string]$Genre,
    [string]$Python
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-FullPath([string]$Path) {
    if ($Path -notmatch '^(?:[a-z]:[/\\]|[/\\]{2}[^/\\]+[/\\][^/\\]+)') {
        throw "Expected an absolute filesystem path: $Path"
    }
    [System.IO.Path]::GetFullPath($Path)
}

$source = Resolve-FullPath $SkillRoot
$prepareScript = Join-Path $source 'scripts/prepare_monolith_input.py'
if (-not (Test-Path -LiteralPath $prepareScript -PathType Leaf)) {
    throw "The installed humanize-korean preparation script was not found: $prepareScript"
}

$scratch = Resolve-FullPath $ScratchRoot
if ($scratch -match '[/\\]#!sandbox\.\{[^/\\]+\}(?:[/\\]|$)') {
    throw 'Choose a shared scratch path outside the per-call Desktop sandbox temporary directory.'
}

$pythonPaths = if ($Python) {
    Resolve-FullPath $Python
}
else {
    Get-Command -Name 'python.exe','python3.exe' -CommandType Application -All -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Source
    $misePaths = Join-Path $env:USERPROFILE 'AppData/Local/mise/installs/python/*/python.exe'
    Get-Item -Path $misePaths -ErrorAction SilentlyContinue |
        Sort-Object { $_.Directory.Name -as [version] } -Descending |
        Select-Object -ExpandProperty FullName
}
$candidates = $pythonPaths | Where-Object {
    $_ -and $_ -notmatch '[/\\]Microsoft[/\\]WindowsApps[/\\]python[^/\\]*\.exe$' -and
    (Test-Path -LiteralPath $_ -PathType Leaf)
} | Select-Object -Unique
$interpreter = $null
foreach ($candidate in $candidates) {
    & $candidate -B -X utf8 -c 'import sys; sys.exit(sys.version_info < (3, 11))'
    if ($LASTEXITCODE -eq 0) {
        $interpreter = $candidate
        break
    }
}
if (-not $interpreter) {
    throw 'No Python 3.11 or newer found. Specify an installed interpreter with -Python.'
}

$null = [System.IO.Directory]::CreateDirectory($scratch)
$runDir = Join-Path $scratch ([Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $runDir
$before = Join-Path $runDir '01_input.txt'
[System.IO.File]::WriteAllText($before, $InputText, [System.Text.UTF8Encoding]::new($false))
$log = & $interpreter -B -X utf8 $prepareScript --run-dir $runDir --genre $Genre
if ($LASTEXITCODE -ne 0) {
    throw "Upstream preparation failed for $runDir (exit $LASTEXITCODE).`n$($log -join [Environment]::NewLine)"
}
$metrics = Get-Content -LiteralPath (Join-Path $runDir '00_metrics.json') -Raw -Encoding utf8 | ConvertFrom-Json
$routeHint = $metrics.PSObject.Properties['route_hint']
$route = if ($routeHint -and $routeHint.Value) { $routeHint.Value } else { 'standard' }
[pscustomobject]@{runDir=$runDir; python=$interpreter; route=$route} | ConvertTo-Json -Compress
