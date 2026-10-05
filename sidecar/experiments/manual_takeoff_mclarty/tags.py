import pymupdf as fitz,re,json
def small_shapes(pg,maxsz=40):
    out=[]
    for p in pg.get_drawings():
        r=p["rect"]
        if r.width<=maxsz and r.height<=maxsz and r.width>6 and r.height>6:
            n=sum(1 for it in p["items"] if it[0]=="l"); c=sum(1 for it in p["items"] if it[0]=="c")
            out.append((r,n,c,len(p["items"])))
    return out
def tag_tokens(pg, pat, maxsize=9):
    toks=[]
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines",[]):
            t="".join(s["text"] for s in l["spans"]).strip()
            if re.fullmatch(pat,t) and l["spans"][0]["size"]<maxsize:
                toks.append((t,fitz.Rect(l["bbox"])))
    return toks
def tags_in_shapes(pg, pat, shape_lines=(5,6,7,8), maxsize=9):
    shapes=small_shapes(pg)
    res=[]
    for t,r in tag_tokens(pg,pat,maxsize):
        c=fitz.Point((r.x0+r.x1)/2,(r.y0+r.y1)/2)
        enc=[s for s in shapes if s[0].contains(c) and s[0].width<=36]
        if not enc: continue
        enc.sort(key=lambda s:s[0].width*s[0].height)
        s=enc[0]
        res.append({"tag":t,"rect":[round(v,1) for v in r],"shape":[round(v,1) for v in s[0]],"nlines":s[1],"ncurves":s[2]})
    return res
if __name__=="__main__":
    import sys
    d=fitz.open(sys.argv[1]); pg=d[int(sys.argv[2])]
    res=tags_in_shapes(pg,sys.argv[3])
    from collections import Counter
    print(Counter((r["nlines"],r["ncurves"]) for r in res))
    for r in res: print(r)
