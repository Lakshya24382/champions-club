CREATE TYPE "public"."booking_kind" AS ENUM('regular', 'social');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sport" AS ENUM('tennis', 'cricket', 'padel', 'badminton');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"court_id" integer NOT NULL,
	"kind" "booking_kind" DEFAULT 'regular' NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"member_id" integer,
	"guest_name" varchar(120),
	"guest_phone" varchar(20),
	"price" numeric(10, 2) DEFAULT 0 NOT NULL,
	"title" varchar(120),
	"capacity" integer,
	"price_per_player" numeric(10, 2),
	"cancelled_at" timestamp with time zone,
	"cancel_reason" varchar(255),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_time_order" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_social_fields" CHECK ("bookings"."kind" = 'regular' or ("bookings"."capacity" is not null and "bookings"."price_per_player" is not null))
);
--> statement-breakpoint
CREATE TABLE "courts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"sport" "sport" NOT NULL,
	"rate_per_hour" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "social_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"member_id" integer,
	"guest_name" varchar(120),
	"guest_phone" varchar(20),
	"price" numeric(10, 2) NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_plans" ADD COLUMN "court_discount_pct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_participants" ADD CONSTRAINT "social_participants_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_participants" ADD CONSTRAINT "social_participants_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_participants" ADD CONSTRAINT "social_participants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_court_time_idx" ON "bookings" USING btree ("court_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_member_time_idx" ON "bookings" USING btree ("member_id","starts_at");--> statement-breakpoint
CREATE INDEX "social_booking_idx" ON "social_participants" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_member_once" ON "social_participants" USING btree ("booking_id","member_id") WHERE "social_participants"."status" = 'confirmed' and "social_participants"."member_id" is not null;