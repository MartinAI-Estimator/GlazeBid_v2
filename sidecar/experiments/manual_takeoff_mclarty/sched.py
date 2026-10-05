import pymupdf as fitz,re,json,sys
def extract(pdf,page):
    d=fitz.open(pdf); pg=d[page]
    lines=[]
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines",[]):
            t="".join(s["text"] for s in l["spans"]).strip()
            if t: lines.append((l["bbox"],t,l["spans"][0]["size"]))
    heads=[(bb,t) for bb,t,sz in lines if re.match(r'^(FROM|BETWEEN)\b',t)]
    heads.sort(key=lambda r:(round(r[0][1]/300),r[0][0]))
    marks={}
    for i,(bb,t) in enumerate(heads):
        x0,y0=bb[0],bb[1]
        # next head in same row to bound x
        nxt=[h for h in heads if abs(h[0][1]-y0)<40 and h[0][0]>x0+5]
        xmax=min(h[0][0] for h in nxt)-25 if nxt else x0+450
        near=[t2 for b2,t2,sz in lines if abs(b2[1]-y0)<12 and x0-80<b2[0]<x0 and not re.fullmatch(r'0\d',t2)]
        m="/".join(sorted(near,key=lambda s:(len(s),s)))
        body=[(b2,t2) for b2,t2,sz in lines if y0-2<=b2[1]<y0+80 and x0-5<=b2[0]<xmax and sz<=9.5]
        body.sort(key=lambda r:(round(r[0][1]),r[0][0]))
        txt=[t2 for _,t2 in body if t2 not in("HARDWARE","QUANTITY DESCRIPTION","FINISH") and not re.fullmatch(r'\d{1,2}[ab]?',t2)]
        marks[m]={"head_bbox":[round(v) for v in bb],"xmax":round(xmax),"text":txt}
    return marks
if __name__=="__main__":
    pdf,page,out=sys.argv[1:4]
    m=extract(pdf,int(page)); json.dump(m,open(out,"w"),indent=1)
    for k,v in m.items():
        print("##",k,v["head_bbox"])
        for t in v["text"]: print("   ",t)
