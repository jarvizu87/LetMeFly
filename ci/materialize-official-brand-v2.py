from __future__ import annotations
from PIL import Image
from pathlib import Path
import hashlib, json, sys

if len(sys.argv) != 3:
    raise SystemExit('usage: materialize-official-brand-v2.py <approved-runtime-master.webp> <output-dir>')

src = Path(sys.argv[1])
out = Path(sys.argv[2])
brand = out / 'brand'
icons = out / 'icons'
brand.mkdir(parents=True, exist_ok=True)
icons.mkdir(parents=True, exist_ok=True)

AUTHORITATIVE_ORIGINAL_SHA = '2b0bb29e200fb48ade90336bc355ad26c21277ddfcbacdf245474e85f82d348b'
RUNTIME_SOURCE_SHA = 'e130ad7f388f9caab28d43a2fef731f9719275b79b527684b0fed9d43cb54e7b'
RUNTIME_PIXEL_SHA = 'f8a1f872d1f5fdf9a8cc0cd56f5e46e3f3e3dda20ad7d9a87a1b2183a6318c2e'
EXPECTED = {
    'brand/letmefly-logo-display-512.png': '56cedda2ac66e0c741579a2621bca3a2aec3ef8dc449f2dccf2da99ae6733b99',
    'icons/app-icon-192.png': '33881815734aa07e9f6f3bbcbbb62265250a381b3bdb5298c4998655f214808d',
    'icons/app-icon-512.png': '80cc6447d93651b5cd2824981424d11f33e465e1aa895c120eb50b3961a4f08d',
    'icons/app-icon-512-maskable.png': 'bdce794851fe520612088df2e16d3e610b29f5ca33addc6393303d1c7e16c97c',
    'icons/apple-touch-icon.png': '579f2517374ba2f031964017ff023780fdee2ccd1eda02e5f45f816e8c8eb479',
    'icons/favicon-32.png': '03fa7f4b273d55f2d86ae09eca0fedfae19f342dd631d16d74ecfaf3163b915f',
}

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

actual_source_sha = sha(src)
if actual_source_sha != RUNTIME_SOURCE_SHA:
    raise SystemExit(f'approved runtime master SHA mismatch: expected {RUNTIME_SOURCE_SHA}, got {actual_source_sha}')

with Image.open(src) as opened:
    if opened.size != (512, 512):
        raise SystemExit(f'approved runtime master dimensions changed: {opened.size}')
    icc = opened.info.get('icc_profile')
    if not icc:
        raise SystemExit('approved runtime master is missing its locked ICC profile')
    rgba = opened.convert('RGBA')

pixel_sha = hashlib.sha256(rgba.tobytes()).hexdigest()
if pixel_sha != RUNTIME_PIXEL_SHA:
    raise SystemExit(f'approved runtime RGBA pixel SHA mismatch: expected {RUNTIME_PIXEL_SHA}, got {pixel_sha}')

display_path = brand / 'letmefly-logo-display-512.png'
rgba.save(display_path, optimize=True, icc_profile=icc)

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

report = {
    'authoritativeOriginalSha256': AUTHORITATIVE_ORIGINAL_SHA,
    'runtimeMasterSha256': RUNTIME_SOURCE_SHA,
    'runtimePixelSha256': RUNTIME_PIXEL_SHA,
    'runtimeDimensions': [512, 512],
    'runtimeHasIccProfile': True,
    'files': {},
}
for rel, expected in EXPECTED.items():
    path = out / rel
    actual = sha(path)
    if actual != expected:
        raise SystemExit(f'derivative SHA mismatch for {rel}: expected {expected}, got {actual}')
    with Image.open(path) as test:
        report['files'][rel] = {'sha256': actual, 'dimensions': list(test.size), 'mode': test.mode}
(out / 'official-brand-v2-materialization.json').write_text(json.dumps(report, indent=2) + '\n')
print('LetMeFly official brand v2 materialization: PASS')
