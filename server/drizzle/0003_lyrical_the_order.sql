CREATE TABLE "trip_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"distance_km" numeric(10, 3) NOT NULL,
	"duration_sec" integer,
	"gps_points" jsonb,
	"source_trip_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_presets" ADD CONSTRAINT "trip_presets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_presets" ADD CONSTRAINT "trip_presets_source_trip_id_trips_id_fk" FOREIGN KEY ("source_trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_presets_user_id_idx" ON "trip_presets" USING btree ("user_id");