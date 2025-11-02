import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_subscription_status" AS ENUM('active', 'canceled', 'none');
  CREATE TYPE "public"."enum_purchases_item_type" AS ENUM('media', 'collection');
  CREATE TABLE "purchases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"item_type" "enum_purchases_item_type" NOT NULL,
  	"price" numeric NOT NULL,
  	"transaction_i_d" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "purchases_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"background_collections_id" integer,
  	"background_media_id" integer
  );
  
  ALTER TABLE "background_media_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "background_media_rels" CASCADE;
  ALTER TABLE "background_collections_rels" DROP CONSTRAINT "background_collections_rels_users_fk";
  
  ALTER TABLE "_background_collections_v_rels" DROP CONSTRAINT "_background_collections_v_rels_users_fk";
  
  DROP INDEX "background_collections_rels_users_id_idx";
  DROP INDEX "_background_collections_v_rels_users_id_idx";
  ALTER TABLE "users" ADD COLUMN "stripe_customer_i_d" varchar;
  ALTER TABLE "users" ADD COLUMN "subscription_status" "enum_users_subscription_status" DEFAULT 'none';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "purchases_id" integer;
  ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "purchases_rels" ADD CONSTRAINT "purchases_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "purchases_rels" ADD CONSTRAINT "purchases_rels_background_collections_fk" FOREIGN KEY ("background_collections_id") REFERENCES "public"."background_collections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "purchases_rels" ADD CONSTRAINT "purchases_rels_background_media_fk" FOREIGN KEY ("background_media_id") REFERENCES "public"."background_media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "purchases_user_idx" ON "purchases" USING btree ("user_id");
  CREATE UNIQUE INDEX "purchases_transaction_i_d_idx" ON "purchases" USING btree ("transaction_i_d");
  CREATE INDEX "purchases_updated_at_idx" ON "purchases" USING btree ("updated_at");
  CREATE INDEX "purchases_created_at_idx" ON "purchases" USING btree ("created_at");
  CREATE INDEX "purchases_rels_order_idx" ON "purchases_rels" USING btree ("order");
  CREATE INDEX "purchases_rels_parent_idx" ON "purchases_rels" USING btree ("parent_id");
  CREATE INDEX "purchases_rels_path_idx" ON "purchases_rels" USING btree ("path");
  CREATE INDEX "purchases_rels_background_collections_id_idx" ON "purchases_rels" USING btree ("background_collections_id");
  CREATE INDEX "purchases_rels_background_media_id_idx" ON "purchases_rels" USING btree ("background_media_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_purchases_fk" FOREIGN KEY ("purchases_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_purchases_id_idx" ON "payload_locked_documents_rels" USING btree ("purchases_id");
  ALTER TABLE "background_collections_rels" DROP COLUMN "users_id";
  ALTER TABLE "_background_collections_v_rels" DROP COLUMN "users_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "background_media_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  ALTER TABLE "purchases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "purchases_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "purchases" CASCADE;
  DROP TABLE "purchases_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_purchases_fk";
  
  DROP INDEX "payload_locked_documents_rels_purchases_id_idx";
  ALTER TABLE "background_collections_rels" ADD COLUMN "users_id" integer;
  ALTER TABLE "_background_collections_v_rels" ADD COLUMN "users_id" integer;
  ALTER TABLE "background_media_rels" ADD CONSTRAINT "background_media_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."background_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "background_media_rels" ADD CONSTRAINT "background_media_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "background_media_rels_order_idx" ON "background_media_rels" USING btree ("order");
  CREATE INDEX "background_media_rels_parent_idx" ON "background_media_rels" USING btree ("parent_id");
  CREATE INDEX "background_media_rels_path_idx" ON "background_media_rels" USING btree ("path");
  CREATE INDEX "background_media_rels_users_id_idx" ON "background_media_rels" USING btree ("users_id");
  ALTER TABLE "background_collections_rels" ADD CONSTRAINT "background_collections_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_background_collections_v_rels" ADD CONSTRAINT "_background_collections_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "background_collections_rels_users_id_idx" ON "background_collections_rels" USING btree ("users_id");
  CREATE INDEX "_background_collections_v_rels_users_id_idx" ON "_background_collections_v_rels" USING btree ("users_id");
  ALTER TABLE "users" DROP COLUMN "stripe_customer_i_d";
  ALTER TABLE "users" DROP COLUMN "subscription_status";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "purchases_id";
  DROP TYPE "public"."enum_users_subscription_status";
  DROP TYPE "public"."enum_purchases_item_type";`)
}
