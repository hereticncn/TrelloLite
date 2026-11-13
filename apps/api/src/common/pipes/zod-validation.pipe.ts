import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import { ZodError, type ZodSchema } from 'zod'

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value ?? {})

    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Проверьте правильность заполнения полей',
        fieldErrors: this.toFieldErrors(result.error),
      })
    }

    return result.data
  }

  private toFieldErrors(error: ZodError): Record<string, string[]> {
    const fieldErrors: Record<string, string[]> = {}

    for (const issue of error.issues) {
      const path = issue.path.join('.') || '_form'
      fieldErrors[path] ??= []
      fieldErrors[path].push(issue.message)
    }

    return fieldErrors
  }
}
