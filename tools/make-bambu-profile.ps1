# Builds a printer profile for the "Bambu ... project" download (assets/bambu/*.json)
# from two projects saved in Bambu Studio for the same printer:
#   -Multi   a project with 2 or more filaments
#   -Single  a project with 1 filament
# The output holds the multi-filament project's settings reduced to its first
# filament, plus which settings repeat per filament. Process settings the
# project had changed are reset to the system preset's values.
#
# Example:
#   powershell -ExecutionPolicy Bypass -File tools\make-bambu-profile.ps1 `
#     -Multi "$env:USERPROFILE\Downloads\Books_Read_Counter.3mf" `
#     -Single "$env:USERPROFILE\Downloads\nattbind_box (3).3mf" `
#     -Out assets\bambu\x2d-profile.json
param(
  [Parameter(Mandatory)][string]$Multi,
  [Parameter(Mandatory)][string]$Single,
  [Parameter(Mandatory)][string]$Out,
  [string]$Profiles = 'C:\Program Files\Bambu Studio\resources\profiles\BBL'
)
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ProjectSettings($path) {
  $z = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $path))
  $e = $z.GetEntry('Metadata/project_settings.config')
  if (-not $e) { throw "$path has no Metadata/project_settings.config" }
  $r = New-Object IO.StreamReader($e.Open()); $t = $r.ReadToEnd(); $r.Close(); $z.Dispose()
  $t | ConvertFrom-Json
}

$multiCfg = Read-ProjectSettings $Multi
$singleCfg = Read-ProjectSettings $Single
$n = @($multiCfg.filament_settings_id).Count
if ($n -lt 2) { throw '-Multi must have at least 2 filaments' }
if (@($singleCfg.filament_settings_id).Count -ne 1) { throw '-Single must have exactly 1 filament' }

# System values of the process preset, resolved through its inherits chain.
$name = $multiCfg.print_settings_id; $chain = @()
while ($name) {
  $j = Get-Content (Join-Path "$Profiles\process" "$name.json") -Raw | ConvertFrom-Json
  $chain += $j; $name = $j.inherits
}
[array]::Reverse($chain); $sys = @{}
foreach ($j in $chain) { foreach ($p in $j.PSObject.Properties) { $sys[$p.Name] = $p.Value } }

$cfg = [ordered]@{}
$perFilament = [ordered]@{}
foreach ($p in $multiCfg.PSObject.Properties) {
  $k = $p.Name; $v = $p.Value
  $o = $singleCfg.PSObject.Properties[$k]
  $lenN = if ($v -is [array]) { $v.Count } else { -1 }
  $len1 = if ($o -and $o.Value -is [array]) { $o.Value.Count } else { -1 }
  if ($lenN -gt 0 -and $len1 -gt 0 -and $lenN -ne $len1 -and $lenN -eq $n * $len1) {
    $perFilament[$k] = $len1
    $cfg[$k] = @($v[0..($len1 - 1)])
  } else {
    $cfg[$k] = $v
  }
}

$changed = (@($multiCfg.different_settings_to_system)[0]) -split ';' | Where-Object { $_ }
foreach ($k in $changed) { $cfg[$k] = $sys[$k]; "reset $k -> $($sys[$k])" }
$cfg['different_settings_to_system'] = @('', '', '')
$nozzles = @($multiCfg.flush_volumes_matrix).Count / ($n * $n)
$cfg['flush_volumes_matrix'] = @(1..$nozzles | ForEach-Object { '0' })

$about = "$($multiCfg.printer_settings_id), $($multiCfg.print_settings_id), $(@($multiCfg.filament_settings_id)[0]). Built from a Bambu Studio $($multiCfg.version) project; per_filament gives the block size each key repeats per filament."
$json = [ordered]@{ about = $about; per_filament = $perFilament; config = $cfg } | ConvertTo-Json -Depth 5 -Compress
[IO.File]::WriteAllText((Join-Path (Get-Location) $Out), $json, (New-Object Text.UTF8Encoding($false)))
"$($perFilament.Count) per-filament settings; wrote $Out"
