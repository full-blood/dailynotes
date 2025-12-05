// Importer le module sqlite3
// "verbose()" active les messages de débogage
const sqlite3 = require('sqlite3').verbose();

// Importer le module path (pour gérer les chemins de fichiers)
const path = require('path');

// Définir le chemin de la base de données
// __dirname = dossier actuel (/srv/pwa/daily/backend)
const DB_PATH = path.join(__dirname, 'notes.db');

// Créer/ouvrir la base de données
// Si notes.db n'existe pas, SQLite le crée automatiquement
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erreur connexion DB:', err.message);
  } else {
    console.log('✅ Connection a la base de donnees SQLite');
    // Appeler la fonction pour créer la table
    initDatabase();
  }
});

// Fonction pour initialiser la structure de la base
function initDatabase() {
  // Créer la table "notes" si elle n'existe pas déjà
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      content TEXT,
      metadata TEXT,
      tags TEXT,
      weather INTEGER,
      mood INTEGER,
      tomorrow TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Exécuter la requête SQL
  db.run(createTableSQL, (err) => {
    if (err) {
      console.error('❌ Erreur creation table:', err.message);
    } else {
      console.log('✅ Table "notes" prete');
    }
  });
}

// Exporter l'objet "db" pour l'utiliser dans server.js
module.exports = db;
