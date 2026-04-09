const fs = require('fs');
const path = require('path');

/**
 * Updates or appends key=value pairs in the project .env file.
 * Existing keys are replaced in-place; new keys are appended at the end.
 */
function updateEnvFile(updates) {
  const envPath = path.resolve(process.cwd(), '.env');

  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (_) {
    // .env doesn't exist yet — will be created
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      if (content.length > 0 && !content.endsWith('\n')) content += '\n';
      content += `${key}=${value}\n`;
    }
  }

  fs.writeFileSync(envPath, content, 'utf8');
}

module.exports = { updateEnvFile };
