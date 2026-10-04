CREATE TYPE "public"."enquiry_source" AS ENUM('website', 'phone', 'walk_in');--> statement-breakpoint
CREATE TYPE "public"."enquiry_status" AS ENUM('new', 'contacted', 'quote_sent', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."enquiry_type" AS ENUM('membership', 'trial', 'corporate', 'general');--> statement-breakpoint
CREATE TYPE "public"."note_kind" AS ENUM('note', 'status_change', 'assignment', 'system');--> statement-breakpoint
CREATE TYPE "public"."notify_audience" AS ENUM('staff', 'customer');--> statement-breakpoint
CREATE TYPE "public"."notify_channel" AS ENUM('email', 'sms', 'internal');--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" varchar(20) NOT NULL,
	"type" "enquiry_type" DEFAULT 'general' NOT NULL,
	"source" "enquiry_source" DEFAULT 'website' NOT NULL,
	"status" "enquiry_status" DEFAULT 'new' NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20) NOT NULL,
	"phone_key" varchar(10) NOT NULL,
	"company_name" varchar(150),
	"message" varchar(1000),
	"interested_plan" "plan_tier",
	"sport" "sport",
	"assigned_to" integer,
	"follow_up_at" timestamp with time zone,
	"last_contacted_at" timestamp with time zone,
	"lost_reason" varchar(255),
	"member_id" integer,
	"trial_booking_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "enquiry_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"enquiry_id" integer NOT NULL,
	"author_id" integer,
	"kind" "note_kind" DEFAULT 'note' NOT NULL,
	"body" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"audience" "notify_audience" NOT NULL,
	"to_user_id" integer,
	"channel" "notify_channel" NOT NULL,
	"to_address" varchar(255),
	"subject" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"related_type" varchar(30),
	"related_id" integer,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_number" varchar(20) NOT NULL,
	"enquiry_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"duration_months" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"discount_pct" integer DEFAULT 0 NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"note" varchar(500),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "trial_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone_key" varchar(10) NOT NULL,
	"name" varchar(120) NOT NULL,
	"booking_id" integer,
	"enquiry_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_trial_booking_id_bookings_id_fk" FOREIGN KEY ("trial_booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_notes" ADD CONSTRAINT "enquiry_notes_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_notes" ADD CONSTRAINT "enquiry_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_claims" ADD CONSTRAINT "trial_claims_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_claims" ADD CONSTRAINT "trial_claims_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enquiries_phone_idx" ON "enquiries" USING btree ("phone_key");--> statement-breakpoint
CREATE INDEX "enquiries_followup_idx" ON "enquiries" USING btree ("follow_up_at");--> statement-breakpoint
CREATE INDEX "enquiry_notes_enquiry_idx" ON "enquiry_notes" USING btree ("enquiry_id");--> statement-breakpoint
CREATE INDEX "notifications_audience_idx" ON "notifications" USING btree ("audience","read_at");--> statement-breakpoint
CREATE INDEX "quotes_enquiry_idx" ON "quotes" USING btree ("enquiry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_claims_phone_unique" ON "trial_claims" USING btree ("phone_key");