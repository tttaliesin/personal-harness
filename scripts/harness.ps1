<#
.SYNOPSIS
Runs the harness CLI with Python 3.11 or newer.
.DESCRIPTION
Passes plan, apply, or check to scripts/harness.py. Only apply writes
configuration; plan and check are read-only operations.
.PARAMETER Command
The harness command: plan, apply, or check.
.PARAMETER HostName
The host profile (roylabs-desktop or homelab-desktop). Defaults to COMPUTERNAME.
Host names are converted to lowercase before being passed to the CLI.
.PARAMETER HomeDirectory
An optional user profile directory, passed as --home.
.PARAMETER CodexHome
An optional Codex directory, passed as --codex-home.
.PARAMETER LocalConfig
An optional local TOML configuration file, passed as --local-config.
.PARAMETER Python
A Python executable name or path. Defaults to python. Arguments are separate
parameters; do not include interpreter flags in this value.
.EXAMPLE
.\scripts\harness.ps1 plan -HostName homelab-desktop
.EXAMPLE
.\scripts\harness.ps1 check -HostName roylabs-desktop -HomeDirectory 'D:\Test Profile'
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('plan', 'apply', 'check')]
    [string]$Command,

    [ValidateNotNullOrEmpty()]
    [string]$HostName = $env:COMPUTERNAME,

    [ValidateNotNullOrEmpty()]
    [string]$HomeDirectory,

    [ValidateNotNullOrEmpty()]
    [string]$CodexHome,

    [ValidateNotNullOrEmpty()]
    [string]$LocalConfig,

    [string]$StateRoot,

    [ValidateNotNullOrEmpty()]
    [string]$Python = 'python'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Handle native exit codes explicitly, including in PowerShell 7.3+.
$PSNativeCommandUseErrorActionPreference = $false

try {
    if ([string]::IsNullOrWhiteSpace($HostName)) {
        throw 'COMPUTERNAME is unavailable. Specify -HostName roylabs-desktop or homelab-desktop.'
    }

    $harnessPath = Join-Path -Path $PSScriptRoot -ChildPath 'harness.py'
    if (-not (Test-Path -LiteralPath $harnessPath -PathType Leaf)) {
        throw "Harness CLI not found: $harnessPath"
    }

    if (Test-Path -LiteralPath $Python -PathType Leaf) {
        $pythonExecutable = (Get-Item -LiteralPath $Python).FullName
    }
    else {
        $pythonExecutable = (Get-Command -Name $Python -CommandType Application -ErrorAction Stop).Source
    }

    $versionArguments = @(
        '-c'
        "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 'Python 3.11 or newer is required (found ' + sys.version.split()[0] + ').')"
    )
    & $pythonExecutable @versionArguments
    $versionExitCode = $LASTEXITCODE
    if ($versionExitCode -ne 0) {
        exit $versionExitCode
    }

    $cliArguments = @('-B', $harnessPath, $Command.ToLowerInvariant(), '--host', $HostName.ToLowerInvariant())
    if ($PSBoundParameters.ContainsKey('HomeDirectory')) {
        $cliArguments += @('--home', $HomeDirectory)
    }
    if ($PSBoundParameters.ContainsKey('CodexHome')) {
        $cliArguments += @('--codex-home', $CodexHome)
    }
    if ($PSBoundParameters.ContainsKey('LocalConfig')) {
        $cliArguments += @('--local-config', $LocalConfig)
    }

    if ($PSBoundParameters.ContainsKey('StateRoot')) {
        $cliArguments += @('--state-root', $StateRoot)
    }

    & $pythonExecutable @cliArguments
    exit $LASTEXITCODE
}
catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
