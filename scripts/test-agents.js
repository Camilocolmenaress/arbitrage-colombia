require('dotenv').config();
const logger = require('../shared/logger');

const { run: runTrendSpotter }       = require('../agents/trend-spotter/index');
const { run: runEvergreenValidator } = require('../agents/evergreen-validator/index');
const { run: runGapFinder }          = require('../agents/gap-finder/index');

const AGENT = process.argv[2]; // 'trends' | 'evergreen' | 'gaps' | 'all'

async function main() {
  logger.info('Manual test run started', { agent: AGENT || 'all' });

  if (!AGENT || AGENT === 'trends' || AGENT === 'all') {
    logger.info('--- Running Trend Spotter ---');
    await runTrendSpotter();
  }

  if (!AGENT || AGENT === 'evergreen' || AGENT === 'all') {
    logger.info('--- Running Evergreen Validator ---');
    await runEvergreenValidator();
  }

  if (!AGENT || AGENT === 'gaps' || AGENT === 'all') {
    logger.info('--- Running Gap Finder ---');
    await runGapFinder();
  }

  logger.info('Manual test run completed');
}

main().catch(err => {
  logger.error('Test run failed', { error: err.message });
  process.exit(1);
});
