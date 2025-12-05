// ============================================
// IMPORTS - Charger les modules nécessaires
// ============================================

const express = require('express');      // Framework web
const cors = require('cors');            // Permettre les requêtes cross-origin
const db = require('./db');              // Notre base de données (db.js)

// ============================================
// CONFIGURATION
// ============================================

const app = express();                   // Créer l'application Express
const PORT = 3000;                       // Port d'écoute du serveur

// ============================================
// MIDDLEWARES
// ============================================

// Qu'est-ce qu'un middleware ?
// = Fonction qui s'exécute AVANT les routes
// = Modifie la requête ou la réponse

// 1. CORS : Autoriser les requêtes depuis n'importe quel domaine
app.use(cors());

// 2. JSON Parser : Convertir le body des requêtes en objet JavaScript
// Sans ça, req.body serait undefined
app.use(express.json());

// 3. Logger simple : Afficher chaque requête dans la console
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next(); // Passer à la suite (important !)
});

// Servir les fichiers statiques du frontend
app.use(express.static('../frontend'));

// ============================================
// ROUTES API
// ============================================

// Route de test - Vérifier que le serveur fonctionne
app.get('/', (req, res) => {
  res.json({ 
    message: '✅ Serveur Daily Notes actif',
    version: '1.0.0',
    endpoints: [
      'GET /api/notes',
      'GET /api/notes/:id',
      'POST /api/notes',
      'PUT /api/notes/:id',
      'DELETE /api/notes/:id'
    ]
  });
});

// --------------------------------------------
// 1. GET /api/notes - Lire toutes les notes
// --------------------------------------------
app.get('/api/notes', (req, res) => {
  // Requête SQL pour sélectionner toutes les notes
  // ORDER BY updated_at DESC = trier par date de modification (plus récent en premier)
  const sql = 'SELECT * FROM notes ORDER BY updated_at DESC';
  
  // db.all() = récupérer TOUTES les lignes
  db.all(sql, [], (err, rows) => {
    if (err) {
      // En cas d'erreur SQL
      console.error('❌ Erreur lecture notes:', err.message);
      return res.status(500).json({ error: err.message });
    }
    
    // rows = tableau d'objets (chaque objet = une note)
    console.log(`✅ ${rows.length} notes récupérées`);
    res.json(rows);
  });
});

// --------------------------------------------
// 2. GET /api/notes/:id - Lire une note spécifique
// --------------------------------------------
app.get('/api/notes/:id', (req, res) => {
  // req.params.id = l'ID dans l'URL
  // Exemple : /api/notes/5 → req.params.id = "5"
  const id = req.params.id;
  
  // SQL avec paramètre (? sera remplacé par l'ID)
  // Pourquoi ? et pas directement l'ID ? → Sécurité contre les injections SQL
  const sql = 'SELECT * FROM notes WHERE id = ?';
  
  // db.get() = récupérer UNE seule ligne
  db.get(sql, [id], (err, row) => {
    if (err) {
      console.error('❌ Erreur lecture note:', err.message);
      return res.status(500).json({ error: err.message });
    }
    
    if (!row) {
      // Si aucune note trouvée avec cet ID
      return res.status(404).json({ error: 'Note non trouvée' });
    }
    
    console.log(`✅ Note ${id} récupérée`);
    res.json(row);
  });
});

