import * as qwery from '@qwery/extensions-sdk';

import { makePostgresDriver } from './driver';

export function activate(context: qwery.ExtensionContext) {
  context.subscriptions.push(
    qwery.datasources.registerDriver(
      'postgresql.default',
      (ctx) => makePostgresDriver(ctx),
      'node',
    ),
  );
}

