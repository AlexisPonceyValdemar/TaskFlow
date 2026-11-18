const mongoose = require('mongoose');
const config = require('./config');

function redact(uri) {
  return uri.replace(/\/\/([^@/]+)@/, '//***:***@');
}

async function connect() {
  const { uri, dbName, maxPoolSize, serverSelectionTimeoutMS, connectRetries, connectRetryDelayMs, autoIndex } = config.mongo;
  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= connectRetries; attempt++) {
    try {
      await mongoose.connect(uri, { dbName, maxPoolSize, serverSelectionTimeoutMS, autoIndex });
      console.log(`[db] connecté à ${redact(uri)}`);
      return mongoose.connection;
    } catch (err) {
      console.warn(`[db] tentative ${attempt}/${connectRetries} échouée : ${err.message}`);
      if (attempt === connectRetries) throw err;
      await new Promise((r) => setTimeout(r, connectRetryDelayMs));
    }
  }
}

module.exports = { connect };
