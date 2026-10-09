import { ThumbnailCache } from '@/render';

/** The app's one thumbnail cache, 64 MB of bitmaps shared by every screen. */
export const thumbnailCache = new ThumbnailCache();
