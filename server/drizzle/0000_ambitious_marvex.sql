CREATE TYPE "public"."plan_tier" AS ENUM('gold', 'silver', 'junior');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_code" varchar(20) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20) NOT NULL,
	"date_of_birth" date NOT NULL,
	"plan_id" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_member_code_unique" UNIQUE("member_code")
);
--> statement-breakpoint
CREATE TABLE "membership_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"amount_paid" numeric(10, 2) NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier" "plan_tier" NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" varchar(255),
	"monthly_fee" numeric(10, 2) NOT NULL,
	"court_rate_per_hour" numeric(10, 2) NOT NULL,
	"shop_discount_pct" integer DEFAULT 0 NOT NULL,
	"bar_discount_pct" integer DEFAULT 0 NOT NULL,
	"max_bookings_per_day" integer DEFAULT 2 NOT NULL,
	CONSTRAINT "membership_plans_tier_unique" UNIQUE("tier")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"role" "role" DEFAULT 'staff' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_history" ADD CONSTRAINT "membership_history_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_history" ADD CONSTRAINT "membership_history_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_history" ADD CONSTRAINT "membership_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "members_phone_idx" ON "members" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "members_name_idx" ON "members" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "members_expires_idx" ON "members" USING btree ("expires_at");