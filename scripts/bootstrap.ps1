[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$RequestBase64)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$heldMutexes = [System.Collections.Generic.List[System.Threading.Mutex]]::new()
$exitCode = 1

function Get-CanonicalPath([string]$Value, [string]$Base) {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'An empty path is not valid.' }
    if (-not [IO.Path]::IsPathRooted($Value)) { $Value = [IO.Path]::Combine($Base, $Value) }
    $result = [IO.Path]::GetFullPath($Value)
    $root = [IO.Path]::GetPathRoot($result)
    if ($result.Length -gt $root.Length) { $result = $result.TrimEnd('\', '/') }
    return $result
}

function Get-Sha256([byte[]]$Bytes) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hash.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
}

function Get-IOPath([string]$Path) {
    $Path = $Path.Replace('/', '\')
    if ($Path.StartsWith('\\?\')) { return $Path }
    if ($Path.StartsWith('\\')) { return '\\?\UNC\' + $Path.Substring(2) }
    return '\\?\' + $Path
}

function Write-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText((Get-IOPath $Path), ($Value | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
}

function Test-Within([string]$Path, [string]$Root) {
    return $Path.Equals($Root, [StringComparison]::OrdinalIgnoreCase) -or
        $Path.StartsWith($Root.TrimEnd('\', '/') + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoLinks([string]$Path) {
    $current = $Path
    while ($current) {
        $item = Get-Item -LiteralPath (Get-IOPath $current) -Force -ErrorAction SilentlyContinue
        if ($null -ne $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Managed paths cannot contain reparse points: $current"
        }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}

function Get-VerifiedFiles([string]$Directory) {
    foreach ($item in (Get-Item -LiteralPath (Get-IOPath $Directory) -Force).GetFileSystemInfos()) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Managed source contains a reparse point: $($item.FullName)" }
        if ($item -is [IO.DirectoryInfo]) { Get-VerifiedFiles $item.FullName }
        else { $item.FullName }
    }
}

function Find-Python([string]$Requested, [string]$CallerDirectory) {
    $candidates = @()
    if ($Requested) {
        if ($Requested -match '[/\\:]') {
            $candidates = @(Get-CanonicalPath $Requested $CallerDirectory)
        }
        else {
            $candidates = @(Get-Command -Name $Requested -CommandType Application -All -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -ieq $Requested -or $_.Name -ieq "$Requested.exe" } |
                ForEach-Object { $_.Source })
        }
    }
    else {
        foreach ($name in @('python.exe', 'python3.exe', 'py.exe')) {
            $candidates += @(Get-Command -Name $name -CommandType Application -All -ErrorAction SilentlyContinue |
                ForEach-Object { $_.Source })
        }
    }
    foreach ($candidate in $candidates) {
        if ($candidate -match '(?i)[\\/]WindowsApps[\\/]' -or -not [IO.File]::Exists((Get-IOPath $candidate))) { continue }
        if ([IO.Path]::GetExtension($candidate) -ine '.exe') { continue }
        $probe = @('-c', 'import sys; sys.exit(0) if sys.version_info >= (3, 11) else sys.exit(1)')
        $launcher = [IO.Path]::GetFileName($candidate) -ieq 'py.exe'
        if ($launcher) { $probe = @('-3') + $probe }
        $global:LASTEXITCODE = 0
        & $candidate @probe *> $null
        if ($LASTEXITCODE -ne 0) { continue }
        $probe = @('-c', 'import sys; print(sys.executable)')
        if ($launcher) { $probe = @('-3') + $probe }
        $real = @(& $candidate @probe 2>$null)
        if ($LASTEXITCODE -ne 0 -or $real.Count -ne 1) { continue }
        $realPath = Get-CanonicalPath ([string]$real[0]) $CallerDirectory
        if ($realPath -match '(?i)[\\/]WindowsApps[\\/]' -or -not [IO.File]::Exists((Get-IOPath $realPath))) { continue }
        return $realPath
    }
    if ($Requested) { throw "Invalid --python '$Requested'. Specify a real Python 3.11+ .exe, not a WindowsApps alias." }
    throw 'Python 3.11+ was not found. Install Python from python.org with pip and venv, add it to PATH, or pass --python C:\path\to\python.exe. WindowsApps aliases are ignored.'
}

function Assert-Payload([string]$Root, $Payload) {
    Assert-NoLinks $Root
    $files = @(Get-VerifiedFiles $Root)
    if ($files.Count -ne $Payload.Count) { throw "Managed source is incomplete or contains unexpected files: $Root" }
    foreach ($entry in $Payload.GetEnumerator()) {
        $path = [IO.Path]::Combine($Root, $entry.Key)
        if (-not [IO.File]::Exists((Get-IOPath $path)) -or
            (Get-Sha256 ([IO.File]::ReadAllBytes((Get-IOPath $path)))) -ne $entry.Value.Hash) {
            throw "Managed source verification failed: $path"
        }
    }
}

function Get-PayloadFiles([string]$Root, [string]$Relative, [string[]]$Exclusions) {
    foreach ($pattern in $Exclusions) {
        if ($Relative -like $pattern -or "$Relative/" -like $pattern) { return }
    }
    $item = Get-Item -LiteralPath (Get-IOPath ([IO.Path]::Combine($Root, $Relative))) -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Payload links are not supported: $Relative" }
    if ($item.PSIsContainer) {
        foreach ($child in $item.GetFileSystemInfos()) {
            Get-PayloadFiles $Root "$Relative/$($child.Name)" $Exclusions
        }
    }
    else { $Relative }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'This installer requires Windows.' }
    $request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RequestBase64)) | ConvertFrom-Json
    if ($request.command -notin @('install', 'update')) { throw 'Expected install or update.' }
    $options = @{}
    foreach ($property in $request.options.PSObject.Properties) { $options[$property.Name] = $property.Value }
    $caller = Get-CanonicalPath $request.cwd ([Environment]::CurrentDirectory)
    $source = Get-CanonicalPath $request.sourceRoot $caller
    $hostName = if ($options.ContainsKey('host')) { [string]$options.host } else { [string]$env:COMPUTERNAME }
    $hostName = $hostName.ToLowerInvariant()
    if ($hostName -notmatch '^[a-z0-9][a-z0-9-]*$' -or
        -not [IO.File]::Exists((Get-IOPath ([IO.Path]::Combine($source, "hosts/$hostName.toml"))))) {
        throw "Unknown bundled host '$hostName'. Pass --host with a profile from hosts/."
    }
    $homePath = if ($options.ContainsKey('home')) { Get-CanonicalPath $options.home $caller }
        else { Get-CanonicalPath $env:USERPROFILE $caller }
    $codexPath = if ($options.ContainsKey('codexHome')) { Get-CanonicalPath $options.codexHome $caller }
        elseif (-not $options.ContainsKey('home') -and $env:CODEX_HOME) { Get-CanonicalPath $env:CODEX_HOME $caller }
        else { [IO.Path]::Combine($homePath, '.codex') }
    $manager = if ($options.ContainsKey('installRoot')) { Get-CanonicalPath $options.installRoot $caller }
        elseif ($options.ContainsKey('home')) { [IO.Path]::Combine($homePath, '.local/share/personal-harness') }
        else { Get-CanonicalPath ([IO.Path]::Combine($env:LOCALAPPDATA, 'PersonalHarness')) $caller }
    $state = if ($options.ContainsKey('stateRoot')) { Get-CanonicalPath $options.stateRoot $caller }
        else { [IO.Path]::Combine($manager, 'state') }
    $manager = Get-CanonicalPath $manager $caller
    $state = Get-CanonicalPath $state $caller
    $codexPath = Get-CanonicalPath $codexPath $caller
    $releases = Get-CanonicalPath ([IO.Path]::Combine($manager, 'releases')) $caller
    foreach ($persistent in @($manager, $state)) {
        if ((Test-Within $persistent $source) -or (Test-Within $persistent $releases)) {
            throw 'Manager and state roots must be outside the source payload and managed releases.'
        }
        Assert-NoLinks $persistent
    }
    if ((Test-Within $releases $state) -or (Test-Within $source $state)) {
        throw 'State root must not contain the source payload or managed releases.'
    }
    $agentsPath = Get-CanonicalPath ([IO.Path]::Combine($homePath, '.agents')) $caller
    foreach ($target in @($codexPath, $agentsPath)) {
        foreach ($protected in @($source, $releases)) {
            if ((Test-Within $target $protected) -or (Test-Within $protected $target)) {
                throw 'Output targets must not overlap the source payload or managed releases.'
            }
        }
    }
    Assert-NoLinks $homePath
    Assert-NoLinks $codexPath
    Assert-NoLinks $releases
    Assert-NoLinks ([IO.Path]::Combine($manager, 'active.json'))
    $overrides = @{}
    if ($options.ContainsKey('localConfig')) { $overrides.LocalConfig = Get-CanonicalPath $options.localConfig $caller }
    if ($options.ContainsKey('codex')) {
        $overrides.Codex = if ($options.codex -match '[/\\:]') { Get-CanonicalPath $options.codex $caller } else { $options.codex }
    }
    $manifest = [IO.File]::ReadAllText((Get-IOPath ([IO.Path]::Combine($source, 'package.json')))) | ConvertFrom-Json
    $required = @('package.json', 'README.md', 'requirements.txt', 'registry.toml', 'bin/personal-harness.mjs',
        'scripts/bootstrap.ps1', 'scripts/update-dependencies.ps1', 'scripts/install-dependencies.ps1',
        'scripts/harness.ps1', 'scripts/install_dependencies.py', 'scripts/harness.py',
        'scripts/registry.py', 'scripts/mcp_packages.py', 'scripts/windows_paths.py',
        'common/AGENTS.md', 'common/config.toml', 'skills/create-readme/SKILL.md',
        'skills/agent-desktop/SKILL.md', 'skills/agent-desktop-windows/SKILL.md',
        'sources/agent-desktop-LICENSE', 'sources/dependencies.lock.json', "hosts/$hostName.toml")
    $paths = @('package.json', 'README.md')
    $exclusions = @()
    foreach ($entry in $manifest.files) {
        if (-not $entry.StartsWith('!')) { continue }
        $pattern = $entry.Substring(1)
        if ($pattern -notmatch '^[a-zA-Z0-9._*/-]+$' -or $pattern.Split('/') -contains '..') {
            throw "Invalid payload exclusion: $entry"
        }
        $exclusions += $pattern
    }
    foreach ($entry in $manifest.files) {
        if ($entry.StartsWith('!')) { continue }
        if ($entry -notin @('bin', 'scripts', 'common', 'hosts', 'skills', 'sources', 'docs', 'requirements.txt', 'registry.toml')) {
            throw "Invalid payload allowlist entry: $entry"
        }
        $paths += @(Get-PayloadFiles $source $entry $exclusions)
    }
    $paths = [string[]]$paths
    [Array]::Sort($paths, [StringComparer]::Ordinal)
    $payload = [ordered]@{}
    $identity = [Text.StringBuilder]::new()
    foreach ($relative in $paths) {
        if (@($relative.Split('/') | Where-Object { $_ -in @('.', '..', '') }).Count -gt 0 -or
            $relative -match '[\\:*?\x00-\x1f]' -or $payload.Contains($relative)) {
            throw "Invalid payload allowlist entry: $relative"
        }
        $file = [IO.Path]::Combine($source, $relative)
        $item = Get-Item -LiteralPath (Get-IOPath $file) -Force
        while ($item.FullName.Length -gt $source.Length) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Payload links are not supported: $file" }
            $item = Get-Item -LiteralPath ([IO.Path]::GetDirectoryName($item.FullName)) -Force
        }
        $bytes = [IO.File]::ReadAllBytes((Get-IOPath $file))
        $digest = Get-Sha256 $bytes
        $payload.Add($relative, @{ Bytes = $bytes; Hash = $digest })
        [void]$identity.Append($relative).Append("`n").Append($digest).Append("`n")
    }
    foreach ($relative in $required) {
        if (-not $payload.Contains($relative)) { throw "Required source is missing from the payload allowlist: $relative" }
    }
    $payloadHash = Get-Sha256 ([Text.Encoding]::UTF8.GetBytes($identity.ToString()))

    $pythonRequest = if ($options.ContainsKey('python')) { [string]$options.python } else { '' }
    $requirementsHash = $payload['requirements.txt'].Hash
    $venv = [IO.Path]::Combine($state, 'python', $requirementsHash)
    $venvPython = Get-CanonicalPath ([IO.Path]::Combine($venv, 'Scripts/python.exe')) $caller
    $python = ''
    if (-not $pythonRequest) {
        Assert-NoLinks $venvPython
        if ([IO.File]::Exists((Get-IOPath ([IO.Path]::Combine($venv, 'pyvenv.cfg'))))) {
            try { $python = Find-Python $venvPython $caller }
            catch { $python = '' }
        }
    }
    if (-not $python) { $python = Find-Python $pythonRequest $caller }
    if ((Test-Within $python $source) -or (Test-Within $python $releases)) {
        throw 'The base Python executable must be outside the source payload and managed releases.'
    }

    $resources = [string[]]@($manager, $state, $homePath, $codexPath | ForEach-Object { $_.ToUpperInvariant() } | Sort-Object -Unique)
    foreach ($resource in $resources) {
        $key = Get-Sha256 ([Text.Encoding]::UTF8.GetBytes($resource))
        $mutex = [Threading.Mutex]::new($false, "Local\PersonalHarness-$key")
        $acquired = $false
        try {
            try { $acquired = $mutex.WaitOne(0) }
            catch [Threading.AbandonedMutexException] { $acquired = $true }
            if (-not $acquired) { throw "Harness is already running for resource '$resource'. Retry after it finishes." }
            $heldMutexes.Add($mutex)
        }
        finally { if (-not $acquired) { $mutex.Dispose() } }
    }

    $release = Get-CanonicalPath ([IO.Path]::Combine($releases, $payloadHash)) $caller
    if (-not [IO.Directory]::Exists((Get-IOPath $release))) {
        $staging = "$release.partial-$([Guid]::NewGuid().ToString('N'))"
        [void][IO.Directory]::CreateDirectory((Get-IOPath $staging))
        foreach ($entry in $payload.GetEnumerator()) {
            $target = [IO.Path]::Combine($staging, $entry.Key)
            [void][IO.Directory]::CreateDirectory((Get-IOPath ([IO.Path]::GetDirectoryName($target))))
            [IO.File]::WriteAllBytes((Get-IOPath $target), $entry.Value.Bytes)
        }
        Assert-Payload $staging $payload
        $staging = Get-CanonicalPath $staging $caller
        if (-not (Test-Within $staging $releases) -or -not (Test-Within $release $releases) -or
            $staging -eq $releases -or $release -eq $releases) {
            throw 'Source move escaped the selected manager/releases directory.'
        }
        Assert-NoLinks $staging
        Assert-NoLinks $release
        [IO.Directory]::Move((Get-IOPath $staging), (Get-IOPath $release))
    }
    Assert-Payload $release $payload
    $readyPath = [IO.Path]::Combine($venv, 'ready.json')
    Assert-NoLinks $venvPython
    Assert-NoLinks $readyPath
    $probe = 'import sys; sys.exit(0) if sys.version_info >= (3, 11) else sys.exit(1)'
    $usable = $false
    if ([IO.File]::Exists((Get-IOPath $venvPython)) -and [IO.File]::Exists((Get-IOPath ([IO.Path]::Combine($venv, 'pyvenv.cfg'))))) {
        try {
            & $venvPython -c $probe *> $null
            $usable = $LASTEXITCODE -eq 0
        }
        catch { $usable = $false }
    }
    if (-not $usable) {
        if ($python -eq $venvPython) {
            throw 'The selected managed Python is unusable. Pass --python with a working Python 3.11+ executable outside this venv, then retry.'
        }
        & $python -m venv $venv
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE; throw 'Python venv creation failed. Ensure the selected Python includes venv and pip, then retry.' }
    }
    $ready = $false
    if ([IO.File]::Exists((Get-IOPath $readyPath))) {
        try { $ready = ([IO.File]::ReadAllText((Get-IOPath $readyPath)) | ConvertFrom-Json).requirements_sha256 -eq $requirementsHash }
        catch { $ready = $false }
    }
    if ($ready) {
        & $venvPython -c 'import tomlkit' *> $null
        $ready = $LASTEXITCODE -eq 0
    }
    if (-not $ready) {
        & $venvPython -m pip install --disable-pip-version-check --requirement ([IO.Path]::Combine($release, 'requirements.txt'))
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE; throw 'Installing the pinned Python requirements failed. Fix the reported pip error and retry.' }
        & $venvPython -c 'import tomlkit'
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE; throw 'Python requirements import check failed. Retry with a working Python 3.11+ installation.' }
        Write-Json $readyPath @{ requirements_sha256 = $requirementsHash; python = $python }
    }
    $arguments = @{
        Install = $true; StateRoot = $state; HomeDirectory = $homePath; CodexHome = $codexPath
        HostName = $hostName; Python = $venvPython; Locked = ($options.ContainsKey('locked') -and [bool]$options.locked)
    }
    foreach ($entry in $overrides.GetEnumerator()) { $arguments[$entry.Key] = $entry.Value }
    $global:LASTEXITCODE = 0
    & ([IO.Path]::Combine($release, 'scripts/update-dependencies.ps1')) @arguments
    if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE; throw 'Harness install/apply/check failed. The previous active receipt has been retained.' }
    Assert-Payload $release $payload
    $receipt = @{
        schema_version = 1; payload_sha256 = $payloadHash; source_root = $release
        state_root = $state; home = $homePath; codex_home = $codexPath; host_name = $hostName
        python = $venvPython; command = $request.command; checked_at = [DateTime]::UtcNow.ToString('o')
    }
    $active = [IO.Path]::Combine($manager, 'active.json')
    Assert-NoLinks $active
    $pending = "$active.$([Guid]::NewGuid().ToString('N')).tmp"
    Write-Json $pending $receipt
    if ([IO.File]::Exists((Get-IOPath $active))) { [IO.File]::Replace((Get-IOPath $pending), (Get-IOPath $active), [NullString]::Value) }
    else { [IO.File]::Move((Get-IOPath $pending), (Get-IOPath $active)) }
    Write-Output "Harness $($request.command) applied and checked. Receipt: $active"
    $exitCode = 0
}
catch { Write-Error -Message $_.Exception.Message -ErrorAction Continue }
finally {
    for ($index = $heldMutexes.Count - 1; $index -ge 0; $index--) {
        $heldMutexes[$index].ReleaseMutex()
        $heldMutexes[$index].Dispose()
    }
}
exit $exitCode
