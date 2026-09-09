import * as migration_20260909_020733_initial_sqlite_schema from './20260909_020733_initial_sqlite_schema';
import * as migration_20260909_023850_add_storage_prefix_columns from './20260909_023850_add_storage_prefix_columns';
import * as migration_20260909_024127_drop_prefix_columns from './20260909_024127_drop_prefix_columns';

export const migrations = [
  {
    up: migration_20260909_020733_initial_sqlite_schema.up,
    down: migration_20260909_020733_initial_sqlite_schema.down,
    name: '20260909_020733_initial_sqlite_schema',
  },
  {
    up: migration_20260909_023850_add_storage_prefix_columns.up,
    down: migration_20260909_023850_add_storage_prefix_columns.down,
    name: '20260909_023850_add_storage_prefix_columns',
  },
  {
    up: migration_20260909_024127_drop_prefix_columns.up,
    down: migration_20260909_024127_drop_prefix_columns.down,
    name: '20260909_024127_drop_prefix_columns'
  },
];
