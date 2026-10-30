/**
 * Seed to walls at this generator version, the hashes of the mockup the generator was ported
 * from. A change that moves one bumps `GENERATOR_VERSION` and records new hashes beside these,
 * never over them.
 */
export const GOLDEN: {
  readonly version: number;
  readonly hashes: Record<string, readonly string[]>;
} = {
  version: 7,
  hashes: {
    recommended: ['0d1689f7', '8abe0a3b', '226953ce'],
    japan: ['56637c02', '08b42645', '130a203e'],
    'japan-half': ['cf2e04d1', '6edb60b7'],
    apec: ['777aeb39', '6168ca7c', '2da70780'],
    uk: ['4c3c097b', 'cfae0b19', '4e5ebf18'],
    single: ['bb7acde6', '7b099120', '78dab16b'],
  },
};
