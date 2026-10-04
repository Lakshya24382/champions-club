CREATE TYPE "public"."item_status" AS ENUM('new', 'preparing', 'ready', 'served', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."menu_category" AS ENUM('drink', 'food', 'snack', 'dessert');--> statement-breakpoint
CREATE TYPE "public"."station" AS ENUM('bar', 'kitchen');--> statement-breakpoint
CREATE TYPE "public"."tab_status" AS ENUM('open', 'paid', 'void');--> statement-breakpoint
CREATE TABLE "bar_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tab_id" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"shift_id" integer,
	"received_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar_tab_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"tab_id" integer NOT NULL,
	"menu_item_id" integer NOT NULL,
	"item_name" varchar(100) NOT NULL,
	"category" "menu_category" NOT NULL,
	"station" "station" NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"notes" varchar(200),
	"status" "item_status" DEFAULT 'new' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_items_qty_positive" CHECK ("bar_tab_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "bar_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(40) NOT NULL,
	"seats" integer DEFAULT 4 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "bar_tables_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "bar_tabs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tab_number" varchar(20) NOT NULL,
	"table_id" integer,
	"member_id" integer,
	"customer_name" varchar(120) NOT NULL,
	"status" "tab_status" DEFAULT 'open' NOT NULL,
	"discount_pct" integer DEFAULT 0 NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT 0 NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT 0 NOT NULL,
	"total" numeric(10, 2) DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"opened_by" integer,
	"closed_by" integer,
	"shift_id" integer,
	"void_reason" varchar(255),
	CONSTRAINT "bar_tabs_tab_number_unique" UNIQUE("tab_number")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" "menu_category" NOT NULL,
	"station" "station" NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"opening_cash" numeric(10, 2) DEFAULT 0 NOT NULL,
	"expected_cash" numeric(10, 2),
	"closing_cash" numeric(10, 2),
	"note" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "bar_payments" ADD CONSTRAINT "bar_payments_tab_id_bar_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."bar_tabs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_payments" ADD CONSTRAINT "bar_payments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_payments" ADD CONSTRAINT "bar_payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_tab_items" ADD CONSTRAINT "bar_tab_items_tab_id_bar_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."bar_tabs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_tab_items" ADD CONSTRAINT "bar_tab_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_tab_items" ADD CONSTRAINT "bar_tab_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_tabs" ADD CONSTRAINT "bar_tabs_table_id_bar_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."bar_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_tabs" ADD CONSTRAINT "bar_tabs_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_tabs" ADD CONSTRAINT "bar_tabs_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_tabs" ADD CONSTRAINT "bar_tabs_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_tabs" ADD CONSTRAINT "bar_tabs_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bar_payments_tab_idx" ON "bar_payments" USING btree ("tab_id");--> statement-breakpoint
CREATE INDEX "bar_payments_created_idx" ON "bar_payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bar_items_tab_idx" ON "bar_tab_items" USING btree ("tab_id");--> statement-breakpoint
CREATE INDEX "bar_items_queue_idx" ON "bar_tab_items" USING btree ("status","station");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_tab_per_table" ON "bar_tabs" USING btree ("table_id") WHERE "bar_tabs"."status" = 'open' and "bar_tabs"."table_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_tab_per_member" ON "bar_tabs" USING btree ("member_id") WHERE "bar_tabs"."status" = 'open' and "bar_tabs"."member_id" is not null;--> statement-breakpoint
CREATE INDEX "bar_tabs_status_idx" ON "bar_tabs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bar_tabs_closed_idx" ON "bar_tabs" USING btree ("closed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_shift_per_user" ON "shifts" USING btree ("user_id") WHERE "shifts"."ended_at" is null;