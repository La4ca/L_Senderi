import { app } from "./app";

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Senderi API listening on port ${port}.`);
});
