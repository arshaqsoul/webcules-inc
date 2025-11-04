import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_download_history_item_type" AS ENUM('media', 'collection');
  CREATE TYPE "public"."enum_download_history_access_method" AS ENUM('subscription', 'purchase');
  ALTER TYPE "public"."enum_users_subscription_status" ADD VALUE 'incomplete';
  CREATE TABLE "download_history" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"item_type" "enum_download_history_item_type" NOT NULL,
  	"access_method" "enum_download_history_access_method" NOT NULL,
  	"downloaded_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "download_history_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"background_collections_id" integer,
  	"background_media_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "download_history_id" integer;
  ALTER TABLE "download_history" ADD CONSTRAINT "download_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "download_history_rels" ADD CONSTRAINT "download_history_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."download_history"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "download_history_rels" ADD CONSTRAINT "download_history_rels_background_collections_fk" FOREIGN KEY ("background_collections_id") REFERENCES "public"."background_collections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "download_history_rels" ADD CONSTRAINT "download_history_rels_background_media_fk" FOREIGN KEY ("background_media_id") REFERENCES "public"."background_media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "download_history_user_idx" ON "download_history" USING btree ("user_id");
  CREATE INDEX "download_history_rels_order_idx" ON "download_history_rels" USING btree ("order");
  CREATE INDEX "download_history_rels_parent_idx" ON "download_history_rels" USING btree ("parent_id");
  CREATE INDEX "download_history_rels_path_idx" ON "download_history_rels" USING btree ("path");
  CREATE INDEX "download_history_rels_background_collections_id_idx" ON "download_history_rels" USING btree ("background_collections_id");
  CREATE INDEX "download_history_rels_background_media_id_idx" ON "download_history_rels" USING btree ("background_media_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_download_history_fk" FOREIGN KEY ("download_history_id") REFERENCES "public"."download_history"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_download_history_id_idx" ON "payload_locked_documents_rels" USING btree ("download_history_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "download_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "download_history_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "download_history" CASCADE;
  DROP TABLE "download_history_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_download_history_fk";
  
  ALTER TABLE "users" ALTER COLUMN "subscription_status" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "subscription_status" SET DEFAULT 'none'::text;
  DROP TYPE "public"."enum_users_subscription_status";
  CREATE TYPE "public"."enum_users_subscription_status" AS ENUM('active', 'canceled', 'none');
  ALTER TABLE "users" ALTER COLUMN "subscription_status" SET DEFAULT 'none'::"public"."enum_users_subscription_status";
  ALTER TABLE "users" ALTER COLUMN "subscription_status" SET DATA TYPE "public"."enum_users_subscription_status" USING "subscription_status"::"public"."enum_users_subscription_status";
  DROP INDEX "payload_locked_documents_rels_download_history_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "download_history_id";
  DROP TYPE "public"."enum_download_history_item_type";
  DROP TYPE "public"."enum_download_history_access_method";`)
}
