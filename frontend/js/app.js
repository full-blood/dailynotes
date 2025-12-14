// ============================================
// CONFIGURATION
// ============================================

const API_URL = '/api';
// L'URL de notre backend Express

// ============================================
// VARIABLES GLOBALES - État de l'application
// ============================================

let notes = [];              // Tableau contenant toutes les notes
let currentEditId = null;    // ID de la note en cours d'édition (null si création)
let isOnline = navigator.onLine;

// ============================================
// RÉFÉRENCES AUX ÉLÉMENTS DOM
// ============================================

const elements = {
  // Formulaire
  form: document.getElementById('form'),
  formTitle: document.getElementById('formTitle'),
  id: document.getElementById('noteId'),
  noteContent: document.getElementById('noteContent'),
  noteMetadata: document.getElementById('noteMetadata'),
  noteTags: document.getElementById('noteTags'),
  noteWeather: document.getElementsByName('noteWeather'),
  noteMood: document.getElementsByName('noteMood'),
  noteTomorrow: document.getElementById('noteTomorrow'),
  submitBtn: document.getElementById('submitBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  
  // Liste
  notesList: document.getElementById('notesList'),
  notesCount: document.getElementById('notesCount'),
  loading: document.getElementById('loading'),
  emptyState: document.getElementById('emptyState'),
  
  // Boutons
  refreshBtn: document.getElementById('refreshBtn'),
  
  // Statut
  connectionStatus: document.getElementById('connectionStatus')
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Affiche ou cache le spinner de chargement
 */
function showLoading(show) {
  if(elements.loading) elements.loading.style.display = show ? 'block' : 'none';
}

/**
 * Affiche ou cache le message "Aucune note"
 */
function showEmptyState(show) {
  if(elements.emptyState) elements.emptyState.style.display = show ? 'block' : 'none';
}

/**
 * Met à jour le compteur de notes
 */
function updateNotesCount() {
  if(elements.notesCount) elements.notesCount.textContent = notes.length;
}

/**
 * Affiche une notification toast
 */
function showToast(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // Ici on pourrait ajouter une UI de toast réelle
}

/**
 * Met à jour l'indicateur de connexion
 */
function updateConnectionStatus() {
  if (isOnline) {
    elements.connectionStatus.innerHTML = '<i class="fas fa-wifi"></i> En ligne';
    elements.connectionStatus.className = 'status-badge status-badge--online';
  } else {
    elements.connectionStatus.innerHTML = '<i class="fas fa-wifi-slash"></i> Hors ligne';
    elements.connectionStatus.className = 'status-badge status-badge--offline';
  }
}

/**
 * Affiche une boîte d'alerte avec un message
 */
function showAlert(message) {
  const box = document.getElementById('alertBox');
  const msg = document.getElementById('alertMessage');
  if(box && msg) {
    msg.textContent = message;
    box.style.display = 'flex';
    setTimeout(() => {
      box.style.display = 'none';
    }, 5000);
  } else {
    alert(message);
  }
}

function hideAlert() {
  const box = document.getElementById('alertBox');
  if(box) box.style.display = 'none';
}

// ============================================
// SERVICE WORKER (PWA)
// ============================================

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service Worker enregistré avec succès:', registration.scope);
    } catch (error) {
      console.error('❌ Échec de l\'enregistrement du Service Worker:', error);
    }
  }
}

// ============================================
// API - COMMUNICATION AVEC LE BACKEND
// ============================================

/**
 * Récupère toutes les notes depuis l'API
 */
async function fetchNotesFromAPI() {
  const response = await fetch(`${API_URL}/notes`);
  if (!response.ok) {
    throw new Error(`Erreur HTTP: ${response.status}`);
  }
  return await response.json();
}

/**
 * Crée une nouvelle note sur l'API
 */
async function createNoteOnAPI(noteData) {
  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noteData),
  });

  const text = await response.text();

  if (!response.ok) {
    let message = "Erreur inconnue";
    try {
      const json = JSON.parse(text);
      message = json.error || message;
    } catch(e) {    
      // Si c'est du HTML (comme l'erreur 502 Cloudflare), on met un message générique
      if (text.trim().startsWith('<')) {
        message = `Erreur Serveur (${response.status})`;
      } else {
        message = text;
      }
    }
    if (response.status === 409) {
        showAlert("Une note existe déjà pour cette date. Choisissez une autre date.", "error");
    } else {
        showAlert(message);
    }
    // On lance une erreur avec le statut pour pouvoir filtrer plus tard
    const error = new Error(message);
    error.status = response.status;
    error.rawBody = text;
    throw error;
  }

  return JSON.parse(text);
}

