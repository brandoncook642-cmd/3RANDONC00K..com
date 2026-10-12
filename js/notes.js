const NOTES_DB_NAME = 'brandon-study-library';
const NOTES_DB_VERSION = 3;

const courseSelect = document.querySelector('#notes-course-select');
const searchInput = document.querySelector('#note-search-input');
const notesList = document.querySelector('#notes-list');
const noteCount = document.querySelector('#note-count');
const noteEditor = document.querySelector('#note-editor');
const emptyState = document.querySelector('#notes-empty-state');
const titleInput = document.querySelector('#note-title-input');
const contentInput = document.querySelector('#note-content-input');
const preview = document.querySelector('#note-preview');
const previewButton = document.querySelector('#preview-note-button');
const exportButton = document.querySelector('#export-note-button');
const deleteButton = document.querySelector('#delete-note-button');
const deleteDialog = document.querySelector('#delete-note-dialog');
const saveState = document.querySelector('#save-state');
const noteCourseLabel = document.querySelector('#note-course-label');
const noteUpdatedLabel = document.querySelector('#note-updated-label');
const noteWordCount = document.querySelector('#note-word-count');
const notesStatus = document.querySelector('#notes-status');

let database;
let courses = [];
let courseNotes = [];
let activeNote = null;
let saveTimer;
let saveRevision = 0;
let isPreviewing = false;

document.body.classList.remove('page-entering', 'page-leaving');

function openNotesLibrary() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(NOTES_DB_NAME, NOTES_DB_VERSION);
        request.onupgradeneeded = () => {
            const library = request.result;
            if (!library.objectStoreNames.contains('courses')) {
                const store = library.createObjectStore('courses', { keyPath: 'id' });
                store.createIndex('name', 'name', { unique: true });
            }
            if (!library.objectStoreNames.contains('sources')) {
                library.createObjectStore('sources', { keyPath: 'id' }).createIndex('courseId', 'courseId');
            }
            if (!library.objectStoreNames.contains('notes')) {
                library.createObjectStore('notes', { keyPath: 'id' }).createIndex('courseId', 'courseId');
            }
            if (!library.objectStoreNames.contains('folders')) {
                library.createObjectStore('folders', { keyPath: 'id' }).createIndex('courseId', 'courseId');
            }
        };
        request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Close another A.S.G.A.R.D. tab to finish updating the notes library.'));
    });
}

function storeRequest(storeName, mode, operation) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const request = operation(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

function allRecords(storeName) {
    return storeRequest(storeName, 'readonly', (store) => store.getAll());
}

function setSaveState(message, state = '') {
    saveState.textContent = message;
    saveState.dataset.state = state;
    notesStatus.textContent = message;
}

function formatDate(timestamp) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        .format(new Date(timestamp));
}

function wordCount(text) {
    const words = text.trim().match(/\S+/g) || [];
    return `${words.length} ${words.length === 1 ? 'word' : 'words'}`;
}

function updateWordCount() {
    noteWordCount.textContent = wordCount(contentInput.value);
}

function renderNoteList() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = courseNotes.filter((note) =>
        `${note.title}\n${note.body}`.toLowerCase().includes(query)
    );
    noteCount.textContent = String(filtered.length);
    notesList.replaceChildren();

    if (!filtered.length) {
        const empty = document.createElement('p');
        empty.className = 'notes-list-empty';
        empty.textContent = query ? 'No notes match your search.' : 'No notes in this course yet.';
        notesList.append(empty);
    }

    for (const note of filtered) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `note-list-item${note.id === activeNote?.id ? ' active' : ''}`;
        button.setAttribute('aria-current', note.id === activeNote?.id ? 'true' : 'false');

        const title = document.createElement('span');
        title.className = 'note-list-title';
        title.textContent = note.title || 'Untitled note';
        const body = document.createElement('span');
        body.className = 'note-list-preview';
        body.textContent = note.body.trim().replace(/\s+/g, ' ') || 'No text yet';
        const date = document.createElement('span');
        date.className = 'note-list-date';
        date.textContent = formatDate(note.updatedAt);
        button.append(title, body, date);
        button.addEventListener('click', () => selectNote(note.id));
        notesList.append(button);
    }
}

async function loadCourseNotes() {
    const request = database.transaction('notes', 'readonly')
        .objectStore('notes').index('courseId').getAll(courseSelect.value);
    courseNotes = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result.sort((first, second) => second.updatedAt - first.updatedAt));
        request.onerror = () => reject(request.error);
    });
    renderNoteList();
}

function showEditor(note) {
    activeNote = note;
    isPreviewing = false;
    noteEditor.hidden = !note;
    emptyState.hidden = Boolean(note);
    preview.hidden = true;
    contentInput.hidden = false;
    previewButton.innerHTML = '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
    previewButton.title = 'Reading view';
    previewButton.setAttribute('aria-label', 'Reading view');
    previewButton.disabled = !note;
    exportButton.disabled = !note;
    deleteButton.disabled = !note;

    if (note) {
        titleInput.value = note.title;
        contentInput.value = note.body;
        noteCourseLabel.textContent = courses.find((course) => course.id === note.courseId)?.name || 'Course';
        noteUpdatedLabel.textContent = `Edited ${formatDate(note.updatedAt)}`;
        setSaveState(`Saved ${formatDate(note.updatedAt)}`, 'saved');
        updateWordCount();
    } else {
        titleInput.value = '';
        contentInput.value = '';
        noteCourseLabel.textContent = '';
        noteUpdatedLabel.textContent = '';
        noteWordCount.textContent = '0 words';
        setSaveState('No note selected');
    }
    renderNoteList();
}

