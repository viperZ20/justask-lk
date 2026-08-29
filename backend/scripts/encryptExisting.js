// encryptExisting.js
//
// Encrypts messages written before encryption at rest was enabled.
//
// Not strictly required — the decrypt function passes unprefixed values
// through unchanged, so old plaintext keeps working. But leaving historical
// conversations readable in a database dump defeats the point of the feature
// for exactly the records most likely to exist at demo time.
//
// Safe to re-run: already-encrypted rows are skipped.
//
// Run from the backend folder:  node scripts/encryptExisting.js

require('dotenv').config();
const mongoose = require('mongoose');
const { encrypt, isEnabled, PREFIX } = require('../services/encryption');

(async () => {
  try {
    if (!isEnabled()) {
      console.error('ENCRYPTION_KEY is not set. Nothing to do.');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Work on the raw collection, bypassing the model's getters and setters.
    // Going through the model would decrypt-then-re-encrypt already-migrated
    // rows, which is wasted work and an unnecessary risk.
    const col = mongoose.connection.db.collection('chatmessages');

    const total = await col.countDocuments({});
    const alreadyDone = await col.countDocuments({ content: { $regex: '^' + PREFIX } });

    console.log(`Total messages   : ${total}`);
    console.log(`Already encrypted: ${alreadyDone}`);
    console.log(`To migrate       : ${total - alreadyDone}\n`);

    if (total === alreadyDone) {
      console.log('Nothing to migrate.');
      return;
    }

    const cursor = col.find({ content: { $not: { $regex: '^' + PREFIX } } });
    let done = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const update = { content: encrypt(doc.content) };
      if (doc.audio && !String(doc.audio).startsWith(PREFIX)) {
        update.audio = encrypt(doc.audio);
      }
      await col.updateOne({ _id: doc._id }, { $set: update });
      done++;
      if (done % 50 === 0) console.log(`  ${done} migrated...`);
    }

    console.log(`\nMigrated ${done} message(s).`);

    const check = await col.countDocuments({ content: { $not: { $regex: '^' + PREFIX } } });
    console.log(check === 0
      ? 'Verified: no plaintext content remains.'
      : `Warning: ${check} row(s) still plaintext.`);
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
