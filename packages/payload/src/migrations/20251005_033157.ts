import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "background_collections" ADD COLUMN "meta_title" varchar;
  ALTER TABLE "background_collections" ADD COLUMN "meta_image_id" integer;
  ALTER TABLE "background_collections" ADD COLUMN "meta_description" varchar;
  ALTER TABLE "_background_collections_v" ADD COLUMN "version_meta_title" varchar;
  ALTER TABLE "_background_collections_v" ADD COLUMN "version_meta_image_id" integer;
  ALTER TABLE "_background_collections_v" ADD COLUMN "version_meta_description" varchar;
  ALTER TABLE "background_collections" ADD CONSTRAINT "background_collections_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_background_collections_v" ADD CONSTRAINT "_background_collections_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "background_collections_meta_meta_image_idx" ON "background_collections" USING btree ("meta_image_id");
  CREATE INDEX "_background_collections_v_version_meta_version_meta_imag_idx" ON "_background_collections_v" USING btree ("version_meta_image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "background_collections" DROP CONSTRAINT "background_collections_meta_image_id_media_id_fk";
  
  ALTER TABLE "_background_collections_v" DROP CONSTRAINT "_background_collections_v_version_meta_image_id_media_id_fk";
  
  DROP INDEX "background_collections_meta_meta_image_idx";
  DROP INDEX "_background_collections_v_version_meta_version_meta_imag_idx";
  ALTER TABLE "background_collections" DROP COLUMN "meta_title";
  ALTER TABLE "background_collections" DROP COLUMN "meta_image_id";
  ALTER TABLE "background_collections" DROP COLUMN "meta_description";
  ALTER TABLE "_background_collections_v" DROP COLUMN "version_meta_title";
  ALTER TABLE "_background_collections_v" DROP COLUMN "version_meta_image_id";
  ALTER TABLE "_background_collections_v" DROP COLUMN "version_meta_description";`)
}
