$file = "C:\Users\mjaym\GlazeBid v2\apps\builder\src\components\ProjectIntake.jsx"
$lines = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)

$result = [System.Collections.Generic.List[string]]::new()

# State machine flags
$inSecondaryCards = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $trimmed = $line.TrimStart()

    # ── 1. radarCard <div> opening ──────────────────────────────
    if ($trimmed -eq '<div style={styles.radarCard}>') {
        $indent = $line.Substring(0, $line.Length - $trimmed.Length)
        $result.Add("$indent<motion.div")
        $result.Add("$indent  className=`"glass-card`"")
        $result.Add("$indent  style={styles.radarCard}")
        $result.Add("$indent  initial={{ opacity: 0, y: 10 }}")
        $result.Add("$indent  animate={{ opacity: 1, y: 0 }}")
        $result.Add("$indent  transition={{ duration: 0.4, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}")
        $result.Add("$indent>")
        continue
    }

    # ── 2. radarCard closing </div> ── uniquely after Projects count span
    #    Look-behind: line i-1 is "                </div>" and i-2 is "</div>" (inner closing)
    #    We detect by checking if the previous result lines form the radarCard stack
    if ($trimmed -eq '</div>' -and $result.Count -ge 3) {
        $prev1 = $result[$result.Count - 1].TrimStart()
        $prev2 = $result[$result.Count - 2].TrimStart()
        if ($prev1 -eq '</div>' -and $prev2 -eq '</div>') {
            # Check that 3 levels back has the "Projects" count span
            $prev3 = $result[$result.Count - 3].TrimStart()
            if ($prev3 -like '*recentProjects*length*</span>') {
                $indent = $line.Substring(0, $line.Length - $trimmed.Length)
                $result.Add("$indent</motion.div>")
                continue
            }
        }
    }

    # ── 3. Secondary cards <div key={i} opening ──────────────────
    if ($trimmed -eq '<div') {
        # Peek ahead to see if next non-empty line is "key={i}"
        $j = $i + 1
        while ($j -lt $lines.Count -and $lines[$j].Trim() -eq '') { $j++ }
        if ($j -lt $lines.Count -and $lines[$j].Trim() -eq 'key={i}') {
            $indent = $line.Substring(0, $line.Length - $trimmed.Length)
            # Consume the block up to the closing >
            $attrs = @()
            $i++
            while ($i -lt $lines.Count -and $lines[$i].Trim() -ne '>') {
                $attrs += $lines[$i].Trim()
                $i++
            }
            # $i is now on the ">" line
            $result.Add("$indent<motion.div")
            $result.Add("$indent  key={i}")
            $result.Add("$indent  className=`"glass-card`"")
            $result.Add("$indent  style={styles.projectMiniCard}")
            $result.Add("$indent  initial={{ opacity: 0, y: 10 }}")
            $result.Add("$indent  animate={{ opacity: 1, y: 0 }}")
            $result.Add("$indent  transition={{ duration: 0.4, delay: 0.3 + i * 0.06, ease: [0.23, 1, 0.32, 1] }}")
            $result.Add("$indent  onClick={() => onProjectReady({ projectName: p.name })}")
            $result.Add("$indent  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.4)'; }}")
            $result.Add("$indent  onMouseLeave={e => { e.currentTarget.style.borderColor = '#27272a'; }}")
            $result.Add("$indent>")
            $inSecondaryCards = $true
            continue
        }
    }

    # ── 4. Secondary cards </div> closing (before ");") ──────────
    if ($inSecondaryCards -and $trimmed -eq '</div>') {
        $j = $i + 1
        while ($j -lt $lines.Count -and $lines[$j].Trim() -eq '') { $j++ }
        if ($j -lt $lines.Count -and $lines[$j].Trim() -eq ');') {
            $indent = $line.Substring(0, $line.Length - $trimmed.Length)
            $result.Add("$indent</motion.div>")
            $inSecondaryCards = $false
            continue
        }
    }

    # ── 5. newTakeoffCard <div opening ──────────────────────────
    if ($trimmed -eq '<div') {
        $j = $i + 1
        while ($j -lt $lines.Count -and $lines[$j].Trim() -eq '') { $j++ }
        if ($j -lt $lines.Count -and $lines[$j].Trim() -eq 'style={styles.newTakeoffCard}') {
            $indent = $line.Substring(0, $line.Length - $trimmed.Length)
            # Consume until closing >
            $i++
            while ($i -lt $lines.Count -and $lines[$i].Trim() -ne '>') { $i++ }
            $result.Add("$indent<motion.div")
            $result.Add("$indent  className=`"glass-card`"")
            $result.Add("$indent  style={styles.newTakeoffCard}")
            $result.Add("$indent  initial={{ opacity: 0, y: 10 }}")
            $result.Add("$indent  animate={{ opacity: 1, y: 0 }}")
            $result.Add("$indent  transition={{ duration: 0.4, delay: 0.42, ease: [0.23, 1, 0.32, 1] }}")
            $result.Add("$indent  onClick={() => setShowUploadModal(true)}")
            $result.Add("$indent  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.5)'; e.currentTarget.style.background = 'rgba(14,165,233,0.04)'; }}")
            $result.Add("$indent  onMouseLeave={e => { e.currentTarget.style.borderColor = '#3f3f46'; e.currentTarget.style.background = 'transparent'; }}")
            $result.Add("$indent>")
            continue
        }
    }

    $result.Add($line)
}

[System.IO.File]::WriteAllLines($file, $result, [System.Text.Encoding]::UTF8)
Write-Host "Done. Lines: $($result.Count)"

