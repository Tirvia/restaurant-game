// Полный исправленный script.js
// Версия 3.0 – стабильные видеозвонки, PiP, восстановление соединения, обработка наблюдателей

class Game {
    constructor() {
        // ========== Игровые переменные ==========
        this.currentPlayer = 1;
        this.scores = { 1: 0, 2: 0 };
        this.positions = { 1: 0, 2: 0 };
        this.diceResult = 0;
        this.timer = 60;
        this.timerInterval = null;
        this.cards = {
            1: [], 2: [], 3: [], 4: [], 5: [], 6: []
        };
        
        this.selectedPoints = { 1: 0, 2: 0 };
        this.pointsApplied = false;
        this.applyButtonClicked = false;
        this.diceRolledInCurrentTurn = false;
        this.waitingForAnswer = false;
        this.answerCompleted = false;
        
        this.boardWidth = 800;
        this.boardHeight = 600;
        this.cellRadius = 20;
        
        // Переменные для специальных зон
        this.isSpecialZoneActive = false;
        this.triggeredZonesInTurn = { 1: new Set(), 2: new Set() };
        
        this.zoneSettings = {
            'grams': {
                name: 'Зона граммовки',
                positive: 2,
                negative: -2,
                question: "Назовите точный вес ингредиента для этого блюда в граммах."
            },
            'description': {
                name: 'Зона красочного описания',
                positive: 1,
                negative: -3,
                question: "Дайте красочное описание этого блюда или напитка, чтобы вызвать аппетит у гостя."
            },
            'allergy': {
                name: 'Зона аллергии',
                positive: 1,
                negative: -5,
                question: "Можно ли убрать этот ингредиент из блюда без ущерба для вкуса? Почему?"
            }
        };
        
        // ========== Онлайн-переменные ==========
        this.role = null;
        this.roomCode = null;
        this.playerName = '';
        this.socket = null;
        this.isConnected = false;
        this.serverUrl = window.location.origin;
        this.gameMode = null;
        
        // ========== WebRTC ==========
        this.localStream = null;
        this.peerConnections = new Map(); // socketId -> RTCPeerConnection
        this.remoteStreams = new Map();    // socketId -> MediaStream
        
        // ========== Участники комнаты ==========
        this.players = {
            master: '',
            player1: '',
            player2: '',
            masterSocketId: null,
            player1SocketId: null,
            player2SocketId: null,
            spectators: [] // массив { name, socketId }
        };
        
        // ========== Анимация ==========
        this.teamAnimationInProgress = { 1: false, 2: false };
        this.animationQueue = { 1: [], 2: [] };
        
        // ========== Картинка-в-картинке ==========
        this.pipActive = false;
        this.pipPlayerSocketId = null;
        
        // ========== Флаги переподключения ==========
        this.rejoinAfterReconnect = false;
        
        // Добавляем CSS для PiP
        this.addPipStyles();
        
        this.init();
    }

