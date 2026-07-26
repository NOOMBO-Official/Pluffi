const admin = require('firebase-admin');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json'));
admin.initializeApp({ projectId: config.projectId });
admin.auth().createCustomToken('test-uid').then(token => {
  console.log('SUCCESS AUTH');
  process.exit(0);
}).catch(e => {
  console.error('ERROR AUTH', e);
  process.exit(1);
});
