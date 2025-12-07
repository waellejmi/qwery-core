import { Navigate, useParams } from 'react-router';

import pathsConfig, { createPath } from '~/config/paths.config';

export default function Datasource() {
  const params = useParams();
  const slug = params.slug as string;

  if (!slug) {
    return null;
  }

  const tablesPath = createPath(pathsConfig.app.datasourceTables, slug);
  return <Navigate to={tablesPath} replace />;
}
