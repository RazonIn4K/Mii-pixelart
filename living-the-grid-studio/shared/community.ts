import { z } from "zod";

/** Shared limits used by the browser, Worker, tests, and API documentation. */
export const COMMUNITY_LIMITS = {
  activeSessionsPerUser: 10,
  bioCharacters: 500,
  cloudBytesPerUser: 50 * 1024 * 1024,
  commentCharacters: 1_000,
  creationsPerUser: 100,
  creationDescriptionCharacters: 2_000,
  creationImageAltTextCharacters: 200,
  creationImageDimensionMaximum: 8_192,
  creationImageInputBytes: 8 * 1024 * 1024,
  creationImageMaximumPixels: 25_000_000,
  creationImageOutputBytes: 8 * 1024 * 1024,
  creationImagesPerCreation: 4,
  creationImageUploadsPerDay: 10,
  creationTitleCharacters: 80,
  displayNameCharacters: 50,
  gridDimensionMaximum: 256,
  gridDimensionMinimum: 8,
  gridDocumentBytes: 2 * 1024 * 1024,
  pageSizeDefault: 24,
  pageSizeMaximum: 50,
  reportDetailsCharacters: 2_000,
  tagsPerCreation: 5,
  usernameMaximum: 24,
  usernameMinimum: 3,
} as const;

export const RESERVED_USERNAMES = [
  "about",
  "account",
  "admin",
  "affiliate-disclosure",
  "api",
  "auth",
  "community",
  "cookies",
  "copyright",
  "creation",
  "discover",
  "faq",
  "guides",
  "help",
  "legal",
  "login",
  "logout",
  "me",
  "moderation",
  "moderator",
  "privacy",
  "profile",
  "projects",
  "root",
  "search",
  "security",
  "settings",
  "studio",
  "support",
  "terms",
  "tomodachi",
  "unlock",
  "user",
  "users",
] as const;

const RESERVED_USERNAME_SET = new Set<string>(RESERVED_USERNAMES);
const PALETTE_ID_PATTERN = /^(?:R(?:[1-9]|1[01])C[1-7]|S[1-7])$/;
const USERNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9]|[-_](?=[a-z0-9])){1,22}[a-z0-9]$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const PaletteColorIdSchema = z
  .string()
  .regex(PALETTE_ID_PATTERN, "Unknown palette color ID");

export function normalizeUsername(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export const UsernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(COMMUNITY_LIMITS.usernameMinimum)
      .max(COMMUNITY_LIMITS.usernameMaximum)
      .regex(
        USERNAME_PATTERN,
        "Use lowercase letters, numbers, and single hyphens or underscores",
      ),
  )
  .refine((username) => !RESERVED_USERNAME_SET.has(username), {
    message: "That username is reserved",
  });

function normalizedPlainText(maximum: number, minimum = 0) {
  return z
    .string()
    .transform((value) => value.normalize("NFC").trim())
    .pipe(z.string().min(minimum).max(maximum))
    .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value), {
      message: "Text contains unsupported control characters",
    });
}

export const DisplayNameSchema = normalizedPlainText(
  COMMUNITY_LIMITS.displayNameCharacters,
  1,
);
export const BioSchema = normalizedPlainText(COMMUNITY_LIMITS.bioCharacters);
export const CreationTitleSchema = normalizedPlainText(
  COMMUNITY_LIMITS.creationTitleCharacters,
  1,
);
export const CreationDescriptionSchema = normalizedPlainText(
  COMMUNITY_LIMITS.creationDescriptionCharacters,
);
export const CreationImageAltTextSchema = normalizedPlainText(
  COMMUNITY_LIMITS.creationImageAltTextCharacters,
  1,
);
export const CommentBodySchema = normalizedPlainText(
  COMMUNITY_LIMITS.commentCharacters,
  1,
);
export const ReportDetailsSchema = normalizedPlainText(
  COMMUNITY_LIMITS.reportDetailsCharacters,
);

