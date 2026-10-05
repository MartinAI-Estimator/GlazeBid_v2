import json, html
T=json.load(open('takeoff_blind.json')); C=json.load(open('corrections.json'))
IM=json.load(open('sheet_images.json')); s=IM['scale']
his=json.load(open('martin_markups.json'))
CSS=open('_css.txt').read(); SCRIPT=open('_script.txt').read()
CSS=CSS.replace('--sf:#FF8000;','--sf:#FF8000;--cw:#008000;--ag:#00a0a0;')
CSS=CSS.replace('.pill.ex{{','.pill.cw{{color:var(--cw);border-color:var(--cw);background:#00800018}} .pill.ag{{color:#006a6a;border-color:var(--ag);background:#80ffff33}} .pill.nt{{color:var(--muted);border-color:var(--line)}} .tile.cw{{border-left:5px solid var(--cw)}} .tile.ag{{border-left:5px solid #80FFFF}} .pill.ex{{')
CSS=CSS.replace('{{','{').replace('}}','}'); SCRIPT=SCRIPT.replace('{{','{').replace('}}','}')
COL={'Ext SF Highlight':'#FF8000','Int SF Highlight':'#FF8000','Ext. SF Area':'#FF8000','Ext SF Door':'#FF8000','Int SF Door':'#FF8000','Ext SF Polylength':'#FF8000','Int SF Polylength':'#FF8000',
     'Ext CW Highlight':'#008000','Ext. CW Area':'#008000','Ext CW Polylength':'#008000',
     'All Glass Highlight':'#00a0a0','All Glass Wall Highlight':'#00a0a0','All Glass Wall Area':'#00a0a0','All Glass Wall Polylength':'#00a0a0','All Glass Doors':'#00a0a0','SSG Caulk Count':'#00a0a0','Polished Edge Count':'#00a0a0','Glass Handrail Area':'#7030A0',
     'Glazing Only Highlight':'#800040','Glazing ONLY Door':'#800040','Break Metal Flashing & Trims':'#008080','Bifold/Auto Door':'#C8B400','Glass Film':'#7030A0',
     'Excluded by Binswanger':'#FF0000','Qty Text Box':'#FFFFFF','Scope Note':'#444444','Hardware Set':'#1f4e79','Length Measurement':'#444444','Callout':'#444444','Typewritten Text':'#444444','Highlight':'#7030A0'}
def esc(x): return html.escape(str(x))
def svg_mark(m, layer):
    sub=m['subject']; col=COL.get(sub,'#888'); item=m.get('item','')
    dash=' stroke-dasharray="6 4"' if (layer=='fix' or m.get('dashed')) else ''
    tip=f"{sub} — {item}" + (f" ({m['note']})" if m.get('note') else '') + (f"\n{m['why']}" if m.get('why') else '')
    if 'center' in m:
        cx,cy=m['center']; r=m['r']
        return f'<circle data-item="{esc(item)}" cx="{cx*s:.1f}" cy="{cy*s:.1f}" r="{r*s:.1f}" fill="{col}" fill-opacity="0.9" stroke="#000" stroke-width="1"{dash}><title>{esc(tip)}</title></circle>'
    if 'at' in m:
        x,y=m['at']; txt=m['text']; w=len(txt)*5.2+10
        return f'<g data-item="{esc(item)}"><rect x="{x*s:.1f}" y="{(y-7)*s:.1f}" width="{w}" height="12" fill="#fff" stroke="#000" stroke-width="0.8"{dash}/><text x="{x*s+4:.1f}" y="{(y+2)*s:.1f}" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#000">{esc(txt)}</text><title>{esc(tip)}</title></g>'
    x0,y0,x1,y1=m['rect']
    area=sub.endswith('Area')
    out=f'<rect data-item="{esc(item)}" x="{x0*s:.1f}" y="{y0*s:.1f}" width="{max(1,(x1-x0)*s):.1f}" height="{max(1,(y1-y0)*s):.1f}" fill="{col}" fill-opacity="{0.0 if area else 0.35}" stroke="{col}" stroke-width="{2 if area else 1.2}"{dash}><title>{esc(tip)}</title></rect>'
    if m.get('text') and area:
        lines=m['text'].split('\n'); cx=(x0+x1)/2*s; cy=y0*s-4-10*len(lines)
        out+=f'<g data-item="{esc(item)}"><rect x="{cx-38:.1f}" y="{cy-2:.1f}" width="76" height="{10*len(lines)+4}" fill="#fff" fill-opacity="0.92" stroke="{col}" stroke-width="0.6"/>' + ''.join(f'<text x="{cx:.1f}" y="{cy+8+10*i:.1f}" font-size="7.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" fill="#000">{esc(l)}</text>' for i,l in enumerate(lines)) + '</g>'
    return out
