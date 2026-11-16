import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  createBoardSchema,
  createColumnSchema,
  joinBoardSchema,
  shareBoardSchema,
  updateBoardMemberSchema,
  updateBoardSchema,
  type BoardDto,
  type BoardMemberDto,
  type BoardShareDto,
  type BoardSummaryDto,
  type ColumnDto,
  type CreateBoardInput,
  type CreateColumnInput,
  type JoinBoardInput,
  type JoinBoardResultDto,
  type ShareBoardInput,
  type UpdateBoardInput,
  type UpdateBoardMemberInput,
} from '@trello/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import type { AuthenticatedUser } from '../auth/auth.types'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BoardsService } from './boards.service'

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<BoardSummaryDto[]> {
    return this.boards.list(user.id)
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBoardSchema)) input: CreateBoardInput,
  ): Promise<BoardDto> {
    return this.boards.create(user.id, input)
  }

  @Post('join')
  join(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(joinBoardSchema)) input: JoinBoardInput,
  ): Promise<JoinBoardResultDto> {
    return this.boards.join(user.id, input.shareToken)
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BoardDto> {
    return this.boards.get(user.id, id)
  }

  @Get(':id/share')
  getShare(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BoardShareDto | null> {
    return this.boards.getShare(user.id, id)
  }

  @Post(':id/share')
  share(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(shareBoardSchema)) input: ShareBoardInput,
  ): Promise<BoardShareDto> {
    return this.boards.shareBoard(user.id, id, input)
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateBoardSchema)) input: UpdateBoardInput,
  ): Promise<BoardDto> {
    return this.boards.update(user.id, id, input)
  }

  @Get(':id/members')
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BoardMemberDto[]> {
    return this.boards.listMembers(user.id, id)
  }

  @Patch(':id/members/:userId')
  updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
    @Body(new ZodValidationPipe(updateBoardMemberSchema)) input: UpdateBoardMemberInput,
  ): Promise<BoardMemberDto> {
    return this.boards.updateMemberRole(user.id, id, targetUserId, input)
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
  ): Promise<void> {
    return this.boards.removeMember(user.id, id, targetUserId)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.boards.remove(user.id, id)
  }

  @Post(':boardId/columns')
  createColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe()) boardId: string,
    @Body(new ZodValidationPipe(createColumnSchema)) input: CreateColumnInput,
  ): Promise<ColumnDto> {
    return this.boards.createColumn(user.id, boardId, input)
  }
}
