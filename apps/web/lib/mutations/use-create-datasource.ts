import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Datasource } from '@qwery/domain/entities';
import { IDatasourceRepository } from '@qwery/domain/repositories';
import { CreateDatasourceService } from '@qwery/domain/services';
import {
  CreateDatasourceInput,
  DatasourceOutput,
} from '@qwery/domain/usecases';
import {
  getDatasourcesByProjectIdKey,
  getDatasourcesKey,
} from '~/lib/queries/use-get-datasources';

export function useCreateDatasource(
  datasourceRepository: IDatasourceRepository,
  onSuccess: (datasource: Datasource) => void,
  onError: (error: Error) => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (datasourceDTO: CreateDatasourceInput) => {
      const createDatasourceService = new CreateDatasourceService(
        datasourceRepository,
      );
      return await createDatasourceService.execute(datasourceDTO);
    },
    onSuccess: async (datasourceOutput: DatasourceOutput) => {
      // Refetch the datasources list to ensure fresh data is loaded
      await queryClient.refetchQueries({
        queryKey: getDatasourcesByProjectIdKey(datasourceOutput.projectId),
      });
      // Also invalidate the general datasources query
      queryClient.invalidateQueries({
        queryKey: getDatasourcesKey(),
      });
      onSuccess(datasourceOutput as unknown as Datasource);
    },
    onError,
  });
}
