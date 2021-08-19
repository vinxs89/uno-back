const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const deck = ["0-YELLOW","1-YELLOW-1","1-YELLOW-2","2-YELLOW-1","2-YELLOW-2","3-YELLOW-1","3-YELLOW-2","4-YELLOW-1","4-YELLOW-2","5-YELLOW-1","5-YELLOW-2","6-YELLOW-1","6-YELLOW-2","7-YELLOW-1","7-YELLOW-2","8-YELLOW-1","8-YELLOW-2","9-YELLOW-1","9-YELLOW-2","action-2-YELLOW-1","action-2-YELLOW-2","action-rotate-YELLOW-1","action-rotate-YELLOW-2","action-stop-YELLOW-1","action-stop-YELLOW-2","0-GREEN","1-GREEN-1","1-GREEN-2","2-GREEN-1","2-GREEN-2","3-GREEN-1","3-GREEN-2","4-GREEN-1","4-GREEN-2","5-GREEN-1","5-GREEN-2","6-GREEN-1","6-GREEN-2","7-GREEN-1","7-GREEN-2","8-GREEN-1","8-GREEN-2","9-GREEN-1","9-GREEN-2","action-2-GREEN-1","action-2-GREEN-2","action-rotate-GREEN-1","action-rotate-GREEN-2","action-stop-GREEN-1","action-stop-GREEN-2","0-RED","1-RED-1","1-RED-2","2-RED-1","2-RED-2","3-RED-1","3-RED-2","4-RED-1","4-RED-2","5-RED-1","5-RED-2","6-RED-1","6-RED-2","7-RED-1","7-RED-2","8-RED-1","8-RED-2","9-RED-1","9-RED-2","action-2-RED-1","action-2-RED-2","action-rotate-RED-1","action-rotate-RED-2","action-stop-RED-1","action-stop-RED-2","0-BLUE","1-BLUE-1","1-BLUE-2","2-BLUE-1","2-BLUE-2","3-BLUE-1","3-BLUE-2","4-BLUE-1","4-BLUE-2","5-BLUE-1","5-BLUE-2","6-BLUE-1","6-BLUE-2","7-BLUE-1","7-BLUE-2","8-BLUE-1","8-BLUE-2","9-BLUE-1","9-BLUE-2","action-2-BLUE-1","action-2-BLUE-2","action-rotate-BLUE-1","action-rotate-BLUE-2","action-stop-BLUE-1","action-stop-BLUE-2","action-4-1","action-4-2","action-4-3","action-4-4","action-switch-1","action-switch-2","action-switch-3","action-switch-4"];
const shuffle = (array) => {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

const getRandomArbitrary = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
}

const rooms = new Map();
const mapSocketRooms = new Map();

const getRoom = (roomCode) => {
    const roomId = 'p-' + roomCode;
    return rooms.get(roomId);
}

const getValidRoomCode = () => {
    while (true) {
        const randomCode = getRandomArbitrary(1000, 4000);
        if (!rooms.has(randomCode)) {
            rooms.set(randomCode, {}); // JUST to lock the room
            return randomCode;
        }
    }
}

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('create-room', (playerName, playerId, playersCount) => {
        const roomCode = getValidRoomCode();
        const roomId = 'p-' + roomCode;
        const room = {
            id: roomId,
            code: roomCode,
            players: [{ id: playerId, name: playerName, ready: false, connected: true, socketId: socket.id }],
            maxPlayers: playersCount
        };

        mapSocketRooms.set(socket.id, roomId);
        rooms.set(roomId, room);
        socket.join(roomId);

        io.to(roomId).emit('joined-room', roomCode, room.players);
    });

    socket.on('join-room', (playerName, playerId, roomCode) => {
        const room = getRoom(roomCode);
        if (room && !isClosedRoom(room)) {
            socket.join(room.id);
            room.players.push({ id: playerId, name: playerName });

            if (room.players.length === room.maxPlayers) {
                closeRoom(room);
            }

            io.to(room.id).emit('joined-room', roomCode, room.players);
        }
    });

    socket.on('start-game', (roomCode) => {
        const room = getRoom(roomCode);
        if (room) {
            io.to(room.id).emit('started-game', roomCode);
        }
    });

    socket.on('game-ready', (roomCode, playerId) => {
        console.log('gameready: ' + roomCode + ' - ' + playerId);

        const room = getRoom(roomCode);
        if (room) {
            console.log('room found: ' + roomCode + ' - ' + playerId);

            const player = room.players.find(player => player.id === playerId);
            if (player) {
                console.log('player ready: ' + roomCode + ' - ' + playerId);

                player.ready = true;
            }
            
            if (room.players.find(player => player.ready === false) === undefined) {
                console.log('players complete: ' + roomCode + ' - ' + playerId);

                const currentDeck = deck.slice();
                shuffle(currentDeck);

                io.to(room.id).emit('create-game', room.players, currentDeck);
                io.to(room.id).emit('set-first-player', room.players[0]);
            } else {
                console.log('players not complete: ' + roomCode + ' - ' + playerId);
            }
        }
    });

    socket.on('new-move', (roomCode, cardId, color) => {
        const room = getRoom(roomCode);
        if (room) {
            io.to(room.id).emit('new-move', cardId, color);
        }
    });

    socket.on('disconnect', () => {
        const room = getRoomFromSocket(socket);
        if (room) {
            const player = room.players.find(player => player.socketId === socket.id);
            if (player) {
                player.connected = false;
                if (isRoomEmpty(room)) {
                    deleteRoom(room);
                }
                io.to(room.id).emit('user-disconnected');
            }
        }
    });
});

const getRoomFromSocket = (socket) => {
    const roomId = mapSocketRooms.get(socket.id);
    if(roomId) {
        return rooms.get(roomId); 
    }
    return undefined;
}

const isClosedRoom = (room) => {
    return room.closed;
}

const closeRoom = (room) => {
    console.log('Closing room ' + room.code);
    room.closed = true;
}

const isRoomEmpty = (room) => {
    room.players.filter(player => player.connected) === 0;
}

const deleteRoom = (room) => {
    console.log('Deleting room ' + room.code);
    rooms.delete(room.id);
}

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
  console.log('listening on *:' + PORT);
});