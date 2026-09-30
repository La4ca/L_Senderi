import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import argon2 from "argon2";
import express from "express";
import { ObjectId, type Db } from "mongodb";
import request from "supertest";
import type { SessionDocument, UserDocument } from "../src/db/documents";
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
      findOne: async ({ email }: { email: string }) =>
        users.find((storedUser) => storedUser.email === email) ?? null,
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
      insertOne: async (session: SessionDocument) => {
        sessions.push(session);
        return { acknowledged: true, insertedId: session._id };
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