    // ========== Добавление CSS для картинки-в-картинке ==========
    addPipStyles() {
        const styleId = 'game-pip-styles';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .video-box.pip-active {
                position: fixed !important;
                top: 20px !important;
                right: 20px !important;
                left: auto !important;
                bottom: auto !important;
                width: 320px !important;
                height: 240px !important;
                z-index: 9999 !important;
                border: 4px solid #FFC107 !important;
                box-shadow: 0 0 30px rgba(255, 193, 7, 0.8) !important;
                animation: pipAppear 0.3s ease-out;
            }
            @keyframes pipAppear {
                from { transform: scale(0.8); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            .video-box.pip-active .video-placeholder {
                width: 100%;
                height: 100%;
            }
            .video-box.pip-active video {
                object-fit: cover !important;
            }
        `;
        document.head.appendChild(style);
    }

    // ========== Инициализация ==========
    async init() {
        console.log('🚀 Инициализация игры...');
        this.gameContainer = document.querySelector('.game-container');
        await this.showGameModeSelection();
        console.log('✅ Режим выбран:', this.gameMode);
        
        if (this.gameMode === 'online') {
            await this.showRoleSelection();
        } else {
            this.role = 'local';
            this.playerName = 'Локальный игрок';
            this.startLocalGame();
        }
    }

    // ========== Меню выбора режима ==========
    async showGameModeSelection() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'role-selection-modal';
            modal.innerHTML = `
                <div class="role-selection-content">
                    <h2><i class="fas fa-gamepad"></i> GARAGE - Меню игры</h2>
                    
                    <div class="mode-options">
                        <div class="mode-option">
                            <button class="mode-btn" data-mode="online">
                                <i class="fas fa-globe"></i>
                                <div>
                                    <strong>Онлайн-игра</strong>
                                    <small>Игра по сети с друзьями</small>
                                </div>
                            </button>
                        </div>
                        
                        <div class="mode-option">
                            <button class="mode-btn" data-mode="local">
                                <i class="fas fa-desktop"></i>
                                <div>
                                    <strong>Один компьютер</strong>
                                    <small>Игра на одном устройстве</small>
                                </div>
                            </button>
                        </div>
                        
                        <div class="mode-option">
                            <button class="mode-btn" id="admin-btn">
                                <i class="fas fa-cogs"></i>
                                <div>
                                    <strong>Админ-панель</strong>
                                    <small>Управление сервером игры</small>
                                </div>
                            </button>
                        </div>
                    </div>
                    
                    <div class="game-info">
                        <p><i class="fas fa-info-circle"></i> Для онлайн-игры нужно 3 человека: ведущий и 2 игрока</p>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            const modeButtons = modal.querySelectorAll('.mode-btn[data-mode]');
            const adminBtn = modal.querySelector('#admin-btn');
            
            modeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.gameMode = btn.dataset.mode;
                    modal.remove();
                    resolve();
                });
            });
            
            adminBtn.addEventListener('click', () => {
                window.location.href = 'admin.html';
            });
        });
    }

    // ========== Локальная игра ==========
    startLocalGame() {
        console.log('🖥️ Запуск локальной игры...');
        document.querySelector('.video-container').style.display = 'none';
        this.setupLocalInterface();
        this.continueGameInitialization();
        this.showNotification('Локальная игра запущена! Вы играете на одном устройстве.', 'info');
    }

    setupLocalInterface() {
        const videoContainer = document.querySelector('.video-container');
        if (videoContainer) videoContainer.style.display = 'none';
        this.updateRollButton();
    }

    // ========== Выбор роли (онлайн) ==========
    async showRoleSelection() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'role-selection-modal';
            modal.innerHTML = `
                <div class="role-selection-content">
                    <h2><i class="fas fa-gamepad"></i> Подключение к игре</h2>
                    
                    <div class="name-input-section">
                        <label for="player-name"><i class="fas fa-user"></i> Введите ваше имя:</label>
                        <input type="text" id="player-name" placeholder="Ваше имя" maxlength="20" autocomplete="off" class="large-input">
                    </div>
                    
                    <div class="role-options">
                        <h3><i class="fas fa-user-tag"></i> Выберите роль:</h3>
                        
                        <div class="role-option">
                            <input type="radio" id="role-master" name="role" value="master">
                            <label for="role-master" class="role-label">
                                <i class="fas fa-crown"></i>
                                <div>
                                    <strong>Ведущий</strong>
                                    <small>Создаёт комнату и управляет игрой</small>
                                </div>
                            </label>
                        </div>
                        
                        <div class="role-option">
                            <input type="radio" id="role-player" name="role" value="player">
                            <label for="role-player" class="role-label">
                                <i class="fas fa-user-friends"></i>
                                <div>
                                    <strong>Игрок (0/2)</strong>
                                    <small>Присоединиться как игрок</small>
                                </div>
                            </label>
                        </div>
                        
                        <div class="role-option">
                            <input type="radio" id="role-spectator" name="role" value="spectator">
                            <label for="role-spectator" class="role-label">
                                <i class="fas fa-eye"></i>
                                <div>
                                    <strong>Наблюдатель</strong>
                                    <small>Только просмотр игры</small>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div id="master-section" class="role-section" style="display: none;">
                        <button id="create-room-btn" class="btn create-btn">
                            <i class="fas fa-plus-circle"></i> Создать новую комнату
                        </button>
                        <div id="room-info" class="room-info" style="display: none;">
                            <div class="room-code-display">
                                <i class="fas fa-door-open"></i>
                                <div>
                                    <p>Код комнаты:</p>
                                    <h3 id="room-code-display"></h3>
                                </div>
                            </div>
                            <p class="small">Поделитесь этим кодом с игроками</p>
                            <button id="copy-code-btn" class="btn copy-btn">
                                <i class="fas fa-copy"></i> Копировать код
                            </button>
                        </div>
                    </div>
                    
                    <div id="player-section" class="role-section" style="display: none;">
                        <div class="input-group">
                            <input type="text" id="room-code-input" placeholder="Введите 6-значный код комнаты" maxlength="6" autocomplete="off" class="large-input code-input">
                            <button id="join-room-btn" class="btn join-btn">
                                <i class="fas fa-sign-in-alt"></i> Присоединиться
                            </button>
                        </div>
                        <div id="room-status" class="room-status"></div>
                    </div>
                    
                    <div id="connection-status" class="connection-status">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span id="status-text">Подключение к серверу...</span>
                    </div>
                    
                    <div class="game-info">
                        <p><i class="fas fa-info-circle"></i> Для игры нужно 3 человека: ведущий и 2 игрока</p>
                    </div>
                    
                    <button id="back-to-mode" class="btn back-btn">
                        <i class="fas fa-arrow-left"></i> Назад к выбору режима
                    </button>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const nameInput = document.getElementById('player-name');
            const roleInputs = modal.querySelectorAll('input[name="role"]');
            const masterSection = modal.querySelector('#master-section');
            const playerSection = modal.querySelector('#player-section');
            const createBtn = modal.querySelector('#create-room-btn');
            const joinBtn = modal.querySelector('#join-room-btn');
            const roomCodeInput = document.getElementById('room-code-input');
            const statusDiv = modal.querySelector('#connection-status');
            const statusText = modal.querySelector('#status-text');
            const backBtn = modal.querySelector('#back-to-mode');
            
            setTimeout(() => nameInput.focus(), 100);
            
            backBtn.addEventListener('click', () => {
                modal.remove();
                this.showGameModeSelection().then(() => {
                    if (this.gameMode === 'online') {
                        this.showRoleSelection().then(resolve);
                    }
                });
            });
            
            this.setupSocketConnection(modal, resolve);
            
            roleInputs.forEach(input => {
                input.addEventListener('change', () => {
                    this.role = input.value;
                    
                    if (this.role === 'master') {
                        masterSection.style.display = 'block';
                        playerSection.style.display = 'none';
                        statusText.textContent = 'Готов к созданию комнаты';
                    } else {
                        masterSection.style.display = 'none';
                        playerSection.style.display = 'block';
                        statusText.textContent = 'Введите код комнаты';
                        setTimeout(() => roomCodeInput.focus(), 100);
                    }
                });
            });
            
            createBtn.addEventListener('click', async () => {
                const playerName = nameInput.value.trim();
                if (!playerName) {
                    this.showAlert('Пожалуйста, введите ваше имя');
                    return;
                }
                if (!this.role) {
                    this.showAlert('Пожалуйста, выберите роль');
                    return;
                }
                this.playerName = playerName;
                
                statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создаем комнату...';
                this.socket.emit('create-room', { playerName, gameMode: 'online' });
            });
            
            joinBtn.addEventListener('click', async () => {
                const playerName = nameInput.value.trim();
                const roomCode = roomCodeInput.value.trim().toUpperCase();
                
                if (!playerName) {
                    this.showAlert('Пожалуйста, введите имя');
                    return;
                }
                if (roomCode.length !== 6) {
                    this.showAlert('Код комнаты должен содержать 6 символов');
                    return;
                }
                if (!this.role) {
                    this.showAlert('Пожалуйста, выберите роль');
                    return;
                }
                
                this.playerName = playerName;
                this.roomCode = roomCode;
                
                statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Присоединяемся к комнате...';
                this.socket.emit('join-room', {
                    roomCode: roomCode,
                    playerName: playerName,
                    role: this.role
                });
            });
            
            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const selectedRole = modal.querySelector('input[name="role"]:checked');
                    if (selectedRole) {
                        if (selectedRole.value === 'master') {
                            createBtn.click();
                        } else {
                            roomCodeInput.focus();
                        }
                    }
                }
            });
            
            roomCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    joinBtn.click();
                }
            });
            
            roomCodeInput.addEventListener('input', () => {
                const code = roomCodeInput.value.trim().toUpperCase();
                roomCodeInput.value = code;
                if (code.length === 6 && this.socket) {
                    this.socket.emit('check-room', code);
                }
            });
        });
    }

    // ========== Инициализация видео и WebRTC ==========
    async initVideo() {
        console.log('🎥 initVideo() для роли:', this.role);
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('❌ getUserMedia не поддерживается');
            this.showNotification('Ваш браузер не поддерживает видеозвонки.', 'warning');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
                audio: true
            });
            this.localStream = stream;
            console.log('✅ Доступ к камере получен');
            
            const containerId = this.getVideoContainerIdByRole();
            if (containerId) {
                this.displayLocalStream(containerId);
            }
            
            // Оповещаем сервер о готовности и инициируем соединения
            if (this.socket && this.roomCode) {
                this.socket.emit('webrtc-ready', { roomCode: this.roomCode });
                this.initiateWebRTCConnections();
            }
        } catch (error) {
            console.error('❌ Ошибка доступа к камере/микрофону:', error);
            this.showNotification('Не удалось получить доступ к камере. Видео не будет работать.', 'warning');
        }
    }

    displayLocalStream(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const placeholder = container.querySelector('.video-placeholder');
        if (!placeholder) return;
        
        placeholder.innerHTML = '';
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = this.localStream;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.borderRadius = '10px';
        placeholder.appendChild(video);
        
        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = this.getRoleDisplayName();
        placeholder.appendChild(label);
        
        this.setVideoContainerColor(containerId, this.role);
    }

    // ========== WebRTC ==========
    async createPeerConnection(targetSocketId, isInitiator = false) {
        // Не подключаемся к себе
        if (targetSocketId === this.socket?.id) {
            console.warn('⚠️ Пропускаем подключение к самому себе');
            return null;
        }
        if (this.peerConnections.has(targetSocketId)) {
            console.log('⚠️ Соединение уже существует с', targetSocketId);
            return this.peerConnections.get(targetSocketId);
        }
        if (!this.localStream) {
            console.log('⚠️ Нет локального потока, соединение не создано');
            return null;
        }

        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };

        const pc = new RTCPeerConnection(config);
        this.peerConnections.set(targetSocketId, pc);

        // Добавляем локальные треки
        this.localStream.getTracks().forEach(track => {
            pc.addTransceiver(track, { streams: [this.localStream], direction: 'sendrecv' });
        });

        // Обработка ICE кандидатов
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-ice-candidate', {
                    roomCode: this.roomCode,
                    targetPeerId: targetSocketId,
                    candidate: event.candidate
                });
            }
        };

        // Получение удалённого потока
        pc.ontrack = (event) => {
            console.log('📹 Получен удалённый поток от', targetSocketId);
            const remoteStream = event.streams[0];
            if (remoteStream) {
                this.remoteStreams.set(targetSocketId, remoteStream);
                this.displayRemoteStream(targetSocketId, remoteStream);
            }
        };

        // Отслеживание состояния соединения
        pc.onconnectionstatechange = () => {
            console.log(`🔌 Состояние соединения с ${targetSocketId}: ${pc.connectionState}`);
            if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                this.closePeerConnection(targetSocketId);
            }
        };

        // Если инициатор, создаём offer
        if (isInitiator) {
            try {
                const offer = await pc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await pc.setLocalDescription(offer);
                this.socket.emit('webrtc-offer', {
                    roomCode: this.roomCode,
                    targetPeerId: targetSocketId,
                    offer: pc.localDescription
                });
            } catch (err) {
                console.error('❌ Ошибка создания offer:', err);
                this.closePeerConnection(targetSocketId);
            }
        }

        return pc;
    }

    closePeerConnection(socketId) {
        const pc = this.peerConnections.get(socketId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(socketId);
        }
        this.remoteStreams.delete(socketId);
        this.clearVideoContainer(socketId);
    }

    clearVideoContainer(socketId) {
        let containerId = null;
        if (socketId === this.players.masterSocketId) {
            containerId = 'video-master-container';
        } else if (socketId === this.players.player1SocketId) {
            containerId = 'video-team1-container';
        } else if (socketId === this.players.player2SocketId) {
            containerId = 'video-team2-container';
        } else {
            return;
        }

        const container = document.getElementById(containerId);
        if (!container) return;
        const placeholder = container.querySelector('.video-placeholder');
        if (!placeholder) return;

        // Если это не наш контейнер (не наше локальное видео), восстанавливаем плейсхолдер
        if (this.getVideoContainerIdByRole() !== containerId) {
            const role = containerId === 'video-master-container' ? 'master' :
                        containerId === 'video-team1-container' ? 'player1' : 'player2';
            const playerName = role === 'master' ? this.players.master :
                              role === 'player1' ? this.players.player1 : this.players.player2;
            this.updatePlaceholder(containerId, role, playerName);
        }
    }

    displayRemoteStream(socketId, stream) {
        let containerId = null;
        let role = null;

        if (socketId === this.players.masterSocketId) {
            containerId = 'video-master-container';
            role = 'master';
        } else if (socketId === this.players.player1SocketId) {
            containerId = 'video-team1-container';
            role = 'player1';
        } else if (socketId === this.players.player2SocketId) {
            containerId = 'video-team2-container';
            role = 'player2';
        } else {
            console.log('👀 Получен поток от наблюдателя, не отображаем');
            return;
        }

        const container = document.getElementById(containerId);
        if (!container) return;
        const placeholder = container.querySelector('.video-placeholder');
        if (!placeholder) return;

        placeholder.innerHTML = '';
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.borderRadius = '10px';
        placeholder.appendChild(video);
        
        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = this.getRoleDisplayNameForPlaceholder(role, this.getPlayerNameByRole(role));
        placeholder.appendChild(label);
        
        this.setVideoContainerColor(containerId, role);

        // Если это PiP – применяем стиль
        if (this.pipActive && socketId === this.pipPlayerSocketId) {
            this.applyPipStyle(containerId, true);
        }
    }

    initiateWebRTCConnections() {
        if (!this.localStream || !this.socket || !this.roomCode) {
            console.log('⚠️ Невозможно инициировать WebRTC: нет локального потока, сокета или комнаты');
            return;
        }
        console.log('🔄 Инициируем WebRTC соединения...');

        const targets = [
            { id: this.players.masterSocketId, name: this.players.master },
            { id: this.players.player1SocketId, name: this.players.player1 },
            { id: this.players.player2SocketId, name: this.players.player2 }
        ];

        targets.forEach(target => {
            if (target.id && target.id !== this.socket.id && !this.peerConnections.has(target.id)) {
                console.log(`🔗 Инициируем WebRTC соединение с ${target.name} (${target.id})`);
                this.createPeerConnection(target.id, true);
            }
        });
    }

    // ========== Картинка-в-картинке ==========
    setPipForPlayer(active, playerSocketId = null) {
        this.pipActive = active;
        this.pipPlayerSocketId = playerSocketId;

        // Сбрасываем PiP со всех контейнеров
        ['video-master-container', 'video-team1-container', 'video-team2-container'].forEach(id => {
            this.applyPipStyle(id, false);
        });

        if (active && playerSocketId) {
            let targetId = null;
            if (playerSocketId === this.players.player1SocketId) {
                targetId = 'video-team1-container';
            } else if (playerSocketId === this.players.player2SocketId) {
                targetId = 'video-team2-container';
            } else if (playerSocketId === this.players.masterSocketId) {
                targetId = 'video-master-container';
            }
            if (targetId) {
                this.applyPipStyle(targetId, true);
            }
        }
    }

    applyPipStyle(containerId, enable) {
        const container = document.getElementById(containerId);
        if (container) {
            container.classList.toggle('pip-active', enable);
        }
    }

    // ========== Методы интерфейса ==========
    getVideoContainerIdByRole() {
        const roleMap = {
            'master': 'video-master-container',
            'player1': 'video-team1-container',
            'player2': 'video-team2-container'
        };
        return roleMap[this.role] || null;
    }

    getRoleDisplayName() {
        switch(this.role) {
            case 'master': return `Ведущий: ${this.playerName}`;
            case 'player1': return `Команда 1: ${this.playerName}`;
            case 'player2': return `Команда 2: ${this.playerName}`;
            default: return this.playerName;
        }
    }

    setVideoContainerColor(containerId, role) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.classList.remove('video-team1', 'video-team2', 'video-master');
        if (role === 'player1') {
            container.classList.add('video-team1');
        } else if (role === 'player2') {
            container.classList.add('video-team2');
        } else if (role === 'master') {
            container.classList.add('video-master');
        }
    }

    getPlayerNameByRole(role) {
        switch(role) {
            case 'master': return this.players.master;
            case 'player1': return this.players.player1;
            case 'player2': return this.players.player2;
            default: return '';
        }
    }

    getRoleDisplayNameForPlaceholder(role, playerName) {
        switch(role) {
            case 'master': return `Ведущий: ${playerName}`;
            case 'player1': return `Команда 1: ${playerName}`;
            case 'player2': return `Команда 2: ${playerName}`;
            default: return playerName;
        }
    }

    updateVideoPlaceholders() {
        if (this.gameMode === 'local') return;
        this.updatePlaceholder('video-master-container', 'master', this.players.master);
        this.updatePlaceholder('video-team1-container', 'player1', this.players.player1);
        this.updatePlaceholder('video-team2-container', 'player2', this.players.player2);
    }

    updatePlaceholder(containerId, role, playerName) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const placeholder = container.querySelector('.video-placeholder');
        if (!placeholder) return;

        // Если это наш контейнер и у нас есть локальный поток, не перезаписываем
        if (this.getVideoContainerIdByRole() === containerId && this.localStream) {
            return;
        }

        placeholder.innerHTML = '';
        const icon = document.createElement('i');
        icon.className = this.getRoleIcon(role);
        placeholder.appendChild(icon);
        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = playerName ? this.getRoleDisplayNameForPlaceholder(role, playerName) : this.getDefaultRoleName(role);
        placeholder.appendChild(label);
        this.setVideoContainerColor(containerId, role);
    }

    getRoleIcon(role) {
        switch(role) {
            case 'master': return 'fas fa-user-tie';
            case 'player1': return 'fas fa-user';
            case 'player2': return 'fas fa-user';
            default: return 'fas fa-user';
        }
    }

    getDefaultRoleName(role) {
        switch(role) {
            case 'master': return 'Ведущий';
            case 'player1': return 'Команда 1';
            case 'player2': return 'Команда 2';
            default: return 'Наблюдатель';
        }
    }

    // ========== Игровая логика (без изменений, но с вызовом PiP) ==========
    async continueGameInitialization() {
        console.log('🎥 Инициализируем видео...');
        if (this.gameMode === 'online') {
            await this.initVideo();
        }
        console.log('🃏 Загружаем карты...');
        await this.loadCards();
        console.log('🎲 Создаем игровое поле...');
        this.createBoard();
        this.createZoneLabels();
        this.setupEventListeners();
        this.setupRoleInterface();
        this.drawBoard();
        this.updateScores();
        this.updatePieces();
        this.updateTurnIndicator();
        this.showNotification(`Игра началась! ${this.getWelcomeMessage()}`, 'info');
        console.log('🎮 Игра полностью инициализирована!');
    }

    async loadCards() {
        try {
            const response = await fetch('cards.json');
            if (response.ok) {
                const cardsData = await response.json();
                this.cards = cardsData.categories || this.cards;
                if (cardsData.zones) {
                    this.zoneSettings.grams.question = cardsData.zones.grams || this.zoneSettings.grams.question;
                    this.zoneSettings.description.question = cardsData.zones.description || this.zoneSettings.description.question;
                    this.zoneSettings.allergy.question = cardsData.zones.allergy || this.zoneSettings.allergy.question;
                }
                console.log('✅ Вопросы загружены из cards.json');
                return;
            }
        } catch (error) {
            console.log('Файл cards.json не найден, используем демо-вопросы');
        }
        const demoCards = {
            1: [{ question: "Как правильно приготовить борщ?", instruction: "Опишите основные шаги" }],
            2: [{ question: "Как приготовить коктейль Мохито?", instruction: "Опишите шаги приготовления" }],
            3: [{ question: "Какая температура подачи красного вина?", instruction: "Назовите оптимальную температуру" }],
            4: [{ question: "Гость жалуется на холодное блюдо. Ваши действия?", instruction: "Опишите решение" }],
            5: [{ question: "Как правильно сервировать стол?", instruction: "Опишите основные правила" }],
            6: [{ question: "Как предложить гостю дорогое вино?", instruction: "Опишите технику продаж" }]
        };
        for (let i = 1; i <= 6; i++) {
            this.cards[i] = demoCards[i] || [{ question: "Вопрос для категории " + i, instruction: "Ответьте на вопрос" }];
        }
    }

    createBoard() {
        const container = document.getElementById('cells-container');
        if (!container) return;
        container.innerHTML = '';
        const positions = this.generateBoardPositions();
        for (let i = 0; i <= 40; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.id = `cell-${i}`;
            cell.dataset.number = `Клетка ${i}`;
            if (i === 0) {
                cell.textContent = 'СТАРТ';
            } else if (i === 40) {
                cell.textContent = 'ФИНИШ';
                cell.classList.add('finish', 'finish-big');
            } else {
                cell.textContent = i;
            }
            if (i === 0) {
                cell.classList.add('start');
            } else if (i === 40) {
                // already added
            } else if (i >= 11 && i <= 14) {
                cell.classList.add('grams');
            } else if (i >= 19 && i <= 22) {
                cell.classList.add('description');
            } else if (i >= 33 && i <= 36) {
                cell.classList.add('allergy');
            } else if ((i >= 26 && i <= 32) || (i >= 37 && i <= 39)) {
                cell.classList.add('red');
            } else {
                cell.classList.add('normal');
            }
            if (positions[i]) {
                cell.style.left = positions[i].x + 'px';
                cell.style.top = positions[i].y + 'px';
            }
            container.appendChild(cell);
        }
        this.updatePieces();
    }

    createZoneLabels() {
        const container = document.getElementById('cells-container');
        if (!container) return;
        const oldLabels = container.querySelectorAll('.zone-label');
        oldLabels.forEach(label => label.remove());
        const gramsLabel = document.createElement('div');
        gramsLabel.className = 'zone-label';
        gramsLabel.style.cssText = `
            position: absolute;
            color: #4CAF50;
            font-size: 16px;
            font-weight: bold;
            z-index: 5;
            transform: rotate(-90deg);
            transform-origin: left top;
            white-space: nowrap;
            background: rgba(0, 0, 0, 0.7);
            padding: 2px 8px;
            border-radius: 3px;
            letter-spacing: normal;
            font-family: Arial, sans-serif;
        `;
        gramsLabel.textContent = 'Зона граммовки ±2';
        gramsLabel.style.left = '210px';
        gramsLabel.style.top = '450px';
        container.appendChild(gramsLabel);
        const descLabel = document.createElement('div');
        descLabel.className = 'zone-label';
        descLabel.style.cssText = `
            position: absolute;
            color: #9C27B0;
            font-size: 16px;
            font-weight: bold;
            z-index: 5;
            white-space: nowrap;
            background: rgba(0, 0, 0, 0.7);
            padding: 2px 8px;
            border-radius: 3px;
            border: 1px solid rgba(156, 39, 176, 0.5);
            letter-spacing: normal;
            font-family: Arial, sans-serif;
        `;
        descLabel.textContent = 'Зона красочного описания +1/-3';
        descLabel.style.left = '285px';
        descLabel.style.top = '30px';
        container.appendChild(descLabel);
        const allergyLabel = document.createElement('div');
        allergyLabel.className = 'zone-label';
        allergyLabel.style.cssText = `
            position: absolute;
            color: #E91E63;
            font-size: 16px;
            font-weight: bold;
            z-index: 5;
            white-space: nowrap;
            background: rgba(0, 0, 0, 0.7);
            padding: 2px 8px;
            border-radius: 3px;
            border: 1px solid rgba(233, 30, 99, 0.5);
            letter-spacing: normal;
            font-family: Arial, sans-serif;
        `;
        allergyLabel.textContent = 'Зона аллергии +1/-5';
        allergyLabel.style.left = '630px';
        allergyLabel.style.top = '380px';
        container.appendChild(allergyLabel);
    }

    generateBoardPositions() {
        const positions = [];
        positions[0] = { x: 300, y: 200 };
        positions[1] = { x: 380, y: 200 };
        positions[2] = { x: 460, y: 200 };
        positions[3] = { x: 540, y: 200 };
        positions[4] = { x: 540, y: 270 };
        positions[5] = { x: 540, y: 340 };
        positions[6] = { x: 520, y: 400 };
        positions[7] = { x: 480, y: 460 };
        positions[8] = { x: 420, y: 480 };
        positions[9] = { x: 350, y: 480 };
        positions[10] = { x: 280, y: 480 };
        positions[11] = { x: 220, y: 460 };
        positions[12] = { x: 170, y: 400 };
        positions[13] = { x: 150, y: 330 };
        positions[14] = { x: 150, y: 260 };
        positions[15] = { x: 150, y: 190 };
        positions[16] = { x: 150, y: 120 };
        positions[17] = { x: 155, y: 50 };
        positions[18] = { x: 190, y: 5 };
        positions[19] = { x: 240, y: -30 };
        positions[20] = { x: 300, y: -50 };
        positions[21] = { x: 360, y: -50 };
        positions[22] = { x: 420, y: -50 };
        positions[23] = { x: 475, y: -30 };
        positions[24] = { x: 510, y: 15 };
        positions[25] = { x: 540, y: 70 };
        const circleCenterX = 800;
        const circleCenterY = 180;
        const circleRadius = 160;
        const totalSteps = 14;
        const angleStep = 360 / totalSteps;
        positions[26] = {
            x: circleCenterX + circleRadius * Math.cos(-120 * Math.PI / 180),
            y: circleCenterY + circleRadius * Math.sin(-120 * Math.PI / 180)
        };
        for (let i = 27; i <= 39; i++) {
            const step = i - 26;
            const angle = -120 + (step * angleStep);
            const angleRad = angle * Math.PI / 180;
            positions[i] = {
                x: circleCenterX + circleRadius * Math.cos(angleRad),
                y: circleCenterY + circleRadius * Math.sin(angleRad)
            };
        }
        positions[40] = { x: 790, y: 170 };
        const scale = 0.7;
        const offsetX = 140;
        const offsetY = 100;
        for (let i = 0; i <= 40; i++) {
            if (positions[i]) {
                positions[i].x = positions[i].x * scale + offsetX;
                positions[i].y = positions[i].y * scale + offsetY;
            }
        }
        return positions;
    }

    drawBoard() {
        const canvas = document.getElementById('board-canvas');
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const positions = this.generateBoardPositions();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 26; i++) {
            if (positions[i] && positions[i + 1]) {
                if (i === 0) ctx.moveTo(positions[i].x + 20, positions[i].y + 20);
                ctx.lineTo(positions[i + 1].x + 20, positions[i + 1].y + 20);
            }
        }
        ctx.stroke();
        if (positions[25] && positions[26]) {
            ctx.beginPath();
            ctx.moveTo(positions[25].x + 20, positions[25].y + 20);
            ctx.lineTo(positions[26].x + 20, positions[26].y + 20);
            ctx.stroke();
        }
        ctx.beginPath();
        if (positions[26]) ctx.moveTo(positions[26].x + 20, positions[26].y + 20);
        for (let i = 26; i < 39; i++) {
            if (positions[i] && positions[i + 1]) {
                ctx.lineTo(positions[i + 1].x + 20, positions[i + 1].y + 20);
            }
        }
        ctx.stroke();
        if (positions[39] && positions[40]) {
            ctx.beginPath();
            ctx.moveTo(positions[39].x + 20, positions[39].y + 20);
            ctx.lineTo(positions[40].x + 20, positions[40].y + 20);
            ctx.stroke();
        }
        console.log('✅ Игровое поле отрисовано');
    }

    setupEventListeners() {
        console.log('🔧 Настройка обработчиков событий...');
        const rollDiceBtn = document.getElementById('roll-dice');
        if (rollDiceBtn) {
            rollDiceBtn.addEventListener('click', () => this.rollDice());
            console.log('✅ Обработчик для броска кубика установлен');
        }
        const answerBtn = document.getElementById('answer-received');
        const masterBtn = document.getElementById('master-evaluation');
        if (answerBtn) answerBtn.style.display = 'none';
        if (masterBtn) masterBtn.style.display = 'none';
        document.querySelectorAll('.point-btn.compact').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.gameMode === 'online' && this.role !== 'master') return;
                if (this.gameMode === 'local' && this.role !== 'local') return;
                if (this.pointsApplied || this.applyButtonClicked) return;
                const points = parseInt(e.target.dataset.points);
                const team = parseInt(e.target.dataset.team);
                this.selectPoints(team, points);
            });
        });
        const nextTurnBtn = document.getElementById('next-turn');
        if (nextTurnBtn) {
            nextTurnBtn.addEventListener('click', () => this.nextTurn());
        }
        window.addEventListener('resize', () => this.drawBoard());
        if (this.gameMode === 'online') {
            setInterval(() => {
                if (this.socket && this.socket.connected) this.socket.emit('ping');
            }, 30000);
        }
        console.log('✅ Все обработчики событий установлены');
    }

    rollDice() {
        console.log('🎲 Бросок кубика...');
        if (this.gameMode === 'online') {
            if (!this.socket || !this.isConnected) {
                alert('Нет подключения к серверу!');
                return;
            }
            if (!this.roomCode) {
                alert('Вы не в комнате!');
                return;
            }
            if (this.isSpecialZoneActive) {
                alert('Сейчас активна специальная зона!');
                return;
            }
            const canRoll = (this.role === 'player1' && this.currentPlayer === 1) ||
                           (this.role === 'player2' && this.currentPlayer === 2);
            if (!canRoll) {
                alert('Сейчас не ваш ход!');
                return;
            }
            if (this.diceRolledInCurrentTurn) {
                alert('В этом ходе кубик уже брошен!');
                return;
            }
            console.log('📤 Отправляем запрос на бросок кубика на сервер');
            this.socket.emit('roll-dice');
        } else {
            if (this.isSpecialZoneActive) {
                alert('Сейчас активна специальная зона!');
                return;
            }
            if (this.diceRolledInCurrentTurn) {
                alert('В этом ходе кубик уже брошен!');
                return;
            }
            const diceElement = document.getElementById('dice');
            if (!diceElement) return;
            diceElement.classList.add('rolling');
            setTimeout(() => {
                this.diceResult = Math.floor(Math.random() * 6) + 1;
                diceElement.textContent = this.diceResult;
                diceElement.classList.remove('rolling');
                const taskNames = { 1: 'Кухня', 2: 'Бар', 3: 'Знания', 4: 'Ситуация', 5: 'Сервис', 6: 'Продажи' };
                const taskTypeElement = document.getElementById('task-type');
                if (taskTypeElement) taskTypeElement.textContent = taskNames[this.diceResult];
                this.diceRolledInCurrentTurn = true;
                this.waitingForAnswer = true;
                setTimeout(() => this.drawCard(this.diceResult), 500);
            }, 1500);
        }
        this.updateRollButton();
    }

    drawCard(type) {
        console.log('🃏 Рисуем карточку для категории:', type);
        const cards = this.cards[type];
        if (!cards || cards.length === 0) return;
        const randomCard = cards[Math.floor(Math.random() * cards.length)];
        console.log('✅ Выбран вопрос:', randomCard);
        if (this.gameMode === 'local') {
            this.showQuestion(randomCard.question, type, randomCard.instruction, true);
        }
    }

    showQuestion(question, category, instruction = '', isAnsweringPlayer = false) {
        console.log('❓ Показываем вопрос:', { question, category, instruction, isAnsweringPlayer, role: this.role });
        const modal = document.getElementById('card-modal');
        if (!modal) { console.error('❌ Модальное окно не найдено!'); return; }
        const cardContent = modal.querySelector('.card-content');
        if (!cardContent) { console.error('❌ Контент карточки не найден!'); return; }
        document.getElementById('card-dice').textContent = category;
        document.getElementById('card-category').textContent = this.getCategoryName(category);
        document.getElementById('card-question').textContent = question;
        document.getElementById('card-instruction').textContent = instruction || '';
        const answerBtn = document.getElementById('answer-received');
        const masterBtn = document.getElementById('master-evaluation');

        // Активируем PiP для отвечающего игрока
        if (isAnsweringPlayer && this.role !== 'master') {
            this.setPipForPlayer(true, this.socket.id);
        }

        if (this.gameMode === 'online') {
            if (isAnsweringPlayer) {
                answerBtn.style.display = 'block';
                masterBtn.style.display = 'none';
                answerBtn.textContent = 'Завершить ответ';
                answerBtn.onclick = () => {
                    console.log('✅ Игрок завершил ответ');
                    this.answerCompleted = true;
                    if (this.socket && this.isConnected) this.socket.emit('answer-completed');
                    this.stopTimerAndCloseCard();
                };
            } else if (this.role === 'master') {
                answerBtn.style.display = 'none';
                masterBtn.style.display = 'none';
            } else {
                answerBtn.style.display = 'none';
                masterBtn.style.display = 'none';
            }
        } else {
            answerBtn.style.display = 'block';
            masterBtn.style.display = 'none';
            answerBtn.textContent = 'Завершить ответ';
            answerBtn.onclick = () => {
                this.stopTimerAndCloseCard();
                this.showMasterPanel();
            };
        }
        modal.classList.add('active');
        setTimeout(() => {
            cardContent.classList.add('flipped');
            if (this.gameMode === 'local') this.startTimer();
        }, 1000);
    }

    showMasterButtonInCard() {
        console.log('👑 Показываем кнопку для ведущего');
        const modal = document.getElementById('card-modal');
        if (!modal) return;
        const answerBtn = document.getElementById('answer-received');
        const masterBtn = document.getElementById('master-evaluation');
        if (this.role === 'master') {
            answerBtn.style.display = 'none';
            masterBtn.style.display = 'block';
            masterBtn.textContent = 'Приступить к оцениванию';
            masterBtn.onclick = () => {
                console.log('👑 Ведущий начал оценивание');
                if (this.socket && this.isConnected) this.socket.emit('start-evaluation');
                this.hideCard();
                this.showMasterPanel();
            };
            if (!modal.classList.contains('active')) {
                modal.classList.add('active');
                const cardContent = modal.querySelector('.card-content');
                if (cardContent) cardContent.classList.add('flipped');
            }
        }
    }

    getCategoryName(type) {
        const names = { 1: 'Кухня', 2: 'Бар', 3: 'Знания', 4: 'Ситуация', 5: 'Сервис', 6: 'Продажи' };
        return names[type] || 'Неизвестная категория';
    }

    startTimer() {
        clearInterval(this.timerInterval);
        this.timer = 60;
        const timerElement = document.getElementById('timer');
        if (timerElement) timerElement.textContent = this.timer;
        this.timerInterval = setInterval(() => {
            this.timer--;
            if (timerElement) timerElement.textContent = this.timer;
            if (this.timer <= 0) this.stopTimerAndCloseCard();
        }, 1000);
    }

    stopTimerAndCloseCard() {
        console.log('⏱️ Таймер остановлен, закрываем карточку');
        clearInterval(this.timerInterval);
        const isAnsweringPlayer = (this.role === 'player1' && this.currentPlayer === 1) ||
                                 (this.role === 'player2' && this.currentPlayer === 2);
        if (this.gameMode === 'online') {
            if (isAnsweringPlayer) {
                this.answerCompleted = true;
                if (this.socket && this.isConnected) this.socket.emit('answer-completed');
            }
        } else {
            this.answerCompleted = true;
        }
        this.hideCard();
        this.setPipForPlayer(false); // выключаем PiP
        if (this.gameMode === 'local' || this.role === 'master') {
            setTimeout(() => this.showMasterPanel(), 500);
        }
    }

    hideCard() {
        const modal = document.getElementById('card-modal');
        if (!modal) return;
        const cardContent = modal.querySelector('.card-content');
        if (cardContent) cardContent.classList.remove('flipped');
        setTimeout(() => modal.classList.remove('active'), 500);
    }

    showMasterPanel() {
        console.log('👑 Показываем панель ведущего');
        this.resetSelection();
        const panel = document.getElementById('master-panel');
        if (panel) {
            panel.style.display = 'block';
            panel.style.opacity = '0';
            panel.style.transform = 'translateX(-50%) translateY(20px)';
            requestAnimationFrame(() => {
                panel.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
                panel.style.opacity = '1';
                panel.style.transform = 'translateX(-50%) translateY(0)';
            });
            this.updateMasterPanelButtons();
        }
        this.showNotification('Оцените ответ команд и нажмите "Следующий ход"', 'info');
    }

    hideMasterPanel() {
        const panel = document.getElementById('master-panel');
        if (panel) {
            panel.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            panel.style.opacity = '0';
            panel.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => {
                panel.style.display = 'none';
                panel.style.opacity = '1';
                panel.style.transform = 'translateX(-50%) translateY(0)';
            }, 300);
        }
    }

    resetSelection() {
        this.selectedPoints = { 1: 0, 2: 0 };
        this.pointsApplied = false;
        this.applyButtonClicked = false;
        this.updateSelectionDisplay(1);
        this.updateSelectionDisplay(2);
        if (this.gameMode === 'local' || this.role === 'master') {
            document.querySelectorAll('.point-btn.compact').forEach(btn => {
                btn.classList.remove('selected');
                btn.disabled = false;
            });
            const nextTurnBtn = document.getElementById('next-turn');
            if (nextTurnBtn) nextTurnBtn.disabled = false;
        } else {
            document.querySelectorAll('.point-btn.compact').forEach(btn => {
                btn.classList.remove('selected');
                btn.disabled = true;
            });
            const nextTurnBtn = document.getElementById('next-turn');
            if (nextTurnBtn) nextTurnBtn.disabled = true;
        }
    }

    updateSelectionDisplay(team) {
        const element = document.getElementById(`team${team}-selection`);
        if (!element) return;
        const points = this.selectedPoints[team];
        const valueElement = element.querySelector('.selection-value');
        if (valueElement) {
            valueElement.textContent = points === 0 ? '0' : (points > 0 ? '+' : '') + points;
            valueElement.style.color = points > 0 ? '#4CAF50' : points < 0 ? '#F44336' : '#FFC107';
        }
    }

    selectPoints(team, points) {
        if (this.gameMode === 'online' && this.role !== 'master') return;
        if (this.gameMode === 'local' && this.role !== 'local') return;
        document.querySelectorAll(`.point-btn.compact[data-team="${team}"]`).forEach(btn => {
            btn.classList.remove('selected');
        });
        if (this.selectedPoints[team] === points) {
            this.selectedPoints[team] = 0;
        } else {
            this.selectedPoints[team] = points;
            const selectedBtn = document.querySelector(`.point-btn.compact[data-team="${team}"][data-points="${points}"]`);
            if (selectedBtn) selectedBtn.classList.add('selected');
        }
        this.updateSelectionDisplay(team);
    }

    updateMasterPanelButtons() {
        const activeTeam = this.currentPlayer;
        const inactiveTeam = activeTeam === 1 ? 2 : 1;
        document.querySelectorAll(`.point-btn.compact[data-team="${inactiveTeam}"][data-points="3"]`).forEach(btn => btn.classList.add('hidden'));
        document.querySelectorAll(`.point-btn.compact[data-team="${inactiveTeam}"][data-points="-3"]`).forEach(btn => btn.classList.add('hidden'));
        document.querySelectorAll(`.point-btn.compact[data-team="${inactiveTeam}"][data-points="1"]`).forEach(btn => btn.classList.remove('hidden'));
        document.querySelectorAll(`.point-btn.compact[data-team="${inactiveTeam}"][data-points="2"]`).forEach(btn => btn.classList.remove('hidden'));
        document.querySelectorAll(`.point-btn.compact[data-team="${inactiveTeam}"][data-points="-1"]`).forEach(btn => btn.classList.remove('hidden'));
        document.querySelectorAll(`.point-btn.compact[data-team="${inactiveTeam}"][data-points="-2"]`).forEach(btn => btn.classList.remove('hidden'));
        document.querySelectorAll(`.point-btn.compact[data-team="${activeTeam}"]`).forEach(btn => btn.classList.remove('hidden'));
        document.querySelectorAll('.team-control-row').forEach(row => row.classList.remove('current-team-row'));
        const activeRow = document.getElementById(`team-control-row-${activeTeam}`);
        if (activeRow) activeRow.classList.add('current-team-row');
    }

    nextTurn() {
        if (this.gameMode === 'online' && this.role !== 'master') {
            alert('Только ведущий может переходить к следующему ходу!');
            return;
        }
        if (this.isSpecialZoneActive) {
            alert('Нельзя переходить к следующему ходу пока активна специальная зона!');
            return;
        }
        for (let team of [1, 2]) {
            const points = this.selectedPoints[team];
            if (points !== 0) {
                this.scores[team] += points;
                this.movePiece(team, points, false);
            }
        }
        this.updateScores();
        if (this.gameMode === 'online' && this.socket && this.isConnected) {
            this.socket.emit('next-turn', { scores: this.scores, positions: this.positions });
        }
        this.hideMasterPanel();
        this.resetForNextTurn();
    }

    resetForNextTurn() {
        this.triggeredZonesInTurn = { 1: new Set(), 2: new Set() };
        this.isSpecialZoneActive = false;
        this.diceRolledInCurrentTurn = false;
        this.waitingForAnswer = false;
        this.answerCompleted = false;
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        this.updateTurnIndicator();
        this.updateRollButton();
        clearInterval(this.timerInterval);
        const timer = document.getElementById('timer');
        if (timer) timer.textContent = '60';
        const dice = document.getElementById('dice');
        if (dice) dice.textContent = '?';
        const taskType = document.getElementById('task-type');
        if (taskType) taskType.textContent = '';
        this.resetSelection();
        this.showNotification(`Сейчас ходит команда ${this.currentPlayer}`, 'info');
    }

    movePiece(team, points, isSpecialZone = false, skipEffects = false) {
        if (this.teamAnimationInProgress[team]) {
            this.animationQueue[team].push({ points, isSpecialZone, skipEffects });
            return;
        }
        const piece = document.getElementById(`piece${team}`);
        if (!piece) return;
        const newPosition = Math.max(0, Math.min(this.positions[team] + points, 40));
        const delta = newPosition - this.positions[team];
        if (delta === 0) {
            this.processNextInQueue(team);
            return;
        }
        this.teamAnimationInProgress[team] = true;
        if (isSpecialZone && !skipEffects) {
            if (delta > 0) this.scores[team] += delta;
            else if (delta < 0) this.scores[team] += delta;
        }
        const fromPosition = this.positions[team];
        this.positions[team] = newPosition;
        if (!skipEffects) this.updateScores();
        this.animatePieceMovement(team, fromPosition, newPosition, () => {
            this.teamAnimationInProgress[team] = false;
            this.updatePieces();
            if (!skipEffects) {
                if (this.gameMode === 'local') {
                    if (Math.abs(points) <= 6 && !isSpecialZone) this.checkSpecialZoneLocal(team, newPosition);
                } else {
                    if (Math.abs(points) <= 6 && !isSpecialZone && this.socket && this.isConnected) {
                        this.socket.emit('check-special-zone', { team, position: newPosition });
                    }
                    if (this.socket && this.isConnected) {
                        this.socket.emit('update-game', { scores: this.scores, positions: this.positions, currentPlayer: this.currentPlayer });
                    }
                }
                if (newPosition >= 40) {
                    const winnerName = team === 1 ? this.players.player1 : this.players.player2;
                    this.showWinner(team, winnerName, `🎉 Победила команда ${team} (${winnerName})!`);
                }
            }
            this.processNextInQueue(team);
        });
    }

    checkSpecialZoneLocal(team, position) {
        const cell = document.getElementById(`cell-${position}`);
        if (!cell) return;
        let zoneType = null;
        if (cell.classList.contains('grams')) zoneType = 'grams';
        else if (cell.classList.contains('description')) zoneType = 'description';
        else if (cell.classList.contains('allergy')) zoneType = 'allergy';
        if (zoneType && !this.triggeredZonesInTurn[team].has(zoneType)) {
            this.triggeredZonesInTurn[team].add(zoneType);
            const zoneSettings = this.zoneSettings[zoneType];
            const zoneData = { team, zoneType, zoneName: zoneSettings.name, question: zoneSettings.question, positive: zoneSettings.positive, negative: zoneSettings.negative };
            this.isSpecialZoneActive = true;
            this.showSpecialZoneModal(zoneData);
        }
    }

    animatePositionFromServer(team, newPosition) {
        if (this.positions[team] === newPosition) return;
        const delta = newPosition - this.positions[team];
        this.movePiece(team, delta, false, true);
    }

    processNextInQueue(team) {
        if (this.animationQueue[team].length > 0) {
            const next = this.animationQueue[team].shift();
            this.movePiece(team, next.points, next.isSpecialZone, next.skipEffects);
        }
    }

    animatePieceMovement(team, fromPosition, toPosition, callback) {
        const piece = document.getElementById(`piece${team}`);
        if (!piece) { if (callback) callback(); return; }
        const positions = this.generateBoardPositions();
        const steps = Math.abs(toPosition - fromPosition);
        const direction = toPosition > fromPosition ? 1 : -1;
        if (steps === 0) { if (callback) callback(); return; }
        let currentStep = 0;
        const moveNext = () => {
            if (currentStep >= steps) { if (callback) callback(); return; }
            currentStep++;
            const nextPosition = fromPosition + (direction * currentStep);
            if (positions[nextPosition]) {
                piece.style.transition = `left 300ms ease-out, top 300ms ease-out`;
                piece.style.left = (positions[nextPosition].x + 5) + 'px';
                piece.style.top = (positions[nextPosition].y + 5) + 'px';
                piece.classList.add('moving');
                setTimeout(() => {
                    piece.classList.remove('moving');
                    setTimeout(moveNext, 100);
                }, 300);
            } else {
                setTimeout(moveNext, 50);
            }
        };
        setTimeout(moveNext, 100);
    }

    showSpecialZoneModal(data) {
        const existingModal = document.querySelector('.special-zone-modal');
        if (existingModal) existingModal.remove();
        const modal = document.createElement('div');
        modal.className = 'special-zone-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 500px;
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border-radius: 15px;
            padding: 25px;
            color: white;
            z-index: 1001;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            border: 4px solid ${this.getZoneColor(data.zoneType)};
            animation: modalSlideIn 0.3s ease-out;
        `;
        const isMaster = this.gameMode === 'local' || this.role === 'master';
        const teamName = data.team === 1 ? 
            (this.gameMode === 'online' ? `Команда 1: ${this.players.player1 || ''}` : 'Команда 1') : 
            (this.gameMode === 'online' ? `Команда 2: ${this.players.player2 || ''}` : 'Команда 2');
        modal.innerHTML = `
            <div class="zone-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="color: ${this.getZoneColor(data.zoneType)}; margin: 0; font-size: 20px;">
                    <i class="fas fa-star"></i> ${data.zoneName}
                </h3>
                <span style="color: #aaa; font-size: 14px;">${teamName}</span>
            </div>
            <div style="font-size: 16px; margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 10px; line-height: 1.5;">
                ${data.question}
            </div>
            ${isMaster ? `
            <div style="text-align: center; margin-top: 25px;">
                <button id="special-correct" class="btn special-zone-btn" style="background: #4CAF50; margin-right: 15px; padding: 10px 20px;">
                    <i class="fas fa-check"></i> Верно (+${data.positive})
                </button>
                <button id="special-incorrect" class="btn special-zone-btn" style="background: #f44336; padding: 10px 20px;">
                    <i class="fas fa-times"></i> Неверно (${data.negative})
                </button>
            </div>
            ` : `
            <div style="text-align: center; margin-top: 25px; padding: 15px; background: rgba(255, 193, 7, 0.1); border-radius: 10px;">
                <i class="fas fa-clock fa-spin" style="color: #FFC107; font-size: 24px; margin-bottom: 10px; display: block;"></i>
                <p style="color: #FFC107; margin: 0; font-size: 14px;">Ожидайте оценки ведущего...</p>
            </div>
            `}
        `;
        document.body.appendChild(modal);
        if (isMaster) {
            modal.querySelector('#special-correct').addEventListener('click', () => {
                const points = data.positive;
                if (this.gameMode === 'local') {
                    this.movePiece(data.team, points, true, false);
                    this.isSpecialZoneActive = false;
                } else if (this.socket && this.isConnected) {
                    this.socket.emit('special-zone-result', { roomCode: this.roomCode, team: data.team, points: points });
                }
                modal.style.animation = 'modalSlideOut 0.3s ease-out';
                setTimeout(() => modal.remove(), 300);
            });
            modal.querySelector('#special-incorrect').addEventListener('click', () => {
                const points = data.negative;
                if (this.gameMode === 'local') {
                    this.movePiece(data.team, points, true, false);
                    this.isSpecialZoneActive = false;
                } else if (this.socket && this.isConnected) {
                    this.socket.emit('special-zone-result', { roomCode: this.roomCode, team: data.team, points: points });
                }
                modal.style.animation = 'modalSlideOut 0.3s ease-out';
                setTimeout(() => modal.remove(), 300);
            });
        }
    }

    getZoneColor(zoneType) {
        switch(zoneType) {
            case 'grams': return '#4CAF50';
            case 'description': return '#9C27B0';
            case 'allergy': return '#E91E63';
            default: return '#4CAF50';
        }
    }

    updatePieces() {
        const positions = this.generateBoardPositions();
        for (let team of [1, 2]) {
            const piece = document.getElementById(`piece${team}`);
            if (!piece) continue;
            const position = this.positions[team];
            if (positions[position]) {
                piece.style.left = (positions[position].x + 5) + 'px';
                piece.style.top = (positions[position].y + 5) + 'px';
            }
        }
    }

    updateScores() {
        const team1Score = document.querySelector('#team1-score .score');
        const team2Score = document.querySelector('#team2-score .score');
        if (team1Score) team1Score.textContent = this.scores[1];
        if (team2Score) team2Score.textContent = this.scores[2];
    }

    updateTurnIndicator() {
        document.querySelectorAll('.video-box').forEach(box => box.classList.remove('current-turn'));
        document.querySelectorAll('.team-score').forEach(score => score.classList.remove('current-turn'));
        document.querySelectorAll('.current-turn-indicator').forEach(indicator => indicator.style.display = 'none');
        const currentTeam = this.currentPlayer;
        const videoTeam = document.getElementById(`video-team${currentTeam}-container`);
        const teamScore = document.getElementById(`team${currentTeam}-score`);
        const turnIndicator = document.getElementById(`turn-indicator-${currentTeam}`);
        if (videoTeam) videoTeam.classList.add('current-turn');
        if (teamScore) teamScore.classList.add('current-turn');
        if (turnIndicator) turnIndicator.style.display = 'block';
        if (teamScore) {
            if (currentTeam === 1) {
                teamScore.style.borderColor = '#2196F3';
                teamScore.style.boxShadow = '0 0 15px rgba(33, 150, 243, 0.3)';
            } else {
                teamScore.style.borderColor = '#FF5722';
                teamScore.style.boxShadow = '0 0 15px rgba(255, 87, 34, 0.3)';
            }
        }
        if (videoTeam) {
            if (currentTeam === 1) {
                videoTeam.style.borderColor = '#2196F3';
                videoTeam.style.boxShadow = '0 0 20px rgba(33, 150, 243, 0.5)';
            } else {
                videoTeam.style.borderColor = '#FF5722';
                videoTeam.style.boxShadow = '0 0 20px rgba(255, 87, 34, 0.5)';
            }
        }
        if (this.role === 'master' || this.gameMode === 'local') this.updateMasterPanelButtons();
    }

    updateRollButton() {
        const rollBtn = document.getElementById('roll-dice');
        if (!rollBtn) return;
        if (this.gameMode === 'local') {
            const canRoll = !this.diceRolledInCurrentTurn && !this.isSpecialZoneActive;
            rollBtn.disabled = !canRoll;
            if (rollBtn.disabled) {
                if (this.isSpecialZoneActive) rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Активна специальная зона';
                else rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Кубик уже брошен';
            } else {
                rollBtn.innerHTML = `<i class="fas fa-dice"></i> Бросить кубик (Ход команды ${this.currentPlayer})`;
            }
        } else if (this.gameMode === 'online') {
            const isPlayer1 = this.role === 'player1';
            const isPlayer2 = this.role === 'player2';
            const isMaster = this.role === 'master';
            const isSpectator = this.role === 'spectator';
            const canRoll = (isPlayer1 && this.currentPlayer === 1) || (isPlayer2 && this.currentPlayer === 2);
            const canRollNow = canRoll && !this.diceRolledInCurrentTurn && !this.isSpecialZoneActive;
            rollBtn.disabled = !canRollNow || isMaster || isSpectator || this.waitingForAnswer;
            if (rollBtn.disabled) {
                if (isMaster || isSpectator) rollBtn.innerHTML = '<i class="fas fa-dice"></i> Бросок кубика (только игроки)';
                else if (!canRoll) rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Ожидайте хода';
                else if (this.diceRolledInCurrentTurn) rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Ожидайте ответа';
                else if (this.waitingForAnswer) rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Ожидайте ответа';
                else if (this.isSpecialZoneActive) rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Активна специальная зона';
            } else {
                rollBtn.innerHTML = '<i class="fas fa-dice"></i> Бросить кубик';
            }
        }
    }

    setupRoleInterface() {
        const isMaster = this.role === 'master';
        const isSpectator = this.role === 'spectator';
        const panel = document.getElementById('master-panel');
        if (panel) {
            if (isMaster || this.gameMode === 'local') {
                panel.style.display = 'block';
                this.hideMasterPanel();
            } else {
                panel.style.display = 'none';
            }
        }
        if (isSpectator) {
            const rollBtn = document.getElementById('roll-dice');
            if (rollBtn) rollBtn.style.display = 'none';
            const answerBtn = document.getElementById('answer-received');
            if (answerBtn) answerBtn.style.display = 'none';
            const masterBtn = document.getElementById('master-evaluation');
            if (masterBtn) masterBtn.style.display = 'none';
            const nextTurnBtn = document.getElementById('next-turn');
            if (nextTurnBtn) nextTurnBtn.style.display = 'none';
            document.querySelectorAll('.point-btn.compact').forEach(btn => btn.style.display = 'none');
        }
        document.querySelectorAll('.deck').forEach(deck => {
            deck.style.cursor = 'default';
            deck.style.pointerEvents = 'none';
        });
        this.updateRollButton();
        this.updateConnectionInfoUI();
    }

    getRoleName() {
        switch(this.role) {
            case 'master': return 'Ведущий';
            case 'player1': return 'Команда 1';
            case 'player2': return 'Команда 2';
            case 'spectator': return 'Наблюдатель';
            case 'local': return 'Локальный игрок';
            default: return 'Наблюдатель';
        }
    }

    getWelcomeMessage() {
        if (this.gameMode === 'local') return 'Вы играете в локальном режиме';
        else return `Вы подключились как ${this.playerName} (${this.getRoleName()})`;
    }

    updateConnectionInfoUI() {
        const connectionInfo = document.querySelector('.connection-info.horizontal');
        if (!connectionInfo) return;
        const statusSpan = connectionInfo.querySelector('.connection-status span');
        const roomSpan = connectionInfo.querySelector('.room-info span');
        const playerSpan = connectionInfo.querySelector('.player-info span');
        if (statusSpan) {
            statusSpan.textContent = this.isConnected ? 'Подключено' : 'Не подключено';
            const statusDiv = connectionInfo.querySelector('.connection-status');
            statusDiv.className = `connection-status ${this.isConnected ? 'connected' : 'disconnected'}`;
        }
        if (roomSpan) {
            roomSpan.textContent = `Комната: ${this.roomCode || 'Нет'}`;
        }
        if (playerSpan) {
            playerSpan.textContent = `${this.playerName || 'Игрок'} (${this.getRoleName()})`;
        }
    }

    updatePlayers(players) {
        this.players.master = players.master?.name || '';
        this.players.player1 = players.player1?.name || '';
        this.players.player2 = players.player2?.name || '';
        // socketId обновляются отдельно через participants-update
        this.updateVideoPlaceholders();
        this.updateMasterPanelNames();
        this.updateConnectionInfoUI();
    }

    updateMasterPanelNames() {
        const masterTeam1 = document.getElementById('master-team1-name');
        const masterTeam2 = document.getElementById('master-team2-name');
        if (masterTeam1) {
            masterTeam1.textContent = `Команда 1: ${this.players.player1 || 'Ожидает'}`;
        }
        if (masterTeam2) {
            masterTeam2.textContent = `Команда 2: ${this.players.player2 || 'Ожидает'}`;
        }
    }

    getRoleNameFromType(roleType) {
        switch(roleType) {
            case 'master': return 'Ведущий';
            case 'player1': return 'Команда 1';
            case 'player2': return 'Команда 2';
            case 'spectator': return 'Наблюдатель';
            default: return 'Игрок';
        }
    }

    showWinner(team, winnerName, message) {
        const winnerModal = document.createElement('div');
        winnerModal.className = 'winner-modal';
        winnerModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            animation: fadeIn 0.5s ease-out;
        `;
        const teamColor = team === 1 ? '#2196F3' : '#FF5722';
        winnerModal.innerHTML = `
            <div class="winner-content" style="
                background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
                padding: 50px;
                border-radius: 20px;
                text-align: center;
                border: 5px solid ${teamColor};
                max-width: 600px;
                width: 90%;
                animation: scaleIn 0.5s ease-out;
            ">
                <div style="font-size: 80px; margin-bottom: 20px;">🏆</div>
                <h1 style="color: ${teamColor}; font-size: 36px; margin-bottom: 20px;">ПОБЕДА!</h1>
                <h2 style="color: white; font-size: 28px; margin-bottom: 30px;">${message}</h2>
                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin-bottom: 30px;">
                    <p style="font-size: 20px; margin-bottom: 10px;">ФИНАЛЬНЫЙ СЧЕТ</p>
                    <div style="display: flex; justify-content: center; gap: 40px; margin-top: 20px;">
                        <div><h3 style="color: #2196F3;">Команда 1</h3><div style="font-size: 48px; font-weight: bold;">${this.scores[1]}</div></div>
                        <div style="font-size: 36px; align-self: center;">:</div>
                        <div><h3 style="color: #FF5722;">Команда 2</h3><div style="font-size: 48px; font-weight: bold;">${this.scores[2]}</div></div>
                    </div>
                </div>
                <button id="close-winner" class="btn" style="background: ${teamColor}; padding: 15px 40px; font-size: 18px; margin-top: 20px;">
                    <i class="fas fa-trophy"></i> Закрыть
                </button>
            </div>
        `;
        document.body.appendChild(winnerModal);
        this.startFireworks(teamColor);
        winnerModal.querySelector('#close-winner').addEventListener('click', () => {
            winnerModal.remove();
            const fireworks = document.getElementById('fireworks');
            if (fireworks) { fireworks.style.display = 'none'; fireworks.innerHTML = ''; }
        });
        setTimeout(() => {
            if (winnerModal.parentNode) {
                winnerModal.remove();
                const fireworks = document.getElementById('fireworks');
                if (fireworks) { fireworks.style.display = 'none'; fireworks.innerHTML = ''; }
            }
        }, 10000);
    }

    startFireworks(color) {
        const fireworks = document.getElementById('fireworks');
        if (!fireworks) return;
        fireworks.style.display = 'block';
        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const firework = document.createElement('div');
                firework.style.position = 'fixed';
                firework.style.left = Math.random() * 100 + 'vw';
                firework.style.top = Math.random() * 100 + 'vh';
                firework.style.width = '8px';
                firework.style.height = '8px';
                firework.style.background = color;
                firework.style.borderRadius = '50%';
                firework.style.animation = 'firework 1.5s forwards';
                firework.style.zIndex = '2001';
                fireworks.appendChild(firework);
                setTimeout(() => firework.remove(), 1500);
            }, i * 100);
        }
    }

    showAlert(message) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert';
        alertDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${message}</span><button class="close-alert">&times;</button>`;
        alertDiv.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #f44336; color: white; padding: 15px 25px; border-radius: 10px;
            z-index: 10001; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            display: flex; align-items: center; gap: 10px; animation: slideDown 0.3s ease-out; max-width: 90%;
        `;
        document.body.appendChild(alertDiv);
        alertDiv.querySelector('.close-alert').addEventListener('click', () => alertDiv.remove());
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.style.animation = 'slideUp 0.3s ease-out';
                setTimeout(() => alertDiv.remove(), 300);
            }
        }, 5000);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i><span>${message}</span>`;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: ${type === 'error' ? '#f44336' : type === 'warning' ? '#FF9800' : '#2196F3'};
            color: white; padding: 15px 25px; border-radius: 10px; z-index: 10000;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3); animation: slideIn 0.3s ease-out;
            display: flex; align-items: center; gap: 10px; max-width: 300px;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // ========== Socket.IO обработчики ==========
    setupSocketConnection(modal, resolve) {
        console.log('🔌 Подключаемся к серверу:', this.serverUrl);
        
        const statusText = modal.querySelector('#status-text');
        const statusDiv = modal.querySelector('#connection-status');
        
        this.socket = io(this.serverUrl, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 20000
        });
        
        this.socket.on('connect', () => {
            this.isConnected = true;
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> Подключено к серверу';
            statusDiv.style.background = 'rgba(76, 175, 80, 0.2)';
            statusDiv.style.color = '#4CAF50';
            console.log('✅ Подключено к серверу');
            this.updateConnectionInfoUI();
        });
        
        this.socket.on('connect_error', (error) => {
            statusText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Ошибка подключения`;
            statusDiv.style.background = 'rgba(244, 67, 54, 0.2)';
            statusDiv.style.color = '#f44336';
            console.error('❌ Ошибка подключения:', error);
        });
        
        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            console.log('🔌 Отключен от сервера:', reason);
            this.updateConnectionInfoUI();
            this.showNotification('Потеряно соединение с сервером. Попытка переподключения...', 'warning');
        });
        
        this.socket.on('reconnect', () => {
            this.isConnected = true;
            console.log('✅ Переподключено к серверу');
            this.updateConnectionInfoUI();
            this.showNotification('Соединение восстановлено!', 'info');
            
            // Если мы были в комнате, повторно присоединяемся
            if (this.roomCode && this.playerName && this.role) {
                this.socket.emit('join-room', {
                    roomCode: this.roomCode,
                    playerName: this.playerName,
                    role: this.role
                });
            }
        });
        
        // ---------- События комнат ----------
        this.socket.on('role-unavailable', (data) => {
            statusText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${data.message}`;
            alert(data.message);
            if (data.availableRoles.includes('spectator')) {
                if (confirm('Хотите присоединиться как наблюдатель?')) {
                    this.role = 'spectator';
                    this.socket.emit('join-room', {
                        roomCode: this.roomCode,
                        playerName: this.playerName,
                        role: 'spectator'
                    });
                }
            }
        });
        
        this.socket.on('room-created', async (data) => {
            this.roomCode = data.roomCode;
            this.playerName = data.playerName;
            this.players.master = data.playerName;
            this.players.masterSocketId = this.socket.id;
            this.gameMode = data.gameMode;
            
            modal.querySelector('#room-info').style.display = 'block';
            modal.querySelector('#room-code-display').textContent = data.roomCode;
            
            modal.querySelector('#copy-code-btn').addEventListener('click', () => {
                navigator.clipboard.writeText(data.roomCode);
                const copyBtn = modal.querySelector('#copy-code-btn');
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
                copyBtn.style.background = '#4CAF50';
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    copyBtn.style.background = '';
                }, 2000);
            });
            
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> Комната создана!';
            
            setTimeout(() => {
                modal.remove();
                this.continueGameInitialization().then(resolve);
            }, 2000);
            
            this.updateConnectionInfoUI();
        });
        
        this.socket.on('join-success', (data) => {
            this.roomCode = data.roomCode;
            this.playerName = data.playerName;
            this.role = data.role;
            this.gameMode = data.gameMode;
            
            // Сохраняем свой socket.id (он уже есть в this.socket.id)
            // Получаем socketId других участников из data.players
            if (data.players) {
                this.players.master = data.players.master?.name || '';
                this.players.masterSocketId = data.players.master?.socketId || null;
                this.players.player1 = data.players.player1?.name || '';
                this.players.player1SocketId = data.players.player1?.socketId || null;
                this.players.player2 = data.players.player2?.name || '';
                this.players.player2SocketId = data.players.player2?.socketId || null;
            }
            
            if (data.gameState) {
                this.currentPlayer = data.gameState.currentPlayer;
                this.scores = data.gameState.scores || this.scores;
                this.positions = data.gameState.positions || this.positions;
                this.diceResult = data.gameState.diceResult || 0;
                this.isSpecialZoneActive = data.gameState.isSpecialZoneActive || false;
            }
            
            this.updatePlayers(data.players); // обновит имена в UI
            
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> Вы в игре!';
            
            setTimeout(() => {
                modal.remove();
                this.continueGameInitialization().then(resolve);
            }, 2000);
            
            this.updateConnectionInfoUI();
            
            // Если есть локальный поток – начинаем WebRTC
            if (this.localStream) {
                this.socket.emit('webrtc-ready', { roomCode: this.roomCode });
                this.initiateWebRTCConnections();
            }
        });

        // ---------- Обновление участников (основной источник информации о socketId) ----------
        this.socket.on('participants-update', (participants) => {
            console.log('👥 participants-update:', participants);

            // Обновляем данные с проверкой изменений socketId
            const updatePlayer = (role, data) => {
                const oldSocketId = this.players[`${role}SocketId`];
                const newSocketId = data?.socketId || null;
                const newName = data?.name || '';

                this.players[role] = newName;
                this.players[`${role}SocketId`] = newSocketId;

                // Если socketId изменился и существует новое значение – закрываем старое соединение и создаём новое
                if (oldSocketId && newSocketId && oldSocketId !== newSocketId) {
                    console.log(`🔄 SocketId ${role} изменился: ${oldSocketId} -> ${newSocketId}, обновляем соединение`);
                    this.closePeerConnection(oldSocketId);
                    if (this.localStream && newSocketId !== this.socket.id) {
                        this.createPeerConnection(newSocketId, true);
                    }
                }
                // Если появился новый участник
                if (!oldSocketId && newSocketId && newSocketId !== this.socket.id) {
                    console.log(`🆕 Новый участник ${role} (${newSocketId})`);
                    if (this.localStream) {
                        this.createPeerConnection(newSocketId, true);
                    }
                }
                // Если участник ушёл (newSocketId === null)
                if (oldSocketId && !newSocketId) {
                    console.log(`❌ Участник ${role} (${oldSocketId}) покинул комнату`);
                    this.closePeerConnection(oldSocketId);
                }
            };

            updatePlayer('master', participants.master);
            updatePlayer('player1', participants.player1);
            updatePlayer('player2', participants.player2);
            this.players.spectators = participants.spectators || [];

            this.updateVideoPlaceholders();
            this.updateMasterPanelNames();
        });
        
        // ---------- События выхода игроков ----------
        this.socket.on('player-left', (data) => {
            this.showNotification(`${data.playerName} ${data.message}`, 'warning');
            // Обработка будет выполнена в participants-update, но дублируем для UI
            this.updateConnectionInfoUI();
        });

        this.socket.on('spectator-joined', (data) => {
            this.showNotification(`${data.playerName} присоединился как наблюдатель`, 'info');
            this.updateConnectionInfoUI();
        });
        
        this.socket.on('spectator-left', (data) => {
            this.showNotification(`${data.playerName} покинул комнату как наблюдатель`, 'info');
            this.updateConnectionInfoUI();
        });
        
        this.socket.on('room-closed', (message) => {
            this.showNotification(message, 'error');
            setTimeout(() => location.reload(), 3000);
        });
        
        // ========== WebRTC сигнализация ==========
        this.socket.on('webrtc-peer-ready', async ({ peerId, peerName, peerRole }) => {
            console.log(`📞 Готов к WebRTC с ${peerName} (${peerRole}), socketId: ${peerId}`);
            if (this.localStream && !this.peerConnections.has(peerId) && peerId !== this.socket.id) {
                await this.createPeerConnection(peerId, true);
            }
        });
        
        this.socket.on('webrtc-offer', async ({ offer, senderId, senderName }) => {
            console.log(`📞 Получен offer от ${senderName}`);
            if (!this.localStream) {
                console.log('⚠️ Нет локального потока, не можем ответить на offer');
                return;
            }
            await this.createPeerConnection(senderId, false);
            const pc = this.peerConnections.get(senderId);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    this.socket.emit('webrtc-answer', {
                        roomCode: this.roomCode,
                        targetPeerId: senderId,
                        answer: pc.localDescription
                    });
                } catch (err) {
                    console.error('❌ Ошибка обработки offer:', err);
                }
            }
        });
        
        this.socket.on('webrtc-answer', async ({ answer, senderId, senderName }) => {
            console.log(`📞 Получен answer от ${senderName}`);
            const pc = this.peerConnections.get(senderId);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (err) {
                    console.error('❌ Ошибка установки remote description:', err);
                }
            }
        });
        
        this.socket.on('webrtc-ice-candidate', ({ candidate, senderId }) => {
            const pc = this.peerConnections.get(senderId);
            if (pc) {
                pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error('❌ Ошибка добавления ICE кандидата:', e));
            }
        });
        
        // ========== Игровые события ==========
        this.socket.on('dice-rolled', (data) => {
            console.log('🎲 Получен результат броска:', data);
            this.diceResult = data.dice;
            this.answerCompleted = false;
            const diceElement = document.getElementById('dice');
            if (diceElement) {
                diceElement.textContent = data.dice;
                diceElement.classList.add('rolling');
                setTimeout(() => diceElement.classList.remove('rolling'), 500);
            }
            const taskNames = { 1: 'Кухня', 2: 'Бар', 3: 'Знания', 4: 'Ситуация', 5: 'Сервис', 6: 'Продажи' };
            const taskTypeElement = document.getElementById('task-type');
            if (taskTypeElement) taskTypeElement.textContent = taskNames[data.dice];
            this.showNotification(`${data.playerName} выбросил ${data.dice}!`, 'info');
            this.diceRolledInCurrentTurn = true;
            this.waitingForAnswer = true;
            this.updateRollButton();
        });
        
        this.socket.on('question-show', (data) => {
            console.log('📋 Получен вопрос от сервера:', data);
            const isAnsweringPlayer = (this.role === 'player1' && this.currentPlayer === 1) || 
                                     (this.role === 'player2' && this.currentPlayer === 2);
            this.currentQuestion = data.question;
            this.currentQuestionCategory = data.category;
            this.showQuestion(data.question, data.category, data.instruction, isAnsweringPlayer);
            if (this.gameMode === 'local') this.startTimer();
        });
        
        this.socket.on('answer-completed-by-player', () => {
            console.log('✅ Игрок завершил ответ, показываем кнопку для ведущего');
            if (this.role === 'master') this.showMasterButtonInCard();
        });
        
        this.socket.on('master-started-evaluation', () => {
            console.log('👑 Ведущий начал оценивание');
            this.setPipForPlayer(false); // выключаем PiP
            if (this.role !== 'master') this.hideCard();
        });
        
        this.socket.on('master-finished-evaluation', () => {
            console.log('👑 Ведущий завершил оценивание');
            if (this.role === 'master') {
                this.hideCard();
                this.showMasterPanel();
            }
        });
        
        this.socket.on('special-zone', (data) => {
            console.log('🎯 Получена специальная зона от сервера:', data);
            this.isSpecialZoneActive = true;
            this.showSpecialZoneModal(data);
        });
        
        this.socket.on('special-zone-result', (data) => {
            console.log('🎯 Результат специальной зоны от сервера:', data);
            const modal = document.querySelector('.special-zone-modal');
            if (modal) {
                modal.style.animation = 'modalSlideOut 0.3s ease-out';
                setTimeout(() => modal.remove(), 300);
            }
            this.animatePositionFromServer(data.team, data.newPosition);
            this.scores[data.team] = data.scores[data.team];
            this.updateScores();
            this.isSpecialZoneActive = false;
            this.showNotification(`Команда ${data.team} получила ${data.points > 0 ? '+' : ''}${data.points} очков!`, 'info');
        });
        
        this.socket.on('special-zone-closed', () => {
            console.log('🎯 Специальная зона закрыта на сервере');
            const modal = document.querySelector('.special-zone-modal');
            if (modal) {
                modal.style.animation = 'modalSlideOut 0.3s ease-out';
                setTimeout(() => modal.remove(), 300);
            }
            this.isSpecialZoneActive = false;
        });
        
        this.socket.on('game-updated', (gameState) => {
            console.log('🔄 Обновление состояния игры:', gameState);
            this.scores = gameState.scores || this.scores;
            this.currentPlayer = gameState.currentPlayer || this.currentPlayer;
            this.diceResult = gameState.diceResult || this.diceResult;
            this.isSpecialZoneActive = gameState.isSpecialZoneActive || false;
            for (let team of [1, 2]) {
                if (gameState.positions && gameState.positions[team] !== undefined) {
                    if (this.positions[team] !== gameState.positions[team]) {
                        this.animatePositionFromServer(team, gameState.positions[team]);
                    }
                }
            }
            this.updateScores();
            this.updateTurnIndicator();
            const diceElement = document.getElementById('dice');
            if (diceElement && this.diceResult > 0) diceElement.textContent = this.diceResult;
        });
        
        this.socket.on('turn-changed', (data) => {
            console.log('🔄 Смена хода:', data);
            this.currentPlayer = data.currentPlayer;
            this.diceRolledInCurrentTurn = false;
            this.waitingForAnswer = false;
            this.answerCompleted = false;
            this.triggeredZonesInTurn = { 1: new Set(), 2: new Set() };
            this.isSpecialZoneActive = false;
            this.updateTurnIndicator();
            this.updateRollButton();
            this.showNotification(`Сейчас ходит ${data.playerName}`, 'info');
        });
        
        this.socket.on('timer-update', (data) => {
            const timerElement = document.getElementById('timer');
            if (timerElement) timerElement.textContent = data.timer;
        });
        
        this.socket.on('timer-ended', () => {
            console.log('⏰ Время вышло!');
            this.waitingForAnswer = false;
            const isAnsweringPlayer = (this.role === 'player1' && this.currentPlayer === 1) || 
                                     (this.role === 'player2' && this.currentPlayer === 2);
            if (isAnsweringPlayer) {
                this.hideCard();
                this.answerCompleted = true;
                if (this.socket && this.isConnected) this.socket.emit('answer-completed');
            }
            this.showNotification('Время вышло!', 'warning');
        });
        
        this.socket.on('hide-card', () => this.hideCard());
        
        this.socket.on('game-over', (data) => {
            console.log('🏆 Игра окончена!', data);
            this.showWinner(data.winner, data.winnerName, data.message);
        });
        
        this.socket.on('error', (error) => {
            this.showAlert(error.message || 'Произошла ошибка');
        });
        
        this.socket.on('room-status', (data) => {
            const roomStatus = modal.querySelector('#room-status');
            if (data.exists) {
                roomStatus.innerHTML = `<i class="fas fa-check-circle"></i> Комната найдена`;
                roomStatus.className = 'room-status found';
                let slotsInfo = '';
                if (data.slots.player1) slotsInfo += 'Игрок 1 свободен, ';
                if (data.slots.player2) slotsInfo += 'Игрок 2 свободен';
                if (slotsInfo) roomStatus.innerHTML += `<br><small>${slotsInfo}</small>`;
                if (data.spectators > 0) roomStatus.innerHTML += `<br><small>Наблюдателей: ${data.spectators}</small>`;
            } else {
                roomStatus.innerHTML = `<i class="fas fa-times-circle"></i> Комната не найдена`;
                roomStatus.className = 'room-status not-found';
            }
        });
    }
}

// ========== Запуск игры ==========
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
