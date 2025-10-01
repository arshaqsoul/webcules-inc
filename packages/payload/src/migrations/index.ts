import * as migration_20251001_054919 from './20251001_054919';

export const migrations = [
  {
    up: migration_20251001_054919.up,
    down: migration_20251001_054919.down,
    name: '20251001_054919'
  },
];