export const UserRoleSchema = z.enum(["user", "moderator", "admin"]);
export const UserStatusSchema = z.enum([
  "active",
  "suspended",
  "deletion_pending",
  "deleted",
]);
export const CreationStatusSchema = z.enum([
  "draft",
  "published",
  "hidden",
  "deleted",
]);
export const CreationVisibilitySchema = z.enum([
  "private",
  "unlisted",
  "public",
]);
export const PublishVisibilitySchema = z.enum(["unlisted", "public"]);
export const RevisionStatusSchema = z.enum([
  "uploading",
  "ready",
  "failed",
  "obsolete",
]);
export const CreationObjectKindSchema = z.enum([
  "project_json",
  "preview",
  "thumb",
  "social",
]);
export const CreationImageContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
export const CommentStatusSchema = z.enum(["active", "hidden", "deleted"]);
export const ReportReasonSchema = z.enum([
  "spam",
  "harassment",
  "sexual_content",
  "violence",
  "personal_information",
  "copyright",
  "other",
]);
export const ReportStatusSchema = z.enum([
  "open",
  "reviewing",
  "resolved",
  "dismissed",
]);
export const ReportTargetTypeSchema = z.enum([
  "creation",
  "comment",
  "user",
]);
export const ModerationActionSchema = z.enum([
  "hide_creation",
  "restore_creation",
  "hide_comment",
  "restore_comment",
  "suspend_user",
  "restore_user",
  "lock_comments",
  "unlock_comments",
  "resolve_report",
  "dismiss_report",
]);

export type UserRole = z.infer<typeof UserRoleSchema>;
export type UserStatus = z.infer<typeof UserStatusSchema>;
export type CreationStatus = z.infer<typeof CreationStatusSchema>;
export type CreationVisibility = z.infer<typeof CreationVisibilitySchema>;
export type CommentStatus = z.infer<typeof CommentStatusSchema>;
export type ReportReason = z.infer<typeof ReportReasonSchema>;
export type ReportStatus = z.infer<typeof ReportStatusSchema>;
export type ModerationAction = z.infer<typeof ModerationActionSchema>;

const IsoTimestampSchema = z.string().datetime({ offset: true });
const SourcePaletteMappingSchema = z
  .object({
    sourceIndex: z.number().int().min(0).max(255),
    sourceHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    sourceRgb: z.tuple([
      z.number().int().min(0).max(255),
      z.number().int().min(0).max(255),
      z.number().int().min(0).max(255),
    ]).optional(),
    sourcePress: z
      .object({
        h: z.number().finite(),
        s: z.number().finite(),
        b: z.number().finite(),
      })
      .strict()
      .optional(),
    colorId: PaletteColorIdSchema,
    exact: z.boolean(),
    deltaE: z.number().finite().nonnegative(),
  })
  .strict();

const GridMetaV1Schema = z
  .object({
    name: normalizedPlainText(120, 1),
    createdAt: IsoTimestampSchema,
    modifiedAt: IsoTimestampSchema,
    sourceImage: z.string().max(255).optional(),
    sourceJson: z.string().max(255).optional(),
    sourceFormat: z.string().max(80).optional(),
    sourceMetadata: z.record(z.string(), z.unknown()).optional(),
    sourcePaletteMappings: z
      .array(SourcePaletteMappingSchema)
      .max(84)
      .optional(),
    importWarnings: z
      .array(normalizedPlainText(500, 1))
      .max(32)
      .optional(),
    notes: normalizedPlainText(5_000).optional(),
  })
  .strict();

function encodedJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * The local editor's current GridDocument v1 shape, with cloud-save limits.
 * Local files may contain source filenames and legacy metadata; those fields
 * are accepted here so existing projects remain importable, then removed by
 * CanonicalGridDocumentSchema before persistence.
 */
