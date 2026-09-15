import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('overlays/ui-command-v2/static/train-heroes-v1/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const expected = [
  'squat-lower-strength',
  'bench-upper-push',
  'deadlift-posterior-chain',
  'olympic-explosive',
  'conditioning-carries',
  'accessory-recovery-work-capacity',
  'yoke-trap-strength',
  'overhead-vertical-strength',
  'realization-testing-crown-day',
];

const fail = (message) => {
  console.error(`TRAIN_HERO_V1_LOCK_FAIL: ${message}`);
  process.exit(1);
};

if (manifest.schemaVersion !== 1) fail('schemaVersion must remain 1');
if (manifest.packId !== 'train-heroes-v1') fail('packId must remain train-heroes-v1');
if (manifest.status !== 'locked') fail('pack must remain locked');
if (manifest.source?.nativeWidth !== 1672 || manifest.source?.nativeHeight !== 941) {
  fail('native source dimensions must remain 1672x941');
}
if (manifest.source?.aspectRatio !== '16:9') fail('aspect ratio must remain 16:9');
if (!Array.isArray(manifest.heroes) || manifest.heroes.length !== 9) fail('exactly nine heroes are required');

const actual = manifest.heroes.map((hero) => hero.key);
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  fail(`hero order/keys changed: ${JSON.stringify(actual)}`);
}

for (const hero of manifest.heroes) {
  if (!hero.label || !hero.deliveryFile || !Array.isArray(hero.useFor) || hero.useFor.length === 0) {
    fail(`${hero.key} is missing required metadata`);
  }
  if (!/^train-hero-v1-[a-z0-9-]+\.webp$/.test(hero.deliveryFile)) {
    fail(`${hero.key} has an invalid stable delivery filename: ${hero.deliveryFile}`);
  }
  if (!/^[a-f0-9]{64}$/.test(hero.sourceSha256)) {
    fail(`${hero.key} has an invalid source SHA-256`);
  }
}

if (manifest.selectionPolicy?.fallbackKey !== 'accessory-recovery-work-capacity') {
  fail('fallback hero changed');
}
if (manifest.selectionPolicy?.programLogicIsolation !== true) fail('program logic isolation must remain true');
if (manifest.selectionPolicy?.athleteDataIsolation !== true) fail('athlete data isolation must remain true');

console.log('TRAIN_HERO_V1_LOCK_PASS');
console.log(`pack=${manifest.packId} heroes=${manifest.heroes.length} status=${manifest.status}`);
