# Собирает ciabatta-site.zip — только файлы сайта, готовые к загрузке на хостинг.
#
# Почему не Compress-Archive: он пишет пути внутри архива с обратными слэшами
# (icons\icon-192.png), и на Linux-хостинге вместо папки icons появляется файл
# со «страшным» именем — иконки не находятся. Здесь пути всегда с прямыми слэшами.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path $PSScriptRoot -Parent
$out  = Join-Path $root 'ciabatta-site.zip'
if (Test-Path $out) { Remove-Item $out -Force }

$files  = @(Get-ChildItem (Join-Path $root 'icons') -File)
$files += @('index.html', 'ciabatta.html', 'manifest.json', 'sw.js') |
          ForEach-Object { Get-Item (Join-Path $root $_) }
$files = $files | Sort-Object FullName

$zip = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
  [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $zip, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal)
}
$zip.Dispose()

$zip = [System.IO.Compression.ZipFile]::OpenRead($out)
Write-Host "Собран $out ($((Get-Item $out).Length) байт):" -ForegroundColor Green
$zip.Entries | ForEach-Object { Write-Host ("  " + $_.FullName) }
$zip.Dispose()
