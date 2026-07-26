const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'dist', 'src', 'app.js');
if (!fs.existsSync(target)) {
  console.log('[Index Wrapper] dist/src/app.js not found. Running inline build...');
  require('child_process').execSync('npx prisma generate && npx tsc', { stdio: 'inherit' });
}

require('./dist/src/app.js');
