import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'

// Only the rendered artwork viewport ships. Embedding a whole mockup behind an
// SVG viewBox would also expose its offscreen sample athlete details. Original
// reference hashes are provenance; scene hashes verify the public artwork bytes.
export function validateMockupScenes(directory) {
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'))
  assert.equal(manifest.length,9)
  for(const item of manifest){
    const svg=fs.readFileSync(path.join(directory,item.scene+'.svg'),'utf8')
    const encoded=svg.match(/href="data:image\/png;base64,([^"]+)"/)?.[1]
    assert.ok(encoded,`${item.scene} is self-contained`)
    const bytes=Buffer.from(encoded,'base64')
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sceneSha256,`${item.scene}: public scene bytes`)
    const dimensions=item.viewBox.slice(2)
    assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],dimensions,`${item.scene}: offscreen mockup pixels excluded`)
    assert.ok(svg.includes(`viewBox="0 0 ${dimensions.join(' ')}"`),`${item.scene}: artwork-only viewport`)
    assert.match(item.originalSha256,/^[a-f0-9]{64}$/,`${item.scene}: reference provenance`)
    assert.ok(!/<script|<foreignObject|https?:\/\/(?!www.w3.org)/i.test(svg),`${item.scene}: no executable or remote content`)
  }
  return manifest
}
if(process.argv[1]?.endsWith('validate-mockup-scenes.mjs')){
  validateMockupScenes(path.resolve(process.argv[2]))
  console.log('Approved mockup scene integrity: PASS')
}
