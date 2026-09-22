import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import './setup-integration-env';

export default function prepareIntegrationDatabase(): void {
  execFileSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: resolve(__dirname, '..'),
      env: process.env,
      stdio: 'inherit',
    },
  );
}
