<#
.SYNOPSIS
Previews the latest official stable dependencies without writing files.
.DESCRIPTION
Pass -Install to install and record dependencies, then apply and check the harness.
Pass -Locked to reproduce the existing exact lock instead of resolving latest.
#>
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$Locked,
    [string]$HostName = $env:COMPUTERNAME,
    [string]$CodexHome,
    [string]$Codex,
    [string]$LocalConfig,
    [string]$HomeDirectory,
    [string]$Python,
    [string]$StateRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
try {
    $dependencyArguments = @{ HostName = $HostName; Install = $Install; Locked = $Locked }
    foreach ($name in @('CodexHome', 'Codex', 'LocalConfig', 'StateRoot', 'Python')) {
        if ($PSBoundParameters.ContainsKey($name)) { $dependencyArguments[$name] = $PSBoundParameters[$name] }
    }
    if ($PSBoundParameters.ContainsKey('HomeDirectory') -and -not $PSBoundParameters.ContainsKey('CodexHome')) {
        $dependencyArguments['CodexHome'] = Join-Path $HomeDirectory '.codex'
    }
    & (Join-Path $PSScriptRoot 'install-dependencies.ps1') @dependencyArguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if (-not $Install) { exit 0 }
    $harnessArguments = @{ HostName = $HostName }
    foreach ($name in @('CodexHome', 'LocalConfig', 'StateRoot', 'HomeDirectory', 'Python')) {
        if ($PSBoundParameters.ContainsKey($name)) { $harnessArguments[$name] = $PSBoundParameters[$name] }
    }
    if ($dependencyArguments.ContainsKey('CodexHome')) {
        $harnessArguments['CodexHome'] = $dependencyArguments['CodexHome']
    }
    if (-not $harnessArguments.ContainsKey('Python')) {
        $venv = Join-Path (Split-Path $PSScriptRoot -Parent) '.venv/Scripts/python.exe'
        if (Test-Path -LiteralPath $venv -PathType Leaf) { $harnessArguments['Python'] = $venv }
    }
    foreach ($command in @('apply', 'check')) {
        & (Join-Path $PSScriptRoot 'harness.ps1') $command @harnessArguments
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    exit 0
}
catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
