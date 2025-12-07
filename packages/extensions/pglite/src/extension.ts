import * as qwery from '@qwery/extensions-sdk';

import { makePGliteDriver } from './driver';

export function activate(context: qwery.ExtensionContext) {
  context.subscriptions.push(
    qwery.datasources.registerDriver(
      'pglite.default',
      (ctx: qwery.DriverContext) => makePGliteDriver(ctx),
      'browser',
    ),
  );
}

