import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { ObjectId, type Db } from "mongodb";
import request from "supertest";
import { hashSessionToken, SESSION_COOKIE_NAME } from "../src/auth/session";
import { errorHandler } from "../src/middleware/error-handler";
import { notFoundHandler } from "../src/middleware/not-found";
import { type FriendshipDocument, type SessionDocument, type UserDocument } from "../src/db/documents";
import { createUsersRouter } from "../src/routes/users";

function createDatabase(
  users: UserDocument[],
  sessions: SessionDocument[],
  friendships: FriendshipDocument[],
): Db {
  return {
    collection: (name: string) => {
      if (name === "users") {
        return {
          findOne: async ({ _id }: { _id: ObjectId }) =>
            users.find((user) => user._id.equals(_id)) ?? null,
          findOneAndUpdate: async (
            { _id }: { _id: ObjectId },
            { $set }: { $set: Partial<UserDocument> },
          ) => {
            const user = users.find((candidate) => candidate._id.equals(_id));
            if (!user) return null;
            Object.assign(user, $set);
            return user;
          },
        };
      }

      if (name === "friendships") {
        return {
          findOne: async ({ userIdLow, userIdHigh }: Pick<FriendshipDocument, "userIdLow" | "userIdHigh">) =>
            friendships.find((friendship) =>
              friendship.userIdLow.equals(userIdLow) && friendship.userIdHigh.equals(userIdHigh),
            ) ?? null,
        };
      }

      return {
        findOne: async ({ tokenHash }: { tokenHash: string }) =>
          sessions.find((session) => session.tokenHash === tokenHash) ?? null,
      };
    },
  } as unknown as Db;
}

function makeUser(email: string, displayName: string): UserDocument {
  const now = new Date("2026-10-01T00:00:00.000Z");
  return {
    _id: new ObjectId(),
    email,
    passwordHash: "$argon2id$not-used-in-this-test",
    displayName,
    bio: "",
    info: {},
    createdAt: now,
    updatedAt: now,
  };
}

