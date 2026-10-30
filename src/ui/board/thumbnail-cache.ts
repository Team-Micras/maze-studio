import { ThumbnailCache } from '@/render';

/** The app's one thumbnail cache, 64 MB of large bitmaps and 40 MB of previews shared by every screen. */
export const thumbnailCache = new ThumbnailCache();
