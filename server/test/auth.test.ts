import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import argon2 from "argon2";
import express from "express";
import { ObjectId, type Db } from "mongodb";
import request from "supertest";
import type { SessionDocument, UserDocument } from "../src/db/documents";
import { hashPassword } from "../src/auth/password";
import { SESSION_COOKIE_NAME, hashSessionToken } from "../src/auth/session";
import { createAuthRouter, type AuthRouterDependencies } from "../src/routes/auth";
import { errorHandler } from "../src/middleware/error-handler";
import { notFoundHandler } from "../src/middleware/not-found";

interface MemoryDatabase {
  db: Db;
  users: UserDocument[];
  sessions: SessionDocument[];
}

function createMemoryDatabase(): MemoryDatabase {
  const users: UserDocument[] = [];
  const sessions: SessionDocument[] = [];

  const collections = {
    users: {
      findOne: async (filter: { email?: string; _id?: ObjectId }) =>
        users.find(
          (storedUser) =>
            (filter.email === undefined || storedUser.email === filter.email) &&
            (filter._id === undefined || storedUser._id.equals(filter._id)),
        ) ?? null,
      insertOne: async (user: UserDocument) => {
        if (users.some((storedUser) => storedUser.email === user.email)) {
          throw Object.assign(new Error("Duplicate email index"), {
            code: 11000,
            keyPattern: { email: 1 },
          });
        }
        users.push(user);
        return { acknowledged: true, insertedId: user._id };
      },
      deleteOne: async ({ _id }: { _id: ObjectId }) => {
        const index = users.findIndex((user) => user._id.equals(_id));
        if (index >= 0) users.splice(index, 1);
        return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
      },
    },
    sessions: {
      findOne: async ({ tokenHash }: { tokenHash: string }) =>
        sessions.find((session) => session.tokenHash === tokenHash) ?? null,
      insertOne: async (session: SessionDocument) => {
        sessions.push(session);
        return { acknowledged: true, insertedId: session._id };
      },
      deleteOne: async ({ _id }: { _id: ObjectId }) => {
        const index = sessions.findIndex((session) => session._id.equals(_id));
        if (index >= 0) sessions.splice(index, 1);
        return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
      },
    },
  };

  const db = {
    collection: (name: "users" | "sessions") => collections[name],
  } as unknown as Db;

  return { db, users, sessions };
}

function createTestApp(
  database: MemoryDatabase,
  overrides: Partial<AuthRouterDependencies> = {},
): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/auth",
    createAuthRouter({
      getDatabase: () => database.db,
      createSessionToken: () => "test-session-token",
      now: () => new Date("2026-09-30T00:00:00.000Z"),
      getAllowedOrigins: () => ["http://localhost:5173"],
      ...overrides,
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

async function addUser(
  database: MemoryDatabase,
  email = "member@example.com",
  password = "correct horse battery staple",
): Promise<UserDocument> {
  const createdAt = new Date("2026-09-01T00:00:00.000Z");
  const user: UserDocument = {
    _id: new ObjectId(),
    email,
    passwordHash: await hashPassword(password),
    displayName: "Member Example",
    bio: "",
    info: {},
    createdAt,
    updatedAt: createdAt,
  };
  database.users.push(user);
  return user;
}

test("registration normalizes email, stores an Argon2id hash, and returns only the public user", async () => {
  const database = createMemoryDatabase();
  const app = createTestApp(database);
  const password = "a long and private passphrase";

  const response = await request(app).post("/api/auth/register").set("Origin", "http://localhost:5173").send({
    email: "  Ada.Lovelace@Example.com  ",
    password,
    displayName: "  Ada Lovelace  ",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, "ada.lovelace@example.com");
  assert.equal(response.body.user.displayName, "Ada Lovelace");
  assert.equal("password" in response.body.user, false);
  assert.equal("passwordHash" in response.body.user, false);
  assert.equal(database.users.length, 1);
  assert.equal(database.sessions.length, 1);

  const storedUser = database.users[0]!;
  assert.equal(storedUser.email, "ada.lovelace@example.com");
  assert.notEqual(storedUser.passwordHash, password);
  assert.equal(storedUser.passwordHash.includes(password), false);
  assert.equal(storedUser.displayName, "Ada Lovelace");
  assert.equal(storedUser.bio, "");
  assert.deepEqual(storedUser.info, {});
  assert.equal(await argon2.verify(storedUser.passwordHash, password), true);
  assert.match(storedUser.passwordHash, /^\$argon2id\$/);

  const storedSession = database.sessions[0]!;
  assert.equal(storedSession.userId.toHexString(), storedUser._id.toHexString());
  assert.equal(
    storedSession.tokenHash,
    createHash("sha256").update("test-session-token").digest("hex"),
  );
  assert.equal(storedSession.tokenHash.includes("test-session-token"), false);
  assert.equal(storedSession.expiresAt.toISOString(), "2026-10-07T00:00:00.000Z");

  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(cookie?.includes("senderi_session=test-session-token"));
  assert.ok(cookie?.includes("Path=/api"));
  assert.ok(cookie?.includes("HttpOnly"));
  assert.ok(cookie?.includes("SameSite=Lax"));
  assert.equal(response.headers["cache-control"], "private, no-store");
});

test("registration rejects a duplicate normalized email with a conflict response", async () => {
  const database = createMemoryDatabase();
  let hashCalls = 0;
  const app = createTestApp(database, {
    hashPassword: async () => {
      hashCalls += 1;
      return "$argon2id$test-hash";
    },
  });

  const first = await request(app).post("/api/auth/register").set("Origin", "http://localhost:5173").send({
    email: "Person@Example.com",
    password: "a valid passphrase",
    displayName: "Person One",
  });
  const duplicate = await request(app).post("/api/auth/register").set("Origin", "http://localhost:5173").send({
    email: "  PERSON@example.com ",
    password: "another valid passphrase",
    displayName: "Person Two",
  });

  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, {
    error: {
      code: "email_already_exists",
      message: "An account with this email already exists.",
    },
  });
  assert.equal(database.users.length, 1);
  assert.equal(database.sessions.length, 1);
  assert.equal(hashCalls, 1);
});

test("registration rejects invalid email, display name, and password before hashing or storage", async () => {
  const database = createMemoryDatabase();
  let hashCalls = 0;
  const app = createTestApp(database, {
    hashPassword: async () => {
      hashCalls += 1;
      return "$argon2id$test-hash";
    },
  });
  const invalidInputs = [
    { email: "not-an-email", password: "long enough password", displayName: "Person" },
    { email: "person@example.com", password: "short", displayName: "Person" },
    { email: "person@example.com", password: "long enough password", displayName: "   " },
    { email: "person@example.com", password: "p".repeat(129), displayName: "Person" },
    { email: "person@example.com", password: "long enough password", displayName: "x".repeat(81) },
  ];

  for (const input of invalidInputs) {
    const response = await request(app)
      .post("/api/auth/register")
      .set("Origin", "http://localhost:5173")
      .send(input);
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "validation_error");
  }

  assert.equal(hashCalls, 0);
  assert.equal(database.users.length, 0);
  assert.equal(database.sessions.length, 0);
});

test("registration rejects an origin outside the client allowlist", async () => {
  const database = createMemoryDatabase();
  let hashCalls = 0;
  const app = createTestApp(database, {
    hashPassword: async () => {
      hashCalls += 1;
      return "$argon2id$test-hash";
    },
  });

  const response = await request(app)
    .post("/api/auth/register")
    .set("Origin", "https://unexpected.example")
    .send({ email: "person@example.com", password: "long enough password", displayName: "Person" });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "origin_not_allowed");
  assert.equal(hashCalls, 0);
  assert.equal(database.users.length, 0);
});

