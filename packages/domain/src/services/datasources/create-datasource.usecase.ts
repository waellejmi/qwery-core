import { DatasourceEntity, Datasource } from '../../entities';
import { IDatasourceRepository } from '../../repositories';
import {
  CreateDatasourceInput,
  CreateDatasourceUseCase,
  DatasourceOutput,
} from '../../usecases';

export class CreateDatasourceService implements CreateDatasourceUseCase {
  constructor(private readonly datasourceRepository: IDatasourceRepository) {}

  public async execute(
    datasourceDTO: CreateDatasourceInput,
  ): Promise<DatasourceOutput> {
    const newDatasource = DatasourceEntity.create(datasourceDTO);

    const datasource = await this.datasourceRepository.create(
      newDatasource as unknown as Datasource,
    );
    return DatasourceOutput.new(datasource);
  }
}
