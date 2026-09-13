import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Exact approved Raizen_Black_Crown_Ascension source, decoded and visually
// verified at 1229 x 1536. A valid outer SVG can still hide a broken JPEG.
export function validateLockedArt(file) {
  const svg = fs.readFileSync(file, 'utf8')
  const payload = svg.match(/href="data:image\/jpeg;base64,([^"]+)"/)?.[1]
  if (!payload || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) {
    throw new Error('Locked identity art contains invalid or truncated base64')
  }
  const jpeg = Buffer.from(payload, 'base64')
  if (jpeg.toString('base64') !== payload || jpeg.length !== 530408 ||
      createHash('sha256').update(jpeg).digest('hex') !== '1ca02d23424f2b2f2ded57f9ebce0ebd36c805cd3a778b5929790b2011911e2a') {
    throw new Error('Locked identity art does not match the approved original JPEG')
  }
  if (!svg.includes('viewBox="0 0 1229 1536"') || !svg.includes('width="1229" height="1536"')) {
    throw new Error('Locked identity art must preserve the original image dimensions')
  }
  return { bytes: jpeg.length, width: 1229, height: 1536 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Approved identity image integrity: PASS', validateLockedArt(process.argv[2]))
}