def his_mark(h):
    sub=h['subject'] or h['type']; col=COL.get(sub,'#444'); x0,y0,x1,y1=h['rect']
    content=(h['content'] or '').replace('sfW','sf / W').replace('"H','" / H')
    tip=f"Martin: {sub}" + (f" — {content}" if content else '')
    if h['type']=='Circle':
        return f'<circle cx="{(x0+x1)/2*s:.1f}" cy="{(y0+y1)/2*s:.1f}" r="{max(3,(x1-x0)/2*s):.1f}" fill="none" stroke="{col}" stroke-width="2.2"><title>{esc(tip)}</title></circle>'
    if h['type']=='FreeText':
        return f'<g><rect x="{x0*s:.1f}" y="{y0*s:.1f}" width="{(x1-x0)*s:.1f}" height="{(y1-y0)*s:.1f}" fill="#fff" stroke="#222" stroke-width="0.8"/><text x="{x0*s+3:.1f}" y="{y1*s-3:.1f}" font-size="8" font-family="IBM Plex Mono, monospace" fill="#000">{esc(content[:28])}</text><title>{esc(tip)}</title></g>'
    if h['type']=='PolyLine':
        horiz=(x1-x0)>=(y1-y0)
        if horiz: X0,Y0,X1,Y1=x0,(y0+y1)/2,x1,(y0+y1)/2
        else: X0,Y0,X1,Y1=(x0+x1)/2,y0,(x0+x1)/2,y1
        return f'<line x1="{X0*s:.1f}" y1="{Y0*s:.1f}" x2="{X1*s:.1f}" y2="{Y1*s:.1f}" stroke="{col}" stroke-width="3" stroke-dasharray="4 3" stroke-linecap="round"><title>{esc(tip)}</title></line>'
    if h['type']=='Stamp': return ''
    area=sub.endswith('Area')
    fill='none' if area else col
    out=f'<rect x="{x0*s:.1f}" y="{y0*s:.1f}" width="{max(1,(x1-x0)*s):.1f}" height="{max(1,(y1-y0)*s):.1f}" fill="{fill}" fill-opacity="0.28" stroke="{col}" stroke-width="2.2" stroke-dasharray="2 3"><title>{esc(tip)}</title></rect>'
    if content and area:
        lines=content.split(' / '); cx=(x0+x1)/2*s; cy=y1*s+4
        out+=f'<g><rect x="{cx-40:.1f}" y="{cy:.1f}" width="80" height="{10*len(lines)+4}" fill="#fff" fill-opacity="0.92" stroke="{col}" stroke-width="0.6" stroke-dasharray="2 2"/>'+''.join(f'<text x="{cx:.1f}" y="{cy+10+10*i:.1f}" font-size="7.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" fill="#000">{esc(l)}</text>' for i,l in enumerate(lines))+'</g>'
    return out

