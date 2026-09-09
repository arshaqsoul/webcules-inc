import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`prefix\`;`)
  await db.run(sql`ALTER TABLE \`background_media\` DROP COLUMN \`prefix\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`prefix\` text DEFAULT 'media';`)
  await db.run(sql`ALTER TABLE \`background_media\` ADD \`prefix\` text DEFAULT 'backgroundMedia';`)
}
