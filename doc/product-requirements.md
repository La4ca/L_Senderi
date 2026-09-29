# Product requirements

## Goal and first-release boundary

Senderi lets people create accounts, present a profile, connect with friends, post to a timeline, interact with posts, and exchange realtime text messages with friends. All features below are required for the first usable release. Native mobile apps, video, group chat, notifications, extra reaction types, email verification, and third-party sign-in are outside this release.

| Area | Required behavior | Acceptance check |
| --- | --- | --- |
| Accounts | A visitor can sign up with a unique email, display name, and password; sign in and out; and request a password reset by email. | A user can regain access with a valid reset link. An invalid or expired link fails without changing the password. |
| Profile | A user can view profiles and edit their own display name, profile information, bio, avatar, and cover photo. | Saved text and photos persist after refresh and on another device. Only the owner can edit. |
| Timeline | A user can create a text post, a photo post, or a post with both, and choose Public, Friends, or Only me. The author can change a post's audience later. | The feed, direct post view, and photo access all reflect the current audience. |
| Friends | A user can find another user, send a request, accept or decline a received request, view friends, and remove a friend. | Friends-only posts and chat become available only after acceptance and stop being available after removal. |
| Reactions | A signed-in user can Like or unlike any post they can view. | At most one Like per user per post; counts update correctly. |
| Comments | A signed-in user can read and add text comments on any post they can view. | A hidden post's comments cannot be fetched or created by an unauthorized user. |
| Shares | A user can share a Public post to their own timeline. | The share points to the original; if the original stops being Public, the shared item no longer exposes it. |
| Chat | Accepted friends can exchange one-to-one text messages in realtime and load history. | Messages persist; reconnecting clients reload missed messages; removed friends cannot send new messages. |
| Abuse controls | Login attempts and password-reset requests are limited by the application before Brevo is called. | Repeated attempts receive a controlled response and do not generate unlimited email. |

## Audience and interaction rules

- All timeline content requires sign-in. **Public** means every signed-in Senderi user, including non-friends. **Friends** means the author and users with an accepted friendship at request time. **Only me** means the author alone.
- Post audience controls apply equally to text, photo bytes, comments, Like counts, and share references. A client-hidden control is never treated as an authorization check.
- A share has its own Public/Friends/Only me audience, but its source must be Public at creation and at every later read. If the source changes audience, the share cannot reveal it.
- The author may change post audience after publication. Existing links and shares must obey the new audience immediately.
- Friends are mutual only after a request is accepted. Pending, declined, and removed connections do not grant friends-only access or chat access.
- The first release offers one reaction, **Like**, with repeat action removing it. Chat supports text only: no images, files, groups, calls, or end-to-end encryption claim.

## Product acceptance journey

Using two regular accounts and one non-friend account, verify signup, login, profile changes, friend request and acceptance, text and photo posts, all three audiences, Like/comment/share, and live chat. Then remove the friendship and confirm friends-only content and chat are denied. Reset a password through Brevo and confirm the old password and reused reset link no longer work.
