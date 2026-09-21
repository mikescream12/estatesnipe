export type {
  MatchSource,
  VisionMatchRequest,
  VisionMatchResult,
  VisionStructuredPayload,
} from "./types";
export {
  getVisionConfig,
  isPremiumVision,
  isVisionEnabled,
  premiumVision,
  visionEnabled,
  visionMaxListings,
  visionMinConfidence,
} from "./config";
export { matchPhotos, matchListingPhotos } from "./matchPhotos";
export { enrichListingPhotos, selectPhotoUrls } from "./enrichPhotos";
export { detectVisionProvider, hasVisionApiKey } from "./provider";
export { getCachedVision, setCachedVision, visionCacheKey } from "./cache";
export { fetchImageAsDataUrl, rehostPhotoUrlsForVision, isDataUrl } from "./rehost";
