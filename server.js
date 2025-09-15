const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuration Socket.IO avec CORS
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());


// Stockage en mémoire des documents par room
const documents = new Map();
const usersByRoom = new Map();


app.use(express.static(path.join(__dirname, "public")));


// Route principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion des connexions WebSocket
io.on('connection', (socket) => {
    console.log('Utilisateur connecté:', socket.id);

    // Rejoindre une room
    socket.on('join-room', (data) => {
        console.log('User joining room:', data);
        const { roomId, userName } = data;
        
        if (!roomId || !userName) {
            console.error('Missing roomId or userName');
            return;
        }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;

        // Ajouter l'utilisateur à la room
        if (!usersByRoom.has(roomId)) {
            usersByRoom.set(roomId, new Map());
        }
        usersByRoom.get(roomId).set(socket.id, {
            name: userName,
            cursor: 0
        });

        // Envoyer le document existant ou en créer un nouveau
        if (!documents.has(roomId)) {
            const defaultContent = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\title{Document Collaboratif - ${roomId}}
\\author{Équipe FreeTeX}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Bienvenue dans cet éditeur collaboratif !
Plusieurs personnes peuvent éditer ce document simultanément.

\\section{Section Collaborative}
% Commencez à taper ici

\\begin{itemize}
\\item Premier point
\\item Deuxième point
\\end{itemize}

\\section{Formules Mathématiques}
Voici une équation : $E = mc^2$

\\[
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
\\]

\\end{document}`;

            documents.set(roomId, {
                content: defaultContent,
                lastModified: Date.now()
            });
            console.log('Created new document for room:', roomId);
        }

        // Delay sending document content to ensure client is ready
        setTimeout(() => {
            const doc = documents.get(roomId);
            console.log('Sending document content to', socket.id, 'for room', roomId);
            socket.emit('document-content', doc);
        }, 100);

        // Notifier les autres utilisateurs
        socket.to(roomId).emit('user-joined', {
            userId: socket.id,
            userName: userName
        });

        // Envoyer la liste des utilisateurs connectés
        const roomUsers = Array.from(usersByRoom.get(roomId).entries()).map(([id, user]) => ({
            userId: id,
            userName: user.name
        }));
        
        io.to(roomId).emit('users-list', roomUsers);
        
        console.log(`${userName} a rejoint la room ${roomId}`);
    });

    // Gestion des modifications de texte
    socket.on('text-change', (data) => {
        const { roomId, content, operation } = data;
        console.log('Text change received from', socket.userName, 'in room', roomId);
        
        if (documents.has(roomId)) {
            // Mettre à jour le document
            documents.set(roomId, {
                content: content,
                lastModified: Date.now(),
                lastUser: socket.userName
            });

            // Diffuser la modification à tous les autres utilisateurs de la room
            socket.to(roomId).emit('text-change', {
                content: content,
                operation: operation,
                userId: socket.id,
                userName: socket.userName,
                timestamp: Date.now()
            });
        }
    });

    // Gestion de la position du curseur
    socket.on('cursor-position', (data) => {
        const { roomId, position } = data;
        
        if (usersByRoom.has(roomId) && usersByRoom.get(roomId).has(socket.id)) {
            usersByRoom.get(roomId).get(socket.id).cursor = position;
            
            // Diffuser la position du curseur
            socket.to(roomId).emit('cursor-update', {
                userId: socket.id,
                userName: socket.userName,
                position: position
            });
        }
    });

    // Déconnexion
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.roomId && usersByRoom.has(socket.roomId)) {
            usersByRoom.get(socket.roomId).delete(socket.id);
            
            // Notifier les autres utilisateurs
            socket.to(socket.roomId).emit('user-left', {
                userId: socket.id,
                userName: socket.userName
            });

            console.log(`${socket.userName} a quitté la room ${socket.roomId}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});