$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), '업무관리.lnk'))
$shortcut.TargetPath = (Resolve-Path (Join-Path $PSScriptRoot 'run.bat')).Path
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = (Resolve-Path (Join-Path $PSScriptRoot 'assets\icon.ico')).Path
$shortcut.Save()

Write-Host ""
Write-Host "바탕화면에 `"업무관리`" 바로가기를 만들었습니다."
Write-Host "이제부터는 바탕화면 아이콘을 더블클릭하면 바로 실행됩니다."
