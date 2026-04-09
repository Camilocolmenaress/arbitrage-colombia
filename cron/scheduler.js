require('dotenv').config();
const cron = require('node-cron');
const { TREND_SPOTTER, EVERGREEN_VALIDATOR, GAP_FINDER } = require('./cron.config');
const logger = require('../shared/logger');

const { run: runTrendSpotter }       = require('../agents/trend-spotter/index');
const { run: runEvergreenValidator } = require('../agents/evergreen-validator/index');
const { run: runGapFinder }          = require('../agents/gap-finder/index');

function scheduleAgent(name, schedule, runFn) {
  cron.schedule(schedule, async () => {
    logger.info(`[CRON] ${name} triggered`);
    try {
      await runFn();
    } catch (err) {
      logger.error(`[CRON] ${name} failed`, { error: err.message });
    }
  }, {
    timezone: 'America/Bogota'
  });
  logger.info(`[CRON] ${name} scheduled`, { schedule });
}

scheduleAgent('Trend Spotter',       TREND_SPOTTER,       runTrendSpotter);
scheduleAgent('Evergreen Validator', EVERGREEN_VALIDATOR, runEvergreenValidator);
scheduleAgent('Gap Finder',          GAP_FINDER,          runGapFinder);

logger.info('[CRON] Scheduler running. All agents scheduled.');
