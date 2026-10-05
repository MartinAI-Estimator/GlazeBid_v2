import json, math
s32=json.load(open("a32_snap.json")); s33=json.load(open("a33_snap.json"))
elev=json.load(open("a20_elev_snap.json")); plan=json.load(open("a12_plan_tags.json"))
dets=json.load(open("details.json")); br=json.load(open("bays_rows.json"))
a32=json.load(open("a32_marks_raw.json")); a33=json.load(open("a33_marks_raw.json"))
def inch(s):
    f,i=s.split("'"); return int(f)*12+float(i.strip('"'))
def fi(v):
    f=int(v//12); i=v-f*12
    i=round(i*2)/2
    if i>=12: f+=1;i-=12
    return f"{f}'-{i:g}\""
def sf(w,h): return round(w*h/144,1)
items=[]; markups=[]
PT=plan and {t["tag"]:t for t in plan}
EL={e["tag"]:e for e in elev}
def tagmark(tag,subject,item):
    t=PT.get(tag)
    if t: markups.append({"item":item,"sheet":"A1.2","page":2,"subject":subject,"rect":t["shape"],"note":f"plan tag {tag} (hexagon, vector)"})
def schedmark(sheet,page,m,subject,item,frames,qty_text,headxy=None):
    for f in frames:
        markups.append({"item":item,"sheet":sheet,"page":page,"subject":subject,"rect":f["rect"],"note":"type drawing (snapped)"})
    if frames:
        r=frames[0]["rect"]
        markups.append({"item":item,"sheet":sheet,"page":page,"subject":"Qty Text Box","at":[r[0],r[3]+14],"text":qty_text})
def elevmark(tag,subject,item,area=True):
    e=EL.get(tag)
    if not e: return
    for f in e["frames"]:
        w=inch(f["W"]); h=inch(f["H"])
        bad=f.get("err",0)>0.2
        markups.append({"item":item,"sheet":"A2.0","page":7,"subject":subject,"rect":f["rect"],"note":"elevation frame (snapped)" if not bad else f"elevation snap disagrees with schedule (err {f['err']}) — dashed, flagged for review","dashed":bad})
        if area and not bad:
            markups.append({"item":item,"sheet":"A2.0","page":7,"subject":"Ext. SF Area","rect":f["rect"],"text":f"A = {sf(w,h)} sf\nW = {fi(w)}\nH = {fi(h)}"})
    markups.append({"item":item,"sheet":"A2.0","page":7,"subject":subject,"rect":e["tag_shape"],"note":"elevation tag"})
def doormark(tag,subject,item):
    e=EL.get(tag)
    if e and e["frames"]:
        r=e["frames"][0]["rect"]; markups.append({"item":item,"sheet":"A2.0","page":7,"subject":subject,"center":[(r[0]+r[2])/2,(r[1]+r[3])/2],"r":7})

# ---- exterior openings (A3.2) ----
EXT={
 "1":dict(cls="ext_cw",sys="SF-1 Pittco TMW 450 EFG (VSSG)",desc="Jewel Box 102 — 2-story frame: 14'-0\" x 10'-0\" lower w/ pair medium-stile bi-fold doors + 14'-0\" x 12'-0\" upper (1'-0\" band between). 1\" Solarban 72 Acuity low-iron IG, tempered. Black anodized #63.",bays="3 (upper) / doors+2 sidelites (lower)",rows="2 / 2",door="pair bi-fold (pass-thru)",hw="HW: cont. geared hinges, cylinder, closers, weatherstrip, pull/push, surface bolts, acc. threshold",flags=["Series is Pittco (not Kawneer/Tubelite) — price Kawneer equivalent, flag","Bi-fold doors: pass-thru (bifold/auto door sub)"]),
 "2":dict(cls="ext_cw",sys="SF-1 Pittco TMW 450 EFG",desc="Jewel Box 102 — 19'-9 1/2\" x 10'-0\" lower (4 bays x 2 rows) + 19'-9 1/2\" x 12'-0\" upper (4 bays x 2 rows). 1\" Solarban 72 low-iron IG tempered.",bays="4 / 4",rows="2 / 2",flags=["Series Pittco — Kawneer equivalent, flag"]),
 "3":dict(cls="ext_cw",sys="SF-1 Pittco TMW 450 EFG",desc="Main Entry 100 — 13'-2 1/2\" x 10'-0\" lower w/ pair medium-stile bi-fold doors + 13'-2 1/2\" x 12'-0\" upper (3 bays x 3 rows). GF-1 3M Fasara gradient film on top band.",bays="3 / doors+sidelites",rows="3 / 2",door="pair bi-fold (pass-thru)",hw="HW set as 01",flags=["GF-1 glass film (3M Fasara Illumina, 100%→0%) on upper band — implied scope","Bi-fold doors: pass-thru","Legend D-1 says STANDARD NARROW STILE door; schedule says MEDIUM STILE — RFI"]),
 "4":dict(cls="ext_sf",sys="SF-2 Pittco TMS 114XTFG (VSSG)",desc="Main Studio 102 — 22'-11\" x 10'-0\", 6 equal bays x 2 rows (8'-1\" + 1'-11\"). 1\" Solarban 72 low-iron IG tempered.",bays=6,rows=2),
 "5":dict(cls="ext_sf",sys="SF-2 Pittco TMS 114XTFG",desc="Main Studio 102 — 23'-8\" x 10'-0\" w/ pair medium-stile bi-fold doors + 3 bays x 2 rows.",bays="3 + door section",rows=2,door="pair bi-fold (pass-thru)",hw="HW set as 01",flags=["Bi-fold doors: pass-thru"]),
 "6a":dict(cls="ext_sf",sys="SF-2 Pittco TMS 114XTFG",desc="Consultation 105 — 10'-6\" x 10'-0\", 3 equal bays x 2 rows.",bays=3,rows=2),
 "6b":dict(cls="ext_sf",sys="SF-2 Pittco TMS 114XTFG",desc="Consultation 105 — 12'-9 1/2\" x 10'-0\", 3 equal bays x 2 rows.",bays=3,rows=2),
 "7":dict(cls="ext_sf",sys="SF-2 Pittco TMS 114XTFG",desc="Entry 134 — 11'-8 1/2\" x 10'-0\", 3 bays x 2 rows.",bays=3,rows=2),
 "8":dict(cls="ext_cw",sys="SF-1 Pittco TMW 450",desc="Entry 134 — 3'-4\" x 10'-0\" door frame: single medium-stile door 3'-0\" x 7'-0\" + transom. 5/8\" Solarban 72 IG in door.",bays=1,rows=2,door="single medium stile",hw="HW: cont. hinge, cylinder, closer, weatherstrip, pull/push bar, acc. threshold"),
 "24":dict(cls="ext_sf",sys="SF-2 Pittco TMS 114XTFG",desc="Service Reception 117 — 8'-0\" x 10'-0\" (schedule) / 7'-0\" x 10'-0\" (elevation), 2 bays x 1 row.",bays=2,rows=1,flags=["Schedule 8'-0\" vs elevation 7'-0\" — RFI"]),
 "25":dict(cls="ext_sf",sys="SF-2 Pittco TMS 114XTFG",desc="Service Reception 117 — same as 24.",bays=2,rows=1,flags=["Schedule 8'-0\" vs elevation 7'-0\" — RFI"]),
 "26":dict(cls="ext_sf",sys="SF-2 Pittco TMS 114XTFG",desc="Service Reception 117 — same as 24.",bays=2,rows=1,flags=["Schedule 8'-0\" vs elevation 7'-0\" — RFI"]),
 "30":dict(cls="ext_cw",sys="SF-1 Pittco TMW 450",desc="Service Reception 117 / Gen. Mgr 116 — 13'-9\" x 10'-0\", 3 bays + single medium-stile door 3'-0\" x 7'-0\" w/ transom. Anodized alum closure trim to match storefront.",bays="3 + door",rows=1,door="single medium stile",hw="HW: cont. hinge, cylinder, closer, pull/push, acc. threshold",flags=["Faces drive-through service reception: scheduled on exterior schedule & exterior elevation — treated as exterior"]),
 "31a":dict(cls="ext_cw",sys="SF-1 Pittco TMW 450",desc="Service Reception 117 / Service Advisors 114 — 9'-5 1/2\" x 10'-0\", 2 bays + single door 3'-0\" x 7'-0\" w/ transom. Alum closure trim to match.",bays="2 + door",rows=1,door="single medium stile",hw="HW set as 30"),
 "31b":dict(cls="ext_cw",sys="SF-1 Pittco TMW 450",desc="Service Reception 117 / Service Advisors 114 — 7'-0\" x 10'-0\", 1 bay + single door 3'-0\" x 7'-0\" w/ transom.",bays="1 + door",rows=1,door="single medium stile",hw="HW set as 30"),
 "32":dict(cls="ext_cw",sys="SF-1 Pittco TMW 450",desc="Service Reception 117 / Service Advisors 114 — 25'-7 1/2\" x 10'-0\", 5 equal bays + single door 3'-0\" x 7'-0\" w/ transom.",bays="5 + door",rows=1,door="single medium stile",hw="HW set as 30"),
}
GO_EXT={"9":"Parts Receiving 122 — HM door 3'-0\" x 7'-0\": vision lite 5/8\" insulated clear tempered (glass only, HM by others)",
        "12":"Service Shop 124 — HM door vision lite 5/8\" insulated tempered (glass only)",
        "16":"Wash Bays 128 — HM door vision lite 5/8\" insulated tempered (glass only)",
        "22":"Service Shop 124 — HM door vision lite 5/8\" insulated tempered (glass only)",
        "29":"Service Shop 124 — HM door vision lite 5/8\" insulated tempered (glass only)",
        "21":"Service Shop 124 — HM window frame 14'-0\" x 4'-0\", 3 lites 1\" Solarban 72 IG tempered (glass only, HM frame by others)"}
EXCL_EXT={"10":"OH insulated rolling door series 625 w/ 1/4\" tempered glazing — overhead door sub",
          "11":"Rytec Spiral FV high-speed coiling door w/ polycarbonate panels — door sub",
          "17":"OH insulated sectional door series 596 w/ 5/8\" tempered glazing — overhead door sub","18":"OH sectional door (as 17)","19":"OH sectional door (as 17)","20":"OH sectional door (as 17)",
          "23":"Rytec Spiral FV high-speed door","27":"Rytec Spiral FV high-speed door","28":"Rytec Spiral FV high-speed door"}
NOT_OURS_EXT={"13":"HM pair w/ louvers (Electrical 131)","14":"HM single, no lite (Sprinkler 133)","15":"HM pair w/ louvers (Compressor 132)"}
SUBJ={"ext_sf":"Ext SF Highlight","ext_cw":"Ext CW Highlight","int_sf":"Int SF Highlight","all_glass":"All Glass Highlight","glazing_only":"Glazing Only Highlight","excluded":"Excluded by Binswanger","bifold":"Bifold/Auto Door","break_metal":"Break Metal Flashing & Trims","glass_film":"Glass Film","mirror":"Glazing Only Highlight","note":"Scope Note","hardware":"Hardware Set"}
alias={"17":"17-19","18":"17-19","19":"17-19","24":"24-26","25":"24-26","26":"24-26","27":"27-28","28":"27-28"}
def frames_for(m):
    fr=s32.get(alias.get(m,m),[])
    return fr
for m,v in EXT.items():
    fr=frames_for(m)
    W=inch(fr[0]["W"]) if fr else None; H=sum(inch(f["H"]) for f in fr)+(12 if len(fr)>1 else 0) if fr else None
    area=sum(sf(inch(f["W"]),inch(f["H"])) for f in fr) if fr else None
    it={"id":m,"class":v["cls"],"label":f"{m} — 1 Thus","desc":v["desc"],"system":v["sys"],"w":fi(W) if W else "","h":fi(H) if H else "","bays":v.get("bays"),"rows":v.get("rows"),"sf":area,"qty":1,
        "door":v.get("door",""),"hardware":v.get("hw",""),"evidence":f"A3.2 type {m} (text + snapped type drawing @1/4\"); A1.2 tag {m} x1; A2.0 elevation tag {m} snapped","flags":v.get("flags",[]),
        "rule":"Class from A2.0 legend: SF-1 TMW 450 = 'curtain wall', SF-2 TMS 114 = 'storefront' (legend wins, flagged)"}
    e=EL.get(m)
    if e and e["frames"]:
        it["elev_w"]=e["frames"][0]["W"]; it["elev_h"]=e["frames"][0]["H"]
    items.append(it)
    sub=SUBJ[v["cls"]]
    tagmark(m,sub,m); schedmark("A3.2",10,m,sub,m,fr,f"{m} — 1 Thus"); elevmark(m,sub,m)
    if v.get("door"):
        doormark(m,"Ext SF Door" if "bi-fold" not in v["door"] else "Bifold/Auto Door",m)
    if "bi-fold" in v.get("door",""):
        items.append({"id":f"{m}-BF","class":"bifold","label":f"{m} bi-fold doors — 1 pair","desc":"Medium-stile center-hung bi-fold doors w/ 5/8\" Solarban 72 IG — pass-thru (bifold/auto door sub) in our frame","qty":1,"evidence":f"A3.2 type {m} text","flags":["Pass-thru item: price by bifold/auto door sub; frame prep by us"],"rule":"Auto/bifold doors = pass-thru"})
for m,dsc in GO_EXT.items():
    fr=frames_for(m); it={"id":m,"class":"glazing_only","label":f"{m} — 1 Thus","desc":dsc,"qty":1,"evidence":f"A3.2 type {m}; A1.2 tag x1; A2.0 tag","flags":[],"rule":"Glass in HM frames/doors = glazing only (frame by others)"}
    if m=="21": it.update(w="14'-0\"",h="4'-0\"",bays=3,rows=1,sf=56.0)
    items.append(it); tagmark(m,"Glazing Only Highlight",m); schedmark("A3.2",10,m,"Glazing Only Highlight",m,fr,f"{m} — 1 Thus"); elevmark(m,"Glazing Only Highlight",m,area=(m=="21"))
    if m!="21": doormark(m,"Glazing ONLY Door",m)
for m,dsc in EXCL_EXT.items():
    items.append({"id":m,"class":"excluded","label":f"{m}","desc":dsc,"qty":1,"evidence":f"A3.2 type {m}; A1.2 tag; A2.0 tag","flags":[],"rule":"Overhead / high-speed doors and their glass = by door sub (considered, excluded)"})
    tagmark(m,"Excluded by Binswanger",m); elevmark(m,"Excluded by Binswanger",m,area=False)
for m,dsc in NOT_OURS_EXT.items():
    items.append({"id":m,"class":"not_ours","label":m,"desc":dsc,"qty":1,"evidence":f"A3.2 type {m}","flags":[],"rule":"HM/louver doors with no glass: not glazing scope, not marked"})

# ---- interior (A3.3) ----
INT_SF={"100":("Main Entry 100 / Jewel Box 102 — EMS 114 interior SF 6'-3\" x 10'-0\", 2 bays, 1/4\" clear tempered",2,1),
        "101":("Main Entry 100 / Showroom 101 — EMS 114 16'-3 1/2\" x 10'-0\": pair medium-stile doors 6'-0\" x 7'-0\" w/ transom + 2 sidelites 5'-3\" (2 rows). HW: cont. hinges, cylinder, closers, pulls, panic, surface bolts, threshold","2 + door",2),
        "102":("Main Entry 100 / Main Studio 103 — EMS 114 6'-3\" x 10'-0\", 2 bays, 1/4\" tempered",2,1)}
ALLGLASS={"103":("Flex 106 — 8'-10 3/4\" x 10'-0\" frameless 1/2\" tempered w/ single door 3'-0\", CRL floating header, 2\" U-channel, patch fittings PC, frost film to 36\"",2),
 "104":("F/I 107 — 9'-10 3/4\" x 10'-0\" frameless w/ door (as 103)",2),"105":("F/I 108 — 9'-10 3/4\" x 10'-0\" frameless w/ door (as 103)",2),
 "106":("Sales Mgrs 109 — 28'-5 5/8\" x 10'-0\" frameless: 4 equal panels 21'-5 5/8\" + 2 doors 3'-0\"",6),
 "110":("Service Advisors 114 / Customer Lounge 104 — 5'-0\" x 10'-0\" frameless door 3'-0\" + 1'-6\" sidelite",2),
 "111":("Service Advisors 114 / Service Mgr 115 — 11'-9\" x 10'-0\" frameless door + 2 panels 8'-3\"",3),
 "112":("Service Mgr 115 / Gen Mgr 116 — 4'-4 1/2\" x 10'-0\" frameless panel",1),
 "113":("Corridor 113 / Gen Mgr 116 — 5'-0\" x 10'-0\" frameless door + sidelite",2),
 "131":("Consultation 105 — 3'-6\" x 10'-0\" frameless panel, polished exposed end, frost to 36\"",1),"132":("Consultation 105 — 3'-6\" x 10'-0\" panel",1),"133":("Consultation 105 — panel (type drawing not snapped — flag)",1),
 "134":("Consultation 105 — 5'-5\" x 10'-0\" panel w/ perpendicular partition",1),"135":("Consultation 105 — 7'-9 1/2\" x 10'-0\", 2 equal panels",2),"136":("Consultation 105 — 7'-9 1/2\" x 10'-0\", 2 equal panels",2),
 "137":("Consultation 105 — 5'-5\" x 10'-0\" panel",1),"138":("Consultation 105 — 7'-9 1/2\" x 10'-0\", 2 panels",2),"139":("Consultation 105 — 7'-9 1/2\" x 10'-0\", 2 panels",2),
 "140":("Consultation 105 — 5'-5\" x 10'-0\" panel",1),"141":("Consultation 105 — 7'-9 1/2\" x 10'-0\", 2 panels",2),"142":("Consultation 105 — 7'-9 1/2\" x 10'-0\", 2 panels",2),
 "143":("Consultation 105 — 2'-6 1/2\" x 10'-0\" panel",1),"144":("Consultation 105 — 7'-0\" x 10'-0\", 2 panels",2),"145":("Consultation 105 — 7'-0\" x 10'-0\", 2 panels",2)}
GO_INT={"118":"Tech Parts 119 / Service Shop 124 — HM door vision lite 1/4\" tempered (glass only)","121":"Service Shop 124 / Break 123 — HM door vision lite 1/4\" tempered (glass only)",
        "119":"Parts 121 / Tech Parts 119 — HM frame w/ sidelite 3'-8\" x 3'-10\" 1/4\" tempered (glass only)","120":"Parts 121 / Parts Mgr 120 — HM frame w/ sidelite 5'-0\" x 3'-10\" 1/4\" tempered (glass only)"}
EXCL_INT={"117":"OH security grille model 670 (Tech Parts/Service Shop) — by others","130":"OH security grille model 670 (Retail Parts 118) — by others"}
NOT_INT={"107":"wood door, HM frame, no lite","108":"wood door","109":"wood door","115":"wood door","114":"HM door no lite","116":"HM door no lite","122":"HM","123":"HM","124":"HM","125":"HM","126":"HM","127":"HM","128":"HM","129":"HM","146":"alum cable rail (by others)","147":"alum cable rail (by others)"}
DIMS={"103":(106.75,120),"104":(118.75,120),"105":(118.75,120),"106":(341.625,120),"110":(60,120),"111":(141,120),"112":(52.5,120),"113":(60,120),"131":(42,120),"132":(42,120),"133":(None,120),"134":(65,120),"135":(93.5,120),"136":(93.5,120),"137":(65,120),"138":(93.5,120),"139":(93.5,120),"140":(65,120),"141":(93.5,120),"142":(93.5,120),"143":(30.5,120),"144":(84,120),"145":(84,120)}
for m,(dsc,b,r) in INT_SF.items():
    fr=s33[m]["frames"]; W=inch(fr[0]["W"]); H=inch(fr[0]["H"])
    items.append({"id":m,"class":"int_sf","label":f"{m} — 1 Thus","desc":dsc,"system":"Pittco EMS 114 interior storefront, black anodized #63","w":fi(W),"h":fi(H),"bays":b,"rows":r,"sf":sf(W,H),"qty":1,"evidence":f"A3.3 type {m} (text + snapped drawing); A1.2 tag {m} x1","flags":["Series Pittco EMS 114 — interior; price Kawneer/Tubelite interior equivalent"],"rule":"Interior aluminum framed glazing = Int SF"})
    tagmark(m,"Int SF Highlight",m); schedmark("A3.3",11,m,"Int SF Highlight",m,fr,f"{m} — 1 Thus")
    if m=="101":
        rr=fr[0]["rect"]; markups.append({"item":m,"sheet":"A3.3","page":11,"subject":"Int SF Door","center":[(rr[0]+rr[2])/2,(rr[1]+rr[3])/2+40],"r":7})
for m,(dsc,panels) in ALLGLASS.items():
    fr=s33.get(m,{}).get("frames",[]); W,H=DIMS[m]
    it={"id":m,"class":"all_glass","label":f"{m} — 1 Thus","desc":dsc,"system":"1/2\" clear tempered, polished edges, CRL floating header / 2\" U-channel, patch fittings PC, concealed head closers","w":fi(W) if W else "","h":fi(H),"bays":panels,"rows":1,"sf":sf(W,H) if W else None,"qty":1,"evidence":f"A3.3 type {m} (text; dims from dimension strings); A1.2 tag {m} x1","flags":[],"rule":"Frameless 1/2\" tempered partitions/doors = All Glass; 3M Fasara frost film to 36\" = implied scope (glass film)"}
    if not fr: it["flags"].append("Type drawing not snapped (open-ended U-channel panel) — size from dimension text; verify")
    items.append(it); tagmark(m,"All Glass Highlight",m); schedmark("A3.3",11,m,"All Glass Highlight",m,fr,f"{m} — 1 Thus")
for m,dsc in GO_INT.items():
    fr=s33[m]["frames"]; items.append({"id":m,"class":"glazing_only","label":f"{m} — 1 Thus","desc":dsc,"qty":1,"evidence":f"A3.3 type {m}; A1.2 tag x1","flags":[],"rule":"Glass in HM = glazing only"})
    tagmark(m,"Glazing Only Highlight",m); schedmark("A3.3",11,m,"Glazing Only Highlight",m,fr,f"{m} — 1 Thus")
for m,dsc in EXCL_INT.items():
    items.append({"id":m,"class":"excluded","label":m,"desc":dsc,"qty":1,"evidence":f"A3.3 type {m}; A1.2 tag","flags":[],"rule":"Grilles by others (considered, excluded)"}); tagmark(m,"Excluded by Binswanger",m)
for m,dsc in NOT_INT.items():
    items.append({"id":m,"class":"not_ours","label":m,"desc":dsc,"qty":1,"evidence":f"A3.3 type {m}","flags":[],"rule":"No glass: not marked"})

# ---- implied / notes / legend / mirrors ----
items.append({"id":"GF-1","class":"glass_film","label":"GF-1 glass film","desc":"3M Fasara Illumina SH2FGIM-G gradient film (100% top → 0% bottom) at Main Entry 03 upper band (elevation label GF-1).","qty":1,"evidence":"A2.0 legend GF-1; A2.0 west elevation label GF-1 at type 3; A3.2 type 3 note 'DF-1 glass film per ext finish sched sheet A2.0'","flags":["Schedule says DF-1, legend says GF-1 — same item, RFI to confirm extent (3 only?)"],"rule":"Glass film = implied scope"})
items.append({"id":"FROST","class":"glass_film","label":"3M Fasara frost film — all-glass partitions","desc":"Milky White (Milano) #SH2MAML frost film up to 36\" AFF on every frameless 1/2\" tempered panel and door (marks 103–106, 110–113, 131–145).","qty":23,"evidence":"A3.3 type notes 'FROST GLASS UP TO 36\" H'","flags":[],"rule":"Glass film = implied scope"})
items.append({"id":"BM-1","class":"break_metal","label":"Alum closure trim to match storefront","desc":"'Anodized alum closure trim to match storefront' at types 30 / 31a (A3.2) and 'pre-fin mtl closure trim to match storefront' at plan detail 12/A4.3.","qty":"LF — to be measured in Frame Builder","evidence":"A3.2 types 30, 31a text; A4.3 detail 12","flags":[],"rule":"Break metal that touches our frame and matches our finish = ours"})
items.append({"id":"BM-2","class":"break_metal","label":"24 ga pre-fin metal sill flashing at curtain wall sills","desc":"'24 GA. PRE-FIN MTL SILL FLASHING – SET IN SEALANT' under curtain wall sill in wall sections A5.0-1, A5.1-1, A5.3-2, A5.5-2, A5.6-2, A5.8-4, A5.9-1.","qty":"LF of CW sills","evidence":"wall sections (keyword search)","flags":["24 ga steel, pre-finished — could be by EIFS/sheet-metal trade; Martin's rule: touches our frame → review"],"rule":"Sill flashing at our sill = flag for review"})
items.append({"id":"NOTE-10","class":"note","label":"Door & frame note 10 — slip connections at CW jambs","desc":"'Provide slip connections at curtain wall jambs as req'd for wind resistance. Refer to structural.'","qty":1,"evidence":"A3.2 Door & Frame Notes","flags":[],"rule":"Scope note"})
items.append({"id":"NOTE-12","class":"note","label":"Door & frame note 12 — push bars at frames 1, 3, 5, 32","desc":"Interior push bar / exterior pull at the entrance frames; coordinate with hardware sets.","qty":1,"evidence":"A3.2 Door & Frame Notes","flags":[],"rule":"Scope note"})
items.append({"id":"HW-GEN","class":"hardware","label":"General hardware schedule (A3.2)","desc":"Hinge McKinney TB2314; panic Von Duprin 8800; lockset Schlage ND; closer LCN 4040 w/ hold open; threshold National Guard 896V; weatherstrip NGP 5050; pull Rockwood 112; push plate Rockwood 70RCE; kick plates Rockwood K1050. Applies to our alum doors 1, 3, 5, 8, 30, 31a, 31b, 32, 101.","qty":1,"evidence":"A3.2 HARDWARE table + per-type HW tables","flags":["Hardware default = included (per Martin); uncheck items by others"],"rule":"Storefront door hardware from schedule/specs, default included"})
items.append({"id":"MIR","class":"mirror","label":"Mirrors — toilet accessory 8","desc":"18\" x 36\" x 1/4\" frameless plate glass mirror, no manufacturer listed, 1/4\" chrome or alum trim all edges. Tagged 6x on A6.0 interior toilet elevations.","qty":6,"evidence":"A3.0 toilet accessories schedule mark 8; A6.0 accessory tags (6)","flags":["Frameless plate glass mirror with no manufacturer — usually glazier; confirm vs accessory package","Count from interior elevations (corner views can duplicate) — verify on A3.0 enlarged plans"],"rule":"Mirrors = glazing scope unless manufactured accessory (Bobrick)"})
items.append({"id":"LEGEND","class":"note","label":"A2.0 exterior materials legend rows","desc":"SF-1 CURTAIN WALL = TMW 450 / TMW 450 EFG (black #63); SF-2 STOREFRONT = TMS center-glazed thermal; GF-1 glass film; D-1/D-4 Pittco narrow-stile center-hung doors; D-2 high-speed coiling; D-3 rolling parts door; D-5 rolling OH w/ single band of glass.","qty":1,"evidence":"A2.0 legend","flags":["Legend calls TMW 450 'curtain wall' and TMS 114 'storefront'; both are 10'-0\" tall framed walls — classification follows legend, flagged"],"rule":"Legend decides class; flag when trade knowledge disagrees"})
# legend markups
LEG={"SF-1":("Ext CW Highlight",[2002,1000,2560,1026]),"SF-2":("Ext SF Highlight",[2002,1038,2560,1064]),"GF-1":("Glass Film",[2002,725,2830,751]),"D-1":("Ext CW Highlight",[2002,270,2560,296]),"D-4":("Ext CW Highlight",[2002,367,2560,393]),"D-2":("Excluded by Binswanger",[2002,309,2560,335]),"D-3":("Excluded by Binswanger",[2002,337,2560,363]),"D-5":("Excluded by Binswanger",[2002,400,2600,426])}
for k,(sub,r) in LEG.items(): markups.append({"item":"LEGEND","sheet":"A2.0","page":7,"subject":sub,"rect":r,"note":f"legend row {k}"})
markups.append({"item":"NOTE-10","sheet":"A3.2","page":10,"subject":"Scope Note","rect":[2430,2130,2830,2535],"note":"Door & frame notes block"})
markups.append({"item":"HW-GEN","sheet":"A3.2","page":10,"subject":"Hardware Set","rect":[2870,2255,3255,2512],"note":"general hardware schedule"})
markups.append({"item":"MIR","sheet":"A3.0","page":8,"subject":"Glazing Only Highlight","rect":[1185,658,1860,670],"note":"toilet accessory 8 mirror row"})
# detail titles
CLASS_BY_KW=[("FRAMELESS","All Glass Highlight"),("U' CHANNEL","All Glass Highlight"),("TEMPERED","All Glass Highlight"),("GLAZING PER SCHEDULE","Glazing Only Highlight"),("HM FRAME","Glazing Only Highlight"),("CURTAIN WALL","Ext CW Highlight"),("INTERIOR STOREFRONT","Int SF Highlight"),("STOREFRONT","Ext SF Highlight"),("SILL FLASHING","Break Metal Flashing & Trims"),("CLOSURE","Break Metal Flashing & Trims"),("MIRROR","Glazing Only Highlight")]
ndet=0
for sh,v in dets.items():
    for dd in v["details"]:
        if not dd["hits"]: continue
        kws=" | ".join(h[0] for h in dd["hits"])
        sub="Ext SF Highlight"
        for k,sj in CLASS_BY_KW:
            if any(k in h[0].upper() for h in dd["hits"]): sub=sj; break
        r=dd["title_rect"]; tr=[r[0]-50,r[1]-3,r[2]+10,r[3]+3]
        markups.append({"item":f"DET {dd['num']}/{sh}","sheet":sh,"page":v["page"],"subject":sub,"rect":tr,"note":f"detail title; keywords: {kws}"})
        for h in dd["hits"]:
            markups.append({"item":f"DET {dd['num']}/{sh}","sheet":sh,"page":v["page"],"subject":sub,"rect":h[1],"note":"callout text"})
        ndet+=1
items.append({"id":"DETAILS","class":"detail","label":f"Details referencing glazing — {ndet} found on {len([s for s,v in dets.items() if any(d['hits'] for d in v['details'])])} sheets","desc":"Plan details A4.1–A4.4 (storefront jambs, CW jambs, frameless glass partitions/doors), wall sections A5.0–A5.9, A5.13 (CW per schedule, sill flashing, U-channel head/sill 9 & 10/A5.3), HM head/jamb 8 & 10/A5.8, mirror section 2/A6.1.","qty":ndet,"evidence":"title + keyword search inside each detail region","flags":["Sheets A5.4–A5.9, A5.13, A6.1 are outside the 12-sheet bid set but contain glazing details"],"rule":"Detail titles marked in system color; sections highlighted not counted"})

T={"job":"McLarty Mazda of Little Rock — new 2-story sales & service facility (BCO+H Architects, Benton AR), 10.16.2025 PRELIMINARY — NOT FOR CONSTRUCTION",
   "set":"Orig Plans — 35 sheets: Cover, LS1.0, A1.0–A1.6, A2.0, A3.0–A3.3, A4.0–A4.4, A5.0–A5.13, A6.0–A6.1 (no S/M/E/P/C in this PDF)",
   "sheets_read":["all 35 (text + vector); drawn/snapped on A1.2, A2.0, A3.0, A3.2, A3.3, A4.1–A4.4, A5.0–A5.9, A5.13, A6.1"],
   "sheets_skipped":"none — A1.0/A1.1/A1.3–A1.6/A4.0/A5.10–A5.12/A6.0/LS1.0 read, no glazing scope beyond RCP shade note and mirror tags",
   "specs":"none in set — flag",
   "system":{"basis":"Pittco Architectural Metals TMW 450 / TMW 450 EFG (legend SF-1 'curtain wall'), TMS 114XTFG VSSG (legend SF-2 'storefront'), EMS 114 interior; black anodized #63; 1\" Solarban 72 Acuity low-iron IG tempered; 5/8\" IG in doors; 1/4\" tempered interior; 1/2\" tempered frameless","series_class":"Pittco not in Frame Builder library — flag: price Kawneer/Tubelite equivalents (4-1/2\" thermal SF / 1-1/2\" x 4-1/2\" SF / interior 1-3/4\" x 4-1/2\")"},
   "glass":{"ext":"1\" Solarban 72 Acuity low-iron, clear, insulated, tempered","doors":"5/8\" Solarban 72 Acuity IG tempered","interior":"1/4\" clear tempered (EMS 114); 1/2\" clear tempered polished edges (frameless)","film":"GF-1 3M Fasara Illumina gradient at 03; 3M Fasara Milky White frost to 36\" at all frameless"},
   "items":items,
   "review_flags":["No specifications in set","Pittco systems specified 'or equal' — Kawneer/Tubelite equivalents to be selected","Legend labels (SF-1 curtain wall = TMW 450, SF-2 storefront = TMS 114) conflict with trade usage — classification follows legend, flagged","Types 24/25/26: elevation 7'-0\" vs schedule 8'-0\"","Door stile: legend D-1 narrow stile vs schedule medium stile","Bi-fold doors at 1, 3, 5 — pass-thru sub","Mirrors (6) — glazier vs accessory package","24 ga sill flashing — trade to be confirmed","Plan opening boxes not drawn: plan highlights are tag hexagons only (reference plan has no clean glass line to snap)"],
   "rfi_drafts":[{"to":"BCO+H Architects","subject":"Types 24, 25, 26 width","body":"A3.2 shows types 24–26 (Service Reception 117) at 8'-0\" x 10'-0\"; the north elevation scales 7'-0\". Please confirm."},
                 {"to":"BCO+H Architects","subject":"Entrance door stile","body":"A2.0 legend D-1/D-4 lists standard narrow stile center-hung doors; A3.2 types 1, 3, 5, 8, 30–32 call for medium stile. Please confirm stile width."},
                 {"to":"BCO+H Architects","subject":"Glass film extent","body":"A3.2 type 3 references 'DF-1 glass film per A2.0'; the A2.0 legend lists GF-1 (3M Fasara Illumina gradient). Please confirm GF-1 applies to the type 3 upper band only."}],
   "totals":{"ext_frames_TMW450":len([i for i in items if i["class"]=="ext_cw"]),"ext_frames_TMS114":len([i for i in items if i["class"]=="ext_sf"]),"int_sf_frames":len([i for i in items if i["class"]=="int_sf"]),"all_glass_openings":len([i for i in items if i["class"]=="all_glass"]),"glazing_only":len([i for i in items if i["class"]=="glazing_only"]),"excluded":len([i for i in items if i["class"]=="excluded"]),"bifold_pairs":len([i for i in items if i["class"]=="bifold"]),"plan_tags_found":82,"detail_hits":ndet},
   "markups":markups}
json.dump(T,open("takeoff_blind.json","w"),indent=1)
from collections import Counter
print(len(items),"items",len(markups),"markups"); print(Counter(i["class"] for i in items)); print(Counter(m["sheet"] for m in markups))
