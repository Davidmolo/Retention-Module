import fitz
from PIL import Image
import io

src = r"D:\azfs\grossProfit\tmp\xxii-final-logo.pdf"
doc = fitz.open(src)
page = doc[0]
print("page", page.rect)
pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
print("pix", pix.width, pix.height, pix.n)
out = r"D:\azfs\grossProfit\tmp\xxii-final-render.png"
pix.save(out)
print("saved", out)

im = Image.open(out).convert("RGB")
w, h = im.size
# Sample corner as background
bg = im.getpixel((2, 2))
print("bg", bg)
px = im.load()
minx, miny, maxx, maxy = w, h, 0, 0
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 18:
            if x < minx: minx = x
            if y < miny: miny = y
            if x > maxx: maxx = x
            if y > maxy: maxy = y
print("content", minx, miny, maxx, maxy)
pad = 36
minx = max(0, minx - pad)
miny = max(0, miny - pad)
maxx = min(w - 1, maxx + pad)
maxy = min(h - 1, maxy + pad)
crop = im.crop((minx, miny, maxx + 1, maxy + 1))
dest = r"D:\azfs\grossProfit\public\brand\xxii-logo-white.png"
crop.save(dest, "PNG")
print("cropped", crop.size, dest)
