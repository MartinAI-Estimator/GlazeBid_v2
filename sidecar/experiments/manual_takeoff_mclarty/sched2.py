import pymupdf as fitz,re,json,sys
def lines_of(pg):
    L=[]
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines",[]):
            t="".join(s["text"] for s in l["spans"]).strip()
            if t: L.append((l["bbox"],t,l["spans"][0]["size"]))
    return L
def extract(pdf,page,markre):
    d=fitz.open(pdf); pg=d[page]; lines=lines_of(pg)
    marks=[(bb,t) for bb,t,sz in lines if re.fullmatch(markre,t) and sz<10]
    # keep only marks that have a head line immediately right
    out={}
    for bb,m in marks:
        y0=bb[1]
        right=[(b2,t2) for b2,t2,sz in lines if bb[2]<b2[0]<bb[2]+40 and abs(b2[1]-y0)<10 and len(t2)>6]
        if not right: continue
        hx=right[0][0][0]
        others=[b for b,t in marks if abs(b[1]-y0)<40 and b[0]>bb[0]+5]
        xmax=min(b[0] for b in others)-10 if others else hx+480
        body=[(b2,t2) for b2,t2,sz in lines if y0-2<=b2[1]<y0+90 and hx-5<=b2[0]<xmax and sz<=9.5 and not re.fullmatch(markre,t2)]
        body.sort(key=lambda r:(round(r[0][1]),r[0][0]))
        txt=[]
        for _,t2 in body:
            if t2 in("HARDWARE","QUANTITY DESCRIPTION","FINISH","QUANTITY","DESCRIPTION","QUANITY") : break
            txt.append(t2)
        key=m
        if key in out: key=m+"_dup"
        out[key]={"mark_bbox":[round(v) for v in bb],"head_bbox":[round(v) for v in right[0][0]],"xmax":round(xmax),"text":txt}
    return out
if __name__=="__main__":
    pdf,page,markre,outf=sys.argv[1:5]
    m=extract(pdf,int(page),markre); json.dump(m,open(outf,"w"),indent=1)
    for k,v in m.items(): print(k,v["mark_bbox"][:2],"|"," / ".join(v["text"])[:200])
