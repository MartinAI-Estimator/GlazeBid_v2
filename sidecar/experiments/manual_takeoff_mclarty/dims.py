import pymupdf as fitz, re
DIM=re.compile(r"^(\d+)'(?:-(\d+)(?:\s+(\d+)/(\d+))?)?\"?$|^(\d+)\"$")
def parse_dim(t):
    t=t.replace("”",'"').replace("’","'").strip()
    t=re.sub(r'\s+',' ',t)
    m=re.match(r"^(\d+)'\s*-?\s*(\d+)?\s*(?:(\d+)/(\d+))?\s*\"?",t)
    if m and "'" in t:
        ft=int(m.group(1)); inch=int(m.group(2) or 0); fr=0
        if m.group(3): fr=int(m.group(3))/int(m.group(4))
        return ft*12+inch+fr
    m=re.match(r'^(\d+)(?:\s+(\d+)/(\d+))?"$',t)
    if m:
        v=int(m.group(1))
        if m.group(2): v+=int(m.group(2))/int(m.group(3))
        return v
    return None
def dim_texts(pg, win):
    """dimension strings within window: list of (inches, text, bbox, rotated)"""
    R=fitz.Rect(*win); out=[]
    for b in pg.get_text("dict",clip=R)["blocks"]:
        for l in b.get("lines",[]):
            t="".join(s["text"] for s in l["spans"]).strip()
            v=parse_dim(t)
            if v is None: continue
            d=l["dir"]; rot=abs(d[0])<0.5
            out.append((v,t,[round(x,1) for x in l["bbox"]],rot))
    return out
def inch_str(v):
    f=int(v//12); i=v-f*12
    return f"{f}'-{i:g}\""
