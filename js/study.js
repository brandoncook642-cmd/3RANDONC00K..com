const DB_NAME = 'brandon-study-library';
const DB_VERSION = 3;
const MAX_SOURCES_PER_COURSE = 12;
const MAX_SELECTED_SOURCES = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SELECTED_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 250 * 1024;

const courseSelect = document.querySelector('#course-select');
const courseTitle = document.querySelector('#course-title');
const sourceInput = document.querySelector('#source-input');
const sourceList = document.querySelector('#source-list');
const sourceCount = document.querySelector('#source-count');
const sourceFolderFilter = document.querySelector('#source-folder-filter');
const sourceFolderDialog = document.querySelector('#source-folder-dialog');
const sourceFolderForm = document.querySelector('#source-folder-form');
const sourceFolderNameInput = document.querySelector('#source-folder-name');
const sourceFolderDialogTitle = document.querySelector('#source-folder-dialog-title');
const sourceFolderDialogKicker = document.querySelector('#source-folder-dialog-kicker');
const sourceFolderDialogStatus = document.querySelector('#source-folder-dialog-status');
const deleteSourceFolderDialog = document.querySelector('#delete-source-folder-dialog');
const selectionStatus = document.querySelector('#selection-status');
const questionForm = document.querySelector('#question-form');
const questionInput = document.querySelector('#question-input');
const sendButton = document.querySelector('#send-button');
const conversation = document.querySelector('#conversation');
const welcomeMessage = document.querySelector('#welcome-message');
const studyStatus = document.querySelector('#study-status');
const courseDialog = document.querySelector('#course-dialog');
const courseForm = document.querySelector('#course-form');
const courseNameInput = document.querySelector('#course-name');
const renameCourseButton = document.querySelector('#rename-course-button');
const renameCourseDialog = document.querySelector('#rename-course-dialog');
const renameCourseNameInput = document.querySelector('#rename-course-name');
const courseRenameStatus = document.querySelector('#course-rename-status');
const studyHistory = [];
let database;
let activeSources = [];
let activeFolders = [];
let selectedSourceIds = new Set();
let isBusy = false;
let courseRenameTimer;
let courseRenameRevision = 0;
let folderDialogMode = 'create';
let editingFolderId = null;

document.body.classList.remove('page-entering', 'page-leaving');

function openLibrary() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
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
    });
}

