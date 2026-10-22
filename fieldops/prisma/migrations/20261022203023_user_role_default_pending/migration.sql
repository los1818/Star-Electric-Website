-- New users (e.g. first SSO sign-in) get no access until an administrator assigns a role.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PENDING';
