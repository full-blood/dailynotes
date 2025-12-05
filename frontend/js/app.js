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

// On stocke les références pour ne pas les chercher à chaque fois
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

// Vérifier que les éléments essentiels existent
const requiredElements = ['form', 'formTitle', 'id', 'submitBtn', 'notesList'];
const missingElements = requiredElements.filter(key => !elements[key]);

if (missingElements.length > 0) {
  console.error('❌ Éléments manquants dans le DOM:', missingElements);
  throw new Error(`Éléments DOM manquants: ${missingElements.join(', ')}`);
}

console.log('✅ Tous les éléments DOM essentiels sont trouvés');

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Affiche ou cache le spinner de chargement
 * @param {boolean} show - true pour afficher, false pour cacher
 */
function showLoading(show) {
  elements.loading.style.display = show ? 'block' : 'none';
}

/**
 * Affiche ou cache le message "Aucune note"
 * @param {boolean} show - true pour afficher, false pour cacher
 */
function showEmptyState(show) {
  elements.emptyState.style.display = show ? 'block' : 'none';
}

/**
 * Met à jour le compteur de notes
 */
function updateNotesCount() {
  elements.notesCount.textContent = notes.length;
}

/**
 * Formate une date ISO en format lisible
 * @param {string} isoDate - Date au format ISO (ex: 2024-01-15T10:30:00.000Z)
 * @returns {string} - Date formatée (ex: 15/01/2024 à 10:30)
 */
function formatDate(isoDate) {
  const date = new Date(isoDate);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} à ${hours}:${minutes}`;
}

/**
 * Affiche une notification toast
 * @param {string} message - Message à afficher
 * @param {string} type - 'success', 'error', ou 'info'
 */
function showToast(message, type = 'info') {
  // On créera un vrai système de notification plus tard
  // Pour l'instant, juste console.log
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  // Vous pouvez aussi utiliser alert() temporairement
  // alert(message);
}

// ============================================
// API - COMMUNICATION AVEC LE BACKEND
// ============================================

/**
 * Récupère toutes les notes depuis l'API
 * @returns {Promise<Array>} - Tableau de notes
 */
async function fetchNotes() {
  try {
    const response = await fetch(`${API_URL}/notes`);
    
    // Vérifier si la requête a réussi (status 200-299)
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
    
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des notes:', error);
    showToast('Impossible de charger les notes', 'error');
    throw error;
  }
}

/**
 * Crée une nouvelle note
 * @param {Object} noteData - Données de la note {title, content, tags}
 * @returns {Promise<Object>} - Note créée avec son ID
 */
/* async function createNote(noteData) {
  try {
    const response = await fetch(`${API_URL}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // Indique qu'on envoie du JSON
      },
      body: JSON.stringify(noteData)
      // Convertit l'objet JavaScript en chaîne JSON
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
    
  } catch (error) {
    console.error('❌ Erreur lors de la création:', error);
    showToast('Impossible de créer la note', 'error');
    throw error;
  }
} */

  async function createNote(noteData) {
  console.log('[createNote] payload envoyé :', noteData);

  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noteData),
  });

  console.log('[createNote] statut :', response.status);
  const text = await response.text();
  console.log('[createNote] réponse brute :', text);

  if (!response.ok) {
	let message = "Erreur inconnue";
	try {
      const json = JSON.parse(text);
      message = json.error || message;
    } catch(e) {	
      message = text || message;
    }
	// Message adapté pour le cas du doublon
    if (response.status === 409) {
      showAlert("Une note existe déjà pour cette date. Choisissez une autre date.", "error");
    } else {
      showAlert(message);
    }

    throw new Error(`HTTP ${response.status} – ${text}`);
	throw new Error(message);
  }

  return JSON.parse(text);
}

/**
 * Met à jour une note existante
 * @param {number} id - ID de la note
 * @param {Object} noteData - Nouvelles données
 * @returns {Promise<Object>} - Note mise à jour
 */
