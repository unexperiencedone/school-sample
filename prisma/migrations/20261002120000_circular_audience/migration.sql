-- Circulars sent to one class or to boarders must only show to those families in the portal
ALTER TABLE "Announcement" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'ALL';
