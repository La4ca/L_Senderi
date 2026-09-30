import type { UserDocument } from "../db/documents";

export interface AuthUserResponse {
  id: string;
  email: string;
  displayName: string;
  bio: string;
  info: {
    location?: string;
    website?: string;
  };
  avatarId?: string;
  coverId?: string;
  createdAt: string;
}

export function toAuthUserResponse(user: UserDocument): AuthUserResponse {
  return {
    id: user._id.toHexString(),
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    info: user.info,
    ...(user.avatarId ? { avatarId: user.avatarId } : {}),
    ...(user.coverId ? { coverId: user.coverId } : {}),
    createdAt: user.createdAt.toISOString(),
  };
}
