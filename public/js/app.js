let socket;
let currentRoomId;
let currentUserName;
let isUpdating = false;

function generateRoomId() {
    return Math.random().toString(36).substr(2, 9);
}

function joinRoom() {
    const userName = document.getElementById('userName').value.trim();
    const roomId = document.getElementById('roomId').value.trim() || generateRoomId();

    if (!userName) {
        alert('Veuillez entrer votre nom');
        return;
    }

    currentRoomId = roomId;
    currentUserName = userName;

    // Initialiser Socket.IO
    

    socket = io({
        transports: ['polling'],
        upgrade: false
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        updateStatus(true, 'Connecté');

        // Setup editor BEFORE joining room
        setupEditor();

        // Join room after editor is ready
        socket.emit('join-room', { roomId, userName });

        // Masquer la configuration et afficher l'éditeur
        document.getElementById('roomSetup').style.display = 'none';
        document.getElementById('editorContainer').style.display = 'block';

        // Mettre à jour l'URL de partage
        updateShareUrl();
    });

    socket.on('disconnect', () => {
        updateStatus(false, 'Déconnecté');
    });

    socket.on('document-content', (document) => {
        console.log('Received document content:', document);
        const editor = this.document.getElementById('editor');
        if (editor && document && document.content) {
            isUpdating = true;
            editor.value = document.content;
            isUpdating = false;
            addActivityLog(`Document chargé (modifié le ${new Date(document.lastModified).toLocaleTimeString()})`);
        } else {
            console.error('Editor element not found or document content missing');
        }
    });

    socket.on('text-change', (data) => {
        console.log('Received text change:', data);
        if (!isUpdating && data && data.content !== undefined) {
            isUpdating = true;
            const editor = document.getElementById('editor');
            if (editor) {
                const cursorPos = editor.selectionStart;
                editor.value = data.content;
                editor.setSelectionRange(cursorPos, cursorPos);
                addActivityLog(`${data.userName} a modifié le document`);
            }
            isUpdating = false;
        }
    });

    socket.on('users-list', (users) => {
        updateUsersList(users);
    });

    socket.on('user-joined', (user) => {
        addActivityLog(`${user.userName} a rejoint la session`);
    });

    socket.on('user-left', (user) => {
        addActivityLog(`${user.userName} a quitté la session`);
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        updateStatus(false, 'Erreur de connexion');
    });
}

function setupEditor() {
    const editor = document.getElementById('editor');
    if (!editor) {
        console.error('Editor element not found');
        return;
    }

    let timeout;

    editor.addEventListener('input', (e) => {
        if (!isUpdating && socket) {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                console.log('Sending text change');
                socket.emit('text-change', {
                    roomId: currentRoomId,
                    content: editor.value,
                    operation: 'insert'
                });
            }, 300); // Délai pour éviter trop de requêtes
        }
    });

    // Use 'keyup' and 'mouseup' instead of 'selectionchange' for better compatibility
    const handleCursorMove = () => {
        if (socket && currentRoomId) {
            socket.emit('cursor-position', {
                roomId: currentRoomId,
                position: editor.selectionStart
            });
        }
    };

    editor.addEventListener('keyup', handleCursorMove);
    editor.addEventListener('mouseup', handleCursorMove);
    editor.addEventListener('focus', handleCursorMove);
}

function updateStatus(connected, message) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (statusDot && statusText) {
        statusDot.className = 'status-dot' + (connected ? ' connected' : '');
        statusText.textContent = message;
    }
}

function updateUsersList(users) {
    const usersBar = document.getElementById('usersBar');
    if (!usersBar) return;

    usersBar.innerHTML = '<strong>Utilisateurs connectés:</strong>';

    users.forEach(user => {
        const badge = document.createElement('span');
        badge.className = 'user-badge';
        badge.textContent = user.userName + (user.userId === socket.id ? ' (vous)' : '');
        usersBar.appendChild(badge);
    });
}

function updateShareUrl() {
    const shareInput = document.getElementById('shareUrl');
    if (shareInput) {
        const shareUrl = `${window.location.origin}?room=${currentRoomId}`;
        shareInput.value = shareUrl;
    }
}

function copyShareUrl() {
    const shareInput = document.getElementById('shareUrl');
    if (shareInput) {
        shareInput.select();
        document.execCommand('copy');

        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copié!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }
}

function addActivityLog(message) {
    const log = document.getElementById('activityLog');
    if (log) {
        const time = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.innerHTML = `<span style="color: #7f8c8d;">[${time}]</span> ${message}`;
        log.appendChild(logEntry);
        log.scrollTop = log.scrollHeight;
    }
}

// Vérifier si une room est spécifiée dans l'URL
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        const roomInput = document.getElementById('roomId');
        if (roomInput) {
            roomInput.value = roomFromUrl;
        }
    }
});