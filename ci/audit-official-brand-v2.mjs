import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const dist = path.join(root, 'dist')
const authoritativeOriginalSha256 = '2b0bb29e200fb48ade90336bc355ad26c21277ddfcbacdf245474e85f82d348b'
const runtimeMasterSha256 = 'e130ad7f388f9caab28d43a2fef731f9719275b79b527684b0fed9d43cb54e7b'
const runtimePixelSha256 = 'f8a1f872d1f5fdf9a8cc0cd56f5e46e3f3e3dda20ad7d9a87a1b2183a6318c2e'
const expected = {
  'brand/letmefly-logo-display-512.png': ['56cedda2ac66e0c741579a2621bca3a2aec3ef8dc449f2dccf2da99ae6733b99', 512, 512],
  'icons/app-icon-192.png': ['33881815734aa07e9f6f3bbcbbb62265250a381b3bdb5298c4998655f214808d', 192, 192],
  'icons/app-icon-512.png': ['80cc6447d93651b5cd2824981424d11f33e465e1aa895c120eb50b3961a4f08d', 512, 512],
  'icons/app-icon-512-maskable.png': ['bdce794851fe520612088df2e16d3e610b29f5ca33addc6393303d1c7e16c97c', 512, 512],
  'icons/apple-touch-icon.png': ['579f2517374ba2f031964017ff023780fdee2ccd1eda02e5f45f816e8c8eb479', 180, 180],
  'icons/favicon-32.png': ['03fa7f4b273d55f2d86ae09eca0fedfae19f342dd631d16d74ecfaf3163b915f', 32, 32],
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
const materializationPath=path.join(dist,'brand','official-brand-v2-materialization.json')
if (!fs.existsSync(materializationPath)) fail('official brand materialization report missing')
const materialization=JSON.parse(fs.readFileSync(materializationPath,'utf8'))
if (materialization.authoritativeOriginalSha256 !== authoritativeOriginalSha256) fail('materialization original-source provenance SHA mismatch')
if (materialization.runtimeMasterSha256 !== runtimeMasterSha256) fail('materialization runtime-master SHA mismatch')
if (materialization.runtimePixelSha256 !== runtimePixelSha256) fail('materialization runtime pixel SHA mismatch')
if (materialization.runtimeHasIccProfile !== true) fail('materialization ICC-profile contract missing')
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
const report={result:'PASS',brandVersion:'official-brand-v2',authoritativeOriginalSha256,runtimeMasterSha256,runtimePixelSha256,assets:results}
fs.writeFileSync(path.join(outDir,'official-brand-v2.json'),JSON.stringify(report,null,2)+'\n')
console.log('LetMeFly official brand v2 production audit: PASS')
