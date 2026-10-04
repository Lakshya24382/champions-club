CREATE TYPE "public"."collection_kind" AS ENUM('court', 'social', 'membership');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('rent', 'utilities', 'supplies', 'maintenance', 'marketing', 'other');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('issued', 'partially_paid', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('paid', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."payslip_status" AS ENUM('unpaid', 'paid');--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "collection_kind" NOT NULL,
	"ref_id" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"received_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_code" varchar(20) NOT NULL,
	"user_id" integer,
	"full_name" varchar(120) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"title" varchar(80) NOT NULL,
	"monthly_salary" numeric(12, 2) NOT NULL,
	"joined_on" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "employees_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" "expense_category" NOT NULL,
	"description" varchar(200) NOT NULL,
	"payee" varchar(120),
	"amount" numeric(12, 2) NOT NULL,
	"incurred_on" date NOT NULL,
	"due_date" date,
	"paid_at" timestamp with time zone,
	"paid_method" "payment_method",
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"description" varchar(200) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" varchar(100),
	"received_by" integer,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" varchar(20) NOT NULL,
	"quote_id" integer,
	"enquiry_id" integer,
	"client_name" varchar(150) NOT NULL,
	"client_company" varchar(150),
	"client_email" varchar(255),
	"client_phone" varchar(20),
	"client_gstin" varchar(15),
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"due_date" date NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"discount_pct" integer DEFAULT 0 NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"tax_rate_pct" numeric(5, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT 0 NOT NULL,
	"notes" varchar(500),
	"void_reason" varchar(255),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_quote_id_unique" UNIQUE("quote_id")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"type" "leave_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" integer NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"reason" varchar(300),
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"decision_note" varchar(300),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"month" date NOT NULL,
	"base_salary" numeric(12, 2) NOT NULL,
	"days_in_month" integer NOT NULL,
	"days_employed" integer NOT NULL,
	"unpaid_leave_days" integer DEFAULT 0 NOT NULL,
	"deduction" numeric(12, 2) DEFAULT 0 NOT NULL,
	"bonus" numeric(12, 2) DEFAULT 0 NOT NULL,
	"net_pay" numeric(12, 2) NOT NULL,
	"status" "payslip_status" DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_method" "payment_method",
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collections_kind_ref_unique" ON "collections" USING btree ("kind","ref_id");--> statement-breakpoint
CREATE INDEX "collections_created_idx" ON "collections" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "expenses_incurred_idx" ON "expenses" USING btree ("incurred_on");--> statement-breakpoint
CREATE INDEX "expenses_paid_idx" ON "expenses" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_payments_invoice_idx" ON "invoice_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_payments_paid_idx" ON "invoice_payments" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_created_idx" ON "invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leave_employee_idx" ON "leave_requests" USING btree ("employee_id","start_date");--> statement-breakpoint
CREATE INDEX "leave_status_idx" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_employee_month_unique" ON "payslips" USING btree ("employee_id","month");