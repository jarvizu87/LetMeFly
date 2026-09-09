import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const dist = path.join(root, 'dist')
const expected = {
  'brand/letmefly-logo-display-512.png': ['56cedda2ac66e0c741579a2621bca3a2aec3ef8dc449f2dccf2da99ae6733b99', 512, 512],
  'icons/app-icon-192.png': ['a139fca7b39f392c9674bf953366e7fccfa621733244405070a5ccfa3ffc106e', 192, 192],
  'icons/app-icon-512.png': ['f1a07af19ba28db8ffed25db96b3093fe3ce45b6f37916f8b839a4345176169f', 512, 512],
  'icons/app-icon-512-maskable.png': ['37c2b1e1695afe27394db706eac78c93cd7c398514c797af5a8656e08ca694af', 512, 512],
  'icons/apple-touch-icon.png': ['8d2631bda1c2266b7803e967769db716bfd93f9a786e6f932fd52a91db39b332', 180, 180],
  'icons/favicon-32.png': ['44d34910aa1dd9a3e65a78c56d4610ff3c9afc71ad145372042f491587468494', 32, 32],
}
const fail = (m) => { throw new Error(m) }
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const pngSize = (p) => {
  const b = fs.readFileSync(p)
  if (b.readUInt32BE(0) !== 0x89504e47) fail(`${p} is not PNG`)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}
const results = {}
for (const [rel, [hash,w,h]] of Object.entries(expected)) {
  const p=path.join(dist,rel)
  if (!fs.existsSync(p)) fail(`missing official brand asset: ${rel}`)
  const actual=sha(p); if (actual !== hash) fail(`hash mismatch: ${rel}`)
  const size=pngSize(p); if (size[0]!==w || size[1]!==h) fail(`dimension mismatch: ${rel} -> ${size}`)
  results[rel]={sha256:actual,dimensions:size}
}
const index=fs.readFileSync(path.join(dist,'index.html'),'utf8')
const manifestText=fs.readFileSync(path.join(dist,'manifest.webmanifest'),'utf8')
const manifest=JSON.parse(manifestText)
const sw=fs.readFileSync(path.join(dist,'service-worker.js'),'utf8')
for (const needle of ['/manifest.webmanifest?v=brand-v9','/icons/favicon-32.png?v=9','/icons/apple-touch-icon.png?v=9']) if (!index.includes(needle)) fail(`index missing ${needle}`)
const iconMap=new Map(manifest.icons.map(i=>[i.src,i]))
for (const [src,purpose] of [['/icons/app-icon-192.png?v=9','any'],['/icons/app-icon-512.png?v=9','any'],['/icons/app-icon-512-maskable.png?v=9','maskable']]) {
  if (!iconMap.has(src) || iconMap.get(src).purpose !== purpose) fail(`manifest icon contract missing: ${src}`)
}
for (const needle of ['brand-v9','/brand/letmefly-logo-display-512.png?v=9','/icons/app-icon-192.png?v=9','/icons/app-icon-512-maskable.png?v=9']) if (!sw.includes(needle)) fail(`service worker missing ${needle}`)
let all=''
for (const p of [path.join(dist,'index.html'),...fs.readdirSync(path.join(dist,'assets')).map(f=>path.join(dist,'assets',f))]) {
  if (fs.statSync(p).isFile()) all += fs.readFileSync(p,'utf8')
}
if (/letmefly\/app-brand\/letmefly-app-icon-(192|512|512-maskable)-v2\.png/.test(all)) fail('legacy broken Cloudinary app-brand URL still active')
const outDir=path.join(root,'OFFICIAL_BRAND_AUDIT'); fs.mkdirSync(outDir,{recursive:true})
const report={result:'PASS',brandVersion:'official-brand-v2',sourceSha256:'2b0bb29e200fb48ade90336bc355ad26c21277ddfcbacdf245474e85f82d348b',assets:results}
fs.writeFileSync(path.join(outDir,'official-brand-v2.json'),JSON.stringify(report,null,2)+'\n')
console.log('LetMeFly official brand v2 production audit: PASS')
