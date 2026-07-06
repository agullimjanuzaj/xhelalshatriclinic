import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Ndodhi një gabim i brendshëm';
    let errors: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as any;
        if (Array.isArray(res.message)) {
          // Default NestJS ValidationPipe format: { message: [...errors] }
          errors = res.message;
          message = 'Të dhënat e dërguara janë të pasakta';
        } else if (Array.isArray(res.errors)) {
          // Our custom exceptionFactory format: { message: string, errors: [...] }
          message = res.message || message;
          errors = res.errors;
        } else {
          message = res.message || message;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        // Unique constraint violation — should not normally reach here because
        // services rename soft-deleted records to free unique constraints, but
        // this is a safety net so the client never sees a raw 500.
        status = HttpStatus.CONFLICT;
        message = 'Ekziston tashmë një rekord me këtë vlerë. Provoni me një emër tjetër.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Rekordi nuk u gjet';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Vlera e referuar nuk ekziston. Kontrolloni të dhënat dhe provoni përsëri.';
        this.logger.error(`Prisma P2003 FK constraint: ${exception.message}`);
      } else {
        this.logger.error(`Prisma ${exception.code}: ${exception.message}`, exception.stack);
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Ndodhi një gabim gjatë operacionit në bazën e të dhënave.';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error(`Prisma validation: ${exception.message}`);
      status = HttpStatus.BAD_REQUEST;
      message = 'Të dhënat e dërguara nuk janë të vlefshme.';
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      timestamp: new Date().toISOString(),
    });
  }
}
