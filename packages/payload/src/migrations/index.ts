import * as migration_20251001_054919 from './20251001_054919';
import * as migration_20251001_102009 from './20251001_102009';
import * as migration_20251002_195844 from './20251002_195844';

export const migrations = [
  {
    up: migration_20251001_054919.up,
    down: migration_20251001_054919.down,
    name: '20251001_054919',
  },
  {
    up: migration_20251001_102009.up,
    down: migration_20251001_102009.down,
    name: '20251001_102009',
  },
  {
    up: migration_20251002_195844.up,
    down: migration_20251002_195844.down,
    name: '20251002_195844'
  },
];