async function updateNote(id, noteData) {
  try {
    const response = await fetch(`${API_URL}/notes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(noteData)
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
    
  } catch (error) {
    console.error('❌ Erreur lors de la modification:', error);
    showToast('Impossible de modifier la note', 'error');
    throw error;
  }
}

/** Affiche une boîte d'alerte avec un message*/
function showAlert(message) {
  const box = document.getElementById('alertBox');
  const msg = document.getElementById('alertMessage');

  msg.textContent = message;
  box.style.display = 'flex';

  // Auto-hide après 5 secondes (optionnel)
  setTimeout(() => {
    box.style.display = 'none';
  }, 5000);
}

function hideAlert() {
  const box = document.getElementById('alertBox');
  box.style.display = 'none';
}


/**
 * Supprime une note
 * @param {number} id - ID de la note à supprimer
 * @returns {Promise<void>}
 */
async function deleteNote(id) {
  try {
    const response = await fetch(`${API_URL}/notes/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    // DELETE renvoie 204 No Content (pas de body)
    return;
    
  } catch (error) {
    console.error('❌ Erreur lors de la suppression:', error);
    showToast('Impossible de supprimer la note', 'error');
    throw error;
  }
}

// ============================================
// RENDU - AFFICHAGE DES NOTES
// ============================================

/**
 * Crée le HTML d'une carte de note
 * @param {Object} note - Objet note
 * @returns {string} - HTML de la carte
 */
function createNoteCardHTML(note) {
  // Nettoyer les tags (supprimer les guillemets parasites)
  let tagsString = note.tags || '';

  // Supprimer les guillemets JSON si présents
  if (tagsString.startsWith('"') && tagsString.endsWith('"')) {
    tagsString = tagsString.slice(1, -1); // Enlever premier et dernier caractère
  }  

  // Séparer les tags (chaîne -> tableau)
  const tagsArray = tagsString 
    ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag)
    : [];
  
  // Générer le HTML des tags
  const tagsHTML = tagsArray.length > 0
    ? tagsArray.map(tag => `<span class="tag">${tag}</span>`).join('')
    : '';
  
  // Tronquer le contenu si trop long
  const maxLength = 150;
  let displayContent = note.content || '';
  if (displayContent.length > maxLength) {
    displayContent = displayContent.substring(0, maxLength) + '...';
  }
  
  return `
    <div class="note-card" data-id="${note.id}">
      <div class="note-card__header">
        <div class="note-card__actions">
          <button 
            class="btn btn--success" 
            onclick="editNote(${note.id})"
            title="Modifier"
          >
            <i class="fas fa-edit"></i>
          </button>
          <button 
            class="btn btn--danger" 
            onclick="confirmDelete(${note.id})"
            title="Supprimer"
          >
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      
      ${displayContent ? `
        <div class="note-card__content">${escapeHTML(displayContent)}</div>
      ` : ''}
      
      <div class="note-card__footer">
        <div class="note-card__tags">
          ${tagsHTML}
        </div>
        <time datetime="${note.id}">
          ${note.id}
        </time>
      </div>
    </div>
  `;
}

/**
 * Échappe les caractères HTML pour éviter les failles XSS
 * @param {string} text - Texte à échapper
 * @returns {string} - Texte sécurisé
 */
function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Affiche toutes les notes dans le DOM
 */
function renderNotes() {
  // Vider la liste actuelle
  elements.notesList.innerHTML = '';
  
  // Si aucune note
  if (notes.length === 0) {
    showEmptyState(true);
    updateNotesCount();
    return;
  }
  
  showEmptyState(false);
  
  // Trier les notes : les plus récentes en premier
  const sortedNotes = [...notes].sort((a, b) => {
    return new Date(b.created_at) - new Date(a.created_at);
  });
  
  // Créer le HTML de chaque note
  sortedNotes.forEach(note => {
    elements.notesList.insertAdjacentHTML('beforeend', createNoteCardHTML(note));
  });
  
  updateNotesCount();
}

/**
 * Charge et affiche les notes depuis l'API
 */
async function loadNotes() {
  showLoading(true);
  
  try {
    notes = await fetchNotes();
    renderNotes();
    showToast(`${notes.length} note(s) chargée(s)`, 'success');
  } catch (error) {
    // L'erreur est déjà loggée dans fetchNotes()
  } finally {
    showLoading(false);
  }
}

// ============================================
// FORMULAIRE - CRÉATION/ÉDITION
// ============================================

/**
 * Réinitialise le formulaire en mode "création"
 */
function resetForm() {
  elements.form.reset();              // Vide tous les champs
  elements.id.value = '';         // Pas d'ID = mode création
  currentEditId = null;
  
  // Interface
  elements.formTitle.textContent = 'Nouvelle note';
  elements.submitBtn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
  elements.cancelBtn.style.display = 'none';
  
  hideAlert();//cache l'alerte doublons.f
  // Focus sur le premier champ
  //elements.noteTitle.focus();
}

//nettoie les tags pour l'affichage dans le formulaire
function cleanTagsForInput(tags) {
  if (!tags) return '';

  let t = String(tags).trim();

  // Si c'est du JSON (ex: '["tag1","tag2"]'), on essaie de parser
  if ((t.startsWith('[') && t.endsWith(']')) || t.includes('","')) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) {
        return arr.join(', ');
      }
    } catch (e) {
      // on ignore l'erreur, on tombera sur le nettoyage simple plus bas
    }
  }

  // Si la chaîne est entourée de guillemets ("tag1, tag2")
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }

  return t;
}

/**
 * Passe le formulaire en mode "édition"
 * @param {number} id - ID de la note à éditer
 */
