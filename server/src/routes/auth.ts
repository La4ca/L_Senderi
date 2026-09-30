import { createHash, randomBytes } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { Router, type Response } from "express";
import { z } from "zod";
import { collectionNames, type SessionDocument, type UserDocument } from "../db/documents";
import { getDatabase as getConnectedDatabase } from "../db/client";
import { HttpError } from "../errors/http-error";
import { requireClientOrigin } from "../middleware/require-client-origin";
import { validateBody } from "../middleware/validate-body";
import { hashPassword as hashArgon2idPassword } from "../auth/password";

const SESSION_COOKIE_NAME = "senderi_session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const SESSION_MAX_AGE_SECONDS = SESSION_LIFETIME_MS / 1_000;

export const registrationSchema = z
  .object({
    email: z.string().trim().max(254).toLowerCase().pipe(z.email()),
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(1).max(80),
  })
  .strict();

type RegistrationInput = z.infer<typeof registrationSchema>;

export interface AuthRouterDependencies {
  getDatabase: () => Db;
  hashPassword: (password: string) => Promise<string>;
  createSessionToken: () => string;
  now: () => Date;
  getAllowedOrigins: () => readonly string[];
}

const defaultDependencies: AuthRouterDependencies = {
  getDatabase: getConnectedDatabase,
  hashPassword: hashArgon2idPassword,
  createSessionToken: () => randomBytes(32).toString("base64url"),
  now: () => new Date(),
  getAllowedOrigins: () =>
    (process.env.CLIENT_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function toCurrentUser(user: UserDocument) {
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

function setSessionCookie(response: Response, token: string): void {
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureAttribute}`,
  );
}

export function createAuthRouter(
  overrides: Partial<AuthRouterDependencies> = {},
): Router {
  const dependencies = { ...defaultDependencies, ...overrides };
  const router = Router();

  router.post(
    "/register",
    requireClientOrigin(dependencies.getAllowedOrigins),
    validateBody(registrationSchema),
    async (request, response) => {
      const { email, password, displayName } = request.body as RegistrationInput;
      const database = dependencies.getDatabase();
      const users = database.collection<UserDocument>(collectionNames.users);
      const sessions = database.collection<SessionDocument>(collectionNames.sessions);
      const createdAt = dependencies.now();
      const existingUser = await users.findOne({ email }, { projection: { _id: 1 } });
      if (existingUser) {
        throw new HttpError(409, "email_already_exists", "An account with this email already exists.");
      }

      const user: UserDocument = {
        _id: new ObjectId(),
        email,
        passwordHash: await dependencies.hashPassword(password),
        displayName,
        bio: "",
        info: {},
        createdAt,
        updatedAt: createdAt,
      };

      try {
        await users.insertOne(user);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new HttpError(409, "email_already_exists", "An account with this email already exists.");
        }
        throw error;
      }

      const sessionToken = dependencies.createSessionToken();
      const session: SessionDocument = {
        _id: new ObjectId(),
        userId: user._id,
        tokenHash: createHash("sha256").update(sessionToken).digest("hex"),
        createdAt,
        expiresAt: new Date(createdAt.getTime() + SESSION_LIFETIME_MS),
      };

      try {
        await sessions.insertOne(session);
      } catch (error) {
        await users.deleteOne({ _id: user._id }).catch(() => undefined);
        throw error;
      }

      response.setHeader("Cache-Control", "private, no-store");
      setSessionCookie(response, sessionToken);
      response.status(201).json({ user: toCurrentUser(user) });
    },
  );

  return router;
}

export const authRouter = createAuthRouter();
