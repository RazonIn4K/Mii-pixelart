-- Keep the stable tag ID, legacy slug, and creation-tag relationships while
-- aligning the displayed taxonomy with Tomodachi Life: Living the Dream's
-- current Face Paint terminology. Preserving the slug avoids breaking shared
-- /api/tags/face-masks links. This migration is forward-only because staging
-- has already applied 0001_community.sql.
UPDATE tags
SET
  name = 'Face Paint',
  description = 'Manual pixel references for Living the Dream Face Paint designs.',
  updated_at = 0
WHERE id = 'tag-face-masks';
