import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`background_media\` ADD \`preview_id\` integer REFERENCES media(id);`)
  await db.run(sql`CREATE INDEX \`background_media_preview_idx\` ON \`background_media\` (\`preview_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_background_media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`alt\` text,
  	\`is_trending\` integer DEFAULT false,
  	\`is_premium\` integer DEFAULT false,
  	\`single_image_price\` numeric NOT NULL,
  	\`folder_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	FOREIGN KEY (\`folder_id\`) REFERENCES \`folders\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_background_media\`("id", "alt", "is_trending", "is_premium", "single_image_price", "folder_id", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height") SELECT "id", "alt", "is_trending", "is_premium", "single_image_price", "folder_id", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height" FROM \`background_media\`;`)
  await db.run(sql`DROP TABLE \`background_media\`;`)
  await db.run(sql`ALTER TABLE \`__new_background_media\` RENAME TO \`background_media\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`background_media_folder_idx\` ON \`background_media\` (\`folder_id\`);`)
  await db.run(sql`CREATE INDEX \`background_media_updated_at_idx\` ON \`background_media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`background_media_created_at_idx\` ON \`background_media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`background_media_filename_idx\` ON \`background_media\` (\`filename\`);`)
}
