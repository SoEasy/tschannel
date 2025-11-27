import { createRollupConfig } from '../../configs/rollup.config.shared.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default createRollupConfig(__dirname);