test("login verifies a password and the session survives a separate request", async () => {
  const database = createMemoryDatabase();
  const user = await addUser(database);
  const app = createTestApp(database);
  const agent = request.agent(app);

  const login = await agent
    .post("/api/auth/login")
    .set("Origin", "http://localhost:5173")
    .send({ email: " MEMBER@Example.com ", password: "correct horse battery staple" });

  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, user._id.toHexString());
  assert.equal("passwordHash" in login.body.user, false);
  assert.equal(database.sessions.length, 1);
  assert.equal(database.sessions[0]!.tokenHash, hashSessionToken("test-session-token"));

  const currentUser = await agent.get("/api/auth/me");
  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.body.user.email, "member@example.com");
  assert.equal(currentUser.body.user.displayName, "Member Example");
  assert.equal("passwordHash" in currentUser.body.user, false);
});

test("wrong and unknown login credentials return the same response without issuing a session", async () => {
  const database = createMemoryDatabase();
  await addUser(database);
  const app = createTestApp(database);

  const wrongPassword = await request(app)
    .post("/api/auth/login")
    .set("Origin", "http://localhost:5173")
    .send({ email: "member@example.com", password: "incorrect password" });
  const unknownEmail = await request(app)
    .post("/api/auth/login")
    .set("Origin", "http://localhost:5173")
    .send({ email: "unknown@example.com", password: "incorrect password" });

  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
  assert.deepEqual(wrongPassword.body, {
    error: {
      code: "invalid_credentials",
      message: "Email or password is incorrect.",
    },
  });
  assert.equal(database.sessions.length, 0);
  assert.equal(wrongPassword.headers["set-cookie"], undefined);
});

test("expired sessions are denied even before MongoDB TTL cleanup", async () => {
  const database = createMemoryDatabase();
  const user = await addUser(database);
  const expiredToken = "expired-session-token";
  database.sessions.push({
    _id: new ObjectId(),
    userId: user._id,
    tokenHash: hashSessionToken(expiredToken),
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
    expiresAt: new Date("2026-09-28T00:00:00.000Z"),
  });
  const app = createTestApp(database);

  const response = await request(app)
    .get("/api/auth/me")
    .set("Cookie", `${SESSION_COOKIE_NAME}=${expiredToken}`);

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "unauthorized");
});

test("logout deletes the session and clears its cookie", async () => {
  const database = createMemoryDatabase();
  await addUser(database);
  const agent = request.agent(createTestApp(database));
  const login = await agent
    .post("/api/auth/login")
    .set("Origin", "http://localhost:5173")
    .send({ email: "member@example.com", password: "correct horse battery staple" });
  assert.equal(login.status, 200);
  assert.equal(database.sessions.length, 1);

  const logout = await agent.post("/api/auth/logout").set("Origin", "http://localhost:5173");
  assert.equal(logout.status, 204);
  assert.equal(database.sessions.length, 0);
  const clearedCookie = logout.headers["set-cookie"];
  const cookie = Array.isArray(clearedCookie) ? clearedCookie[0] : clearedCookie;
  assert.ok(cookie?.includes(`${SESSION_COOKIE_NAME}=`));
  assert.ok(cookie?.includes("Max-Age=0"));

  const afterLogout = await agent.get("/api/auth/me");
  assert.equal(afterLogout.status, 401);
});
