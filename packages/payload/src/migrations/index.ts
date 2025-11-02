import * as migration_20251001_054919 from './20251001_054919';
import * as migration_20251001_102009 from './20251001_102009';
import * as migration_20251002_195844 from './20251002_195844';
import * as migration_20251005_033157 from './20251005_033157';
import * as migration_20251102_231851 from './20251102_231851';

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
    name: '20251002_195844',
  },
  {
    up: migration_20251005_033157.up,
    down: migration_20251005_033157.down,
    name: '20251005_033157',
  },
  {
    up: migration_20251102_231851.up,
    down: migration_20251102_231851.down,
    name: '20251102_231851'
  },
];
