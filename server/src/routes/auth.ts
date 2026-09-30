import { ObjectId, type Db } from "mongodb";
import { Router } from "express";
import { z } from "zod";
import { collectionNames, type UserDocument } from "../db/documents";
import { getDatabase as getConnectedDatabase } from "../db/client";
import { HttpError } from "../errors/http-error";
import { requireClientOrigin } from "../middleware/require-client-origin";
import { validateBody } from "../middleware/validate-body";
import { hashPassword as hashArgon2idPassword, verifyPassword as verifyArgon2idPassword } from "../auth/password";
import {
  clearSessionCookie,
  createSession,
  createSessionToken,
  requireSession,
  setSessionCookie,
  type AuthenticatedSessionContext,
} from "../auth/session";
import { toAuthUserResponse } from "../auth/user-response";

const normalizedEmailSchema = z.string().trim().max(254).toLowerCase().pipe(z.email());

export const registrationSchema = z
  .object({
    email: normalizedEmailSchema,
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(1).max(80),
  })
  .strict();

export const loginSchema = z
  .object({
    email: normalizedEmailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

type RegistrationInput = z.infer<typeof registrationSchema>;
type LoginInput = z.infer<typeof loginSchema>;

export interface AuthRouterDependencies {
  getDatabase: () => Db;
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  createSessionToken: () => string;
  now: () => Date;
  getAllowedOrigins: () => readonly string[];
}

const defaultDependencies: AuthRouterDependencies = {
  getDatabase: getConnectedDatabase,
  hashPassword: hashArgon2idPassword,
  verifyPassword: verifyArgon2idPassword,
  createSessionToken,
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

      let sessionToken: string;
      try {
        const session = await createSession(
          database,
          user._id,
          createdAt,
          dependencies.createSessionToken,
        );
        sessionToken = session.token;
      } catch (error) {
        await users.deleteOne({ _id: user._id }).catch(() => undefined);
        throw error;
      }

      response.setHeader("Cache-Control", "private, no-store");
      setSessionCookie(response, sessionToken);
      response.status(201).json({ user: toAuthUserResponse(user) });
    },
  );

  router.post(
    "/login",
    requireClientOrigin(dependencies.getAllowedOrigins),
    validateBody(loginSchema),
    async (request, response) => {
      const { email, password } = request.body as LoginInput;
      const database = dependencies.getDatabase();
      const user = await database.collection<UserDocument>(collectionNames.users).findOne({ email });

      if (!user || !(await dependencies.verifyPassword(password, user.passwordHash))) {
        throw new HttpError(401, "invalid_credentials", "Email or password is incorrect.");
      }

      const session = await createSession(
        database,
        user._id,
        dependencies.now(),
        dependencies.createSessionToken,
      );
      response.setHeader("Cache-Control", "private, no-store");
      setSessionCookie(response, session.token);
      response.status(200).json({ user: toAuthUserResponse(user) });
    },
  );

  const requireAuthenticatedSession = requireSession({
    getDatabase: dependencies.getDatabase,
    now: dependencies.now,
  });

  router.get("/me", requireAuthenticatedSession, (_request, response) => {
    const context = response.locals.authenticatedSession as AuthenticatedSessionContext;
    response.json({ user: toAuthUserResponse(context.user) });
  });

  router.post(
    "/logout",
    requireClientOrigin(dependencies.getAllowedOrigins),
    requireAuthenticatedSession,
    async (_request, response) => {
      const context = response.locals.authenticatedSession as AuthenticatedSessionContext;
      await dependencies
        .getDatabase()
        .collection("sessions")
        .deleteOne({ _id: context.sessionId });
      clearSessionCookie(response);
      response.setHeader("Cache-Control", "private, no-store");
      response.status(204).end();
    },
  );

  return router;
}

export const authRouter = createAuthRouter();
