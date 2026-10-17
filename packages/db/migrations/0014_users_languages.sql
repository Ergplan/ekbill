ALTER TABLE "users" DROP CONSTRAINT "users_language";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_language" CHECK ("users"."language" in ('hi-Latn', 'en', 'hi', 'mr', 'ta'));