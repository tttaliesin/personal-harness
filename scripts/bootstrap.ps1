[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$RequestBase64)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$heldMutexes = [System.Collections.Generic.List[System.Threading.Mutex]]::new()
$exitCode = 1
$runSource = $null

function Get-CanonicalPath([string]$Value, [string]$Base) {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'An empty path is not valid.' }
    if ($Value.StartsWith('\\?\UNC\')) { $Value = '\\' + $Value.Substring(8) }
    elseif ($Value.StartsWith('\\?\')) { $Value = $Value.Substring(4) }
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

function Remove-OwnedSource([string]$Root, [string]$Parent, [string]$Name, [string[]]$ProtectedPaths) {
    $canonical = Get-CanonicalPath $Root $Parent
    if ($canonical -ne $Root -or [IO.Path]::GetDirectoryName($canonical) -ine $Parent -or
        [IO.Path]::GetFileName($canonical) -cne $Name -or $Name -notmatch '^[a-f0-9]{32}([a-f0-9]{32})?$') {
        throw 'Source cleanup refused an unowned directory.'
    }
    foreach ($persistent in $ProtectedPaths) {
        if ((Test-Within $persistent $canonical) -or (Test-Within $canonical $persistent)) {
            throw 'Source cleanup refused overlap with a persistent target.'
        }
    }
    Assert-NoLinks $canonical
    if (-not [IO.Directory]::Exists((Get-IOPath $canonical))) { return }
    $null = @(Get-VerifiedFiles $canonical)
    Remove-Item -LiteralPath (Get-IOPath $canonical) -Recurse -Force
    if ([IO.Directory]::Exists((Get-IOPath $canonical))) { throw 'Source cleanup did not remove its owned directory.' }
}

function Remove-RunSource($Run, [string]$Runs, [string[]]$ProtectedPaths) {
    Assert-NoLinks $Run.Root
    if ([IO.File]::Exists((Get-IOPath $Run.Root))) { throw 'Source cleanup refused a replaced ownership root.' }
    if (-not [IO.Directory]::Exists((Get-IOPath $Run.Root))) { return }
    $marker = [IO.Path]::Combine($Run.Root, 'owner.json')
    Assert-NoLinks $marker
    $owner = [IO.File]::ReadAllText((Get-IOPath $marker)) | ConvertFrom-Json
    if ($owner.nonce -cne $Run.Nonce -or $owner.payload_sha256 -cne $Run.Hash) {
        throw 'Source cleanup refused an invalid ownership marker.'
    }
    Remove-OwnedSource $Run.Root $Runs $Run.Nonce $ProtectedPaths
}

function Assert-RuntimeReferences([string]$Python, [string[]]$Files, [string[]]$Roots) {
    $audit = @'
import base64, json, os, re, sys, tomllib
request = json.loads(base64.b64decode(sys.argv[1]))
def normalized(value):
    lexical = value.replace('\\', '/').casefold()
    if lexical.startswith(('//./pipe/', '//?/pipe/')):
        suffix = lexical[9:]
        if not suffix or all(part not in ('', '.', '..') for part in suffix.removesuffix('/').split('/')):
            return lexical.rstrip('/')
    return os.path.realpath(os.path.normpath(value)).replace('\\', '/').removeprefix('//?/').casefold().rstrip('/')
roots = [normalized(root) for root in request['roots']]
def walk(value, local_paths=False):
    if isinstance(value, dict):
        for key, child in value.items():
            if key != 'env_vars':
                walk(child, local_paths or key == 'paths')
    elif isinstance(value, list):
        for child in value:
            walk(child, local_paths)
    elif isinstance(value, str):
        candidates = [value.replace('\\', '/').casefold()]
        candidates.extend(normalized(part) for part in value.split(';') if part)
        candidates.extend(normalized(part) for part in re.findall(r'(?:[A-Za-z]:[/\\]|\\\\)[^;\x22\x27]+', value))
        if '${REPO_ROOT}' in value or any(re.search(re.escape(root) + r'(?=$|[/;:\s\x22\x27])', candidate) for root in roots for candidate in candidates):
            raise ValueError()
        if local_paths and '/' in value.replace('\\', '/') and not os.path.isabs(value) and '${' not in value:
            raise ValueError()
try:
    for filename in request['files']:
        if os.path.isfile(filename):
            with open(filename, encoding='utf-8-sig') as stream:
                walk(tomllib.loads(stream.read()))
except Exception:
    print('Runtime reference audit failed; configuration must not depend on executable source.', file=sys.stderr)
    sys.exit(1)
'@
    $data = @{ files = @($Files); roots = @($Roots) } | ConvertTo-Json -Compress
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($data))
    & $Python -c $audit $encoded
    if ($LASTEXITCODE -ne 0) { throw 'Runtime reference audit failed; no configuration values were disclosed.' }
}

function Get-CapturedPayload([string]$Root, [string]$HostName, [switch]$Legacy, [switch]$Share) {
    if ($Legacy -and (Test-Path -LiteralPath (Get-IOPath ([IO.Path]::Combine($Root, '.git'))))) {
        throw 'Legacy source cleanup refused a foreign Git checkout.'
    }
    $manifest = [IO.File]::ReadAllText((Get-IOPath ([IO.Path]::Combine($Root, 'package.json')))) | ConvertFrom-Json
    if ($manifest.name -cne '@tttaliesin/personal-harness' -or
        $manifest.bin.'personal-harness' -cne 'bin/personal-harness.mjs') {
        throw 'Source package identity is not personal-harness.'
    }
    $required = @('package.json', 'README.md', 'requirements.txt', 'bin/personal-harness.mjs',
        'scripts/bootstrap.ps1', 'scripts/update-dependencies.ps1', 'scripts/install-dependencies.ps1',
        'scripts/harness.ps1', 'scripts/install_dependencies.py', 'scripts/harness.py',
        'common/AGENTS.md', 'common/config.toml', 'skills/create-readme/SKILL.md',
        'skills/agent-desktop/SKILL.md', 'skills/agent-desktop-windows/SKILL.md',
        'sources/agent-desktop-LICENSE', 'sources/dependencies.lock.json')
    if (-not $Share) { $required += "hosts/$hostName.toml" }
    if (-not $Legacy) { $required += 'scripts/share.py' }
    if (-not $Legacy -or $manifest.files -contains 'registry.toml') {
        $required += @('registry.toml', 'scripts/registry.py', 'scripts/mcp_packages.py', 'scripts/windows_paths.py')
    }
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
        $paths += @(Get-PayloadFiles $Root $entry $exclusions)
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
        $file = [IO.Path]::Combine($Root, $relative)
        $item = Get-Item -LiteralPath (Get-IOPath $file) -Force
        while ($item.FullName.Length -gt $Root.Length) {
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
    return @{ Files = $payload; Hash = (Get-Sha256 ([Text.Encoding]::UTF8.GetBytes($identity.ToString()))) }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'This installer requires Windows.' }
    $request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RequestBase64)) | ConvertFrom-Json
    if ($request.command -notin @('install', 'update', 'share')) { throw 'Expected install, update or share.' }
    $sharing = $request.command -eq 'share'
    $options = @{}
    foreach ($property in $request.options.PSObject.Properties) { $options[$property.Name] = $property.Value }
    $unavailable = if ($sharing) { @('locked', 'codex', 'localConfig') } else { @('list', 'select', 'dryRun', 'yes', 'branch') }
    foreach ($key in $unavailable) {
        if ($options.ContainsKey($key)) { throw "Option '$key' is not available for $($request.command)." }
    }
    $caller = Get-CanonicalPath $request.cwd ([Environment]::CurrentDirectory)
    $source = Get-CanonicalPath $request.sourceRoot $caller
    $hostName = if ($options.ContainsKey('host')) { [string]$options.host } else { [string]$env:COMPUTERNAME }
    $hostName = $hostName.ToLowerInvariant()
    if ($hostName -notmatch '^[a-z0-9][a-z0-9-]*$' -or
        (-not $sharing -and -not [IO.File]::Exists((Get-IOPath ([IO.Path]::Combine($source, "hosts/$hostName.toml")))))) {
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
    $runs = Get-CanonicalPath ([IO.Path]::Combine($manager, 'runs')) $caller
    $releases = Get-CanonicalPath ([IO.Path]::Combine($manager, 'releases')) $caller
    foreach ($persistent in @($manager, $state)) {
        if ((Test-Within $persistent $source) -or (Test-Within $persistent $releases) -or (Test-Within $persistent $runs)) {
            throw 'Manager and state roots must be outside the source payload and managed releases.'
        }
        Assert-NoLinks $persistent
    }
    if ((Test-Within $releases $state) -or (Test-Within $source $state) -or (Test-Within $runs $state)) {
        throw 'State root must not contain the source payload or managed releases.'
    }
    $agentsPath = Get-CanonicalPath ([IO.Path]::Combine($homePath, '.agents')) $caller
    foreach ($target in @($codexPath, $agentsPath)) {
        foreach ($protected in @($source, $releases, $runs)) {
            if ((Test-Within $target $protected) -or (Test-Within $protected $target)) {
                throw 'Output targets must not overlap the source payload or managed releases.'
            }
        }
    }
    Assert-NoLinks $homePath
    Assert-NoLinks $codexPath
    Assert-NoLinks $runs
    Assert-NoLinks $releases
    Assert-NoLinks ([IO.Path]::Combine($manager, 'active.json'))
    $overrides = @{}
    if ($options.ContainsKey('localConfig')) { $overrides.LocalConfig = Get-CanonicalPath $options.localConfig $caller }
    if ($options.ContainsKey('codex')) {
        $overrides.Codex = if ($options.codex -match '[/\\:]') { Get-CanonicalPath $options.codex $caller } else { $options.codex }
    }
    $capture = Get-CapturedPayload $source $hostName -Share:$sharing
    $payload = $capture.Files
    $payloadHash = $capture.Hash

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
    if ((Test-Within $python $source) -or (Test-Within $python $releases) -or (Test-Within $python $runs)) {
        throw 'The base Python executable must be outside the source payload and managed releases.'
    }
    $baseOutput = @(& $python -c "import sys; print(getattr(sys, '_base_executable', sys.executable))" 2>$null)
    if ($LASTEXITCODE -ne 0 -or $baseOutput.Count -ne 1) { throw 'Unable to verify the real Python base executable.' }
    $basePython = Get-CanonicalPath ([string]$baseOutput[0]) $caller
    foreach ($temporary in @($source, $releases, $runs)) {
        Assert-NoLinks $basePython
        if (Test-Within $basePython $temporary) { throw 'The real Python base must be outside executable source.' }
    }
    $localConfig = if ($overrides.ContainsKey('LocalConfig')) { $overrides.LocalConfig }
        else { [IO.Path]::Combine($state, "$hostName.toml") }
    $runtimePaths = @($localConfig)
    if ($overrides.ContainsKey('Codex') -and [IO.Path]::IsPathRooted($overrides.Codex)) {
        $runtimePaths += $overrides.Codex
    }
    foreach ($persistent in $runtimePaths) {
        if (Test-Within $persistent $source) { throw 'Local runtime paths must be outside executable source.' }
    }
    $protectedPaths = @($state, $codexPath, $agentsPath, $source, $python, $basePython) + $runtimePaths
    foreach ($persistent in $protectedPaths) {
        if ((Test-Within $persistent $runs) -or (Test-Within $persistent $releases)) {
            throw 'Persistent paths must be outside executable source.'
        }
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

    if ([IO.Directory]::Exists((Get-IOPath $runs)) -and
        (Get-Item -LiteralPath (Get-IOPath $runs) -Force).GetFileSystemInfos().Count -gt 0) {
        throw 'Abandoned source runs were retained; cleanup ownership must be resolved before retrying.'
    }
    $nonce = [Guid]::NewGuid().ToString('N')
    $runRoot = Get-CanonicalPath ([IO.Path]::Combine($runs, $nonce)) $caller
    $runSource = @{ Root = $runRoot; Nonce = $nonce; Hash = $payloadHash }
    Assert-NoLinks $runRoot
    [void][IO.Directory]::CreateDirectory((Get-IOPath $runRoot))
    Write-Json ([IO.Path]::Combine($runRoot, 'owner.json')) @{ nonce = $nonce; payload_sha256 = $payloadHash }
    $release = [IO.Path]::Combine($runRoot, 'source')
    foreach ($entry in $payload.GetEnumerator()) {
        $target = [IO.Path]::Combine($release, $entry.Key)
        [void][IO.Directory]::CreateDirectory((Get-IOPath ([IO.Path]::GetDirectoryName($target))))
        [IO.File]::WriteAllBytes((Get-IOPath $target), $entry.Value.Bytes)
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
        & (Get-IOPath $python) -m venv --without-pip (Get-IOPath $venv) | Out-Host
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
        & (Get-IOPath $venvPython) -m ensurepip --upgrade | Out-Host
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE; throw 'Python pip bootstrap failed. Fix the reported ensurepip error and retry.' }
        & (Get-IOPath $venvPython) -m pip install --disable-pip-version-check --requirement (Get-IOPath ([IO.Path]::Combine($release, 'requirements.txt'))) | Out-Host
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE; throw 'Installing the pinned Python requirements failed. Fix the reported pip error and retry.' }
        & $venvPython -c 'import tomlkit'
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE; throw 'Python requirements import check failed. Retry with a working Python 3.11+ installation.' }
        Write-Json $readyPath @{ requirements_sha256 = $requirementsHash; python = $python }
    }
    if ($sharing) {
        Assert-Payload $release $payload
        $shareArguments = @('--home', $homePath, '--codex-home', $codexPath, '--state-root', $state)
        foreach ($key in @('select', 'branch')) {
            if ($options.ContainsKey($key)) { $shareArguments += @("--$key", [string]$options[$key]) }
        }
        foreach ($entry in @{ list = '--list'; dryRun = '--dry-run'; yes = '--yes' }.GetEnumerator()) {
            if ($options.ContainsKey($entry.Key) -and [bool]$options[$entry.Key]) { $shareArguments += $entry.Value }
        }
        & $venvPython -B (Get-IOPath ([IO.Path]::Combine($release, 'scripts/share.py'))) @shareArguments
        $shareExitCode = $LASTEXITCODE
        if ($shareExitCode -ne 0) { $exitCode = $shareExitCode }
        Assert-Payload $release $payload
        $exitCode = $shareExitCode
    }
    else {
        $auditFiles = @([IO.Path]::Combine($release, 'common/config.toml'),
            [IO.Path]::Combine($release, "hosts/$hostName.toml"), [IO.Path]::Combine($release, 'registry.toml'),
            $localConfig, [IO.Path]::Combine($codexPath, 'config.toml'))
        Assert-RuntimeReferences $venvPython $auditFiles @($source, $runs, $releases)
        Assert-Payload $release $payload
        $arguments = @{
            Install = $true; StateRoot = $state; HomeDirectory = $homePath; CodexHome = $codexPath
            HostName = $hostName; Python = $venvPython; Locked = ($options.ContainsKey('locked') -and [bool]$options.locked)
        }
        foreach ($entry in $overrides.GetEnumerator()) { $arguments[$entry.Key] = $entry.Value }
        $global:LASTEXITCODE = 0
        & ([IO.Path]::Combine($release, 'scripts/update-dependencies.ps1')) @arguments
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE; throw 'Harness install/apply/check failed. The previous active receipt has been retained.' }
        Assert-Payload $release $payload
        Assert-RuntimeReferences $venvPython $auditFiles @($source, $runs, $releases)
        $legacy = @()
        if ([IO.Directory]::Exists((Get-IOPath $releases))) {
            Assert-NoLinks $releases
            foreach ($item in (Get-Item -LiteralPath (Get-IOPath $releases) -Force).GetFileSystemInfos()) {
                if ($item -isnot [IO.DirectoryInfo] -or $item.Name -cnotmatch '^[a-f0-9]{64}$') {
                    throw 'Legacy source cleanup is incomplete; an unknown entry was retained.'
                }
                $oldRoot = Get-CanonicalPath $item.FullName $caller
                Assert-NoLinks $oldRoot
                $old = Get-CapturedPayload $oldRoot $hostName -Legacy
                Assert-Payload $oldRoot $old.Files
                if ($old.Hash -cne $item.Name) { throw 'Legacy source cleanup is incomplete; a modified release was retained.' }
                $legacy += $oldRoot
            }
        }
        foreach ($oldRoot in $legacy) {
            Remove-OwnedSource $oldRoot $releases ([IO.Path]::GetFileName($oldRoot)) $protectedPaths
        }
        Remove-RunSource $runSource $runs $protectedPaths
        $receipt = @{
            schema_version = 2; payload_sha256 = $payloadHash
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
}
catch { Write-Error -Message $_.Exception.Message -ErrorAction Continue }
finally {
    if ($null -ne $runSource) {
        try { Remove-RunSource $runSource $runs $protectedPaths }
        catch {
            Write-Error -Message ("Source cleanup failed: " + $_.Exception.Message) -ErrorAction Continue
            if ($exitCode -eq 0) { $exitCode = 1 }
        }
    }
    for ($index = $heldMutexes.Count - 1; $index -ge 0; $index--) {
        $heldMutexes[$index].ReleaseMutex()
        $heldMutexes[$index].Dispose()
    }
}
exit $exitCode
