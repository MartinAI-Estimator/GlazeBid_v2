import pymupdf as fitz,re,json
KW=re.compile(r"STOREFRONT|CURTAIN WALL|FRAMELESS GLASS|GLASS PARTITION|GLASS DOOR|GLAZING|SILL FLASHING|CLOSURE TRIM|CLOSURE TRMI|BREAK METAL|BRAKE METAL|MIRROR|'U' CHANNEL|U CHANNEL|TEMPERED",re.I)
def details(pg):
    L=[]
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines",[]):
            t="".join(s["text"] for s in l["spans"]).strip(); sz=l["spans"][0]["size"]
            L.append((fitz.Rect(l["bbox"]),t,sz))
    titles=[(r,t) for r,t,sz in L if 20<=sz<=26 and r.x0<3200]
    nums=[(r,t) for r,t,sz in L if sz>=34 and r.x0<3200]
    out=[]
    for r,t in titles:
        n=[(nr,nt) for nr,nt in nums if abs(nr.y0-r.y0)<20 and nr.x0<r.x0 and r.x0-nr.x1<60]
        num=n[0][1].split()[0] if n else "?"
        # region: x from r.x0-60 to next title x0 in same row (|dy|<40) minus 20, else r.x0+900 ; y from previous row bottom
        same=[q for q,_ in titles if abs(q.y0-r.y0)<40 and q.x0>r.x0+10]
        x1=min(q.x0 for q in same)-30 if same else min(r.x0+900,3230)
        above=[q for q,_ in titles if q.y1<r.y0-5 and q.x0<r.x0+250 and q.x1>r.x0-60]
        y0=max(q.y1 for q in above)+5 if above else 30
        region=fitz.Rect(r.x0-60,y0,x1,r.y1)
        hits=[(t2,[round(v) for v in r2]) for r2,t2,sz in L if region.contains(r2) and sz<11 and KW.search(t2)]
        out.append({"num":num,"title":t,"title_rect":[round(v) for v in r],"region":[round(v) for v in region],"hits":hits})
    return out
if __name__=="__main__":
    d=fitz.open("orig.pdf"); idx={x['page']:x['sheet'] for x in json.load(open('sheet_index.json'))}
    allout={}
    for i in range(12,33):
        dets=details(d[i]); allout[idx[i]]={"page":i,"details":dets}
        for dd in dets:
            if dd["hits"]:
                print(idx[i],dd["num"],dd["title"],"|",[h[0] for h in dd["hits"]])
    json.dump(allout,open("details.json","w"),indent=1)
