# Tiny web server for the game (no Python needed). Serves this folder at http://localhost:8002/
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8002
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.json'='application/json'; '.md'='text/plain; charset=utf-8'; '.ico'='image/x-icon' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$port/")
try { $l.Start() } catch { Write-Host "Port $port is busy. Close the other game window first."; Read-Host 'Press Enter to close'; exit 1 }
Write-Host "Game server running at http://localhost:$port/  (close this window to stop)"
$room = -join ((65..72) + (74..78) + (80..90) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
Start-Process "http://localhost:$port/?local=1&code=$room"
Start-Sleep -Milliseconds 800
Start-Process "http://localhost:$port/?local=1&room=$room"
while ($l.IsListening) {
  $ctx = $l.GetContext(); $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $res.StatusCode = 404 }
  } catch { $res.StatusCode = 500 }
  $res.Close()
}
