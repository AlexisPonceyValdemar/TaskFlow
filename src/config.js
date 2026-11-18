// Toute la configuration provient de variables d'environnement (fichier .env chargé par docker compose).
// Aucune valeur de connexion n'est codée en dur : passer d'un MongoDB standalone à un replica set
// ou à un cluster shardé (mongos) se fait uniquement en changeant MONGODB_URI.

function int(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isNaN(v) ? def : v;
}

module.exports = {
  port: int('PORT', 3000),
  mongo: {
    // Exemples :
    //  standalone : mongodb://mongo:27017/taskflow
    //  replica set: mongodb://mongo1:27017,mongo2:27017,mongo3:27017/taskflow?replicaSet=rs0&readPreference=primaryPreferred&w=majority
    //  sharding   : mongodb://mongos1:27017,mongos2:27017/taskflow
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/taskflow',
    dbName: process.env.MONGODB_DB_NAME || undefined, // facultatif, sinon celui de l'URI
    maxPoolSize: int('MONGODB_MAX_POOL_SIZE', 20),
    serverSelectionTimeoutMS: int('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 5000),
    connectRetries: int('MONGODB_CONNECT_RETRIES', 30),
    connectRetryDelayMs: int('MONGODB_CONNECT_RETRY_DELAY_MS', 2000),
    autoIndex: (process.env.MONGODB_AUTO_INDEX || 'true') === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  seedDemo: (process.env.SEED_DEMO || 'false') === 'true',
};
