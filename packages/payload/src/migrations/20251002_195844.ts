import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_application" AS ENUM('webcules', 'webcules-backgrounds');
  CREATE TYPE "public"."enum__pages_v_version_application" AS ENUM('webcules', 'webcules-backgrounds');
  CREATE TYPE "public"."enum_posts_application" AS ENUM('webcules', 'webcules-backgrounds');
  CREATE TYPE "public"."enum__posts_v_version_application" AS ENUM('webcules', 'webcules-backgrounds');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'member');
  CREATE TYPE "public"."enum_background_collections_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__background_collections_v_version_status" AS ENUM('draft', 'published');
  ALTER TYPE "public"."enum_folders_folder_type" ADD VALUE 'backgroundMedia';
  CREATE TABLE "background_media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"is_trending" boolean DEFAULT false,
  	"is_premium" boolean DEFAULT false,
  	"single_image_price" numeric NOT NULL,
  	"folder_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_small_url" varchar,
  	"sizes_small_width" numeric,
  	"sizes_small_height" numeric,
  	"sizes_small_mime_type" varchar,
  	"sizes_small_filesize" numeric,
  	"sizes_small_filename" varchar
  );
  
  CREATE TABLE "background_media_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "background_collections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar,
  	"midjourney_prompt" varchar,
  	"collection_price" numeric,
  	"status" "enum_background_collections_status" DEFAULT 'draft',
  	"published_at" timestamp(3) with time zone,
  	"is_trending" boolean DEFAULT false,
  	"slug" varchar,
  	"slug_lock" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_background_collections_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "background_collections_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"background_media_id" integer
  );
  
  CREATE TABLE "_background_collections_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_description" varchar,
  	"version_midjourney_prompt" varchar,
  	"version_collection_price" numeric,
  	"version_status" "enum__background_collections_v_version_status" DEFAULT 'draft',
  	"version_published_at" timestamp(3) with time zone,
  	"version_is_trending" boolean DEFAULT false,
  	"version_slug" varchar,
  	"version_slug_lock" boolean DEFAULT true,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__background_collections_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_background_collections_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"background_media_id" integer
  );
  
  ALTER TABLE "pages" ADD COLUMN "application" "enum_pages_application" DEFAULT 'webcules';
  ALTER TABLE "_pages_v" ADD COLUMN "version_application" "enum__pages_v_version_application" DEFAULT 'webcules';
  ALTER TABLE "posts" ADD COLUMN "application" "enum_posts_application" DEFAULT 'webcules';
  ALTER TABLE "_posts_v" ADD COLUMN "version_application" "enum__posts_v_version_application" DEFAULT 'webcules';
  ALTER TABLE "users" ADD COLUMN "role" "enum_users_role" DEFAULT 'member' NOT NULL;
  ALTER TABLE "users" ADD COLUMN "is_paid" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "background_media_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "background_collections_id" integer;
  ALTER TABLE "background_media" ADD CONSTRAINT "background_media_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "background_media_rels" ADD CONSTRAINT "background_media_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."background_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "background_media_rels" ADD CONSTRAINT "background_media_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "background_collections_rels" ADD CONSTRAINT "background_collections_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."background_collections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "background_collections_rels" ADD CONSTRAINT "background_collections_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "background_collections_rels" ADD CONSTRAINT "background_collections_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "background_collections_rels" ADD CONSTRAINT "background_collections_rels_background_media_fk" FOREIGN KEY ("background_media_id") REFERENCES "public"."background_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_background_collections_v" ADD CONSTRAINT "_background_collections_v_parent_id_background_collections_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."background_collections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_background_collections_v_rels" ADD CONSTRAINT "_background_collections_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_background_collections_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_background_collections_v_rels" ADD CONSTRAINT "_background_collections_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_background_collections_v_rels" ADD CONSTRAINT "_background_collections_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_background_collections_v_rels" ADD CONSTRAINT "_background_collections_v_rels_background_media_fk" FOREIGN KEY ("background_media_id") REFERENCES "public"."background_media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "background_media_folder_idx" ON "background_media" USING btree ("folder_id");
  CREATE INDEX "background_media_updated_at_idx" ON "background_media" USING btree ("updated_at");
  CREATE INDEX "background_media_created_at_idx" ON "background_media" USING btree ("created_at");
  CREATE UNIQUE INDEX "background_media_filename_idx" ON "background_media" USING btree ("filename");
  CREATE INDEX "background_media_sizes_thumbnail_sizes_thumbnail_filenam_idx" ON "background_media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "background_media_sizes_small_sizes_small_filename_idx" ON "background_media" USING btree ("sizes_small_filename");
  CREATE INDEX "background_media_rels_order_idx" ON "background_media_rels" USING btree ("order");
  CREATE INDEX "background_media_rels_parent_idx" ON "background_media_rels" USING btree ("parent_id");
  CREATE INDEX "background_media_rels_path_idx" ON "background_media_rels" USING btree ("path");
  CREATE INDEX "background_media_rels_users_id_idx" ON "background_media_rels" USING btree ("users_id");
  CREATE INDEX "background_collections_slug_idx" ON "background_collections" USING btree ("slug");
  CREATE INDEX "background_collections_updated_at_idx" ON "background_collections" USING btree ("updated_at");
  CREATE INDEX "background_collections_created_at_idx" ON "background_collections" USING btree ("created_at");
  CREATE INDEX "background_collections__status_idx" ON "background_collections" USING btree ("_status");
  CREATE INDEX "background_collections_rels_order_idx" ON "background_collections_rels" USING btree ("order");
  CREATE INDEX "background_collections_rels_parent_idx" ON "background_collections_rels" USING btree ("parent_id");
  CREATE INDEX "background_collections_rels_path_idx" ON "background_collections_rels" USING btree ("path");
  CREATE INDEX "background_collections_rels_users_id_idx" ON "background_collections_rels" USING btree ("users_id");
  CREATE INDEX "background_collections_rels_media_id_idx" ON "background_collections_rels" USING btree ("media_id");
  CREATE INDEX "background_collections_rels_background_media_id_idx" ON "background_collections_rels" USING btree ("background_media_id");
  CREATE INDEX "_background_collections_v_parent_idx" ON "_background_collections_v" USING btree ("parent_id");
  CREATE INDEX "_background_collections_v_version_version_slug_idx" ON "_background_collections_v" USING btree ("version_slug");
  CREATE INDEX "_background_collections_v_version_version_updated_at_idx" ON "_background_collections_v" USING btree ("version_updated_at");
  CREATE INDEX "_background_collections_v_version_version_created_at_idx" ON "_background_collections_v" USING btree ("version_created_at");
  CREATE INDEX "_background_collections_v_version_version__status_idx" ON "_background_collections_v" USING btree ("version__status");
  CREATE INDEX "_background_collections_v_created_at_idx" ON "_background_collections_v" USING btree ("created_at");
  CREATE INDEX "_background_collections_v_updated_at_idx" ON "_background_collections_v" USING btree ("updated_at");
  CREATE INDEX "_background_collections_v_latest_idx" ON "_background_collections_v" USING btree ("latest");
  CREATE INDEX "_background_collections_v_autosave_idx" ON "_background_collections_v" USING btree ("autosave");
  CREATE INDEX "_background_collections_v_rels_order_idx" ON "_background_collections_v_rels" USING btree ("order");
  CREATE INDEX "_background_collections_v_rels_parent_idx" ON "_background_collections_v_rels" USING btree ("parent_id");
  CREATE INDEX "_background_collections_v_rels_path_idx" ON "_background_collections_v_rels" USING btree ("path");
  CREATE INDEX "_background_collections_v_rels_users_id_idx" ON "_background_collections_v_rels" USING btree ("users_id");
  CREATE INDEX "_background_collections_v_rels_media_id_idx" ON "_background_collections_v_rels" USING btree ("media_id");
  CREATE INDEX "_background_collections_v_rels_background_media_id_idx" ON "_background_collections_v_rels" USING btree ("background_media_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_background_media_fk" FOREIGN KEY ("background_media_id") REFERENCES "public"."background_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_background_collections_fk" FOREIGN KEY ("background_collections_id") REFERENCES "public"."background_collections"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_background_media_id_idx" ON "payload_locked_documents_rels" USING btree ("background_media_id");
  CREATE INDEX "payload_locked_documents_rels_background_collections_id_idx" ON "payload_locked_documents_rels" USING btree ("background_collections_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "background_media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "background_media_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "background_collections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "background_collections_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_background_collections_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_background_collections_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "background_media" CASCADE;
  DROP TABLE "background_media_rels" CASCADE;
  DROP TABLE "background_collections" CASCADE;
  DROP TABLE "background_collections_rels" CASCADE;
  DROP TABLE "_background_collections_v" CASCADE;
  DROP TABLE "_background_collections_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_background_media_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_background_collections_fk";
  
  ALTER TABLE "folders_folder_type" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_folders_folder_type";
  CREATE TYPE "public"."enum_folders_folder_type" AS ENUM('media');
  ALTER TABLE "folders_folder_type" ALTER COLUMN "value" SET DATA TYPE "public"."enum_folders_folder_type" USING "value"::"public"."enum_folders_folder_type";
  DROP INDEX "payload_locked_documents_rels_background_media_id_idx";
  DROP INDEX "payload_locked_documents_rels_background_collections_id_idx";
  ALTER TABLE "pages" DROP COLUMN "application";
  ALTER TABLE "_pages_v" DROP COLUMN "version_application";
  ALTER TABLE "posts" DROP COLUMN "application";
  ALTER TABLE "_posts_v" DROP COLUMN "version_application";
  ALTER TABLE "users" DROP COLUMN "role";
  ALTER TABLE "users" DROP COLUMN "is_paid";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "background_media_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "background_collections_id";
  DROP TYPE "public"."enum_pages_application";
  DROP TYPE "public"."enum__pages_v_version_application";
  DROP TYPE "public"."enum_posts_application";
  DROP TYPE "public"."enum__posts_v_version_application";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_background_collections_status";
  DROP TYPE "public"."enum__background_collections_v_version_status";`)
}
