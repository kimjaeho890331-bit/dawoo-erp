$lines = Get-Content 'C:\Users\dawoo0\dawoo-erp\.env.local' | Where-Object { $_ -match '^(GITHUB_TOKEN|SUPABASE_ACCESS_TOKEN)=' }
foreach ($line in $lines) {
    $parts = $line -split '=', 2
    $name = $parts[0]
    $value = $parts[1]
    [Environment]::SetEnvironmentVariable($name, $value, 'User')
    Write-Host "[OK] $name registered ($($value.Length) chars)"
}
