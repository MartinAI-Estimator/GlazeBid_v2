import pymupdf as fitz, json
from tags import tags_in_shapes
from snap import rect_candidates, dedupe, ftin
def inches(s):
    f,i=s.split("'"); return int(f)*12+float(i.strip('"'))
def run(pdf,page,sched,PPF=9.0,alias={}):
    d=fitz.open(pdf); pg=d[page]
    tags=[t for t in tags_in_shapes(pg,r'(\d{1,2}[ab]?|1[0-4]\d[ab]?)') if t["nlines"] in (5,6)]
    res=[]
    for t in tags:
        r=fitz.Rect(t["shape"]); c=fitz.Point((r.x0+r.x1)/2,(r.y0+r.y1)/2)
        m=alias.get(t["tag"],t["tag"]); want=sched.get(m)
        win=(c.x-400,c.y-400,c.x+400,c.y+250)
        rc=dedupe(rect_candidates(pg,win,minlen=12))
        rc=[q for q in rc if q.width>=12 and q.height>=12]
        # add unions of horizontally adjacent rects sharing y extents
        extra=[]
        for a in rc:
            cur=fitz.Rect(a)
            for _ in range(6):
                nxt=[b for b in rc if abs(b.y0-cur.y0)<3 and abs(b.y1-cur.y1)<3 and 0<=b.x0-cur.x1<=5]
                if not nxt: break
                nxt.sort(key=lambda b:b.x0); cur=cur|nxt[0]; extra.append(fitz.Rect(cur))
        rc=dedupe(rc+extra)
        out={"tag":t["tag"],"tag_shape":t["shape"],"frames":[],"sched":want}
        if want:
            W0,H0=want[0]
            scored=[]
            for q in rc:
                if not (q.x0-30<=c.x<=q.x1+30 and q.y0-60<=c.y<=q.y1+60): continue
                w=q.width/PPF*12; h=q.height/PPF*12
                err=abs(w-W0)/W0+2*abs(h-H0)/H0
                if not q.contains(c): err+=0.5
                scored.append((err,q))
            scored.sort(key=lambda s:s[0])
            if scored:
                err,q=scored[0]
                out["frames"].append({"rect":[round(v,1) for v in q],"W":ftin(q.width,PPF),"H":ftin(q.height,PPF),"err":round(err,3)})
                # stacked above
                cur=q
                for _,(Wi,Hi) in enumerate(want[1:]):
                    above=[a for a in rc if abs(a.x0-cur.x0)<8 and abs(a.x1-cur.x1)<8 and 0<=cur.y0-a.y1<=40]
                    if not above: break
                    above.sort(key=lambda a:-a.height); a=above[0]
                    out["frames"].append({"rect":[round(v,1) for v in a],"W":ftin(a.width,PPF),"H":ftin(a.height,PPF),"err":round(abs(a.width/PPF*12-Wi)/Wi+abs(a.height/PPF*12-Hi)/Hi,3)})
                    cur=a
        res.append(out)
    return res
if __name__=="__main__":
    snap=json.load(open("a32_snap.json"))
    sched={m:[(inches(f["W"]),inches(f["H"])) for f in fr] for m,fr in snap.items()}
    sched["21"]=[(168.0,48.0)]
    alias={"17":"17-19","18":"17-19","19":"17-19","24":"24-26","25":"24-26","26":"24-26","27":"27-28","28":"27-28"}
    res=run("orig.pdf",7,sched,9.0,alias)
    for o in res: print(o["tag"], [(f["rect"],f["W"],f["H"],f["err"]) for f in o["frames"]], "sched",o["sched"])
    json.dump(res,open("a20_elev_snap.json","w"),indent=1)