/**
 * Met à jour une note sur l'API
 */
async function updateNoteOnAPI(id, noteData) {
  const response = await fetch(`${API_URL}/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noteData)
  });
  
  if (!response.ok) {
    const error = new Error(`Erreur HTTP: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  
  return await response.json();
}

/**
 * Supprime une note sur l'API
 */
async function deleteNoteOnAPI(id) {
  const response = await fetch(`${API_URL}/notes/${id}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    if (response.status === 404) return; // Déjà supprimé
    const error = new Error(`Erreur HTTP: ${response.status}`);
    error.status = response.status;
    throw error;
  }
}

// ============================================
// LOGIQUE PRINCIPALE (Local + API)
// ============================================

/**
 * Crée une note (avec bascule automatique offline)
 */
async function createNote(noteData) {
  // 1. Essayer l'API si on pense être en ligne
  if (isOnline) {
    try {
      const createdNote = await createNoteOnAPI(noteData);
      await dbManager.saveNote(createdNote);
      return createdNote;
    } catch (error) {
      // Si c'est une erreur de validation (ex: ID manquant, doublon), on arrête tout
      if (error.status === 400 || error.status === 409) {
        console.error('❌ Erreur de validation lors de la création:', error);
        // On NE tombe PAS en offline : on considère que la note est invalide
        throw error;
      }
      
      console.warn('⚠️ API indisponible (Serveur éteint ou erreur réseau), passage en mode local.', error);
      // Pour les erreurs 5xx (Serveur) ou réseau, on continue vers le mode hors ligne
    }
  }

  // 2. Mode Hors Ligne (ou Fallback si API échoue)
  try {
    const now = new Date().toISOString();
    const localNote = {
        id: noteData.id,
        content: noteData.content,
        metadata: noteData.metadata,
        tags: noteData.tags,
        weather: noteData.weather ?? null,
        mood: noteData.mood ?? null,
        tomorrow: noteData.tomorrow,
        created_at: now,
        updated_at: now,
        _localOnly: true // Marqueur pour dire "pas encore sync"
    };

    await dbManager.saveNote(localNote);

    await dbManager.addPendingAction({
        type: 'CREATE',
        noteId: localNote.id,
        data: noteData
    });

    showToast('Note créée localement (sera synchronisée)', 'info');
    return localNote;
  } catch (error) {
        console.error('❌ Erreur lors de la création (mode local):', error);
    throw error;
  }
}

/**
 * Met à jour une note
 */
async function updateNote(id, noteData) {
  if (isOnline) {
    try {
      const updatedNote = await updateNoteOnAPI(id, noteData);
      await dbManager.saveNote(updatedNote);
      return updatedNote;
    } catch (error) {
      if (error.status === 400) {
        showAlert(error.message);
        throw error;
      }
      console.warn('⚠️ API indisponible, modification locale.', error);
    }
  }

  // Mode Hors Ligne / Fallback
  const localNote = await dbManager.getNote(id);
  if (!localNote) throw new Error('Note introuvable localement');

  const updatedLocalNote = {
    ...localNote,
    ...noteData,
    updated_at: new Date().toISOString(),
    _localOnly: true
  };

  await dbManager.saveNote(updatedLocalNote);

  await dbManager.addPendingAction({
    type: 'UPDATE',
    noteId: id,
    data: noteData
  });

  showToast('Note modifiée localement', 'info');
  return updatedLocalNote;
}

/**
 * Supprime une note
 */
async function deleteNote(id) {
  if (isOnline) {
    try {
      await deleteNoteOnAPI(id);
      await dbManager.deleteNote(id);
      return;
    } catch (error) {
      console.warn('⚠️ API indisponible, suppression locale.', error);
    }
  }

  // Mode Hors Ligne / Fallback
  await dbManager.deleteNote(id);

  await dbManager.addPendingAction({
    type: 'DELETE',
    noteId: id
  });

  showToast('Note supprimée localement', 'info');
}

/**
 * Synchronisation des actions en attente
 */
async function processPendingActions() {
  if (!isOnline) return;

  try {
    const pendingActions = await dbManager.getPendingActions();
    if (pendingActions.length === 0) return;

    console.log(`🔄 Sync: ${pendingActions.length} action(s) en attente...`);

    for (const action of pendingActions) {
      try {
        switch (action.type) {
          case 'CREATE':
            // On vérifie d'abord si la note n'existe pas déjà sur le serveur
            try {
              const created = await createNoteOnAPI(action.data);
              await dbManager.saveNote(created);
            } catch(e) {
              // Si conflit (409), on suppose qu'elle est déjà là, on ignore
              if(e.status !== 409) throw e;
            }
            // On supprime le flag _localOnly si présent en rechargeant ou écrasant
            break;
          case 'UPDATE':
            await updateNoteOnAPI(action.noteId, action.data);
            break;
          case 'DELETE':
            await deleteNoteOnAPI(action.noteId);
            break;
        }
        await dbManager.deletePendingAction(action.localId);
      } catch (error) {
        console.error(`❌ Échec sync action ${action.type}:`, error);
        // On laisse l'action dans la file pour réessayer plus tard
      }
    }
    
    // Rafraîchir tout après sync
    await loadNotes();
    showToast('Synchronisation terminée', 'success');
  } catch (error) {
    console.error('❌ Erreur globale sync:', error);
  }
}

// ============================================
// RENDU - AFFICHAGE DES NOTES
// ============================================

function createNoteCardHTML(note) {
  let tagsString = note.tags || '';
  if (tagsString.startsWith('"') && tagsString.endsWith('"')) {
    tagsString = tagsString.slice(1, -1);
  }  
  const tagsArray = tagsString 
    ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag)
    : [];
  
  const tagsHTML = tagsArray.length > 0
    ? tagsArray.map(tag => `<span class="tag">${tag}</span>`).join('')
    : '';
  
  const tempBadge = note._localOnly
    ? '<span class="tag" style="background: #f59e0b;">⏳ En attente</span>'
    : '';

  const maxLength = 150;
  let displayContent = note.content || '';
  if (displayContent.length > maxLength) {
    displayContent = displayContent.substring(0, maxLength) + '...';
  }
  
  // Échappement basique pour la sécurité
  const safeContent = displayContent.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `
    <div class="note-card" data-id="${note.id}">
      <div class="note-card__header">
        <h3 class="note-card__title">${note.id}</h3>
        <div class="note-card__actions">
          <button class="btn btn--success" onclick="editNote('${note.id}')" title="Modifier">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn--danger" onclick="confirmDelete('${note.id}')" title="Supprimer">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      
      ${safeContent ? `<div class="note-card__content">${safeContent}</div>` : ''}
      
      <div class="note-card__footer">
        <div class="note-card__tags">
            ${tempBadge}
            ${tagsHTML}
        </div>
        <time>${formatDate(note.updated_at || note.created_at)}</time>
      </div>
    </div>
  `;
}

function formatDate(isoDate) {
  if(!isoDate) return '';
  const date = new Date(isoDate);
  return date.toLocaleDateString('fr-FR', { 
    day: '2-digit', month: '2-digit', year: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
}

function renderNotes() {
  elements.notesList.innerHTML = '';
  
  if (notes.length === 0) {
    showEmptyState(true);
    updateNotesCount();
    return;
  }
  
  showEmptyState(false);
  
  // Tri par date de mise à jour (plus récent en premier)
  const sortedNotes = [...notes].sort((a, b) => {
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });
  
  sortedNotes.forEach(note => {
    elements.notesList.insertAdjacentHTML('beforeend', createNoteCardHTML(note));
  });
  
  updateNotesCount();
}

async function loadNotes() {
  showLoading(true);
  try {
    // 1. Charger depuis le cache local (rapide)
    notes = await dbManager.getAllNotes();
    renderNotes();

    // 2. Si on est en ligne, on tente de rafraîchir depuis le serveur
    if (isOnline) {
      try {
        const serverNotes = await fetchNotesFromAPI();
        await dbManager.saveNotes(serverNotes);
        // Recharger depuis la DB locale mise à jour
        notes = await dbManager.getAllNotes();
        renderNotes();
        // Lancer la sync des actions en attente
        processPendingActions();
      } catch (error) {
        console.warn('⚠️ Impossible de joindre le serveur, affichage cache local.');
      }
    }
  } catch (error) {
    console.error('❌ Erreur chargement notes:', error);
    showToast('Erreur de chargement', 'error');
  } finally {
    showLoading(false);
  }
}

// ============================================
// FORMULAIRE
// ============================================

function resetForm() {
  elements.form.reset();
  elements.id.value = '';
  // Déverrouiller le champ ID
  elements.id.readOnly = false;
  
  currentEditId = null;
  elements.formTitle.textContent = 'Nouvelle note';
  elements.submitBtn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
  elements.cancelBtn.style.display = 'none';
  hideAlert();
}

function cleanTagsForInput(tags) {
  if (!tags) return '';
  let t = String(tags).trim();
  if ((t.startsWith('[') && t.endsWith(']')) || t.includes('","')) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) return arr.join(', ');
    } catch (e) {}
  }
  if ((t.startsWith('"') && t.endsWith('"'))) t = t.slice(1, -1).trim();
  return t;
}

function editNote(id) {
  const note = notes.find(n => String(n.id) === String(id));
  if (!note) return;
  
  elements.id.value = note.id;
  // Verrouiller l'ID en édition pour ne pas le changer
  elements.id.readOnly = true;
  
  elements.noteContent.value = note.content || '';
  elements.noteMetadata.value = note.metadata || '';
  elements.noteTags.value = cleanTagsForInput(note.tags || '');
  elements.noteTomorrow.value = note.tomorrow || '';

  if (note.weather) {
    const wRadio = document.querySelector(`input[name="noteWeather"][value="${note.weather}"]`);
    if(wRadio) wRadio.checked = true;
  }
  
  if (note.mood) {
    const mRadio = document.querySelector(`input[name="noteMood"][value="${note.mood}"]`);
    if(mRadio) mRadio.checked = true;
  }

  currentEditId = note.id;
  elements.formTitle.textContent = 'Modifier la note';
  elements.submitBtn.innerHTML = '<i class="fas fa-save"></i> Mettre à jour';
  elements.cancelBtn.style.display = 'inline-flex';
  
  elements.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleSubmit(e) {
  e.preventDefault();
  
  const noteData = {
    id: elements.id.value.trim(),
    content: elements.noteContent.value.trim(),
    metadata: elements.noteMetadata.value.trim(),
    tags: elements.noteTags.value.trim(),
    weather: document.querySelector('input[name="noteWeather"]:checked')?.value,
    mood: document.querySelector('input[name="noteMood"]:checked')?.value,
    tomorrow: elements.noteTomorrow.value.trim()
  };
  
  elements.submitBtn.disabled = true;
  elements.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement...';
  
  try {
    if (currentEditId) {
      await updateNote(currentEditId, noteData);
      showToast('Modification enregistrée', 'success');
    } else {
      await createNote(noteData);
      showToast('Note créée', 'success');
    }
    await loadNotes();
    resetForm();
  } catch (error) {
    // Erreur déjà gérée dans les fonctions (alert ou console)
    console.error(error);
  } finally {
    elements.submitBtn.disabled = false;
    elements.submitBtn.innerHTML = currentEditId 
      ? '<i class="fas fa-save"></i> Mettre à jour'
      : '<i class="fas fa-save"></i> Enregistrer';
  }
}

function confirmDelete(id) {
  if (confirm(`Supprimer la note "${id}" ?`)) {
    handleDelete(id);
  }
}

async function handleDelete(id) {
  try {
    await deleteNote(id);
    if (currentEditId === id) resetForm();
    await loadNotes();
  } catch (error) {
    console.error(error);
  }
}

// ============================================
// GESTION CONNECTIVITÉ
// ============================================

function handleOnline() {
  isOnline = true;
  updateConnectionStatus();
  showToast('Connexion rétablie', 'success');
  processPendingActions();
}

function handleOffline() {
  isOnline = false;
  updateConnectionStatus();
  showToast('Mode hors ligne', 'info');
}

// ============================================
// INITIALISATION
// ============================================

async function init() {
  console.log('🚀 Démarrage...');
  
  // 1. Enregistrer le Service Worker (CRUCIAL pour PWA et icônes)
  await registerServiceWorker();

  try {
    await dbManager.init();
    updateConnectionStatus();
    
    // Listeners
    elements.form.addEventListener('submit', handleSubmit);
    elements.cancelBtn.addEventListener('click', resetForm);
    elements.refreshBtn.addEventListener('click', loadNotes);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Chargement initial
    await loadNotes();
    
  } catch (error) {
    console.error('Erreur init:', error);
  }
}

// Démarrage
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Exports globaux
window.editNote = editNote;
window.confirmDelete = confirmDelete;
