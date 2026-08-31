$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location "C:\Users\Diego-Note\Documents\Default Project"
& "C:\Program Files\nodejs\npm.cmd" run dev *>&1 | Out-File -FilePath "C:\Users\Diego-Note\Documents\Default Project\log.txt" -Encoding utf8
