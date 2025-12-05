// ============================================
// CONFIGURATION INDEXEDDB
// ============================================

const DB_NAME = 'DailyNotesDB';           // Nom de la base
const DB_VERSION = 1;                     // Version (incrémente pour migrer)
const NOTES_STORE = 'notes';              // Nom de l'object store (= table)
const PENDING_STORE = 'pending_actions';  // Actions en attente de sync

// ============================================
// CLASSE DatabaseManager - Gère IndexedDB
// ============================================

class DatabaseManager {
  constructor() {
    this.db = null;  // Instance de la base de données
  }

  /**
   * Initialise la connexion à IndexedDB
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      // Ouvrir (ou créer) la base de données
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // ========================================
      // ÉVÉNEMENT : Erreur d'ouverture
      // ========================================
      request.onerror = () => {
        console.error('✘ Erreur IndexedDB:', request.error);
        reject(request.error);
      };

      // ========================================
      // ÉVÉNEMENT : Succès d'ouverture
      // ========================================
      request.onsuccess = () => {
        this.db = request.result;
        console.log('✓ IndexedDB initialisée');
        resolve(this.db);
      };

      // ========================================
      // ÉVÉNEMENT : Upgrade (création/migration)
      // S'exécute UNIQUEMENT si :
      // - La DB n'existe pas encore
      // - DB_VERSION a augmenté
      // ========================================
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('Mise à jour du schéma IndexedDB...');

        // ========================================
        // CRÉER L'OBJECT STORE "notes"
        // ========================================
        if (!db.objectStoreNames.contains(NOTES_STORE)) {
          const notesStore = db.createObjectStore(NOTES_STORE, {
            keyPath: 'id',  // La clé primaire = id
            autoIncrement: false  // On utilise l'ID du serveur
          });

          // Créer des index pour rechercher efficacement
          notesStore.createIndex('created_at', 'created_at', { unique: false });
          notesStore.createIndex('updated_at', 'updated_at', { unique: false });
          notesStore.createIndex('date', 'id', { unique: true });

          console.log('✓ Object store "notes" créé');
        }

        // ========================================
        // CRÉER L'OBJECT STORE "pending_actions"
        // Stocke les actions à synchroniser
        // ========================================
        if (!db.objectStoreNames.contains(PENDING_STORE)) {
          const pendingStore = db.createObjectStore(PENDING_STORE, {
            keyPath: 'localId',  // ID unique local
            autoIncrement: true
          });

          pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
          pendingStore.createIndex('type', 'type', { unique: false });

          console.log('✓ Object store "pending_actions" créé');
        }
      };
    });
  }

  // ============================================
  // GESTION DES NOTES
  // ============================================

  /**
   * Récupère toutes les notes
   * @returns {Promise<Array>}
   */
  async getAllNotes() {
    return new Promise((resolve, reject) => {
      // Créer une transaction en lecture seule
      const transaction = this.db.transaction([NOTES_STORE], 'readonly');
      const store = transaction.objectStore(NOTES_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Récupère une note par ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getNote(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([NOTES_STORE], 'readonly');
      const store = transaction.objectStore(NOTES_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Sauvegarde une note (création ou mise à jour)
   * @param {Object} note
   * @returns {Promise<number>} - ID de la note
   */
  async saveNote(note) {
    return new Promise((resolve, reject) => {
      // Transaction en écriture
      const transaction = this.db.transaction([NOTES_STORE], 'readwrite');
      const store = transaction.objectStore(NOTES_STORE);

      // put() = INSERT ou UPDATE (selon si l'ID existe)
      const request = store.put(note);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Sauvegarde plusieurs notes d'un coup (bulk)
   * @param {Array} notes
   * @returns {Promise<void>}
   */
  async saveNotes(notes) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([NOTES_STORE], 'readwrite');
      const store = transaction.objectStore(NOTES_STORE);

      // Boucle sur chaque note
      notes.forEach(note => {
        store.put(note);
      });

      transaction.oncomplete = () => {
        console.log(`✓ ${notes.length} notes sauvegardées localement`);
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  /**
   * Supprime une note
   * @param {number} id
   * @returns {Promise<void>}
   */
  async deleteNote(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([NOTES_STORE], 'readwrite');
      const store = transaction.objectStore(NOTES_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Vide complètement le store des notes
   * @returns {Promise<void>}
   */
  async clearNotes() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([NOTES_STORE], 'readwrite');
      const store = transaction.objectStore(NOTES_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('🗑️ Toutes les notes locales supprimées');
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // ============================================
  // GESTION DES ACTIONS EN ATTENTE (SYNC)
  // ============================================

  /**
   * Ajoute une action en attente de synchronisation
   * @param {Object} action - {type, noteId, data, timestamp}
   * @returns {Promise<number>} - ID de l'action
   */
  async addPendingAction(action) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PENDING_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_STORE);

      // Ajouter un timestamp si absent
      if (!action.timestamp) {
        action.timestamp = Date.now();
      }

      const request = store.add(action);

      request.onsuccess = () => {
        console.log('📝 Action en attente ajoutée:', action.type);
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Récupère toutes les actions en attente
   * @returns {Promise<Array>}
   */
  async getPendingActions() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PENDING_STORE], 'readonly');
      const store = transaction.objectStore(PENDING_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Supprime une action en attente
   * @param {number} localId
   * @returns {Promise<void>}
   */
  async deletePendingAction(localId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PENDING_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_STORE);
      const request = store.delete(localId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Vide toutes les actions en attente
   * @returns {Promise<void>}
   */
  async clearPendingActions() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PENDING_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('Actions en attente vidées');
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

// ============================================
// EXPORT
// ============================================

// Créer une instance singleton
const dbManager = new DatabaseManager();

// Exposer globalement
window.dbManager = dbManager;