function runStore(storeName, mode, operation) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const request = operation(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

function allRecords(storeName) {
    return runStore(storeName, 'readonly', (store) => store.getAll());
}

function currentCourseId() {
    return courseSelect.value;
}

function setStatus(message) {
    studyStatus.textContent = message;
    selectionStatus.textContent = message;
}

function updateComposer() {
    const selectedCount = activeSources.filter((source) => selectedSourceIds.has(source.id)).length;
    const selectedPdfBytes = activeSources
        .filter((source) => selectedSourceIds.has(source.id) && source.mimeType === 'application/pdf')
        .reduce((total, source) => total + source.size, 0);
    const hasValidSelection = selectedCount > 0 &&
        selectedCount <= MAX_SELECTED_SOURCES &&
        selectedPdfBytes <= MAX_SELECTED_PDF_BYTES;

    sendButton.disabled = isBusy || !hasValidSelection;
    if (isBusy) {
        selectionStatus.textContent = 'Gemini is working...';
    } else if (selectedCount === 0) {
        selectionStatus.textContent = 'Select at least one source';
    } else if (selectedCount > MAX_SELECTED_SOURCES) {
        selectionStatus.textContent = `Select up to ${MAX_SELECTED_SOURCES} sources`;
    } else if (selectedPdfBytes > MAX_SELECTED_PDF_BYTES) {
        selectionStatus.textContent = 'Selected PDFs must total 8 MB or less';
    } else {
        selectionStatus.textContent = `${selectedCount} source${selectedCount === 1 ? '' : 's'} selected`;
    }
}

async function renderCourses(preferredId) {
    const courses = await allRecords('courses');
    courses.sort((first, second) => first.name.localeCompare(second.name));
    courseSelect.replaceChildren();

    for (const course of courses) {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = course.name;
        courseSelect.append(option);
    }

    const savedId = preferredId || localStorage.getItem('study-course-id');
    const nextId = courses.some((course) => course.id === savedId) ? savedId : courses[0]?.id;
    if (nextId) {
        courseSelect.value = nextId;
        localStorage.setItem('study-course-id', nextId);
        await loadSources();
    }
}

async function saveCourseName(revision) {
    const courseId = currentCourseId();
    const name = renameCourseNameInput.value.trim();
    if (!name) {
        courseRenameStatus.textContent = 'Enter a course name';
        courseRenameStatus.dataset.state = 'error';
        return;
    }

    const courses = await allRecords('courses');
    if (revision !== courseRenameRevision) return;
    if (courses.some((course) => course.id !== courseId && course.name.toLowerCase() === name.toLowerCase())) {
        courseRenameStatus.textContent = 'A course with that name already exists';
        courseRenameStatus.dataset.state = 'error';
        return;
    }

    const course = courses.find((record) => record.id === courseId);
    if (!course) return;
    if (course.name === name) {
        courseRenameStatus.textContent = 'Saved';
        courseRenameStatus.dataset.state = 'saved';
        return;
    }

    await runStore('courses', 'readwrite', (store) => store.put({ ...course, name, updatedAt: Date.now() }));
    if (revision !== courseRenameRevision) return;
    const selectedOption = [...courseSelect.options].find((option) => option.value === courseId);
    if (selectedOption) selectedOption.textContent = name;
    courseTitle.textContent = name;
    renameCourseNameInput.value = name;
    courseRenameStatus.textContent = 'Saved';
    courseRenameStatus.dataset.state = 'saved';
}

function scheduleCourseNameSave() {
    const revision = ++courseRenameRevision;
    clearTimeout(courseRenameTimer);
    courseRenameStatus.textContent = 'Saving...';
    courseRenameStatus.dataset.state = 'saving';
    courseRenameTimer = setTimeout(() => {
        saveCourseName(revision).catch((error) => {
            courseRenameStatus.textContent = error instanceof Error ? error.message : 'Could not save course name';
            courseRenameStatus.dataset.state = 'error';
        });
    }, 450);
}

async function openRenameCourseDialog() {
    const course = (await allRecords('courses')).find((record) => record.id === currentCourseId());
    if (!course) return;
    clearTimeout(courseRenameTimer);
    courseRenameRevision++;
    renameCourseNameInput.value = course.name;
    courseRenameStatus.textContent = 'Saved';
    courseRenameStatus.dataset.state = 'saved';
    renameCourseDialog.showModal();
    renameCourseNameInput.focus();
    renameCourseNameInput.select();
}

async function loadSources() {
    const courses = await allRecords('courses');
    const course = courses.find((record) => record.id === currentCourseId());
    courseTitle.textContent = course?.name || 'My course';

    const transaction = database.transaction(['sources', 'folders'], 'readonly');
    const sourceRequest = transaction.objectStore('sources').index('courseId').getAll(currentCourseId());
    const folderRequest = transaction.objectStore('folders').index('courseId').getAll(currentCourseId());
    [activeSources, activeFolders] = await Promise.all([
        new Promise((resolve, reject) => {
            sourceRequest.onsuccess = () => resolve(sourceRequest.result.sort((first, second) => first.name.localeCompare(second.name)));
            sourceRequest.onerror = () => reject(sourceRequest.error);
        }),
        new Promise((resolve, reject) => {
            folderRequest.onsuccess = () => resolve(folderRequest.result.sort((first, second) => first.name.localeCompare(second.name)));
            folderRequest.onerror = () => reject(folderRequest.error);
        })
    ]);
    selectedSourceIds = new Set(activeSources.map((source) => source.id));
    populateSourceFolderFilter();
    renderSources();
}

function currentFolderStorageKey() {
    return `study-source-folder:${currentCourseId()}`;
}

function sourceFolder(source) {
    return activeFolders.some((folder) => folder.id === source.folderId) ? source.folderId : null;
}

function populateSourceFolderFilter() {
    const savedFolder = localStorage.getItem(currentFolderStorageKey()) || 'all';
    const unfiledCount = activeSources.filter((source) => !sourceFolder(source)).length;
    const options = [
        { value: 'all', label: `All sources (${activeSources.length})` },
        { value: 'unfiled', label: `Unfiled (${unfiledCount})` },
        ...activeFolders.map((folder) => ({
            value: folder.id,
            label: `${folder.name} (${activeSources.filter((source) => sourceFolder(source) === folder.id).length})`
        }))
    ];
    sourceFolderFilter.replaceChildren();

    for (const item of options) {
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        sourceFolderFilter.append(option);
    }

    sourceFolderFilter.value = options.some((option) => option.value === savedFolder) ? savedFolder : 'all';
    const isCustomFolder = activeFolders.some((folder) => folder.id === sourceFolderFilter.value);
    document.querySelector('#rename-source-folder-button').disabled = !isCustomFolder;
    document.querySelector('#delete-source-folder-button').disabled = !isCustomFolder;
}

function renderSources() {
    const currentFolder = sourceFolderFilter.value;
    const visibleSources = activeSources.filter((source) => {
        if (currentFolder === 'all') return true;
        if (currentFolder === 'unfiled') return !sourceFolder(source);
        return sourceFolder(source) === currentFolder;
    });
    sourceCount.textContent = String(visibleSources.length);
    sourceList.replaceChildren();

    if (!visibleSources.length) {
        const empty = document.createElement('p');
        empty.className = 'source-empty';
        empty.textContent = activeSources.length
            ? 'No sources in this folder yet.'
            : 'No sources in this course yet.';
        sourceList.append(empty);
    }

    for (const source of visibleSources) {
        const row = document.createElement('div');
        row.className = 'source-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedSourceIds.has(source.id);
        checkbox.setAttribute('aria-label', `Use ${source.name}`);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) selectedSourceIds.add(source.id);
            else selectedSourceIds.delete(source.id);
            updateComposer();
        });

        const name = document.createElement('span');
        name.className = 'source-name';
        name.title = source.name;
        name.textContent = source.name;
        const type = document.createElement('span');
        type.className = 'source-type';
        type.textContent = source.mimeType === 'application/pdf' ? 'PDF' : 'TEXT';
        const label = document.createElement('div');
        label.append(name, type);

        const folderSelect = document.createElement('select');
        folderSelect.className = 'source-folder-select';
        folderSelect.setAttribute('aria-label', `Folder for ${source.name}`);
        const unfiledOption = document.createElement('option');
        unfiledOption.value = '';
        unfiledOption.textContent = 'Unfiled';
        folderSelect.append(unfiledOption);
        for (const folder of activeFolders) {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            folderSelect.append(option);
        }
        folderSelect.value = sourceFolder(source) || '';
        folderSelect.addEventListener('change', async () => {
            const updatedSource = { ...source, folderId: folderSelect.value || null };
            await runStore('sources', 'readwrite', (store) => store.put(updatedSource));
            activeSources = activeSources.map((item) => item.id === source.id ? updatedSource : item);
            populateSourceFolderFilter();
            renderSources();
        });

        const remove = document.createElement('button');
        remove.className = 'remove-source';
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove ${source.name}`);
        remove.title = `Remove ${source.name}`;
        remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        remove.addEventListener('click', async () => {
            await runStore('sources', 'readwrite', (store) => store.delete(source.id));
            await loadSources();
            setStatus(`${source.name} removed`);
        });

        row.append(checkbox, label, folderSelect, remove);
        sourceList.append(row);
    }

    updateComposer();
}

function openSourceFolderDialog(mode) {
    folderDialogMode = mode;
    editingFolderId = mode === 'rename' ? sourceFolderFilter.value : null;
    const folder = activeFolders.find((item) => item.id === editingFolderId);
    if (mode === 'rename' && !folder) return;

    sourceFolderDialogKicker.textContent = mode === 'rename' ? 'EDIT FOLDER' : 'NEW FOLDER';
    sourceFolderDialogTitle.textContent = mode === 'rename' ? 'Rename folder' : 'Add source folder';
    sourceFolderNameInput.value = folder?.name || '';
    sourceFolderDialogStatus.textContent = '';
    sourceFolderDialogStatus.dataset.state = '';
    sourceFolderDialog.showModal();
    sourceFolderNameInput.focus();
}

async function saveSourceFolder(event) {
    event.preventDefault();
    const name = sourceFolderNameInput.value.trim();
    if (!name) {
        sourceFolderDialogStatus.textContent = 'Enter a folder name';
        sourceFolderDialogStatus.dataset.state = 'error';
        return;
    }

    const duplicate = activeFolders.some((folder) =>
        folder.id !== editingFolderId && folder.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
        sourceFolderDialogStatus.textContent = 'A folder with that name already exists';
        sourceFolderDialogStatus.dataset.state = 'error';
        return;
    }

    let folderId = editingFolderId;
    if (folderDialogMode === 'rename') {
        const folder = activeFolders.find((item) => item.id === editingFolderId);
        if (!folder) return;
        await runStore('folders', 'readwrite', (store) => store.put({ ...folder, name, updatedAt: Date.now() }));
    } else {
        folderId = crypto.randomUUID();
        await runStore('folders', 'readwrite', (store) => store.add({
            id: folderId,
            courseId: currentCourseId(),
            name,
            createdAt: Date.now()
        }));
    }

    localStorage.setItem(currentFolderStorageKey(), folderId);
    sourceFolderDialog.close();
    await loadSources();
    setStatus(`${name} ${folderDialogMode === 'rename' ? 'renamed' : 'created'}`);
}

function deleteFolderAndUnfileSources(folderId) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['folders', 'sources'], 'readwrite');
        const folders = transaction.objectStore('folders');
        const sources = transaction.objectStore('sources');
        const request = sources.index('courseId').getAll(currentCourseId());
        request.onsuccess = () => {
            for (const source of request.result) {
                if (sourceFolder(source) === folderId) {
                    sources.put({ ...source, folderId: null });
                }
            }
        };
        folders.delete(folderId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

async function deleteCurrentSourceFolder() {
    const folderId = sourceFolderFilter.value;
    const folder = activeFolders.find((item) => item.id === folderId);
    if (!folder) return;

    await deleteFolderAndUnfileSources(folderId);
    localStorage.setItem(currentFolderStorageKey(), 'unfiled');
    await loadSources();
    setStatus(`${folder.name} deleted; its sources were moved to Unfiled`);
}

async function addFiles(files) {
    if (!files.length) return;
    if (activeSources.length + files.length > MAX_SOURCES_PER_COURSE) {
        setStatus(`A course can contain up to ${MAX_SOURCES_PER_COURSE} sources`);
        return;
    }

    const additions = [];
    const selectedFolderId = activeFolders.some((folder) => folder.id === sourceFolderFilter.value)
        ? sourceFolderFilter.value
        : null;
    for (const file of files) {
        const extension = file.name.split('.').pop().toLowerCase();
        const isPdf = extension === 'pdf';
        const isText = ['txt', 'md'].includes(extension);
        if (!isPdf && !isText) {
            setStatus(`${file.name} is not a supported PDF or text file`);
            continue;
        }
        if (!file.size || file.size > MAX_FILE_BYTES) {
            setStatus(`${file.name} must be between 1 byte and 5 MB`);
            continue;
        }

        if (isPdf) {
            additions.push({
                id: crypto.randomUUID(),
                courseId: currentCourseId(),
                folderId: selectedFolderId,
                name: file.name,
                mimeType: 'application/pdf',
                size: file.size,
                blob: file.slice(0, file.size, 'application/pdf'),
                addedAt: Date.now()
            });
        } else {
            const text = await file.text();
            if (new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
                setStatus(`${file.name} must contain 250 KB or less of text`);
                continue;
            }
            additions.push({
                id: crypto.randomUUID(),
                courseId: currentCourseId(),
                folderId: selectedFolderId,
                name: file.name,
                mimeType: 'text/plain',
                size: file.size,
                text,
                addedAt: Date.now()
            });
        }
    }

    for (const source of additions) {
        await runStore('sources', 'readwrite', (store) => store.add(source));
    }
    await loadSources();
    if (additions.length) setStatus(`${additions.length} source${additions.length === 1 ? '' : 's'} added`);
}

async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
}

async function getRequestSources() {
    const chosen = activeSources.filter((source) => selectedSourceIds.has(source.id));
    return Promise.all(chosen.map(async (source) => ({
        name: source.name,
        mimeType: source.mimeType,
        ...(source.mimeType === 'application/pdf'
            ? { data: await blobToBase64(source.blob) }
            : { text: source.text })
    })));
}

function addMessage(text, role, isError = false) {
    welcomeMessage.hidden = true;
    const message = document.createElement('article');
    message.className = `study-message ${role}${isError ? ' error' : ''}`;
    const label = document.createElement('span');
    label.className = 'study-message-label';
    label.textContent = role === 'user' ? 'You' : 'Study assistant';
    const content = document.createElement('div');
    content.textContent = text;
    message.append(label, content);
    conversation.append(message);
    conversation.scrollTop = conversation.scrollHeight;
}

async function askQuestion(event) {
    event.preventDefault();
    const message = questionInput.value.trim();
    if (!message || sendButton.disabled) return;

    questionInput.value = '';
    addMessage(message, 'user');
    isBusy = true;
    updateComposer();
    const pending = document.createElement('article');
    pending.className = 'study-message assistant';
    pending.textContent = 'Reading your sources...';
    conversation.append(pending);

    try {
        const sources = await getRequestSources();
        const response = await fetch('/api/study', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                mode: document.querySelector('#study-mode').value,
                course: courseTitle.textContent,
                history: studyHistory.slice(-6),
                sources
            })
        });
        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error(`The study service returned an unexpected response (HTTP ${response.status}).`);
        }
        if (!response.ok) throw new Error(result.error || 'The study service is unavailable.');

        studyHistory.push({ role: 'user', text: message }, { role: 'model', text: result.answer });
        addMessage(result.answer, 'assistant');
        setStatus('Answer ready');
    } catch (error) {
        const errorMessage = error instanceof Error && error.message !== 'Failed to fetch'
            ? error.message
            : 'Could not reach the study service. Open the deployed site or run it through Wrangler.';
        addMessage(errorMessage, 'assistant', true);
        setStatus(errorMessage);
    } finally {
        pending.remove();
        isBusy = false;
        updateComposer();
        questionInput.focus();
    }
}

async function initialize() {
    database = await openLibrary();
    const courses = await allRecords('courses');
    if (!courses.length) {
        await runStore('courses', 'readwrite', (store) => store.add({ id: crypto.randomUUID(), name: 'My course' }));
    }
    await renderCourses();
}

document.querySelector('#add-files-button').addEventListener('click', () => sourceInput.click());
sourceInput.addEventListener('change', async () => {
    try {
        await addFiles([...sourceInput.files]);
    } catch (error) {
        setStatus(error instanceof Error ? error.message : 'The source could not be saved');
    }
    sourceInput.value = '';
});

sourceFolderFilter.addEventListener('change', () => {
    localStorage.setItem(currentFolderStorageKey(), sourceFolderFilter.value);
    populateSourceFolderFilter();
    renderSources();
});
document.querySelector('#add-source-folder-button').addEventListener('click', () => openSourceFolderDialog('create'));
document.querySelector('#rename-source-folder-button').addEventListener('click', () => openSourceFolderDialog('rename'));
document.querySelector('#delete-source-folder-button').addEventListener('click', () => deleteSourceFolderDialog.showModal());
document.querySelector('#cancel-source-folder-button').addEventListener('click', () => sourceFolderDialog.close());
sourceFolderForm.addEventListener('submit', (event) => {
    saveSourceFolder(event).catch((error) => {
        sourceFolderDialogStatus.textContent = error instanceof Error ? error.message : 'Could not save folder';
        sourceFolderDialogStatus.dataset.state = 'error';
    });
});
deleteSourceFolderDialog.addEventListener('close', () => {
    if (deleteSourceFolderDialog.returnValue !== 'delete') return;
    deleteCurrentSourceFolder().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Could not delete folder');
    });
});

courseSelect.addEventListener('change', async () => {
    localStorage.setItem('study-course-id', currentCourseId());
    studyHistory.length = 0;
    conversation.querySelectorAll('.study-message').forEach((message) => message.remove());
    welcomeMessage.hidden = false;
    await loadSources();
});

document.querySelector('#new-course-button').addEventListener('click', () => {
    courseForm.reset();
    courseDialog.showModal();
    courseNameInput.focus();
});
document.querySelector('#cancel-course-button').addEventListener('click', () => courseDialog.close());
courseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = courseNameInput.value.trim();
    if (!name) return;
    const exists = (await allRecords('courses')).some((course) => course.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        setStatus('A course with that name already exists');
        return;
    }
    const id = crypto.randomUUID();
    await runStore('courses', 'readwrite', (store) => store.add({ id, name }));
    courseDialog.close();
    await renderCourses(id);
    setStatus(`${name} created`);
});

renameCourseButton.addEventListener('click', () => {
    openRenameCourseDialog().catch((error) => {
        courseRenameStatus.textContent = error instanceof Error ? error.message : 'Could not open course name';
        courseRenameStatus.dataset.state = 'error';
    });
});
renameCourseNameInput.addEventListener('input', scheduleCourseNameSave);
renameCourseDialog.addEventListener('close', () => {
    if (!courseRenameTimer) return;
    const revision = courseRenameRevision;
    clearTimeout(courseRenameTimer);
    courseRenameTimer = null;
    saveCourseName(revision).catch((error) => {
        courseRenameStatus.textContent = error instanceof Error ? error.message : 'Could not save course name';
        courseRenameStatus.dataset.state = 'error';
    });
});

document.querySelectorAll('[data-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
        questionInput.value = button.dataset.prompt;
        questionInput.focus();
    });
});
questionInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) questionForm.requestSubmit();
});
questionForm.addEventListener('submit', askQuestion);

initialize().catch((error) => {
    console.error('Study library could not be opened', error);
    setStatus('Browser storage is unavailable. Try this page in a modern browser.');
});