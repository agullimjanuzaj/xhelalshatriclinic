import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SuggestedConditionsService } from './suggested-conditions.service';
import { CreateSuggestedConditionDto } from './dto/create-suggested-condition.dto';
import { UpdateSuggestedConditionDto } from './dto/update-suggested-condition.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Gjendjet e Sugjeruara')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('suggested-conditions')
export class SuggestedConditionsController {
  constructor(private readonly suggestedConditionsService: SuggestedConditionsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Listo gjendjet e sugjeruara' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.suggestedConditionsService.findAll(activeOnly === 'true');
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Shto gjendje të re të sugjeruar' })
  create(@Body() dto: CreateSuggestedConditionDto) {
    return this.suggestedConditionsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ndrysho gjendjen e sugjeruar' })
  update(@Param('id') id: string, @Body() dto: UpdateSuggestedConditionDto) {
    return this.suggestedConditionsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Fshi gjendjen e sugjeruar' })
  remove(@Param('id') id: string) {
    return this.suggestedConditionsService.remove(id);
  }
}
