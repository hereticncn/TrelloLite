import { z } from 'zod'

export const cardTitleSchema = z
  .string()
  .trim()
  .min(1, 'Введите название карточки')
  .max(120, 'Максимум 120 символов')

export const cardDescriptionSchema = z
  .string()
  .trim()
  .max(2000, 'Максимум 2000 символов')
  .default('')

export const createCardSchema = z.object({
  title: cardTitleSchema,
  description: cardDescriptionSchema,
})

export const updateCardSchema = z
  .object({
    title: cardTitleSchema.optional(),
    description: z.string().trim().max(2000, 'Максимум 2000 символов').optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine((value) => value.title !== undefined || value.description !== undefined, {
    message: 'Передайте хотя бы одно поле карточки',
  })

const cardReferenceSchema = z.string().uuid('Некорректный id карточки').nullish()

export const moveCardSchema = z
  .object({
    toColumnId: z.string().uuid('Некорректный id колонки'),
    beforeCardId: cardReferenceSchema,
    afterCardId: cardReferenceSchema,
    expectedVersion: z.number().int().positive('Некорректная версия карточки'),
  })
  .superRefine((value, ctx) => {
    if (value.beforeCardId && value.afterCardId && value.beforeCardId === value.afterCardId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['afterCardId'],
        message: 'Соседние карточки не должны совпадать',
      })
    }
  })

export type CreateCardInput = z.infer<typeof createCardSchema>
export type UpdateCardInput = z.infer<typeof updateCardSchema>
export type MoveCardInput = z.infer<typeof moveCardSchema>

export type CardDto = {
  id: string
  columnId: string
  title: string
  description: string
  position: number
  version: number
  createdById: string
  createdAt: string
  updatedAt: string
}
