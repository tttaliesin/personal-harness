[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string] $TargetPath
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
$PSModuleAutoLoadingPreference = 'None'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

try {
  if (-not $IsWindows -or $TargetPath -notmatch '^[A-Za-z]:[\\/]' -or $TargetPath -match '[\x00-\x1f]') {
    throw '지원하는 Windows 절대 경로가 필요합니다.'
  }
  # Import only the shipped utility and Storage manifests by absolute path.
  $utility = [System.IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Utility.psd1')
  $storage = [System.IO.Path]::Combine($env:SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules', 'Storage', 'Storage.psd1')
  Import-Module -Name $utility -ErrorAction Stop
  Import-Module -Name $storage -ErrorAction Stop
  $volumes = @(Get-Volume -FilePath $TargetPath -ErrorAction Stop)
  if ($volumes.Count -ne 1) { throw '대상 볼륨을 하나로 확인하지 못했습니다.' }
  $volume = $volumes[0]
  $volumePath = [string] $volume.Path
  if ($volumePath -notmatch '^\\\\\?\\Volume\{[0-9a-fA-F-]+\}\\$') {
    if ([string] $volume.DriveLetter -notmatch '^[A-Za-z]$') { throw '볼륨 경로를 확인하지 못했습니다.' }
    $volumePath = ([string] $volume.DriveLetter) + ':'
  }
  $result = [ordered]@{
    fileSystem = [string] $volume.FileSystem
    volumePath = $volumePath
    size = [long] $volume.Size
    sizeRemaining = [long] $volume.SizeRemaining
  }
  [Console]::WriteLine((ConvertTo-Json -InputObject $result -Compress))
} catch {
  [Console]::Error.WriteLine('대상 볼륨의 읽기 전용 조회를 완료하지 못했습니다.')
  exit 1
}
