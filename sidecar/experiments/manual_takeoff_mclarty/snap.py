import pymupdf as fitz, json, sys, math
def drawings(pg):
    return pg.get_drawings()
def frame_rects(pg, win, minw=40, minh=40):
    """Return candidate rectangles (from vector paths) inside window."""
    W=fitz.Rect(*win); out=[]
    for p in pg.get_drawings():
        r=p["rect"]
        if r.width<minw or r.height<minh: continue
        if not W.contains(r): continue
        # keep closed rect-like paths: items with 're' or 4+ lines
        kinds=[it[0] for it in p["items"]]
        out.append((r,kinds,p.get("width")))
    return out
def outer_frame(pg, win):
    c=frame_rects(pg,win)
    if not c: return None
    c.sort(key=lambda t:-(t[0].width*t[0].height))
    return c[0][0]
def lines_in(pg, rect, tol=1.0):
    """vertical and horizontal line x/y positions inside rect"""
    R=fitz.Rect(*rect); vs=[];hs=[]
    for p in pg.get_drawings():
        for it in p["items"]:
            if it[0]=="l":
                a,b=it[1],it[2]
                if not (R.contains(a) and R.contains(b)): continue
                if abs(a.x-b.x)<tol and abs(a.y-b.y)>20: vs.append(round((a.x+b.x)/2,1))
                elif abs(a.y-b.y)<tol and abs(a.x-b.x)>20: hs.append(round((a.y+b.y)/2,1))
            elif it[0]=="re":
                r=it[1]
                if not R.contains(r): continue
                if r.width<tol*2 and r.height>20: vs.append(round(r.x0+r.width/2,1))
                if r.height<tol*2 and r.width>20: hs.append(round(r.y0+r.height/2,1))
    return sorted(set(vs)),sorted(set(hs))
def ftin(pt, ppf):
    ft=pt/ppf; f=int(ft); i=round((ft-f)*12,1)
    if i>=12.0: f+=1; i-=12.0
    return f"{f}'-{i:.1f}\""

def long_lines(pg, win, minlen=60, tol=1.0):
    R=fitz.Rect(*win); vs=[];hs=[]
    for p in pg.get_drawings():
        for it in p["items"]:
            if it[0]!="l": continue
            a,b=it[1],it[2]
            if abs(a.x-b.x)<tol and abs(a.y-b.y)>=minlen:
                if not (R.x0<=a.x<=R.x1): continue
                y0=max(min(a.y,b.y),R.y0); y1=min(max(a.y,b.y),R.y1)
                if y1-y0>=minlen: vs.append((round(a.x,1),round(y0,1),round(y1,1)))
            elif abs(a.y-b.y)<tol and abs(a.x-b.x)>=minlen:
                if not (R.y0<=a.y<=R.y1): continue
                x0=max(min(a.x,b.x),R.x0); x1=min(max(a.x,b.x),R.x1)
                if x1-x0>=minlen: hs.append((round(a.y,1),round(x0,1),round(x1,1)))
    return sorted(vs),sorted(hs)
def outer_bbox(pg, win, minlen=60):
    vs,hs=long_lines(pg,win,minlen)
    if not vs or not hs: return None
    x0=min(v[0] for v in vs); x1=max(v[0] for v in vs)
    y0=min(h[0] for h in hs); y1=max(h[0] for h in hs)
    return fitz.Rect(x0,y0,x1,y1), vs, hs

def rect_candidates(pg, win, minlen=50, tol=2.0):
    vs,hs=long_lines(pg,win,minlen)
    rects=[]
    for i in range(len(vs)):
        for j in range(i+1,len(vs)):
            xa,ya0,ya1=vs[i]; xb,yb0,yb1=vs[j]
            if xb-xa<minlen: continue
            y0=max(ya0,yb0); y1=min(ya1,yb1)
            if y1-y0<minlen: continue
            top=[h for h in hs if abs(h[0]-y0)<tol and h[1]<=xa+tol and h[2]>=xb-tol]
            bot=[h for h in hs if abs(h[0]-y1)<tol and h[1]<=xa+tol and h[2]>=xb-tol]
            if top and bot: rects.append(fitz.Rect(xa,y0,xb,y1))
    rects.sort(key=lambda r:-(r.width*r.height))
    return rects
def frame_box(pg, win, minlen=50):
    rc=rect_candidates(pg,win,minlen)
    return rc[0] if rc else None

def dedupe(rects, tol=4):
    out=[]
    for r in rects:
        if any(abs(r.x0-s.x0)<tol and abs(r.y0-s.y0)<tol and abs(r.x1-s.x1)<tol and abs(r.y1-s.y1)<tol for s in out): continue
        out.append(r)
    return out
def type_frames(pg, head_xy, xmax, floor_tol=70, up=620):
    """Frames for a schedule type drawing: the rects sitting on the floor just above the head label, plus stacked rects above."""
    x,y=head_xy
    rc=dedupe(rect_candidates(pg,(x-40,y-up,xmax,y-8)))
    base=[r for r in rc if y-floor_tol<=r.y1<=y-8]
    if not base: return []
    base.sort(key=lambda r:-r.width)
    b=base[0]
    frames=[b]
    # stacked above: same x span (±6), bottom within 30pt of top
    cur=b
    while True:
        above=[r for r in rc if abs(r.x0-cur.x0)<6 and abs(r.x1-cur.x1)<6 and 0<=cur.y0-r.y1<=30]
        if not above: break
        above.sort(key=lambda r:-(r.height)); cur=above[0]; frames.append(cur)
    return frames
