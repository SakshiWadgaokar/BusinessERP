import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).id || request.headers['x-request-id'] || undefined;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred. Please contact support if the issue persists.';
    let fieldErrors: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        errorCode = HttpStatus[statusCode] || 'HTTP_ERROR';
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, any>;
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message || message;
        errorCode = body.errorCode || body.error || HttpStatus[statusCode] || 'HTTP_ERROR';
        fieldErrors = body.fieldErrors;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        statusCode = HttpStatus.CONFLICT;
        errorCode = 'DUPLICATE_RECORD';
        const target = Array.isArray(exception.meta?.target)
          ? (exception.meta?.target as string[]).join(', ')
          : 'unique field';
        message = `A record with the same ${target} already exists.`;
      } else if (exception.code === 'P2003') {
        statusCode = HttpStatus.BAD_REQUEST;
        errorCode = 'INVALID_REFERENCE';
        message = 'Referenced record does not exist or cannot be removed while in use.';
      } else if (exception.code === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        errorCode = 'RECORD_NOT_FOUND';
        message = 'Requested record was not found.';
      } else {
        this.logger.error(`Prisma error ${exception.code}: ${exception.message}`);
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    } else {
      this.logger.error('Unhandled non-error exception', JSON.stringify(exception));
    }

    response.status(statusCode).json({
      statusCode,
      errorCode,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
