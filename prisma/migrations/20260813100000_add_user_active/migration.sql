-- Añade User.active (desactivar acceso sin borrar datos ni negocios asociados).
ALTER TABLE "users" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
