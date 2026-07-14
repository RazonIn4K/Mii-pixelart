import type { GridDocument } from "@/lib/engine/grid";

export type UserRole = "user" | "moderator" | "admin";
export type UserStatus =
  | "active"
  | "suspended"
  | "deletion_pending"
  | "deleted";
export type CreationVisibility = "private" | "unlisted" | "public";
export type CreationStatus = "uploading" | "draft" | "published" | "hidden" | "deleted";
export type SaveState = "local" | "saving" | "saved" | "offline" | "conflict" | "error";

export interface CommunityUser {
  id: string;
  username: string | null;
  displayName: string;
  bio?: string | null;
  role: UserRole;
  status: UserStatus;
  avatarSeed: string;
  createdAt: number;
  requiredTermsVersion?: string;
  termsAccepted?: boolean;
  termsVersion?: string | null;
  followerCount?: number;
  followingCount?: number;
  creationCount?: number;
  isFollowing?: boolean;
}

export interface SessionInfo {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  userAgentLabel?: string | null;
  current: boolean;
}

export interface CommunityCapabilities {
  communityMutationsEnabled: boolean;
}

export interface CreationSummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  status: CreationStatus;
  visibility: CreationVisibility;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  primaryImageUrl?: string | null;
  socialImageUrl?: string | null;
  images?: CreationShowcaseImage[];
  revision: number;
  publishedAt?: number | null;
  updatedAt: number;
  owner: Pick<CommunityUser, "id" | "username" | "displayName" | "avatarSeed">;
  tags: string[];
  likeCount: number;
  commentCount: number;
  isLiked?: boolean;
  commentsEnabled?: boolean;
  downloadEnabled?: boolean;
}

export interface CreationShowcaseImage {
  id: string;
  altText: string;
  sortOrder: number;
  isCover: boolean;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  displayUrl: string;
  thumbnailUrl: string;
  socialImageUrl: string;
}

export interface CreationDetail extends CreationSummary {
  project?: GridDocument;
  commentsLocked?: boolean;
  canEdit?: boolean;
  canModerate?: boolean;
}

export interface CommunityComment {
  id: string;
  body: string;
  status: "active" | "hidden" | "deleted";
  author: Pick<CommunityUser, "id" | "username" | "displayName" | "avatarSeed">;
  createdAt: number;
  updatedAt: number;
  canEdit?: boolean;
  canModerate?: boolean;
}

export interface ReportRecord {
  id: string;
  targetType: "creation" | "comment" | "user";
  targetId: string;
  reason: string;
  details?: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  createdAt: number;
  reporter?: Pick<CommunityUser, "id" | "username" | "displayName" | "avatarSeed">;
  targetLabel?: string;
}

export interface CursorMeta {
  nextCursor?: string | null;
  total?: number;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: CursorMeta;
  requestId: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
  requestId: string;
}

export interface CloudProjectState {
  userId: string;
  creationId: string;
  slug: string;
  revision: number;
  etag: string;
  saveState: SaveState;
  lastSavedAt?: number;
  lastSyncedModifiedAt?: string;
  error?: string;
  publication?: {
    status: CreationStatus;
    visibility: CreationVisibility;
    title: string;
    description: string;
    tags: string[];
    commentsEnabled: boolean;
    downloadEnabled: boolean;
  };
}

export interface PublishInput {
  title: string;
  description: string;
  tags: string[];
  visibility: Exclude<CreationVisibility, "private">;
  commentsEnabled: boolean;
  downloadEnabled: boolean;
}
