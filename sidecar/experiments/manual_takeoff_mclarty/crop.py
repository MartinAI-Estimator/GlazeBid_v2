import pymupdf as fitz, sys
def crop(pdf,page,rect,out,dpi=110):
    d=fitz.open(pdf); pg=d[page]
    r=fitz.Rect(*rect)
    pix=pg.get_pixmap(clip=r,dpi=dpi); pix.save(out); return pix.width,pix.height
if __name__=="__main__":
    pdf,page,x0,y0,x1,y1,out=sys.argv[1:8]; dpi=int(sys.argv[8]) if len(sys.argv)>8 else 110
    print(crop(pdf,int(page),(float(x0),float(y0),float(x1),float(y1)),out,dpi))
