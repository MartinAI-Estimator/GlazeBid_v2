$file = "C:\Users\mjaym\GlazeBid v2\apps\builder\src\components\ProjectIntake.jsx"
$lines = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)

# Find marker indices (0-based)
$bodyStart = -1
$bodyEnd   = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Contains('<div style={styles.bentoBody}>') -and $bodyStart -eq -1) { $bodyStart = $i - 1 }
    if ($lines[$i].Contains('end bentoBody') -and $bodyEnd -eq -1)                   { $bodyEnd   = $i }
}
Write-Host "Replacing lines $bodyStart to $bodyEnd (0-based)"

$newSection = @'
      {/* ── BODY ── */}
      <div style={styles.bentoBody}>

        {/* 12-column Bento Grid */}
        {(() => {
          const hero      = (recentProjects ?? []).find(p => getProjectStatus(p) !== 'completed') || (recentProjects ?? [])[0];
          const secondary = (recentProjects ?? []).filter(p => p !== hero).slice(0, 2);
          return (
            <div style={styles.bentoGridNew}>

              {/* ── HERO CARD (col-span-8) ── */}
              {hero ? (
                <div
                  style={styles.heroCard}
                  onClick={() => onProjectReady({ projectName: hero.name })}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(14,165,233,0.12), 0 8px 32px rgba(0,0,0,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#27272a'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)'; }}
                >
                  <div style={styles.heroShimmer} />
                  <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        {(() => {
                          const st = statusMeta[getProjectStatus(hero)] || statusMeta['new'];
                          return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1px solid', color: st.color, borderColor: st.color + '55', background: st.color + '18', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{st.label}</span>;
                        })()}
                        {hero.bidDate && <span style={{ fontSize: 11, color: '#a1a1aa' }}>{getDaysLeft(hero.bidDate)}d to bid</span>}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#fafafa', marginBottom: 6, lineHeight: 1.2, letterSpacing: '-0.3px' }}>{hero.name}</div>
                      <div style={{ fontSize: 12, color: '#71717a' }}>Last modified {new Date(hero.modified).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: '#71717a' }}>Progress</span>
                        <span style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600 }}>{getProjectProgress(hero.name)}%</span>
                      </div>
                      <div style={{ height: 4, background: '#27272a', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${getProjectProgress(hero.name)}%`, background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)', borderRadius: 9999, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ position: 'absolute', bottom: 20, right: 24, zIndex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#0ea5e9' }}>Open &#8594;</span>
                  </div>
                </div>
              ) : (
                <div
                  style={{ ...styles.heroCard, alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setShowUploadModal(true)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.5)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#27272a'; }}
                >
                  <Plus size={32} color="#0ea5e9" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e4e4e7', marginBottom: 6 }}>Start your first project</div>
                  <div style={{ fontSize: 13, color: '#52525b' }}>Drop drawings &amp; specs to begin intake</div>
                </div>
              )}

              {/* ── RADAR PANEL (col-span-4) ── */}
              <div style={styles.radarCard}>
                <div>
                  <div style={styles.bentoWidgetHeader}>
                    <Calendar size={13} style={{ marginRight: 7, color: '#52525b', flexShrink: 0 }} />
                    <span style={styles.bentoWidgetTitle}>Deadlines</span>
                  </div>
                  {upcomingDeadlines.length === 0
                    ? <div style={{ color: '#52525b', fontSize: 12, padding: '8px 0' }}>No upcoming deadlines</div>
                    : upcomingDeadlines.slice(0, 3).map(dl => {
                        const days = getDaysLeft(dl.date);
                        return (
                          <div key={dl.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1c1c1f' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block', background: dl.priority === 'high' ? '#ef4444' : dl.priority === 'medium' ? '#f59e0b' : '#3fb950' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dl.title}</div>
                              <div style={{ fontSize: 11, color: '#52525b' }}>{dl.project}</div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: days <= 3 ? '#ef4444' : '#a1a1aa', flexShrink: 0 }}>{days}d</div>
                          </div>
                        );
                      })
                  }
                </div>
                <div style={{ borderTop: '1px solid #27272a', paddingTop: 14, marginTop: 14 }}>
                  <div style={styles.bentoWidgetHeader}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3fb950', display: 'inline-block', marginRight: 8, flexShrink: 0 }} />
                    <span style={styles.bentoWidgetTitle}>System</span>
                  </div>
                  {[['AI Engine', true], ['Bid Database', true], ['PDF Parser', true]].map(([label, online]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                      <span style={{ fontSize: 12, color: '#71717a' }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, color: online ? '#3fb950' : '#ef4444', background: online ? '#3fb95018' : '#ef444418', border: `1px solid ${online ? '#3fb95040' : '#ef444440'}` }}>{online ? 'Online' : 'Offline'}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                    <span style={{ fontSize: 12, color: '#71717a' }}>Projects</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7' }}>{(recentProjects ?? []).length}</span>
                  </div>
                </div>
              </div>

              {/* ── SECONDARY PROJECT CARDS (col-span-4 each) ── */}
              {secondary.map((p, i) => {
                const st   = statusMeta[getProjectStatus(p)] || statusMeta['new'];
                const prog = getProjectProgress(p.name);
                return (
                  <div
                    key={i}
                    style={styles.projectMiniCard}
                    onClick={() => onProjectReady({ projectName: p.name })}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#27272a'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, border: '1px solid', color: st.color, borderColor: st.color + '55', background: st.color + '18', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{st.label}</span>
                      <span style={{ fontSize: 11, color: '#52525b' }}>{new Date(p.modified).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e4e4e7', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#52525b', marginBottom: 14 }}>Takeoff in progress</div>
                    <div style={{ height: 3, background: '#27272a', borderRadius: 9999, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ height: '100%', width: `${prog}%`, background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)', borderRadius: 9999 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#0ea5e9', fontWeight: 600 }}>Open &#8594;</span>
                  </div>
                );
              })}

              {/* ── NEW TAKEOFF CTA (col-span-4) ── */}
              <div
                style={styles.newTakeoffCard}
                onClick={() => setShowUploadModal(true)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.5)'; e.currentTarget.style.background = 'rgba(14,165,233,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#3f3f46'; e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Plus size={20} color="#0ea5e9" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7', marginBottom: 4 }}>Start New Takeoff</div>
                <div style={{ fontSize: 12, color: '#52525b', lineHeight: 1.4 }}>Drop drawings &amp; specs or browse files to begin</div>
              </div>

            </div>
          );
        })()}

      </div>{/* end bentoBody */}
'@

$newLines = $newSection -split "`n" | ForEach-Object { $_ -replace "`r", "" }

# Build result: before + new content + after
$before = $lines[0..($bodyStart - 1)]
$after  = $lines[($bodyEnd + 1)..($lines.Count - 1)]

$result = $before + $newLines + $after

[System.IO.File]::WriteAllLines($file, $result, [System.Text.Encoding]::UTF8)
Write-Host "Done. New line count: $($result.Count)"
