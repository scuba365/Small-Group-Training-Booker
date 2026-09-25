CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"phone" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Dublin' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"booking_open_hours" integer DEFAULT 168 NOT NULL,
	"booking_close_hours" integer DEFAULT 12 NOT NULL,
	"no_show_fee_cents" integer DEFAULT 500 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "organisations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organisation_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"membership_plan" text,
	"membership_start_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text,
	"name" text NOT NULL,
	"description" text,
	"exercise_type" text DEFAULT 'STRENGTH' NOT NULL,
	"primary_muscle_groups" text,
	"equipment" text,
	"video_url" text,
	"instructions" text,
	"source" text,
	"source_id" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "days" (
	"id" text PRIMARY KEY NOT NULL,
	"week_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"label" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" text PRIMARY KEY NOT NULL,
	"programme_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "programmes" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"id" text PRIMARY KEY NOT NULL,
	"phase_id" text NOT NULL,
	"week_number" integer NOT NULL,
	"label" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workout_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"workout_id" text NOT NULL,
	"name" text,
	"block_type" text DEFAULT 'STRAIGHT_SET' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"rounds" integer,
	"time_cap_seconds" integer,
	"rest_between_rounds_seconds" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workout_exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"block_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"sets" integer,
	"reps_min" integer,
	"reps_max" integer,
	"load_kg" double precision,
	"load_percent_1rm" double precision,
	"rpe" double precision,
	"rir" integer,
	"tempo" text,
	"rest_seconds" integer,
	"duration_seconds" integer,
	"distance_meters" double precision,
	"pace_per_km" text,
	"calories" integer,
	"target_time" text,
	"target_pace" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"day_id" text,
	"organisation_id" text,
	"is_template" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exercise_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"workout_instance_id" text NOT NULL,
	"workout_exercise_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "programme_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"programme_id" text NOT NULL,
	"member_id" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"assigned_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"exercise_instance_id" text NOT NULL,
	"set_number" integer NOT NULL,
	"reps" integer,
	"load_kg" double precision,
	"rpe" double precision,
	"rir" integer,
	"distance_meters" double precision,
	"time_seconds" integer,
	"pace_per_km" text,
	"calories" integer,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workout_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"assignment_id" text NOT NULL,
	"workout_id" text NOT NULL,
	"member_id" text NOT NULL,
	"status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_seconds" integer,
	"session_rpe" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"session_id" text NOT NULL,
	"member_id" text NOT NULL,
	"status" text DEFAULT 'BOOKED' NOT NULL,
	"booked_at" timestamp DEFAULT now(),
	"cancelled_at" timestamp,
	"fee_amount_cents" integer,
	"fee_reason" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_types" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1',
	"default_duration_minutes" integer DEFAULT 60 NOT NULL,
	"default_capacity" integer DEFAULT 12 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"session_type_id" text,
	"name" text NOT NULL,
	"coach_id" text,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"capacity" integer NOT NULL,
	"location" text,
	"workout_id" text,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"notes" text,
	"recurring_group_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"member_id" text NOT NULL,
	"coach_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_block_id_workout_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."workout_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD CONSTRAINT "exercise_instances_workout_instance_id_workout_instances_id_fk" FOREIGN KEY ("workout_instance_id") REFERENCES "public"."workout_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD CONSTRAINT "exercise_instances_workout_exercise_id_workout_exercises_id_fk" FOREIGN KEY ("workout_exercise_id") REFERENCES "public"."workout_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD CONSTRAINT "exercise_instances_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_assignments" ADD CONSTRAINT "programme_assignments_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_assignments" ADD CONSTRAINT "programme_assignments_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_assignments" ADD CONSTRAINT "programme_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_exercise_instance_id_exercise_instances_id_fk" FOREIGN KEY ("exercise_instance_id") REFERENCES "public"."exercise_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_instances" ADD CONSTRAINT "workout_instances_assignment_id_programme_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."programme_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_instances" ADD CONSTRAINT "workout_instances_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_instances" ADD CONSTRAINT "workout_instances_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_user_unique" ON "organisation_members" USING btree ("organisation_id","user_id");--> statement-breakpoint
CREATE INDEX "exercises_org_archived_idx" ON "exercises" USING btree ("organisation_id","is_archived");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_source_source_id_unique" ON "exercises" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_session_member_unique" ON "bookings" USING btree ("session_id","member_id");--> statement-breakpoint
CREATE INDEX "bookings_session_idx" ON "bookings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "bookings_member_org_idx" ON "bookings" USING btree ("member_id","organisation_id");--> statement-breakpoint
CREATE INDEX "session_types_org_idx" ON "session_types" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "sessions_org_date_idx" ON "sessions" USING btree ("organisation_id","date");--> statement-breakpoint
CREATE INDEX "sessions_recurring_idx" ON "sessions" USING btree ("recurring_group_id");--> statement-breakpoint
CREATE INDEX "coach_notes_member_org_idx" ON "coach_notes" USING btree ("member_id","organisation_id");