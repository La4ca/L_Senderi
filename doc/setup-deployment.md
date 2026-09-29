# Local setup and deployment plan

This document describes setup for the application when M0–M7 are implemented. This first delivery contains documentation only, so there are no install or start commands to run yet.

## Planned local setup

1. Install the Node.js LTS release and the repository's package manager version once M0 declares it.
2. Create a MongoDB Atlas Free cluster and database user. Keep the connection string in the server environment; do not commit it. Atlas Free has a 0.5 GB data limit, so keep image bytes in Cloudinary. [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
3. Create a Cloudinary account. The server signs uploads and handles protected post-photo delivery; the browser does not receive the API secret.
4. Create a Brevo API key, verified sender, and password-reset email template. Use it only from the server. The free plan currently documents 300 daily sends; Senderi's development cap is lower. [Brevo plans](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans)
5. Copy the future `client/.env.example` and `server/.env.example` to local ignored files. Start the API and web development servers using the commands M0 adds. Vite proxies `/api` to the local API.

## Environment-variable contract

The M0 example files must list these names with placeholders, never live values. Add a variable only when a feature needs it and update this table.

| Variable | Service | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Server | Development or production behavior. |
| `PORT` | Server | Render-provided listening port; local default documented by M0. |
| `MONGODB_URI` | Server | Atlas connection string. |
| `CLIENT_ORIGINS` | Server | Comma-separated exact Vercel or local client origins allowed for mutation and socket checks. Add a preview URL only while testing that preview. |
| `SESSION_SECRET` | Server | Random secret for session-token hashing or signing support. |
| `CLOUDINARY_CLOUD_NAME` | Server | Cloudinary environment name. |
| `CLOUDINARY_API_KEY` | Server | Signed upload credential. |
| `CLOUDINARY_API_SECRET` | Server | Signed upload and media credential. |
| `BREVO_API_KEY` | Server | Transactional email credential. |
| `BREVO_SENDER_EMAIL` | Server | Verified sender address. |
| `BREVO_RESET_TEMPLATE_ID` | Server | Reset-email template. |
| `PUBLIC_APP_URL` | Server | Base URL for reset links. |
| `VITE_SOCKET_URL` | Client | Public Render Socket.IO endpoint; not a secret. |

Do not put secrets in `VITE_*` variables: Vite embeds them in browser assets. The Vercel rewrite and Vite local proxy should keep REST calls at `/api/*`; the client uses `VITE_SOCKET_URL` only for the direct Socket.IO connection.

## Free-tier deployment

- Deploy the Express HTTP and Socket.IO server as one Render web service. It must listen on `0.0.0.0` and Render's `PORT`. Configure the server variables above in Render.
- Deploy the Vite client to Vercel. Build from `client/` and put the public Render API URL in the versioned `/api/:path*` rewrite configuration. Keep authenticated API and media responses uncached. Add the exact Vercel preview origin to `CLIENT_ORIGINS` while verifying cookies and the rewrite on that preview. [Vercel external rewrites](https://vercel.com/docs/routing/rewrites)
- Connect the server to Atlas and Cloudinary; avoid writing images or state to Render's local disk. Render Free can spin down after 15 minutes without inbound traffic and loses local files on restart. A new HTTP request or WebSocket connection wakes it; the client must show a reconnecting state and reload chat history. [Render free-tier behavior](https://render.com/docs/free), [Render WebSockets](https://render.com/docs/websocket)
- Use separate development credentials where practical. Check Atlas storage, Cloudinary usage, Brevo sends, and Render logs during M7. A free-tier deployment is for development and acceptance testing, not a guarantee of uninterrupted service.

## Deployment acceptance

On the deployed URLs, register two accounts, reset one password, upload profile and post images, verify all post audiences through direct media requests, accept and remove a friendship, interact with a Public post, and exchange chat messages. Repeat chat after Render has restarted or slept to verify ticket renewal and history recovery.