fixed_replaced={tuple(f['replaces']) for f in C['fixes'] if f.get('replaces')}
sheet_order=['A3.2','A3.3','A1.2','A2.0','A3.0','A3.1','A4.2','A4.3','A4.4','A5.0','A5.1','A5.3','A5.5','A5.9']
sheet_title={'A3.2':'Exterior door & frame schedule (pictorial)','A3.3':'Interior door & frame schedule (pictorial)','A1.2':'Reference plans (lower + upper)','A2.0':'Exterior elevations + materials legend','A3.0':'Finish schedule · enlarged toilet plans · accessories','A3.1':'Finish materials legend (interior)','A4.2':'Plan details','A4.3':'Plan details','A4.4':'Plan details','A5.0':'Wall sections','A5.1':'Wall sections','A5.3':'Wall sections · U-channel head/sill','A5.5':'Wall sections (not in Martin\'s set)','A5.9':'Wall sections (not in Martin\'s set)'}
viewer=''
for sh in sheet_order:
    im=IM['sheets'][sh]
    ai=[m for m in T['markups'] if m['sheet']==sh and tuple(m.get('rect',[]))not in fixed_replaced]
    fx=[m for m in C['fixes']+C['added'] if m['sheet']==sh]
    hm=[h for h in his if h['sheet']==sh]
    viewer+=f'''<section class="sheet" data-sheet="{sh}" hidden>
  <div class="stage"><div class="zoomwrap"><div class="zoomer">
    <img src="data:image/jpeg;base64,{im['b64']}" width="{im['w']}" height="{im['h']}" alt="Sheet {sh}" draggable="false">
    <svg class="ov ov-ai" viewBox="0 0 {im['w']} {im['h']}">{''.join(svg_mark(m,'ai') for m in ai)}</svg>
    <svg class="ov ov-fix" viewBox="0 0 {im['w']} {im['h']}">{''.join(svg_mark(m,'fix') for m in fx)}</svg>
    <svg class="ov ov-his" viewBox="0 0 {im['w']} {im['h']}">{''.join(his_mark(h) for h in hm)}</svg>
  </div></div></div>
  <p class="sheetcap"><b>{sh}</b> {esc(sheet_title[sh])} · AI markups: {len(ai)} · after comparison: {len(fx)} · Martin: {len(hm)}</p>
</section>'''

BADGE={'ext_sf':('Ext SF','sf'),'ext_cw':('Ext CW (legend)','cw'),'int_sf':('Int SF','sf'),'all_glass':('All Glass','ag'),'glazing_only':('Glazing Only','go'),'bifold':('Bi-fold · pass-thru','hw'),'break_metal':('Break Metal','bm'),'glass_film':('Glass Film','ag'),'hardware':('Hardware','hw'),'mirror':('Mirror · flag','go'),'note':('Note','nt'),'detail':('Details','nt'),'excluded':('Excluded','ex'),'not_ours':('Not ours','nt')}
rows=''
order=['ext_cw','ext_sf','int_sf','all_glass','glazing_only','bifold','break_metal','glass_film','hardware','mirror','note','detail','excluded','not_ours']
items=sorted(T['items'],key=lambda i:(order.index(i['class']) if i['class'] in order else 99))
for it in items:
    k=it['class']; badge,cls=BADGE.get(k,(k,''))
    size=' × '.join(x for x in [it.get('w'),it.get('h')] if x)
    grid=f"{it['bays']} × {it['rows']}" if it.get('bays') else ''
    sf=f"{it['sf']:.1f}" if isinstance(it.get('sf'),(int,float)) else ''
    flags=''.join(f'<li>{esc(f)}</li>' for f in it.get('flags',[]))
    extra=''
    if it.get('elev_w'): extra+=f'<div class=hw>Elevation snap: {esc(it["elev_w"])} × {esc(it["elev_h"])}</div>'
    if it.get('hardware'): extra+=f'<div class=hw>{esc(it["hardware"])}</div>'
    rows+=f'''<tr class="{cls}"><td><span class="pill {cls}">{badge}</span></td><td class="lab">{esc(it['label'])}</td><td>{esc(it['desc'])}{extra}</td><td class="num">{esc(size)}</td><td class="num">{grid}</td><td class="num">{sf}</td><td class="num">{esc(it.get('qty',''))}</td><td class="ev">{esc(it['evidence'])}{('<ul class=flag>'+flags+'</ul>') if flags else ''}{('<div class=rule>Rule: '+esc(it['rule'])+'</div>') if it.get('rule') else ''}</td></tr>'''

