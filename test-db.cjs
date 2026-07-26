const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
admin.initializeApp();
const db = getFirestore(admin.app(), '(default)');
db.collection('test').doc('test').get().then(doc => {
  console.log('SUCCESS');
  process.exit(0);
}).catch(e => {
  console.error('ERROR', e);
  process.exit(1);
});