export const GridDocumentV1Schema = z
  .object({
    version: z.literal(1),
    meta: GridMetaV1Schema,
    width: z
      .number()
      .int()
      .min(COMMUNITY_LIMITS.gridDimensionMinimum)
      .max(COMMUNITY_LIMITS.gridDimensionMaximum),
    height: z
      .number()
      .int()
      .min(COMMUNITY_LIMITS.gridDimensionMinimum)
      .max(COMMUNITY_LIMITS.gridDimensionMaximum),
    cells: z.array(PaletteColorIdSchema.nullable()).max(256 * 256),
    usedColors: z.array(PaletteColorIdSchema).max(84),
    lockedColors: z.array(PaletteColorIdSchema).max(84),
  })
  .strict()
  .superRefine((document, context) => {
    const expectedCells = document.width * document.height;
    if (document.cells.length !== expectedCells) {
      context.addIssue({
        code: "custom",
        message: `Expected ${expectedCells} cells`,
        path: ["cells"],
      });
    }

    if (new Set(document.usedColors).size !== document.usedColors.length) {
      context.addIssue({
        code: "custom",
        message: "usedColors must be unique",
        path: ["usedColors"],
      });
    }

    if (new Set(document.lockedColors).size !== document.lockedColors.length) {
      context.addIssue({
        code: "custom",
        message: "lockedColors must be unique",
        path: ["lockedColors"],
      });
    }

    const colorsInCells = new Set(
      document.cells.filter((colorId): colorId is string => colorId !== null),
    );
    document.lockedColors.forEach((colorId, index) => {
      if (!colorsInCells.has(colorId)) {
        context.addIssue({
          code: "custom",
          message: "Locked colors must be used by at least one cell",
          path: ["lockedColors", index],
        });
      }
    });

    if (encodedJsonBytes(document) > COMMUNITY_LIMITS.gridDocumentBytes) {
      context.addIssue({
        code: "custom",
        message: "Grid document exceeds the 2 MiB cloud-save limit",
      });
    }
  });

export type GridDocumentV1 = z.infer<typeof GridDocumentV1Schema>;

const ImageImportMetadataSchema = z
  .object({
    imageImport: z
      .object({
        gridWidth: z.number().int().min(8).max(256),
        gridHeight: z.number().int().min(8).max(256),
        maxColors: z.number().int().min(0).max(84),
        useGamePalette: z.boolean(),
        frameMode: z.enum(["cover", "contain", "stretch"]),
        focusX: z.number().min(0).max(100),
        focusY: z.number().min(0).max(100),
        cropX: z.number().min(0).max(100),
        cropY: z.number().min(0).max(100),
        cropWidth: z.number().min(1).max(100),
        cropHeight: z.number().min(1).max(100),
        brightness: z.number().min(0).max(300),
        contrast: z.number().min(0).max(300),
        saturation: z.number().min(0).max(300),
        backgroundMode: z.enum(["keep", "flatten"]),
        backgroundTolerance: z.number().min(0).max(442),
        backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        samplingMode: z.enum(["smooth", "crisp"]),
      })
      .strip(),
  })
  .strip();

const CreativeTemplateMetadataSchema = z
  .object({
    templateId: z.string().min(1).max(80),
    templateCategory: z.string().min(1).max(80),
    templateName: z.string().min(1).max(120),
  })
  .strip();

const AiMetadataSchema = z
  .object({ generatedBy: z.literal("OpenRouter") })
  .strip();

const LtgMetadataSchema = z
  .object({
    source: z.string().max(120).optional(),
    version: z.union([z.string().max(40), z.number().finite()]).optional(),
    name: z.string().max(120).optional(),
    brush: z
      .object({
        mode: z.string().max(40).optional(),
        px: z.number().finite().nonnegative().max(4_096).optional(),
      })
      .strip()
      .optional(),
    canvas: z
      .object({
        preset: z.string().max(80).optional(),
        w: z.number().finite().positive().max(16_384).optional(),
        h: z.number().finite().positive().max(16_384).optional(),
      })
      .strip()
      .optional(),
  })
  .strip();

export function sanitizeSourceMetadata(
  sourceFormat: string | undefined,
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!sourceFormat || !value) return undefined;
  const schema =
    sourceFormat === "image"
      ? ImageImportMetadataSchema
      : sourceFormat === "creative-template"
        ? CreativeTemplateMetadataSchema
        : sourceFormat === "ai-openrouter-sketch"
          ? AiMetadataSchema
          : sourceFormat === "living-the-grid:indexed-palette"
            ? LtgMetadataSchema
            : undefined;
  if (!schema) return undefined;
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

