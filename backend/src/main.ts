import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, text } from "express";
import { AppModule, ApiErrors } from "./app.module";
async function bootstrap() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (
    !process.env.ADMIN_PASSWORD ||
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32
  )
    throw new Error(
      "Configure ADMIN_PASSWORD (required) and SESSION_SECRET (32+ characters).",
    );
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: "256kb" }));
  app.use(text({ type: "text/plain", limit: "256kb" }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || "http://localhost:8081")
      .split(",")
      .map((s) => s.trim()),
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
  );
}
void bootstrap();
