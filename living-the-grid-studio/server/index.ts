import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import {
  getOpenRouterModels,
  getOpenRouterStatus,
  sendOpenRouterChat,
} from "./openrouter";
import {
  createCheckoutSession,
  listPublicProducts,
  verifyCheckoutSession,
} from "./stripe";
import { formatPrice } from "../shared/products";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

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

  app.get("/api/stripe/products", (_req, res) => {
    const products = listPublicProducts().map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      priceLabel: formatPrice(product.amount, product.currency),
      perks: product.perks ?? [],
      caveat: product.caveat ?? null,
    }));
    res.status(200).json({ products });
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      const result = await createCheckoutSession(req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      res.status(500).json({
        configured: true,
        error:
          error instanceof Error
            ? error.message
            : "Stripe checkout failed locally.",
      });
    }
  });

  app.get("/api/stripe/session", async (req, res) => {
    try {
      const sessionId = String(req.query.session_id ?? "");
      const result = await verifyCheckoutSession(sessionId);
      res.status(result.status).json(result.body);
    } catch (error) {
      res.status(500).json({
        configured: true,
        error:
          error instanceof Error
            ? error.message
            : "Stripe session verification failed locally.",
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
