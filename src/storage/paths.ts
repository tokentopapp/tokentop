import * as path from 'path';
import * as os from 'os';

const HOME = os.homedir();

export const PATHS = {
  config: {
    dir: path.join(HOME, '.config/tokentop'),
    file: path.join(HOME, '.config/tokentop/config.json'),
    plugins: path.join(HOME, '.config/tokentop/plugins'),
  },
  data: {
    dir: path.join(HOME, '.local/share/tokentop'),
    database: path.join(HOME, '.local/share/tokentop/usage.db'),
    sessions: path.join(HOME, '.local/share/tokentop/sessions'),
    cache: path.join(HOME, '.local/share/tokentop/cache'),
    logs: path.join(HOME, '.local/share/tokentop/logs'),
  },
} as const;
