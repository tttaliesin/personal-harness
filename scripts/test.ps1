<#
.SYNOPSIS
Runs the repository's unittest suite with Python 3.11 or newer.
.DESCRIPTION
Runs python -m unittest discover -s tests -v from the repository root,
regardless of the caller's working directory, and returns its exit code.
.PARAMETER Python
A Python executable name or path. Defaults to python. Arguments are separate
parameters; do not include interpreter flags in this value.
.EXAMPLE
.\scripts\test.ps1
.EXAMPLE
.\scripts\test.ps1 -Python 'C:\Python311\python.exe'
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [ValidateNotNullOrEmpty()]
    [string]$Python = 'python'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Handle native exit codes explicitly, including in PowerShell 7.3+.
$PSNativeCommandUseErrorActionPreference = $false

try {
    # Resolve relative executable paths before changing to the repository root.
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

    $repositoryRoot = Split-Path -Path $PSScriptRoot -Parent
    $testArguments = @('-m', 'unittest', 'discover', '-s', 'tests', '-v')
    Push-Location -LiteralPath $repositoryRoot
    try {
        & $pythonExecutable @testArguments
        $testExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    exit $testExitCode
}
catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
