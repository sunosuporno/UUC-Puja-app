import {
  Injectable,
  UnauthorizedException,
  HttpException,
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
@Injectable()
export class Auth {
  private attempts = new Map<string, { count: number; until: number }>();
  private secret() {
    const value = process.env.SESSION_SECRET;
    if (!value || value.length < 32)
      throw new Error("SESSION_SECRET must contain at least 32 characters");
    return value;
  }
  login(password: unknown, ip: string) {
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.until < now) this.attempts.delete(key);
    const entry = this.attempts.get(ip) || {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    if (entry.count >= 10 || this.attempts.size >= 10000)
      throw new HttpException("Too many login attempts. Try later.", 429);
    entry.count++;
    this.attempts.set(ip, entry);
    if (
      typeof password !== "string" ||
      !process.env.ADMIN_PASSWORD ||
      !equal(password, process.env.ADMIN_PASSWORD)
    )
      throw new UnauthorizedException("Invalid admin password.");
    this.attempts.delete(ip);
    const body = Buffer.from(
      JSON.stringify({ role: "admin", exp: now + 8 * 3600000 }),
    ).toString("base64url");
    return {
      token:
        body +
        "." +
        createHmac("sha256", this.secret()).update(body).digest("base64url"),
    };
  }
  require(header?: string) {
    try {
      const token = (header || "").replace(/^Bearer /, "");
      const [body, signature, ...rest] = token.split(".");
      if (!body || !signature || rest.length) throw 0;
      const expected = createHmac("sha256", this.secret())
        .update(body)
        .digest("base64url");
      if (!equal(signature, expected)) throw 0;
      const data = JSON.parse(Buffer.from(body, "base64url").toString());
      if (data.role !== "admin" || data.exp < Date.now()) throw 0;
    } catch {
      throw new UnauthorizedException("Sign in as an admin.");
    }
  }
}
