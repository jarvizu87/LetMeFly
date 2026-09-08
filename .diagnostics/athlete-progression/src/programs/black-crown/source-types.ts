export type BlackCrownPriority = 'mandatory' | 'conditional' | 'optional'

export interface BlackCrownSourceSection {
  ordinal: string
  title: string
  priority: BlackCrownPriority
  /**
   * Canonical public prescription text derived from the approved v2.0 source.
   * Athlete-derived exact pound renderings and calendar dates are intentionally omitted.
   */
  prescription: string
}

export interface BlackCrownSourceDay {
  day: number
  title: string
  role: string
  duration: string
  status: string
  sections: BlackCrownSourceSection[]
}

export interface BlackCrownSourceWeek {
  week: number
  block: number
  title: string
  days: BlackCrownSourceDay[]
  /**
   * SHA-256 of the exact canonical source slice used for extraction.
   * The source slice itself stays private; only the digest is committed.
   */
  sourceHash: string
}
