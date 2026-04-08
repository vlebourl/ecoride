ALTER TABLE "user"
ADD COLUMN "super73_auto_mode_enabled" boolean DEFAULT false NOT NULL,
ADD COLUMN "super73_default_mode" text,
ADD COLUMN "super73_default_assist" integer,
ADD COLUMN "super73_default_light" boolean;