from __future__ import annotations
from PIL import Image, ImageFilter, ImageDraw
from pathlib import Path
import hashlib, json, sys

if len(sys.argv) != 3:
    raise SystemExit('usage: materialize-official-brand-v2.py <approved-master.jpg> <output-dir>')

src = Path(sys.argv[1])
out = Path(sys.argv[2])
brand = out / 'brand'
icons = out / 'icons'
brand.mkdir(parents=True, exist_ok=True)
icons.mkdir(parents=True, exist_ok=True)

SOURCE_SHA = '2b0bb29e200fb48ade90336bc355ad26c21277ddfcbacdf245474e85f82d348b'
EXPECTED = {
    'brand/letmefly-logo-display-512.png': '56cedda2ac66e0c741579a2621bca3a2aec3ef8dc449f2dccf2da99ae6733b99',
    'icons/app-icon-192.png': 'a139fca7b39f392c9674bf953366e7fccfa621733244405070a5ccfa3ffc106e',
    'icons/app-icon-512.png': 'f1a07af19ba28db8ffed25db96b3093fe3ce45b6f37916f8b839a4345176169f',
    'icons/app-icon-512-maskable.png': '37c2b1e1695afe27394db706eac78c93cd7c398514c797af5a8656e08ca694af',
    'icons/apple-touch-icon.png': '8d2631bda1c2266b7803e967769db716bfd93f9a786e6f932fd52a91db39b332',
    'icons/favicon-32.png': '44d34910aa1dd9a3e65a78c56d4610ff3c9afc71ad145372042f491587468494',
}

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

if sha(src) != SOURCE_SHA:
    raise SystemExit(f'approved master SHA mismatch: {sha(src)}')

im = Image.open(src).convert('RGB')
if im.size != (1536, 1536):
    raise SystemExit(f'approved master dimensions changed: {im.size}')
w, h = im.size
pix = im.load()
seed = Image.new('L', (w, h), 0)
sp = seed.load()
for y in range(h):
    for x in range(w):
        r, g, b = pix[x, y]
        if max(r, g, b) >= 34 or (r >= 26 and r > g * 1.18 and r > b * 1.15):
            sp[x, y] = 255

# Alpha-only extraction: preserve the exact approved RGB pixels while separating
# the border-connected black canvas. Dilation protects the logo's black outline;
# enclosed black artwork is restored before the edge is lightly antialiased.
mask = seed.filter(ImageFilter.MaxFilter(31))
mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
inv = Image.eval(mask, lambda v: 255 - v)
ImageDraw.floodfill(inv, (0, 0), 128, thresh=0)
mp = mask.load(); ip = inv.load()
for y in range(h):
    for x in range(w):
        if ip[x, y] == 255:
            mp[x, y] = 255
mask = mask.filter(ImageFilter.GaussianBlur(0.65))
rgba = im.convert('RGBA')
rgba.putalpha(mask)

display = rgba.resize((512, 512), Image.Resampling.LANCZOS)
display.save(brand / 'letmefly-logo-display-512.png', optimize=True)

BG = (9, 11, 16, 255)
def make_icon(size: int, inset: int, name: str) -> None:
    canvas = Image.new('RGBA', (size, size), BG)
    art = rgba.resize((inset, inset), Image.Resampling.LANCZOS)
    xy = ((size - inset) // 2, (size - inset) // 2)
    canvas.alpha_composite(art, xy)
    canvas.convert('RGB').save(icons / name, optimize=True)

make_icon(192, 174, 'app-icon-192.png')
make_icon(512, 464, 'app-icon-512.png')
make_icon(512, 350, 'app-icon-512-maskable.png')
make_icon(180, 164, 'apple-touch-icon.png')
make_icon(32, 30, 'favicon-32.png')

report = {'sourceSha256': SOURCE_SHA, 'sourceDimensions': [1536, 1536], 'files': {}}
for rel, expected in EXPECTED.items():
    path = out / rel
    actual = sha(path)
    if actual != expected:
        raise SystemExit(f'derivative SHA mismatch for {rel}: expected {expected}, got {actual}')
    with Image.open(path) as test:
        report['files'][rel] = {'sha256': actual, 'dimensions': list(test.size), 'mode': test.mode}
(out / 'official-brand-v2-materialization.json').write_text(json.dumps(report, indent=2) + '\n')
print('LetMeFly official brand v2 materialization: PASS')
