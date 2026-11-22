[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string] $ProjectPath
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
$PSModuleAutoLoadingPreference = 'None'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

try {
  if (-not $IsWindows) { throw 'Windows 호스트가 필요합니다.' }
  if (-not [System.IO.Path]::IsPathFullyQualified($ProjectPath)) { throw '절대 경로가 필요합니다.' }

  # Load only shipped modules by absolute path, never a user module found through PATH.
  foreach ($module in @('Microsoft.PowerShell.Management', 'Microsoft.PowerShell.Utility')) {
    $manifest = [System.IO.Path]::Combine($PSHOME, 'Modules', $module, "$module.psd1")
    Import-Module -Name $manifest -ErrorAction Stop
  }
  Set-Location -LiteralPath $ProjectPath -ErrorAction Stop
  if ((Get-Location).Provider.Name -ne 'FileSystem') { throw '파일 시스템 경로가 필요합니다.' }

  $names = @(
    'pwsh', 'powershell', 'git', 'winget', 'mise', 'node', 'npm', 'pnpm', 'yarn',
    'python', 'py', 'uv', 'go', 'rustup', 'rustc', 'cargo', 'zig', 'dotnet', 'wsl',
    'docker', 'lazydocker', 'process-compose', 'code', 'gh', 'rg', 'nu',
    'fnm', 'nvm', 'pyenv', 'conda', 'choco', 'scoop', 'wt', 'codex', 'vswhere', 'fsutil',
    'task', 'just', 'make'
  )
  $commands = [ordered]@{}
  foreach ($name in $names) {
    $candidates = @(Get-Command -Name $name -All -ErrorAction SilentlyContinue)
    $commands[$name] = @(
      foreach ($command in $candidates) {
        $commandPath = $null
        $fileVersion = $null
        $productVersion = $null
        if ($command -is [System.Management.Automation.ApplicationInfo] -or
            $command -is [System.Management.Automation.ExternalScriptInfo]) {
          $commandPath = $command.Path
          # Read only the file's version resource; no target command is invoked.
          try {
            $metadata = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($commandPath)
            if ($metadata.FileVersion -match '^[0-9][0-9A-Za-z ._()+-]{0,160}$') {
              $fileVersion = $metadata.FileVersion
            }
            if ($metadata.ProductVersion -match '^[0-9][0-9A-Za-z ._()+-]{0,160}$') {
              $productVersion = $metadata.ProductVersion
            }
          } catch {
            # An unreadable alias or wrapper remains metadata-only with null versions.
          }
        }
        [ordered]@{
          name = $command.Name
          commandType = [string] $command.CommandType
          path = $commandPath
          fileVersion = $fileVersion
          productVersion = $productVersion
        }
      }
    )
  }

  # Local CIM only; never request CommandLine, environment variables or remote sessions.
  $metadataSource = 'local-cim'
  try {
    Import-Module -Name ([System.IO.Path]::Combine($PSHOME, 'Modules', 'CimCmdlets', 'CimCmdlets.psd1')) -ErrorAction Stop
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -Property Caption, Version, BuildNumber, OSArchitecture
    $shell = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $PID" -Property Name, ExecutablePath
  } catch {
    # Restricted agent processes may deny CIM while allowing their own process and HKLM metadata.
    # No privilege change or remote WMI connection is needed for this fallback.
    $metadataSource = 'local-process-and-registry'
    $process = [System.Diagnostics.Process]::GetCurrentProcess()
    $shellPath = $process.MainModule.FileName
    $shell = [pscustomobject]@{ Name = [System.IO.Path]::GetFileName($shellPath); ExecutablePath = $shellPath }
    $productName = $null
    $installationType = $null
    $registry = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion', $false)
    try {
      if ($null -ne $registry) {
        $productName = [string]$registry.GetValue('ProductName', $null)
        $installationType = [string]$registry.GetValue('InstallationType', $null)
      }
    } finally { if ($null -ne $registry) { $registry.Dispose() } }
    $osVersion = [System.Environment]::OSVersion.Version
    # Windows 11 can retain the Windows 10 registry product label.
    # Apply the documented client build boundary and retain this observation method.
    if ($installationType -eq 'Client' -and $osVersion.Build -ge 22000) { $productName = $productName -replace 'Windows 10', 'Windows 11' }
    if ([string]::IsNullOrWhiteSpace($productName)) { $productName = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription }
    $os = [pscustomobject]@{ Caption = $productName; Version = $osVersion.ToString(); BuildNumber = [string]$osVersion.Build; OSArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() }
    $process.Dispose()
  }
  $result = [ordered]@{
    context = [ordered]@{
      platform = 'win32'
      metadataSource = $metadataSource
      os = [ordered]@{
        name = $os.Caption
        version = $os.Version
        build = $os.BuildNumber
        architecture = $os.OSArchitecture
      }
      processArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString().ToLowerInvariant()
      cwd = (Get-Location).ProviderPath
      diagnosticShell = [ordered]@{
        name = [System.IO.Path]::GetFileNameWithoutExtension($shell.Name)
        path = $shell.ExecutablePath
        version = $PSVersionTable.PSVersion.ToString()
        profileApplied = $false
      }
    }
    commands = $commands
    probes = [ordered]@{}
  }
  $json = ConvertTo-Json -InputObject $result -Depth 8 -Compress
  [Console]::WriteLine($json)
} catch {
  [Console]::Error.WriteLine('Windows 호스트 메타데이터를 수집하지 못했습니다.')
  exit 1
}