function canonicalizeParsedGridDocument(
  document: GridDocumentV1,
): GridDocumentV1 {
  const usedColors = Array.from(
    new Set(
      document.cells.filter((colorId): colorId is string => colorId !== null),
    ),
  );
  const sourceMetadata = sanitizeSourceMetadata(
    document.meta.sourceFormat,
    document.meta.sourceMetadata,
  );

  return {
    version: 1,
    meta: {
      name: document.meta.name,
      createdAt: document.meta.createdAt,
      modifiedAt: document.meta.modifiedAt,
      ...(document.meta.sourceFormat
        ? { sourceFormat: document.meta.sourceFormat }
        : {}),
      ...(sourceMetadata ? { sourceMetadata } : {}),
      ...(document.meta.sourcePaletteMappings
        ? { sourcePaletteMappings: document.meta.sourcePaletteMappings }
        : {}),
      ...(document.meta.importWarnings
        ? { importWarnings: document.meta.importWarnings }
        : {}),
      ...(document.meta.notes ? { notes: document.meta.notes } : {}),
    },
    width: document.width,
    height: document.height,
    cells: document.cells,
    usedColors,
    lockedColors: document.lockedColors,
  };
}

/** Parses legacy-compatible v1 input and returns the only persistable shape. */
export const CanonicalGridDocumentSchema = GridDocumentV1Schema.transform(
  canonicalizeParsedGridDocument,
);
export type CanonicalGridDocument = z.output<
  typeof CanonicalGridDocumentSchema
>;

export function canonicalizeGridDocument(input: unknown): CanonicalGridDocument {
  return CanonicalGridDocumentSchema.parse(input);
}

export const TagSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const GoogleAuthStartSchema = z
  .object({
    intent: z.enum(["login", "reauth"]).default("login"),
    returnTo: z
      .string()
      .max(512)
      .regex(/^\/(?!\/)/, "returnTo must be a site-relative path"),
  })
  .strict();

export const SetupProfileSchema = z
  .object({
    username: UsernameSchema,
    displayName: DisplayNameSchema,
    bio: BioSchema.optional(),
    termsVersion: z.string().min(1).max(40),
    acceptsTerms: z.literal(true),
    confirmsAge13OrOlder: z.literal(true),
  })
  .strict();

export const ProfileUpdateSchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    bio: BioSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one profile field",
  });

export const CreateCreationSchema = z
  .object({
    project: CanonicalGridDocumentSchema,
    title: CreationTitleSchema.optional(),
  })
  .strict();

export const SaveProjectSchema = z
  .object({ project: CanonicalGridDocumentSchema })
  .strict();

export const CreateCreationImageUploadSchema = z
  .object({
    altText: CreationImageAltTextSchema,
    byteSize: z
      .number()
      .int()
      .min(1)
      .max(COMMUNITY_LIMITS.creationImageInputBytes),
    contentType: CreationImageContentTypeSchema,
    replaceImageId: z.string().uuid().optional(),
  })
  .strict();

export const UpdateCreationImagesSchema = z
  .object({
    coverImageId: z.string().uuid(),
    orderedImageIds: z
      .array(z.string().uuid())
      .min(1)
      .max(COMMUNITY_LIMITS.creationImagesPerCreation),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.orderedImageIds).size !== value.orderedImageIds.length) {
      context.addIssue({
        code: "custom",
        message: "Image IDs must be unique",
        path: ["orderedImageIds"],
      });
    }
    if (!value.orderedImageIds.includes(value.coverImageId)) {
      context.addIssue({
        code: "custom",
        message: "The cover image must be included in the ordered images",
        path: ["coverImageId"],
      });
    }
  });

export const UpdateCreationSchema = z
  .object({
    title: CreationTitleSchema.optional(),
    description: CreationDescriptionSchema.optional(),
    commentsEnabled: z.boolean().optional(),
    projectDownloadEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one creation field",
  });