function createTestApp(
  users: UserDocument[],
  sessions: SessionDocument[],
  options: { friendships?: FriendshipDocument[]; cloudinaryCloudName?: string } = {},
) {
  const database = createDatabase(users, sessions, options.friendships ?? []);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/users",
    createUsersRouter({
      getDatabase: () => database,
      getAllowedOrigins: () => ["http://localhost:5173"],
      getCloudinaryCloudName: () => options.cloudinaryCloudName,
      now: () => new Date("2026-10-01T01:00:00.000Z"),
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function sessionFor(user: UserDocument, token = "profile-session-token"): SessionDocument {
  return {
    _id: new ObjectId(),
    userId: user._id,
    tokenHash: hashSessionToken(token),
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    expiresAt: new Date("2026-10-08T00:00:00.000Z"),
  };
}

function friendshipFor(first: UserDocument, second: UserDocument): FriendshipDocument {
  const [userIdLow, userIdHigh] = [first._id, second._id].sort((left, right) =>
    left.toHexString().localeCompare(right.toHexString()),
  );
  return {
    _id: new ObjectId(),
    userIdLow,
    userIdHigh,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
  };
}

test("signed-in users can read a profile without private email data", async () => {
  const owner = makeUser("owner@example.com", "Owner Example");
  const viewer = makeUser("viewer@example.com", "Viewer Example");
  const app = createTestApp([owner, viewer], [sessionFor(viewer)]);

  const response = await request(app)
    .get(`/api/users/${owner._id.toHexString()}`)
    .set("Cookie", `${SESSION_COOKIE_NAME}=profile-session-token`);

  assert.equal(response.status, 200);
  assert.equal(response.body.user.displayName, "Owner Example");
  assert.equal(response.body.user.id, owner._id.toHexString());
  assert.equal(response.body.friendshipStatus, "none");
  assert.equal("email" in response.body.user, false);
  assert.equal(response.headers["cache-control"], "private, no-store");
});

test("profile reads report accepted friendship and build profile image URLs from Cloudinary public IDs", async () => {
  const owner = makeUser("owner@example.com", "Owner Example");
  owner.avatarId = "profiles/owner/avatar";
  owner.coverId = "profiles/owner/cover";
  const viewer = makeUser("viewer@example.com", "Viewer Example");
  const app = createTestApp([owner, viewer], [sessionFor(viewer)], {
    friendships: [friendshipFor(owner, viewer)],
    cloudinaryCloudName: "senderi-demo",
  });

  const response = await request(app)
    .get(`/api/users/${owner._id.toHexString()}`)
    .set("Cookie", `${SESSION_COOKIE_NAME}=profile-session-token`);

  assert.equal(response.status, 200);
  assert.equal(response.body.friendshipStatus, "friends");
  assert.equal(
    response.body.user.avatarUrl,
    "https://res.cloudinary.com/senderi-demo/image/upload/c_fill,g_face,h_256,w_256/f_auto/q_auto/profiles/owner/avatar",
  );
  assert.equal(
    response.body.user.coverUrl,
    "https://res.cloudinary.com/senderi-demo/image/upload/c_fill,g_auto,h_480,w_1600/f_auto/q_auto/profiles/owner/cover",
  );
});

test("profile reads report self for the signed-in user's own profile", async () => {
  const owner = makeUser("owner@example.com", "Owner Example");
  const app = createTestApp([owner], [sessionFor(owner)]);

  const response = await request(app)
    .get(`/api/users/${owner._id.toHexString()}`)
    .set("Cookie", `${SESSION_COOKIE_NAME}=profile-session-token`);

  assert.equal(response.status, 200);
  assert.equal(response.body.friendshipStatus, "self");
});

test("profile edits only change the account identified by the authenticated session", async () => {
  const owner = makeUser("owner@example.com", "Owner Example");
  const other = makeUser("other@example.com", "Other Example");
  const app = createTestApp(
    [owner, other],
    [sessionFor(owner, "owner-profile-token"), sessionFor(other, "other-profile-token")],
  );

  const response = await request(app)
    .patch("/api/users/me")
    .set("Origin", "http://localhost:5173")
    .set("Cookie", `${SESSION_COOKIE_NAME}=owner-profile-token`)
    .send({
      displayName: "Updated Owner",
      bio: "A short profile bio.",
      info: { location: "Cebu", website: "https://senderi.example/profile" },
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.displayName, "Updated Owner");
  assert.equal(response.body.user.bio, "A short profile bio.");
  assert.deepEqual(response.body.user.info, {
    location: "Cebu",
    website: "https://senderi.example/profile",
  });
  assert.equal(response.body.user.email, "owner@example.com");
  assert.equal(owner.displayName, "Updated Owner");
  assert.equal(owner.bio, "A short profile bio.");
  assert.equal(other.displayName, "Other Example");
  assert.equal(other.bio, "");
  assert.deepEqual(other.info, {});
});

test("profile edits reject invalid fields and unsupported user-targeted edits", async () => {
  const owner = makeUser("owner@example.com", "Owner Example");
  const other = makeUser("other@example.com", "Other Example");
  const app = createTestApp([owner, other], [sessionFor(owner)]);
  const cookie = `${SESSION_COOKIE_NAME}=profile-session-token`;

  const invalidWebsite = await request(app)
    .patch("/api/users/me")
    .set("Origin", "http://localhost:5173")
    .set("Cookie", cookie)
    .send({ info: { website: "http://insecure.example" } });
  assert.equal(invalidWebsite.status, 400);
  assert.equal(invalidWebsite.body.error.code, "validation_error");

  const unknownField = await request(app)
    .patch("/api/users/me")
    .set("Origin", "http://localhost:5173")
    .set("Cookie", cookie)
    .send({ email: "not-allowed@example.com" });
  assert.equal(unknownField.status, 400);
  assert.equal(unknownField.body.error.code, "validation_error");

  const otherTarget = await request(app)
    .patch(`/api/users/${other._id.toHexString()}`)
    .set("Origin", "http://localhost:5173")
    .set("Cookie", cookie)
    .send({ displayName: "Not allowed" });
  assert.equal(otherTarget.status, 404);
  assert.equal(other.displayName, "Other Example");
});