async function selectNote(noteId) {
    clearTimeout(saveTimer);
    if (activeNote) await saveCurrentNote();
    const note = courseNotes.find((item) => item.id === noteId);
    showEditor(note || null);
}

async function saveCurrentNote() {
    if (!activeNote) return;
    const revision = ++saveRevision;
    const note = {
        ...activeNote,
        title: titleInput.value.trim() || 'Untitled note',
        body: contentInput.value,
        updatedAt: Date.now()
    };
    setSaveState('Saving...', 'saving');

    try {
        await storeRequest('notes', 'readwrite', (store) => store.put(note));
        if (revision !== saveRevision || activeNote.id !== note.id) return;
        activeNote = note;
        const index = courseNotes.findIndex((item) => item.id === note.id);
        if (index === -1) courseNotes.unshift(note);
        else courseNotes[index] = note;
        courseNotes.sort((first, second) => second.updatedAt - first.updatedAt);
        noteUpdatedLabel.textContent = `Edited ${formatDate(note.updatedAt)}`;
        setSaveState(`Saved ${formatDate(note.updatedAt)}`, 'saved');
        renderNoteList();
    } catch (error) {
        setSaveState('Could not save note', 'error');
        notesStatus.textContent = error instanceof Error ? error.message : 'Could not save note';
    }
}

function scheduleSave() {
    updateWordCount();
    if (isPreviewing || !activeNote) return;
    clearTimeout(saveTimer);
    setSaveState('Unsaved changes', 'saving');
    saveTimer = setTimeout(saveCurrentNote, 500);
}

async function createNote() {
    clearTimeout(saveTimer);
    if (activeNote) await saveCurrentNote();
    const now = Date.now();
    const note = {
        id: crypto.randomUUID(),
        courseId: courseSelect.value,
        title: 'Untitled note',
        body: '',
        createdAt: now,
        updatedAt: now
    };
    await storeRequest('notes', 'readwrite', (store) => store.add(note));
    courseNotes.unshift(note);
    showEditor(note);
    titleInput.focus();
    titleInput.select();
    setSaveState('New note');
}

function togglePreview() {
    if (!activeNote) return;
    if (!isPreviewing) {
        clearTimeout(saveTimer);
        saveCurrentNote();
        preview.textContent = contentInput.value || 'Nothing written yet.';
        contentInput.hidden = true;
        preview.hidden = false;
        previewButton.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
        previewButton.title = 'Edit note';
        previewButton.setAttribute('aria-label', 'Edit note');
        isPreviewing = true;
    } else {
        preview.hidden = true;
        contentInput.hidden = false;
        previewButton.innerHTML = '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
        previewButton.title = 'Reading view';
        previewButton.setAttribute('aria-label', 'Reading view');
        isPreviewing = false;
        contentInput.focus();
    }
}

function exportCurrentNote() {
    if (!activeNote) return;
    const title = titleInput.value.trim() || 'Untitled note';
    const blob = new Blob([`# ${title}\n\n${contentInput.value}`], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 100)}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function deleteCurrentNote() {
    if (!activeNote) return;
    const deletedId = activeNote.id;
    clearTimeout(saveTimer);
    saveRevision++;
    await storeRequest('notes', 'readwrite', (store) => store.delete(deletedId));
    courseNotes = courseNotes.filter((note) => note.id !== deletedId);
    showEditor(null);
    setSaveState('Note deleted');
}

async function initializeNotes() {
    database = await openNotesLibrary();
    courses = await allRecords('courses');
    if (!courses.length) {
        const course = { id: crypto.randomUUID(), name: 'My course' };
        await storeRequest('courses', 'readwrite', (store) => store.add(course));
        courses = [course];
    }
    courses.sort((first, second) => first.name.localeCompare(second.name));

    for (const course of courses) {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = course.name;
        courseSelect.append(option);
    }
    const savedCourse = localStorage.getItem('study-course-id');
    courseSelect.value = courses.some((course) => course.id === savedCourse) ? savedCourse : courses[0].id;
    await loadCourseNotes();
    showEditor(null);
}

document.querySelector('#new-note-button').addEventListener('click', createNote);
document.querySelector('#empty-new-note-button').addEventListener('click', createNote);
titleInput.addEventListener('input', scheduleSave);
contentInput.addEventListener('input', scheduleSave);
searchInput.addEventListener('input', renderNoteList);
courseSelect.addEventListener('change', async () => {
    clearTimeout(saveTimer);
    if (activeNote) await saveCurrentNote();
    localStorage.setItem('study-course-id', courseSelect.value);
    await loadCourseNotes();
    showEditor(null);
});
previewButton.addEventListener('click', togglePreview);
exportButton.addEventListener('click', exportCurrentNote);
deleteButton.addEventListener('click', () => deleteDialog.showModal());
deleteDialog.addEventListener('close', () => {
    if (deleteDialog.returnValue === 'delete') deleteCurrentNote();
});

document.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        clearTimeout(saveTimer);
        saveCurrentNote();
    }
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        createNote();
    }
});

initializeNotes().catch((error) => {
    console.error('Notes could not be initialized', error);
    setSaveState('Notes unavailable', 'error');
    notesStatus.textContent = error instanceof Error ? error.message : 'Browser storage is unavailable';
});