// --------------------------------------------
// 3. POST /api/notes - Créer une nouvelle note
// --------------------------------------------
app.post('/api/notes', (req, res) => {
  // req.body = données envoyées par le client
  // Exemple : { "title": "Ma note", "content": "Contenu..." }
  const { id, content, metadata, tags, weather, mood, tomorrow } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: 'L\'ID (date YYYYMMDD) est obligatoire' });
  }
  // Validation du format YYYYMMDD
  if (!/^\d{8}$/.test(id)) {
     return res.status(400).json({ error: 'L\'ID doit être au format YYYYMMDD (8 chiffres).' });
  }

  if (!content && !metadata) {
    return res.status(400).json({ error: 'Il faut au moins un contenu texte ou metadata'});
  }
  
  // Convertir le tableau de tags en chaîne JSON
  // Exemple : ["urgent", "perso"] → '["urgent","perso"]'
  const tagsJSON = tags ? JSON.stringify(tags) : null;
  
  // SQL INSERT
  const sql = `
    INSERT INTO notes (id, content, metadata, tags, weather, mood, tomorrow) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  // db.run() = exécuter une requête qui ne retourne pas de lignes
db.run(sql, [id, content, metadata, tagsJSON, weather, mood, tomorrow], function(err) {
if (err) {
	console.error('❌ Erreur création note:', err.message);
	// Cas particulier : doublon sur l'ID (clé primaire)
	if (err.code === 'SQLITE_CONSTRAINT') {
		return res.status(409).json({
			error: "Une note existe déjà pour cette date. Veuillez choisir une autre date."
		});
	}
	return res.status(500).json({ error: err.message });
	}
	// Récupérer la note complète qu'on vient de créer
	db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row) => {
	if (err) {
		return res.status(500).json({ error: err.message });
	}
	console.log(`✅ Note ${id} créée`);
	// Status 201 = Created (bonne pratique REST)
	res.status(201).json(row);
    });
  });
});

// --------------------------------------------
// 4. PUT /api/notes/:id - Modifier une note
// --------------------------------------------
app.put('/api/notes/:id', (req, res) => {
  const id = req.params.id; // L'ID (date) est tiré de l'URL
  const { content, metadata, tags, weather, mood, tomorrow } = req.body;

  // L'ID (date) est dans l'URL, pas besoin de le valider depuis le body ici.
  //Validation : content OU metadata (au moins un des deux est requis)
  if (!content && !metadata) {
    return res.status(400).json({ error: 'Au moins un des champs ("content" ou "metadata") est obligatoire.' });
  }
  
  const tagsJSON = tags ? JSON.stringify(tags) : null;
  
  // SQL UPDATE
  // updated_at = CURRENT_TIMESTAMP → met à jour automatiquement la date
  const sql = `
    UPDATE notes 
    SET content = ?, metadata = ?, tags = ?, weather = ?, mood = ?, tomorrow = ?,  updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  db.run(sql, [content || null, metadata || null, tagsJSON, weather, mood, tomorrow, id], function(err) {
    if (err) {
      console.error('❌ Erreur modification note:', err.message);
      return res.status(500).json({ error: err.message });
    }
    
    // this.changes = nombre de lignes modifiées
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Note non trouvée' });
    }
    
    // Récupérer la note modifiée
    db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      console.log(`✅ Note ${id} modifiée`);
      res.json(row);
    });
  });
});

// --------------------------------------------
// 5. DELETE /api/notes/:id - Supprimer une note
// --------------------------------------------
app.delete('/api/notes/:id', (req, res) => {
  const id = req.params.id;
  
  // SQL DELETE
  const sql = 'DELETE FROM notes WHERE id = ?';
  
  db.run(sql, [id], function(err) {
    if (err) {
      console.error('❌ Erreur suppression note:', err.message);
      return res.status(500).json({ error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Note non trouvée' });
    }
    
    console.log(`✅ Note ${id} supprimée`);
    // Status 204 = No Content (suppression réussie, pas de contenu à retourner)
    res.status(204).send();
  });
});

// ============================================
// GESTION DES ERREURS 404
// ============================================

// Cette route s'exécute si aucune autre route ne correspond
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 Serveur Daily Notes démarré       ║
║                                        ║
║   📡 Port: ${PORT}                        ║
║   🌐 URL: http://localhost:${PORT}        ║
║   📊 Base: notes.db                    ║
║                                        ║
║   ✅ Prêt à recevoir des requêtes      ║
╚════════════════════════════════════════╝
  `);
});
