import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import {
  getOpenRouterModels,
  getOpenRouterStatus,
  sendOpenRouterChat,
} from "./openrouter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  const paymentsRetired = (_req: express.Request, res: express.Response) => {
    res
      .status(410)
      .set("Cache-Control", "no-store")
      .json({
        error: {
          code: "payments_retired",
          message: "Payments and checkout are no longer offered by Tomodachi.",
        },
      });
  };
  // Install tombstones before JSON parsing so any stale request receives the
  // same terminal response regardless of its old payload shape or size.
  app.use("/api/stripe", paymentsRetired);
  app.all("/api/webhooks/stripe", paymentsRetired);

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/ai/status", (_req, res) => {
    const result = getOpenRouterStatus();
    res.status(result.status).json(result.body);
  });

  app.get("/api/ai/models", async (_req, res) => {
    const result = await getOpenRouterModels();
    res.status(result.status).json(result.body);
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const result = await sendOpenRouterChat(req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      res.status(500).json({
        configured: true,
        reply:
          error instanceof Error ? error.message : "AI request failed locally.",
      });
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
