const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json'));
console.log('Project ID:', config.projectId);
console.log('DB ID:', config.firestoreDatabaseId || '(default)');

admin.initializeApp({
  projectId: config.projectId
});
const db = getFirestore(admin.app(), config.firestoreDatabaseId || '(default)');
db.collection('test').doc('test').get().then(doc => {
  console.log('SUCCESS');
  process.exit(0);
}).catch(e => {
  console.error('ERROR', e);
  process.exit(1);
});
