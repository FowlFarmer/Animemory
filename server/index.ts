import { config } from "./config.js";
import app from "./app.js";

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Animemory API listening on http://127.0.0.1:${config.port}`);
});