export const PublishCreationSchema = z
  .object({
    title: CreationTitleSchema,
    description: CreationDescriptionSchema,
    visibility: PublishVisibilitySchema,
    commentsEnabled: z.boolean(),
    projectDownloadEnabled: z.boolean(),
    tags: z.array(TagSlugSchema).max(COMMUNITY_LIMITS.tagsPerCreation),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.tags).size !== value.tags.length) {
      context.addIssue({
        code: "custom",
        message: "Tags must be unique",
        path: ["tags"],
      });
    }
  });

export const CommentCreateSchema = z
  .object({ body: CommentBodySchema })
  .strict();
export const CommentUpdateSchema = CommentCreateSchema;

export const ReportCreateSchema = z
  .object({
    targetType: ReportTargetTypeSchema,
    targetId: z.string().uuid(),
    reason: ReportReasonSchema,
    details: ReportDetailsSchema.default(""),
  })
  .strict();

export const ModerationDecisionSchema = z
  .object({
    action: ModerationActionSchema,
    reason: normalizedPlainText(1_000, 1),
  })
  .strict();

export const CursorPayloadSchema = z
  .object({
    id: z.string().min(1).max(128),
    sortValue: z.union([z.string().max(256), z.number().finite()]),
  })
  .strict();
export type CursorPayload = z.infer<typeof CursorPayloadSchema>;

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeBase64Url(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += BASE64URL_ALPHABET[(value >> 18) & 63];
    result += BASE64URL_ALPHABET[(value >> 12) & 63];
    if (second !== undefined) result += BASE64URL_ALPHABET[(value >> 6) & 63];
    if (third !== undefined) result += BASE64URL_ALPHABET[value & 63];
  }
  return result;
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid cursor");
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const chunk = value.slice(index, index + 4);
    const numbers = Array.from(chunk, (character) =>
      BASE64URL_ALPHABET.indexOf(character),
    );
    if (numbers.some((number) => number < 0) || numbers.length === 1) {
      throw new Error("Invalid cursor");
    }
    const packed =
      (numbers[0] << 18) |
      (numbers[1] << 12) |
      ((numbers[2] ?? 0) << 6) |
      (numbers[3] ?? 0);
    bytes.push((packed >> 16) & 255);
    if (numbers.length > 2) bytes.push((packed >> 8) & 255);
    if (numbers.length > 3) bytes.push(packed & 255);
  }
  return new Uint8Array(bytes);
}

export function encodeCursor(payload: CursorPayload): string {
  const parsed = CursorPayloadSchema.parse(payload);
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(parsed)));
}

export function decodeCursor(cursor: string): CursorPayload {
  if (cursor.length > 512) throw new Error("Invalid cursor");
  try {
    const json = new TextDecoder(undefined, { fatal: true }).decode(
      decodeBase64Url(cursor),
    );
    return CursorPayloadSchema.parse(JSON.parse(json));
  } catch {
    throw new Error("Invalid cursor");
  }
}

export const PaginationQuerySchema = z
  .object({
    cursor: z.string().max(512).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(COMMUNITY_LIMITS.pageSizeMaximum)
      .default(COMMUNITY_LIMITS.pageSizeDefault),
  })
  .strict();

export const SearchQuerySchema = PaginationQuerySchema.extend({
  q: normalizedPlainText(120, 1),
  tag: TagSlugSchema.optional(),
});

export const ApiMetaSchema = z
  .object({
    nextCursor: z.string().nullable().optional(),
  })
  .catchall(z.unknown());

export const ApiSuccessSchema = z
  .object({
    data: z.unknown(),
    meta: ApiMetaSchema.optional(),
    requestId: z.string().min(1).max(128),
  })
  .strict();

export const ApiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "COMMENTS_DISABLED",
  "REVISION_CONFLICT",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1).max(500),
        fields: z.record(z.string(), z.string().max(500)).optional(),
      })
      .strict(),
    requestId: z.string().min(1).max(128),
  })
  .strict();

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
  requestId: string;
}

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
  requestId: string;
}

export function apiSuccess<T>(
  data: T,
  requestId: string,
  meta?: Record<string, unknown>,
): ApiSuccess<T> {
  return { data, requestId, ...(meta ? { meta } : {}) };
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  fields?: Record<string, string>,
): ApiError {
  return {
    error: { code, message, ...(fields ? { fields } : {}) },
    requestId,
  };
}
