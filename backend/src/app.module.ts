import {
  Inject,
  All,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  ArgumentsHost,
  Get,
  Headers,
  HttpException,
  Module,
  Post,
  Req,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Database } from "./database";
import { BookingsService } from "./bookings.service";
import { Auth } from "./auth";
import { SmsService } from "./sms.service";

@Controller()
class ApiController {
  constructor(
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(Auth) private readonly auth: Auth,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(Database) private readonly db: Database,
  ) {}
  @Get("health") async health() {
    await this.db.pool.query("SELECT 1");
    return { ok: true };
  }
  @Post("admin/login") login(@Body() body: any, @Req() req: Request) {
    return {
      ok: true,
      ...this.auth.login(body?.password, req.ip || "unknown"),
    };
  }
  @Get("admin/menu") async menu(@Headers("authorization") token: string) {
    this.auth.require(token);
    return { ok: true, rows: await this.bookings.adminMenu() };
  }
  @Post("admin/menu") async save(
    @Headers("authorization") token: string,
    @Body() body: any,
  ) {
    this.auth.require(token);
    return { ok: true, ...(await this.bookings.saveMenu(body)) };
  }
  @Post("admin/menu/delete") async remove(
    @Headers("authorization") token: string,
    @Body() body: any,
  ) {
    this.auth.require(token);
    return { ok: true, ...(await this.bookings.deleteMenu(body)) };
  }
  @Get("admin/sms") async messages(@Headers("authorization") token: string) {
    this.auth.require(token);
    return { ok: true, messages: await this.sms.list() };
  }
  @All("bookings") async dispatch(
    @Req() req: Request,
    @Headers("authorization") token: string,
  ) {
    let p: any;
    try {
      p =
        req.method === "GET"
          ? req.query.payload
            ? JSON.parse(String(req.query.payload))
            : req.query
          : typeof req.body === "string"
            ? JSON.parse(req.body)
            : req.body;
    } catch {
      throw new HttpException("Invalid JSON payload", 400);
    }
    if (!p || typeof p !== "object" || Array.isArray(p))
      throw new HttpException("An object payload is required", 400);
    const action = p.action || "createBooking";
    const reads = [
      "getFoodMenu",
      "checkDonation",
      "getBookingsForApartment",
      "getAdminSummary",
      "getCollectionReport",
      "getApartmentCoupons",
    ];
    if (
      !["GET", "POST"].includes(req.method) ||
      (!reads.includes(action) && req.method !== "POST")
    )
      throw new HttpException("Use POST for writes", 405);
    switch (action) {
      case "getFoodMenu":
        return { ok: true, menu: await this.bookings.menu() };
      case "checkDonation":
        return { ok: true, ...(await this.bookings.checkDonation(p)) };
      case "getBookingsForApartment":
        return { ok: true, bookings: await this.bookings.bookings(p) };
      case "getApartmentCoupons":
        this.auth.require(token);
        return { ok: true, report: await this.bookings.apartmentCoupons(p) };
      case "getAdminSummary":
        this.auth.require(token);
        return { ok: true, summary: await this.bookings.summary() };
      case "getCollectionReport":
        this.auth.require(token);
        return { ok: true, report: await this.bookings.collection(p) };
      case "upgradeToTakeaway":
        return { ok: true, upgrade: await this.bookings.upgrade(p) };
      case "createDonation":
        return { ok: true, donation: await this.bookings.donate(p) };
      case "createBooking":
        return { ok: true, booking: await this.bookings.create(p) };
      default:
        throw new HttpException("Unknown action", 400);
    }
  }
}
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500,
      message = "Unable to process request.";
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      message = typeof body === "string" ? body : (body as any).message;
    } else if (error?.code === "23505") {
      status = 409;
      message = "This record already exists.";
    } else if (["23503", "23514", "22P02", "22007"].includes(error?.code)) {
      status = 400;
      message = "The data violates a database constraint.";
    } else console.error("API error", error?.code || error?.name || "unknown");
    res.status(status).json({ ok: false, error: message });
  }
}
@Module({
  controllers: [ApiController],
  providers: [Database, BookingsService, Auth, SmsService],
})
export class AppModule {}
