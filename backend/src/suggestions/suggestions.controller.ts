import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SuggestionsService } from './suggestions.service';
import { FromComplaintsDto } from './dto/from-complaints.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Sugjerime')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Post('from-complaints')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: '"Merr sugjerime" — gjendjet e sugjeruara unike nga ankesat e zgjedhura' })
  fromComplaints(@Body() dto: FromComplaintsDto) {
    return this.suggestionsService.fromComplaints(dto.complaintIds);
  }
}
