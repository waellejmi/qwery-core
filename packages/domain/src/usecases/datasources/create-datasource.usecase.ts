import {
  CreateDatasourceInput,
  DatasourceOutput,
} from '../dto/datasource-usecase-dto';
import { UseCase } from '../usecase';

export type CreateDatasourceUseCase = UseCase<
  CreateDatasourceInput,
  DatasourceOutput
>;