function editNote(id) {
  // Trouver la note dans le tableau
  const note = notes.find(n => String(n.id) === String(id));
  
  if (!note) {
    alert('Note introuvable', 'error');
    return;
  }
  
  // Remplir le formulaire
  elements.id.value = note.id;
  elements.noteContent.value = note.content || '';
  elements.noteMetadata.value = note.metadata || '';
  elements.noteTags.value = cleanTagsForInput(note.tags || '');
  elements.noteWeather.value = note.weather ||'';
  elements.noteMood.value = note.mood || '';
  elements.noteTomorrow.value = note.tomorrow || '';


	// ✅ Cocher le bon bouton "weather"
	const weatherValue = note.weather != null ? String(note.weather) : null;
	document.querySelectorAll('input[name="noteWeather"]').forEach(input => {
		input.checked = weatherValue !== null && String(input.value) === weatherValue;
	});

	// ✅ Cocher le bon bouton "mood"
	const moodValue = note.mood != null ? String(note.mood) : null;
	document.querySelectorAll('input[name="noteMood"]').forEach(input => {
		input.checked = moodValue !== null && String(input.value) === moodValue;
	});

  currentEditId = note.id;
  
  // Interface
  elements.formTitle.textContent = 'Modifier la note';
  elements.submitBtn.innerHTML = '<i class="fas fa-save"></i> Mettre à jour';
  elements.cancelBtn.style.display = 'inline-flex';
  
  // Scroller vers le formulaire
  elements.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  // Focus sur le titre
  elements.noteContent.focus();
}

/**
 * Gère la soumission du formulaire (création ou modification)
 * @param {Event} e - Événement de soumission
 */
async function handleSubmit(e) {
  e.preventDefault();  // Empêche le rechargement de la page
  
  // Récupérer les valeurs du formulaire
  const noteData = {
    //title: elements.noteTitle.value.trim(),
	id: elements.id.value.trim(),
    content: elements.noteContent.value.trim(),
	metadata: elements.noteMetadata.value.trim(),
    tags: elements.noteTags.value.trim(),
    weather: document.querySelector('input[name="noteWeather"]:checked')?.value,
    mood : document.querySelector('input[name="noteMood"]:checked')?.value,
	tomorrow: elements.noteTomorrow.value.trim()
  };
  
  // Désactiver le bouton pendant l'envoi
  elements.submitBtn.disabled = true;
  elements.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';
  
  try {
    if (currentEditId) {
      // MODE ÉDITION
      await updateNote(currentEditId, noteData);
      showToast('Note modifiée avec succès', 'success');
    } else {
      // MODE CRÉATION
      await createNote(noteData);
      showToast('Note créée avec succès', 'success');
    }
    
    // Recharger les notes
    await loadNotes();
    
    // Réinitialiser le formulaire
    resetForm();
    
  } catch (error) {
    // L'erreur est déjà gérée dans createNote()/updateNote()
  } finally {
    // Réactiver le bouton
    elements.submitBtn.disabled = false;
    elements.submitBtn.innerHTML = currentEditId 
      ? '<i class="fas fa-save"></i> Mettre à jour'
      : '<i class="fas fa-save"></i> Enregistrer';
  }
}

/**
 * Demande confirmation avant de supprimer
 * @param {number} id - ID de la note à supprimer
 */
function confirmDelete(id) {
  const note = notes.find(n => String(n.id) === String(id));
  
  if (!note) return;
  
  // Utiliser confirm() pour l'instant (on fera mieux plus tard)
  const confirmed = confirm(
    `Êtes-vous sûr de vouloir supprimer la note du :\n\n"${note.id}" ?`
  );
  
  if (confirmed) {
    handleDelete(id);
  }
}

/**
 * Supprime une note
 * @param {number} id - ID de la note à supprimer
 */
async function handleDelete(id) {
  try {
    await deleteNote(id);
    showToast('Note supprimée', 'success');
    
    // Si on était en train d'éditer cette note, reset le formulaire
    if (currentEditId === id) {
      resetForm();
    }
    
    // Recharger les notes
    await loadNotes();
    
  } catch (error) {
    // L'erreur est déjà gérée dans deleteNote()
  }
}

// ============================================
// EVENT LISTENERS - ÉCOUTE DES ÉVÉNEMENTS
// ============================================

/**
 * Initialise tous les écouteurs d'événements
 */
function initEventListeners() {
  // Soumission du formulaire
  elements.form.addEventListener('submit', handleSubmit);
  
  // Bouton annuler
  elements.cancelBtn.addEventListener('click', () => {
    resetForm();
  });
  
  // Bouton refresh
  elements.refreshBtn.addEventListener('click', () => {
    loadNotes();
  });
}

// ============================================
// INITIALISATION - POINT D'ENTRÉE
// ============================================

/**
 * Fonction principale appelée au chargement de la page
 */
async function init() {
  console.log('🚀 Initialisation de Daily Notes...');
  
  // 1. Initialiser les event listeners
  initEventListeners();
  
  // 2. Charger les notes
  await loadNotes();
  
  // 3. Focus sur le premier champ
  //elements.noteTitle.focus();
  
  console.log('✅ Application prête !');
}

// ============================================
// DÉMARRAGE
// ============================================

// Attendre que le DOM soit complètement chargé
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // Le DOM est déjà chargé
  init();
}

// Exposer les fonctions globalement pour les onclick dans le HTML
window.editNote = editNote;
window.confirmDelete = confirmDelete;