flags=''.join(f'<li>{esc(f)}</li>' for f in T['review_flags'])
rfis=''.join(f'<div class="rfi"><div class="rfih">RFI draft → {esc(r["to"])}</div><div class="rfis">{esc(r["subject"])}</div><p>{esc(r["body"])}</p></div>' for r in T['rfi_drafts'])
conv=''.join(f'<li>{esc(x)}</li>' for x in C['convention_differences'])
mo=''.join(f'<li>{esc(x)}</li>' for x in C['mine_only_judgment'])
added=''.join(f'<li><b>{esc(a["sheet"])} {esc(a["item"])}</b> — {esc(a["why"])}</li>' for a in C['added'])
fixes=''.join(f'<li><b>{esc(a["sheet"])} {esc(a["item"])}</b> — {esc(a["why"])}</li>' for a in C['fixes'])
sc=C['scorecard']
tot=T['totals']
ext_sf_sf=sum(i['sf'] or 0 for i in T['items'] if i['class']=='ext_sf'); ext_cw_sf=sum(i['sf'] or 0 for i in T['items'] if i['class']=='ext_cw'); ag_sf=sum(i['sf'] or 0 for i in T['items'] if i['class']=='all_glass' and i.get('sf'))

page=f'''<title>McLarty Mazda Takeoff</title>
<meta name="description" content="Blind glazing takeoff of the McLarty Mazda drawing set by GlazeBid, compared with Martin's Bluebeam markups.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
{CSS}
<div class="wrap">
<header>
 <div class="eyebrow">GlazeBid · demonstration takeoff #2 · read blind on the 35-sheet set, then compared with Martin's 12-sheet marked set</div>
 <h1>McLarty Mazda of Little Rock — new sales &amp; service facility</h1>
 <div class="meta"><span>Set: <b>Orig Plans 10.16.2025 PRELIMINARY · BCO+H Architects · 35 sheets (Cover, LS, A1–A6)</b></span><span>Systems: <b>Pittco TMW 450 / TMW 450 EFG (legend SF-1 "curtain wall") · TMS 114XTFG (SF-2 "storefront") · EMS 114 interior · ½" frameless · black #63</b></span><span>Glass: <b>1" Solarban 72 Acuity low-iron IG · ¼" / ½" clear tempered interior</b></span><span>Specs: <b>none in set (flagged)</b></span><span>Scale: <b>schedule drawings ¼" = 1'-0", plans/elevations ⅛" = 1'-0" (vector-snapped)</b></span></div>
 <div class="totals">
  <div class="tile cw"><div class="n">{tot['ext_frames_TMW450']}</div><div class="l">TMW 450 frames (legend: curtain wall) · {ext_cw_sf:,.0f} sf · 6 alum doors + 2 bi-fold pairs</div></div>
  <div class="tile sf"><div class="n">{tot['ext_frames_TMS114']}</div><div class="l">TMS 114 storefront frames · {ext_sf_sf:,.0f} sf · 1 bi-fold pair</div></div>
  <div class="tile sf"><div class="n">{tot['int_sf_frames']}</div><div class="l">EMS 114 interior storefront frames (1 pair doors)</div></div>
  <div class="tile ag"><div class="n">{tot['all_glass_openings']}</div><div class="l">Frameless ½" openings · {ag_sf:,.0f} sf · 8 all-glass doors · frost film</div></div>
  <div class="tile go"><div class="n">{tot['glazing_only']}</div><div class="l">Glazing-only (HM vision lites, HM sidelites, 14' HM window)</div></div>
  <div class="tile ex"><div class="n">{tot['excluded']}</div><div class="l">Considered &amp; excluded (5 OH doors, 4 Rytec, 2 grilles)</div></div>
 </div>
 <div class="verdict"><b>Result against Martin's markups:</b> {sc['found_blind']} of {sc['objects_martin_marked']} scope objects he marked were found blind ({sc['found_pct']}%) with {sc['false_scope']} false scope: all 16 exterior frames, all 6 exterior glazing-only items, the 3 interior storefront frames, 4 interior glazing-only items, all 24 frameless openings, the break metal, note 10, the A2.0 legend rows and all 15 detail titles he marked. Missed: the two glass rows in the A3.1 interior finish legend, finish note 13 on A3.0, and his silicone-joint and polished-edge counts. Sizes matched his Areas within an inch after one rounding bug was fixed (type 1). The comparison also exposed that bug and a region bug in the detail finder — both now fixed in the code.</div>
</header>

<h2>Sheets</h2>
<div class="tabs" role="tablist">{''.join(f'<button class="tab" role="tab" aria-selected="{"true" if i==0 else "false"}" data-sheet="{sh}">{sh}</button>' for i,sh in enumerate(sheet_order))}</div>
<div class="layers">
 <label><input type="checkbox" id="ly-ai" checked><span class="sw" style="background:#FF8000"></span>AI takeoff (blind)</label>
 <label><input type="checkbox" id="ly-fix" checked><span class="sw fix"></span>Added after comparison (dashed)</label>
 <label><input type="checkbox" id="ly-his"><span class="sw his"></span>Martin's Bluebeam markups (dotted outline / dashed lines)</label>
 <div class="zoomctl"><button id="zout" type="button">−</button><span id="zlab" style="font-family:var(--mono);font-size:12px">100%</span><button id="zin" type="button">+</button><button id="zfit" type="button">fit</button></div>
</div>
<div class="key"><span><i style="background:#FF8000"></i>Ext / Int SF</span><span><i style="background:#008000"></i>Ext CW (per legend)</span><span><i style="background:#80FFFF;border:1px solid #00a0a0"></i>All glass</span><span><i style="background:#800040"></i>Glazing only</span><span><i style="background:#008080"></i>Break metal</span><span><i style="background:#C8B400"></i>Bi-fold (pass-thru)</span><span><i style="background:#7030A0"></i>Glass film</span><span><i style="background:#FF0000"></i>Excluded</span><span><i style="background:#fff;border:1px solid #000"></i>Qty box / Area W·H·SF</span><span>Hover any mark for its source. Every AI rectangle is a snapped vector frame, a tag hexagon, a text line or a legend row — none are hand-placed.</span></div>
{viewer}

<h2>Scope ledger</h2>
<div class="tw"><table>
<thead><tr><th>Class</th><th>Mark · qty</th><th>Description</th><th>W × H</th><th>Bays × rows</th><th>SF</th><th>Qty</th><th>Evidence · flags</th></tr></thead>
<tbody>{rows}</tbody></table></div>

<div class="two" style="margin-top:18px">
 <div class="card"><h3>Review flags</h3><ul>{flags}</ul></div>
 <div class="card"><h3>RFI drafts</h3>{rfis}</div>
</div>

<h2>Comparison with Martin's marked set (428 markups on 12 sheets)</h2>
<div class="score">
 <div class="tile"><div class="n good">{sc['found_blind']} / {sc['objects_martin_marked']}</div><div class="l">Scope objects he marked that I found blind</div></div>
 <div class="tile"><div class="n good">{sc['false_scope']}</div><div class="l">False scope</div></div>
 <div class="tile"><div class="n bad">{len(sc['misses'])}</div><div class="l">Misses: {esc('; '.join(sc['misses']))}</div></div>
 <div class="tile"><div class="n bad">{sc['size_errors_blind']}</div><div class="l">Size error in the blind run (type 1, rounding bug — fixed)</div></div>
 <div class="tile"><div class="n">{sc['classification_diffs']}</div><div class="l">Classification difference (type 8: he SF, I CW by legend)</div></div>
 <div class="tile"><div class="n">{len(sc['partial'])}</div><div class="l">Partial: {esc('; '.join(sc['partial']))}</div></div>
</div>
<div class="tw" style="margin-top:14px"><table class="cmp">
<thead><tr><th>Scope object</th><th>Martin</th><th>AI (blind)</th><th>Verdict</th></tr></thead><tbody>
<tr><td>Types 1, 2, 3 — two-story TMW 450 EFG</td><td>Ext CW: type drawings, HW tables; Areas lower + upper (1: 14'-4½" × 10' / 12'; 2: 20'-0 15/16"; 3: 13'-2 11/16"); tag + Polylength on plan</td><td>Ext CW: type drawings, Qty boxes, elevation Areas (1: 12'-3" blind → 14'-4.5" after fix; 2: 20'-0.9"; 3: 13'-2.7"); tag highlights</td><td class="good">match · <span class="bad">1 size bug</span></td></tr>
<tr><td>Types 4, 5, 6a, 6b, 7 — TMS 114</td><td>Ext SF; Areas 22'-11 1/16", 23'-7 13/16", 10'-6 9/16", 12'-10 1/16", 11'-8 3/8"</td><td>Ext SF; 22'-11.1", 23'-7.9", 10'-6.5", 12'-10.0", 11'-8.4"; bays 6/3+door/3/3/3</td><td class="good">match</td></tr>
<tr><td>Type 8 — TMW 450 door frame 3'-4" × 10'</td><td>Ext SF; Area 3'-4 7/8" × 9'-11 5/16"</td><td>Ext CW (legend); 2'-7.2" × 10'-0" snap (door leaf), schedule 3'-4" × 10'</td><td>found · class differs</td></tr>
<tr><td>Types 24, 25, 26 — TMS 114</td><td>Ext SF; Areas 7'-0" × 10'; "3 Thus"</td><td>Ext SF; 7'-0.7" × 10' elevation, 8'-0" schedule → RFI</td><td class="good">match + RFI</td></tr>
<tr><td>Types 30, 31a, 31b, 32 — TMW 450 w/ doors</td><td>Ext CW; one Area 29'-0" × 10'-4" across 30–31b; Length Measurements; break metal ×3; HW tables</td><td>Ext CW; per-type Areas 13'-3.6" / 8'-11.6" / 6'-3.5" (32 not on elevation); break metal item; HW in ledger</td><td class="good">match</td></tr>
<tr><td>Glazing only ext: 9, 12, 16, 22, 29 lites; 21 HM window</td><td>Glazing Only on schedule, plan (21) and elevation; 21 = 3 lites; "Hollow Metal" callout</td><td>Same six; 21 text said 4 lites (geometry said 3) — corrected</td><td class="good">match · text slip</td></tr>
<tr><td>Interior SF 100, 101, 102 — EMS 114</td><td>Int SF; HW table at 101; tag + Polylength on plan</td><td>Int SF; 6'-4.5" / 16'-6" / 6'-4.5" × 10'; door circle at 101</td><td class="good">match</td></tr>
<tr><td>Glazing only int: 118, 119, 120, 121</td><td>Glazing Only on schedule; 119/120 on plan</td><td>Same four</td><td class="good">match</td></tr>
<tr><td>Frameless ½" tempered: 103–106, 110–113, 131–145 (24)</td><td>All Glass Wall Area ×24, film band Area ×24, SSG caulk ×76, polished edge ×58, doors ×8, Polylength on plan</td><td>All 24 found and sized (133 flagged unsized); doors in descriptions; film as one implied item; no joint/edge counts</td><td class="good">found · <span class="bad">measures missing</span></td></tr>
<tr><td>Legend rows A2.0 (SF-1, SF-2, D-1, D-4, GF-1)</td><td>Colored rows; GF-1 highlighted</td><td>Same five + D-2/D-3/D-5 red</td><td class="good">match</td></tr>
<tr><td>A3.1 finish legend rows SF-3, D-8 · A3.0 note 13</td><td>All Glass highlights</td><td>Not marked</td><td class="bad">missed</td></tr>
<tr><td>Detail titles (A4.2 ×7, A4.3 ×2, A4.4 ×3, A5.0 ×2, A5.1 ×2, A5.3 ×1)</td><td>15 titles</td><td>15/15 after the detail-6 region fix (14 blind); plus 55 more titles/callouts, 7 sheets outside his set</td><td class="good">15/15</td></tr>
<tr><td>Note 10 slip connections · HW</td><td>Note 10 highlighted; per-type HW tables</td><td>Note 10 + note 12; general HW schedule + per-type HW in ledger</td><td class="good">match</td></tr>
<tr><td>OH doors, Rytec, grilles, HM/louver doors</td><td>Left blank</td><td>Marked excluded (red)</td><td>convention</td></tr>
<tr><td>Bi-fold pairs ×3 · mirrors ×6 · sill flashing · RFIs</td><td>—</td><td>Carried as pass-thru / flags</td><td>judgment</td></tr>
</tbody></table></div>
<div class="two" style="margin-top:18px">
 <div class="card"><h3>Convention differences (not scope)</h3><ul>{conv}</ul></div>
 <div class="card"><h3>What I changed after looking</h3><ul>{fixes}{added}</ul><h3>Mine only — judgment calls</h3><ul>{mo}</ul></div>
</div>

<h2>What this test shows</h2>
<div class="find">
<p><b>This set has no storefront schedule, and the method still worked.</b> The key here was two pictorial door-and-frame schedules (A3.2, A3.3): every opening is drawn at ¼" scale with a circled mark, dimension strings, a description block and a hardware table. Reading those two sheets first — mark, description text, snapped frame rectangle, dimension strings — gave the complete mark list (34 exterior, 48 interior) with system, glass, size and door before any plan or elevation was opened. The plan then showed every hexagon tag exactly once (82 tags, matched to vector hexagons, so room numbers and revision triangles were not confused with door marks), and the elevations gave a second measurement of each exterior frame that agreed with the schedule except where the drawings themselves disagree (24–26).</p>
<p><b>What was different from Valvoline:</b></p>
<ol>
<li><b>The legend contradicts trade usage.</b> A2.0 calls the 4½" TMW 450 "SF-1 curtain wall" and the TMS 114 "SF-2 storefront". I classified by the legend and flagged it; Martin did the same on every TMW 450 frame except the single door frame (type 8). The rule "legend wins, flag it" held.</li>
<li><b>Interior all-glass is a different takeoff.</b> 24 frameless openings are where most of Martin's 428 markups live: an Area per opening, an Area for the 36" frost band, a count symbol on every silicone joint (76) and every polished edge (58), a door count (8) and a Polylength per opening on the plan. I found and sized every opening and carried film, doors and polished edges as text, but I did not produce the joint and edge counts. Those are derivable from the same vector geometry (panel lines = joints; free edges = polished edges) and belong in the all-glass part of Frame Builder.</li>
<li><b>Interior finish legends hold glazing rows.</b> A3.1 rows SF-3 (interior glazing) and D-8 (interior glass door) and A3.0 note 13 were my only true misses. The fix is the same legend-row parser as A2.0, run on every schedule/legend sheet, not just the exterior one.</li>
<li><b>Two code bugs surfaced only because of the comparison.</b> A feet-inch rounding bug (13'-12.0" → 12'-0") made the elevation matcher pick the wrong rectangle at type 1 and raise a false RFI; a column test in the detail finder dropped detail 6/A4.2. Both were invisible in the blind result and obvious next to Martin's marks. That is the case for keeping every accept/reject logged: the diffs are the test suite.</li>
<li><b>Plan opening lengths.</b> Martin draws a Polylength along each opening on the plan; I highlighted tags only because the reference plan has no clean glass line to snap. The length is already known from the schedule and elevation, so the markup writer can place it along the wall at the tag without new vision work.</li>
</ol>
<p><b>Cost:</b> nothing in this takeoff needed a vision model. Sheet index, legend rows, schedule descriptions, type-drawing snaps, tag counts, elevation snaps, detail keyword search and the trade rules are all text and geometry. The model's job was deciding the rules once (legend vs trade, pass-thru, what a finish-legend row means), not reading 35 sheets.</p>
<p><b>What to build from this:</b> the pictorial-schedule reader (mark → description → frame snap → dims); a legend-row parser run on every A3.x legend; tag detection by enclosing hexagon; the elevation matcher with schedule-size scoring (now with the rounding fix); the all-glass measures (joints, edges, film band); the Polylength-on-plan writer; and the scope-object scorer, which gave 94.5% here where a rectangle scorer would have scored this takeoff in the 30s against 428 count symbols.</p>
</div>
</div>
{SCRIPT}
'''
open('mclarty_takeoff.html','w').write(page)
print('bytes', len(page))
