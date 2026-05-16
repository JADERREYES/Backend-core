import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

@Catch(MulterError, BadRequestException)
export class DocumentsUploadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DocumentsUploadExceptionFilter.name);

  catch(exception: MulterError | BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{
      method?: string;
      originalUrl?: string;
      headers?: Record<string, string | string[] | undefined>;
      user?: { userId?: string; email?: string };
    }>();
    const response = ctx.getResponse<Response>();

    const origin =
      typeof request.headers?.origin === 'string'
        ? request.headers.origin
        : '';

    if (origin) {
      response.header('Access-Control-Allow-Origin', origin);
      response.header('Vary', 'Origin');
      response.header('Access-Control-Allow-Credentials', 'true');
      response.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Accept, Origin, X-Requested-With',
      );
      response.header(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      );
    }

    if (exception instanceof MulterError) {
      const status =
        exception.code === 'LIMIT_FILE_SIZE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.BAD_REQUEST;
      const message =
        exception.code === 'LIMIT_FILE_SIZE'
          ? 'El archivo excede el tamano maximo permitido de 15 MB'
          : `Error al procesar la subida del archivo: ${exception.message}`;

      this.logger.warn(
        `Upload rejected ${request.method || 'POST'} ${
          request.originalUrl || '/documents/upload'
        } user=${request.user?.userId || 'unknown'} email=${
          request.user?.email || 'unknown'
        } code=${exception.code} message=${exception.message}`,
      );

      response.status(status).json({
        statusCode: status,
        message,
        error: 'UploadError',
      });
      return;
    }

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as { message?: string | string[] })?.message ||
          'Solicitud invalida';

    this.logger.warn(
      `Upload bad request ${request.method || 'POST'} ${
        request.originalUrl || '/documents/upload'
      } user=${request.user?.userId || 'unknown'} email=${
        request.user?.email || 'unknown'
      } message=${Array.isArray(message) ? message.join(', ') : message}`,
    );

    response.status(status).json({
      statusCode: status,
      message,
      error: 'BadRequest',
    });
  }
}
