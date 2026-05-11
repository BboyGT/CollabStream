param(
  [string]$WebProvider = "vercel",
  [string]$ServerProvider = "railway"
)

Write-Host "Deploying CollabStream..."

if ($ServerProvider -eq "railway") {
  Write-Host "Deploying server to Railway..."
  Push-Location "$PSScriptRoot\..\apps\server"
  railway up
  Pop-Location
}

if ($WebProvider -eq "vercel") {
  Write-Host "Deploying web to Vercel..."
  Push-Location "$PSScriptRoot\..\apps\web"
  vercel
  Pop-Location
}

Write-Host "Done."
