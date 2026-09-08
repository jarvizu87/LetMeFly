// Compatibility facade. Program definitions live in src/programs/* and shared types live in src/program-engine/*.
// Keep this stable while older UI overlays migrate to the modular registry.
export * from '../program-engine/types'
export * from '../programs/registry'
export * from '../programs/crownforge'
export * from '../programs/crown-maintenance'
export * from '../programs/black-crown'
