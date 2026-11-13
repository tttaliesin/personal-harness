<#
.SYNOPSIS
Resolves the latest official stable dependencies in a read-only preview.
.DESCRIPTION
Pass -Install to install the resolved tools and save the exact lock after success.
Pass -Locked to reproduce the existing lock without latest metadata lookups.
#>
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$Locked,
    [string]$HostName = $env:COMPUTERNAME,
    [string]$CodexHome,
    [string]$Codex,
    [string]$LocalConfig,
    [string]$Python
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
try {
    if (-not $Python) {
        $venv = Join-Path (Split-Path $PSScriptRoot -Parent) '.venv\Scripts\python.exe'
        $Python = if (Test-Path -LiteralPath $venv -PathType Leaf) { $venv } else { 'python' }
    }
    $pythonExecutable = if (Test-Path -LiteralPath $Python -PathType Leaf) {
        (Get-Item -LiteralPath $Python).FullName
    } else {
        (Get-Command -Name $Python -CommandType Application -ErrorAction Stop).Source
    }
    & $pythonExecutable -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 'Python 3.11+ required')"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $cliArguments = @('-B', (Join-Path $PSScriptRoot 'install_dependencies.py'), '--host', $HostName.ToLowerInvariant())
    if ($Install) { $cliArguments += '--install' }
    if ($Locked) { $cliArguments += '--locked' }
    if ($CodexHome) { $cliArguments += @('--codex-home', $CodexHome) }
    if ($Codex) { $cliArguments += @('--codex', $Codex) }
    if ($LocalConfig) { $cliArguments += @('--local-config', $LocalConfig) }
    & $pythonExecutable @cliArguments
    exit $LASTEXITCODE
}
catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
