// Инициализация игры
class Game {
    constructor() {
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
        
        this.specialZoneQueue = [];
        this.showingSpecialZone = false;
        this.isSpecialZoneActive = false;
        
        this.triggeredZonesInTurn = {
            1: new Set(),
            2: new Set()
        };
        
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
        
        // Свойства для онлайн-игры
        this.role = null;
        this.roomCode = null;
        this.playerName = '';
        this.socket = null;
        this.isConnected = false;
        this.serverUrl = window.location.origin;
        
        // Для синхронизации
        this.currentQuestion = null;
        this.currentQuestionCategory = null;
        
        // Режим игры
        this.gameMode = null;
        
        // Хранение имен игроков
        this.players = {
            master: '',
            player1: '',
            player2: ''
        };
        
        // Для специальных зон
        this.specialZoneData = null;
        
        this.init();
    }

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
        
        const panel = document.getElementById('master-panel');
        if (panel) panel.style.display = 'block';
        
        this.updateRollButton();
    }

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
            
            joinBtn.addEventListener('click', () => {
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

    setupSocketConnection(modal, resolve) {
        console.log('🔌 Подключаемся к серверу:', this.serverUrl);
        
        const statusText = modal.querySelector('#status-text');
        const statusDiv = modal.querySelector('#connection-status');
        
        this.socket = io(this.serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        this.socket.on('connect', () => {
            this.isConnected = true;
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> Подключено к серверу';
            statusDiv.style.background = 'rgba(76, 175, 80, 0.2)';
            statusDiv.style.color = '#4CAF50';
            console.log('✅ Подключено к серверу');
        });
        
        this.socket.on('connect_error', (error) => {
            statusText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Ошибка подключения`;
            statusDiv.style.background = 'rgba(244, 67, 54, 0.2)';
            statusDiv.style.color = '#f44336';
            console.error('❌ Ошибка подключения:', error);
        });
        
        this.socket.on('role-unavailable', (data) => {
            statusText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${data.message}`;
            alert(data.message);
            
            // Предлагаем присоединиться как наблюдатель
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
        
        this.socket.on('room-created', (data) => {
            this.roomCode = data.roomCode;
            this.playerName = data.playerName;
            this.players.master = data.playerName;
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
        });
        
        this.socket.on('join-success', (data) => {
            this.roomCode = data.roomCode;
            this.playerName = data.playerName;
            this.role = data.role;
            this.gameMode = data.gameMode;
            
            if (data.gameState) {
                this.currentPlayer = data.gameState.currentPlayer;
                this.scores = data.gameState.scores || this.scores;
                this.positions = data.gameState.positions || this.positions;
                this.diceResult = data.gameState.diceResult || 0;
            }
            
            // Сохраняем имена игроков
            if (data.players) {
                this.updatePlayers(data.players);
            }
            
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> Вы в игре!';
            
            setTimeout(() => {
                modal.remove();
                this.continueGameInitialization().then(resolve);
            }, 2000);
        });
        
        this.socket.on('player-joined', (data) => {
            this.showNotification(`${data.playerName} присоединился как ${this.getRoleNameFromType(data.role)}`, 'info');
            
            // Обновляем имена игроков
            if (data.players) {
                this.updatePlayers(data.players);
            }
        });
        
        this.socket.on('player-left', (data) => {
            this.showNotification(`${data.playerName} ${data.message}`, 'warning');
            
            if (data.role === 'player1') {
                this.players.player1 = '';
                document.querySelector('#video-team1 .video-placeholder p').textContent = 'Команда 1';
                document.querySelector('#team1-name').textContent = 'Команда 1';
                document.querySelector('#master-team1-name').textContent = 'Команда 1';
            } else if (data.role === 'player2') {
                this.players.player2 = '';
                document.querySelector('#video-team2 .video-placeholder p').textContent = 'Команда 2';
                document.querySelector('#team2-name').textContent = 'Команда 2';
                document.querySelector('#master-team2-name').textContent = 'Команда 2';
            }
        });
        
        this.socket.on('spectator-joined', (data) => {
            this.showNotification(`${data.playerName} присоединился как наблюдатель`, 'info');
        });
        
        this.socket.on('spectator-left', (data) => {
            this.showNotification(`${data.playerName} покинул комнату как наблюдатель`, 'info');
        });
        
        this.socket.on('room-closed', (message) => {
            this.showNotification(message, 'error');
            setTimeout(() => {
                location.reload();
            }, 3000);
        });
        
        this.socket.on('dice-rolled', (data) => {
            console.log('🎲 Получен результат броска:', data);
            this.diceResult = data.dice;
            this.answerCompleted = false;
            const diceElement = document.getElementById('dice');
            if (diceElement) {
                diceElement.textContent = data.dice;
                diceElement.classList.add('rolling');
                
                setTimeout(() => {
                    diceElement.classList.remove('rolling');
                }, 500);
            }
            
            const taskNames = {
                1: 'Кухня', 2: 'Бар', 3: 'Знания', 
                4: 'Ситуация', 5: 'Сервис', 6: 'Продажи'
            };
            
            const taskTypeElement = document.getElementById('task-type');
            if (taskTypeElement) {
                taskTypeElement.textContent = taskNames[data.dice];
            }
            
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
        });
        
        this.socket.on('answer-completed-by-player', () => {
            console.log('✅ Игрок завершил ответ, показываем кнопку для ведущего');
            if (this.role === 'master') {
                this.showMasterButtonInCard();
            }
        });
        
        this.socket.on('master-started-evaluation', () => {
            console.log('👑 Ведущий начал оценивание');
            if (this.role !== 'master') {
                this.hideCard();
            }
        });
        
        this.socket.on('master-finished-evaluation', () => {
            console.log('👑 Ведущий завершил оценивание');
            if (this.role === 'master') {
                this.hideCard();
                this.showMasterPanel();
            }
        });
        
        this.socket.on('special-zone', (data) => {
            console.log('🎯 Получена специальная зона:', data);
            this.isSpecialZoneActive = true;
            this.showSpecialZoneModal(data);
        });
        
        this.socket.on('special-zone-result', (data) => {
            console.log('🎯 Результат специальной зоны:', data);
            
            // Обновляем позицию и очки
            this.positions[data.team] = data.newPosition;
            this.scores[data.team] = data.scores[data.team];
            
            this.updateScores();
            this.updatePieces();
            this.isSpecialZoneActive = false;
        });
        
        this.socket.on('special-zone-closed', () => {
            console.log('🎯 Специальная зона закрыта');
            const modal = document.querySelector('.special-zone-modal');
            if (modal) modal.remove();
            this.specialZoneData = null;
            this.isSpecialZoneActive = false;
            
            // Проверяем следующую зону в очереди
            if (this.specialZoneQueue.length > 0 && !this.showingSpecialZone) {
                setTimeout(() => this.showNextSpecialZone(), 500);
            }
        });
        
        this.socket.on('game-updated', (gameState) => {
            console.log('🔄 Обновление состояния игры:', gameState);
            this.scores = gameState.scores || this.scores;
            this.positions = gameState.positions || this.positions;
            this.currentPlayer = gameState.currentPlayer || this.currentPlayer;
            this.diceResult = gameState.diceResult || this.diceResult;
            this.isSpecialZoneActive = gameState.isSpecialZoneActive || false;
            
            this.updateScores();
            this.updatePieces();
            this.updateTurnIndicator();
            
            const diceElement = document.getElementById('dice');
            if (diceElement && this.diceResult > 0) {
                diceElement.textContent = this.diceResult;
            }
        });
        
        this.socket.on('turn-changed', (data) => {
            console.log('🔄 Смена хода:', data);
            this.currentPlayer = data.currentPlayer;
            this.diceRolledInCurrentTurn = false;
            this.waitingForAnswer = false;
            this.answerCompleted = false;
            this.triggeredZonesInTurn = { 1: new Set(), 2: new Set() };
            this.specialZoneQueue = [];
            this.showingSpecialZone = false;
            this.isSpecialZoneActive = false;
            this.updateTurnIndicator();
            this.updateRollButton();
            this.showNotification(`Сейчас ходит ${data.playerName}`, 'info');
        });
        
        this.socket.on('timer-update', (data) => {
            const timerElement = document.getElementById('timer');
            if (timerElement) {
                timerElement.textContent = data.timer;
            }
        });
        
        this.socket.on('timer-ended', () => {
            console.log('⏰ Время вышло!');
            this.waitingForAnswer = false;
            
            if ((this.role === 'player1' && this.currentPlayer === 1) || 
                (this.role === 'player2' && this.currentPlayer === 2)) {
                this.answerCompleted = true;
                if (this.socket && this.isConnected) {
                    this.socket.emit('answer-completed');
                }
            }
            
            this.showNotification('Время вышло!', 'warning');
        });
        
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
                
                if (slotsInfo) {
                    roomStatus.innerHTML += `<br><small>${slotsInfo}</small>`;
                }
                
                if (data.spectators > 0) {
                    roomStatus.innerHTML += `<br><small>Наблюдателей: ${data.spectators}</small>`;
                }
            } else {
                roomStatus.innerHTML = `<i class="fas fa-times-circle"></i> Комната не найдена`;
                roomStatus.className = 'room-status not-found';
            }
        });
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

    updatePlayers(players) {
        this.players.master = players.master || '';
        this.players.player1 = players.player1 || '';
        this.players.player2 = players.player2 || '';
        
        this.updateVideoPlaceholders();
        this.updateMasterPanelNames();
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

    async initVideo() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    facingMode: "user"
                },
                audio: false
            });
            
            const videoElement = document.createElement('video');
            videoElement.autoplay = true;
            videoElement.muted = true;
            videoElement.playsInline = true;
            videoElement.srcObject = stream;
            
            const roleMap = {
                'master': 'video-master',
                'player1': 'video-team1',
                'player2': 'video-team2'
            };
            
            const containerId = roleMap[this.role];
            if (containerId) {
                const container = document.getElementById(containerId);
                if (container) {
                    const placeholder = container.querySelector('.video-placeholder');
                    if (placeholder) {
                        const icon = placeholder.querySelector('i');
                        if (icon) icon.style.display = 'none';
                        
                        const text = placeholder.querySelector('p');
                        if (text) {
                            if (this.role === 'master') {
                                text.innerHTML = `<i class="fas fa-crown"></i> Ведущий: ${this.playerName}`;
                            } else if (this.role === 'player1') {
                                text.innerHTML = `<i class="fas fa-user"></i> Команда 1: ${this.playerName}`;
                            } else if (this.role === 'player2') {
                                text.innerHTML = `<i class="fas fa-user"></i> Команда 2: ${this.playerName}`;
                            }
                        }
                        
                        videoElement.style.width = '100%';
                        videoElement.style.height = '100%';
                        videoElement.style.objectFit = 'cover';
                        videoElement.style.borderRadius = '10px';
                        placeholder.appendChild(videoElement);
                    }
                }
            }

        } catch (error) {
            console.log('Камера недоступна:', error);
            this.createDemoVideos();
        }
    }

    updateVideoPlaceholders() {
        // Обновляем мастер
        const masterPlaceholder = document.querySelector('#video-master .video-placeholder p');
        if (masterPlaceholder && this.players.master) {
            masterPlaceholder.innerHTML = `<i class="fas fa-crown"></i> Ведущий: ${this.players.master}`;
        }

        // Обновляем игрока 1
        const player1Placeholder = document.querySelector('#video-team1 .video-placeholder p');
        const player1Score = document.querySelector('#team1-name');
        if (this.players.player1) {
            if (player1Placeholder) {
                player1Placeholder.innerHTML = `<i class="fas fa-user"></i> Команда 1: ${this.players.player1}`;
            }
            if (player1Score) {
                player1Score.textContent = `Команда 1: ${this.players.player1}`;
            }
        }

        // Обновляем игрока 2
        const player2Placeholder = document.querySelector('#video-team2 .video-placeholder p');
        const player2Score = document.querySelector('#team2-name');
        if (this.players.player2) {
            if (player2Placeholder) {
                player2Placeholder.innerHTML = `<i class="fas fa-user"></i> Команда 2: ${this.players.player2}`;
            }
            if (player2Score) {
                player2Score.textContent = `Команда 2: ${this.players.player2}`;
            }
        }
    }

    createDemoVideos() {
        const demoColors = {
            'master': '#FF9800',
            'player1': '#2196F3',
            'player2': '#FF5722'
        };
        
        Object.entries(demoColors).forEach(([role, color]) => {
            if (role !== this.role) {
                const roleMap = {
                    'master': 'video-master',
                    'player1': 'video-team1',
                    'player2': 'video-team2'
                };
                
                const containerId = roleMap[role];
                if (containerId) {
                    const container = document.getElementById(containerId);
                    if (container) {
                        const placeholder = container.querySelector('.video-placeholder');
                        if (placeholder) {
                            placeholder.style.background = `linear-gradient(135deg, ${color} 0%, ${this.darkenColor(color, 30)} 100%)`;
                            
                            const icon = placeholder.querySelector('i');
                            if (icon) {
                                icon.style.display = 'block';
                                icon.style.color = 'white';
                            }
                        }
                    }
                }
            }
        });
    }

    darkenColor(color, percent) {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        
        return "#" + (
            0x1000000 +
            (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)
        ).toString(16).slice(1);
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
                // Уже добавили классы выше
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
        gramsLabel.style.left = '120px';
        gramsLabel.style.top = '460px';
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
        descLabel.style.left = '220px';
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
        allergyLabel.style.left = '540px';
        allergyLabel.style.top = '385px';
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
        const totalAngle = 360;
        const angleStep = totalAngle / totalSteps;
        
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
        const offsetX = 50;
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
                if (i === 0) {
                    ctx.moveTo(positions[i].x + 20, positions[i].y + 20);
                }
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
        if (positions[26]) {
            ctx.moveTo(positions[26].x + 20, positions[26].y + 20);
        }
        
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
        
        document.querySelectorAll('.point-btn').forEach(btn => {
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
                if (this.socket && this.socket.connected) {
                    this.socket.emit('ping');
                }
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
                
                const taskNames = {
                    1: 'Кухня', 2: 'Бар', 3: 'Знания', 
                    4: 'Ситуация', 5: 'Сервис', 6: 'Продажи'
                };
                
                const taskTypeElement = document.getElementById('task-type');
                if (taskTypeElement) {
                    taskTypeElement.textContent = taskNames[this.diceResult];
                }
                
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
        if (!modal) {
            console.error('❌ Модальное окно не найдено!');
            return;
        }
        
        const cardContent = modal.querySelector('.card-content');
        if (!cardContent) {
            console.error('❌ Контент карточки не найден!');
            return;
        }
        
        document.getElementById('card-dice').textContent = category;
        document.getElementById('card-category').textContent = this.getCategoryName(category);
        document.getElementById('card-question').textContent = question;
        document.getElementById('card-instruction').textContent = instruction || '';
        
        const answerBtn = document.getElementById('answer-received');
        const masterBtn = document.getElementById('master-evaluation');
        
        if (this.gameMode === 'online') {
            if (isAnsweringPlayer) {
                answerBtn.style.display = 'block';
                masterBtn.style.display = 'none';
                answerBtn.textContent = 'Завершить ответ';
                answerBtn.onclick = () => {
                    console.log('✅ Игрок завершил ответ');
                    this.answerCompleted = true;
                    if (this.socket && this.isConnected) {
                        this.socket.emit('answer-completed');
                    }
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
            
            if (this.gameMode === 'local') {
                this.startTimer();
            }
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
                
                if (this.socket && this.isConnected) {
                    this.socket.emit('start-evaluation');
                }
                
                this.hideCard();
                this.showMasterPanel();
            };
            
            if (!modal.classList.contains('active')) {
                modal.classList.add('active');
                const cardContent = modal.querySelector('.card-content');
                if (cardContent) {
                    cardContent.classList.add('flipped');
                }
            }
        }
    }

    getCategoryName(type) {
        const names = {
            1: 'Кухня', 2: 'Бар', 3: 'Знания',
            4: 'Ситуация', 5: 'Сервис', 6: 'Продажи'
        };
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
            
            if (this.timer <= 0) {
                this.stopTimerAndCloseCard();
            }
        }, 1000);
    }

    stopTimerAndCloseCard() {
        console.log('⏱️ Таймер остановлен, закрываем карточку');
        clearInterval(this.timerInterval);
        this.hideCard();
        
        if (this.gameMode === 'online') {
            if (this.role === 'master') {
                this.showMasterPanel();
            } else if ((this.role === 'player1' && this.currentPlayer === 1) || 
                       (this.role === 'player2' && this.currentPlayer === 2)) {
                this.answerCompleted = true;
                if (this.socket && this.isConnected) {
                    this.socket.emit('answer-completed');
                }
            }
        } else {
            this.showMasterPanel();
        }
    }

    hideCard() {
        const modal = document.getElementById('card-modal');
        if (!modal) return;
        
        const cardContent = modal.querySelector('.card-content');
        if (cardContent) cardContent.classList.remove('flipped');

        setTimeout(() => {
            modal.classList.remove('active');
        }, 500);
    }

    showMasterPanel() {
        console.log('👑 Показываем панель ведущего');
        this.resetSelection();
        const panel = document.getElementById('master-panel');
        if (panel) {
            panel.style.display = 'block';
        }
        
        this.showNotification('Оцените ответ команд и примените очки', 'info');
    }

    resetSelection() {
        this.selectedPoints = { 1: 0, 2: 0 };
        this.pointsApplied = false;
        this.applyButtonClicked = false;
        
        this.updateSelectionDisplay(1);
        this.updateSelectionDisplay(2);

        if (this.gameMode === 'local' || this.role === 'master') {
            document.querySelectorAll('.point-btn').forEach(btn => {
                btn.classList.remove('selected');
                btn.disabled = false;
            });
            
            const nextTurnBtn = document.getElementById('next-turn');
            if (nextTurnBtn) nextTurnBtn.disabled = false;
        } else {
            document.querySelectorAll('.point-btn').forEach(btn => {
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
        element.innerHTML = points === 0 
            ? 'Выбрано: <span>0 очков</span>'
            : `Выбрано: <span>${points > 0 ? '+' : ''}${points} очков</span>`;
    }

    selectPoints(team, points) {
        if (this.gameMode === 'online' && this.role !== 'master') return;
        if (this.gameMode === 'local' && this.role !== 'local') return;
        
        document.querySelectorAll(`.point-btn[data-team="${team}"]`).forEach(btn => {
            btn.classList.remove('selected');
        });
        
        if (this.selectedPoints[team] === points) {
            this.selectedPoints[team] = 0;
        } else {
            this.selectedPoints[team] = points;
            document.querySelector(`.point-btn[data-team="${team}"][data-points="${points}"]`)?.classList.add('selected');
        }
        
        this.updateSelectionDisplay(team);
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
        
        // Применяем выбранные очки
        for (let team of [1, 2]) {
            const points = this.selectedPoints[team];
            if (points !== 0) {
                this.scores[team] += points;
                this.movePiece(team, points);
            }
        }
        
        this.updateScores();
        
        if (this.gameMode === 'online' && this.socket && this.isConnected) {
            this.socket.emit('next-turn', {
                scores: this.scores,
                positions: this.positions
            });
        }
        
        const panel = document.getElementById('master-panel');
        if (panel) panel.style.display = 'none';
        
        this.triggeredZonesInTurn = { 1: new Set(), 2: new Set() };
        this.specialZoneQueue = [];
        this.showingSpecialZone = false;
        this.isSpecialZoneActive = false;
        this.specialZoneData = null;
        
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

    movePiece(team, points) {
        const piece = document.getElementById(`piece${team}`);
        if (!piece) return;
        
        const newPosition = Math.max(0, Math.min(this.positions[team] + points, 40));
        const delta = newPosition - this.positions[team];
        
        // Обновляем очки с учетом движения (вперед - плюс, назад - минус)
        if (delta > 0) {
            this.scores[team] += delta;
        } else if (delta < 0) {
            this.scores[team] += delta; // Отрицательное число отнимает очки
        }
        
        this.animatePieceMovement(team, this.positions[team], newPosition, () => {
            this.positions[team] = newPosition;
            
            // Проверяем специальную зону
            if (Math.abs(points) <= 6) {
                this.checkSpecialZone(team, newPosition);
            }
            
            // Проверяем победу
            if (newPosition >= 40) {
                const winnerName = team === 1 ? this.players.player1 : this.players.player2;
                this.showWinner(team, winnerName, `🎉 Победила команда ${team} (${winnerName})!`);
            }
            
            if (this.gameMode === 'online' && this.socket && this.isConnected) {
                const gameState = {
                    scores: this.scores,
                    positions: this.positions,
                    currentPlayer: this.currentPlayer
                };
                this.socket.emit('update-game', gameState);
                
                // Проверяем специальную зону на сервере
                this.socket.emit('check-special-zone', { team, position: newPosition });
            }
        });
    }

    animatePieceMovement(team, fromPosition, toPosition, callback) {
        const piece = document.getElementById(`piece${team}`);
        if (!piece) return;
        
        const positions = this.generateBoardPositions();
        const stepDelay = 300;
        const direction = toPosition > fromPosition ? 1 : -1;
        let currentStep = fromPosition;
        
        const moveStep = () => {
            if ((direction > 0 && currentStep >= toPosition) || 
                (direction < 0 && currentStep <= toPosition)) {
                if (callback) callback();
                return;
            }
            
            currentStep += direction;
            
            if (positions[currentStep]) {
                piece.style.left = (positions[currentStep].x + 5) + 'px';
                piece.style.top = (positions[currentStep].y + 5) + 'px';
                piece.classList.add('moving');
                
                setTimeout(() => {
                    piece.classList.remove('moving');
                }, 200);
            }
            
            setTimeout(moveStep, stepDelay);
        };
        
        moveStep();
    }

    checkSpecialZone(team, position) {
        const cell = document.getElementById(`cell-${position}`);
        if (!cell) return;
        
        let zoneType = null;
        
        if (cell.classList.contains('grams')) {
            zoneType = 'grams';
        } else if (cell.classList.contains('description')) {
            zoneType = 'description';
        } else if (cell.classList.contains('allergy')) {
            zoneType = 'allergy';
        }

        if (zoneType && !this.triggeredZonesInTurn[team].has(zoneType)) {
            this.triggeredZonesInTurn[team].add(zoneType);
            
            this.specialZoneQueue.push({
                team: team,
                zoneType: zoneType,
                position: position,
                priority: team === this.currentPlayer ? 1 : 2
            });
            
            this.specialZoneQueue.sort((a, b) => a.priority - b.priority);

            if (!this.showingSpecialZone && !this.isSpecialZoneActive) {
                this.showNextSpecialZone();
            }
        }
    }

    showNextSpecialZone() {
        if (this.specialZoneQueue.length === 0) {
            this.showingSpecialZone = false;
            return;
        }
        
        this.showingSpecialZone = true;
        const task = this.specialZoneQueue.shift();
        const zoneSettings = this.zoneSettings[task.zoneType];
        
        this.specialZoneData = {
            team: task.team,
            zoneType: task.zoneType,
            zoneName: zoneSettings.name,
            question: zoneSettings.question,
            positive: zoneSettings.positive,
            negative: zoneSettings.negative
        };
        
        if (this.gameMode === 'online' && this.socket && this.isConnected) {
            this.socket.emit('special-zone', {
                roomCode: this.roomCode,
                ...this.specialZoneData
            });
        } else {
            this.showSpecialZoneModal(this.specialZoneData);
        }
    }

    showSpecialZoneModal(data) {
        const modal = document.createElement('div');
        modal.className = 'special-zone-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 500px;
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border-radius: 20px;
            padding: 30px;
            color: white;
            z-index: 1001;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            border: 5px solid ${this.getZoneColor(data.zoneType)};
        `;
        
        const isMaster = this.gameMode === 'local' || this.role === 'master';
        const teamName = data.team === 1 ? 
            (this.gameMode === 'online' ? `Команда 1: ${this.players.player1 || ''}` : 'Команда 1') : 
            (this.gameMode === 'online' ? `Команда 2: ${this.players.player2 || ''}` : 'Команда 2');
        
        modal.innerHTML = `
            <h3 style="color: ${this.getZoneColor(data.zoneType)}; margin-bottom: 20px; text-align: center;">
                ${data.zoneName}
            </h3>
            <p style="font-size: 18px; margin-bottom: 15px; text-align: center;">
                Вопрос для ${teamName}
            </p>
            <div style="font-size: 16px; margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 10px;">
                ${data.question}
            </div>
            ${isMaster ? `
            <div style="text-align: center; margin-top: 30px;">
                <button id="special-correct" class="btn" style="background: #4CAF50; margin-right: 20px;">
                    Верно (+${data.positive})
                </button>
                <button id="special-incorrect" class="btn" style="background: #f44336;">
                    Неверно (${data.negative})
                </button>
            </div>
            ` : `
            <div style="text-align: center; margin-top: 30px; color: #aaa;">
                <i class="fas fa-clock"></i> Ожидайте оценки ведущего
            </div>
            `}
        `;
        
        document.body.appendChild(modal);
        
        if (isMaster) {
            modal.querySelector('#special-correct').addEventListener('click', () => {
                const points = data.positive;
                this.movePiece(data.team, points);
                
                if (this.gameMode === 'online' && this.socket && this.isConnected) {
                    this.socket.emit('special-zone-result', {
                        roomCode: this.roomCode,
                        team: data.team,
                        points: points
                    });
                }
                
                modal.remove();
                this.specialZoneData = null;
                this.showingSpecialZone = false;
                this.isSpecialZoneActive = false;
                setTimeout(() => this.showNextSpecialZone(), 500);
            });

            modal.querySelector('#special-incorrect').addEventListener('click', () => {
                const points = data.negative;
                this.movePiece(data.team, points);
                
                if (this.gameMode === 'online' && this.socket && this.isConnected) {
                    this.socket.emit('special-zone-result', {
                        roomCode: this.roomCode,
                        team: data.team,
                        points: points
                    });
                }
                
                modal.remove();
                this.specialZoneData = null;
                this.showingSpecialZone = false;
                this.isSpecialZoneActive = false;
                setTimeout(() => this.showNextSpecialZone(), 500);
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
        document.querySelectorAll('.video-box').forEach(box => {
            box.classList.remove('current-turn');
        });
        
        document.querySelectorAll('.team-score').forEach(score => {
            score.classList.remove('current-turn');
        });

        document.querySelectorAll('.current-turn-indicator').forEach(indicator => {
            indicator.style.display = 'none';
        });

        const currentTeam = this.currentPlayer;
        const videoTeam = document.getElementById(`video-team${currentTeam}`);
        const teamScore = document.getElementById(`team${currentTeam}-score`);
        const turnIndicator = document.getElementById(`turn-indicator-${currentTeam}`);

        if (videoTeam) videoTeam.classList.add('current-turn');
        if (teamScore) teamScore.classList.add('current-turn');
        if (turnIndicator) turnIndicator.style.display = 'block';
        
        // Устанавливаем цвет подсветки в соответствии с цветом команды
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
    }

    updateRollButton() {
        const rollBtn = document.getElementById('roll-dice');
        if (!rollBtn) return;
        
        if (this.gameMode === 'local') {
            const canRoll = !this.diceRolledInCurrentTurn && !this.isSpecialZoneActive;
            rollBtn.disabled = !canRoll;
            
            if (rollBtn.disabled) {
                if (this.isSpecialZoneActive) {
                    rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Активна специальная зона';
                } else {
                    rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Кубик уже брошен';
                }
            } else {
                rollBtn.innerHTML = `<i class="fas fa-dice"></i> Бросить кубик (Ход команды ${this.currentPlayer})`;
            }
            
        } else if (this.gameMode === 'online') {
            const isPlayer1 = this.role === 'player1';
            const isPlayer2 = this.role === 'player2';
            const isMaster = this.role === 'master';
            const isSpectator = this.role === 'spectator';
            
            const canRoll = (isPlayer1 && this.currentPlayer === 1) ||
                           (isPlayer2 && this.currentPlayer === 2);
            const canRollNow = canRoll && !this.diceRolledInCurrentTurn && !this.isSpecialZoneActive;
            
            rollBtn.disabled = !canRollNow || isMaster || isSpectator || this.waitingForAnswer;
            
            if (rollBtn.disabled) {
                if (isMaster || isSpectator) {
                    rollBtn.innerHTML = '<i class="fas fa-dice"></i> Бросок кубика (только игроки)';
                } else if (!canRoll) {
                    rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Ожидайте хода';
                } else if (this.diceRolledInCurrentTurn) {
                    rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Ожидайте ответа';
                } else if (this.waitingForAnswer) {
                    rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Ожидайте ответа';
                } else if (this.isSpecialZoneActive) {
                    rollBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Активна специальная зона';
                }
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
            } else {
                panel.style.display = 'none';
            }
        }

        // Скрываем кнопки для наблюдателей
        if (isSpectator) {
            const rollBtn = document.getElementById('roll-dice');
            if (rollBtn) rollBtn.style.display = 'none';
            
            const answerBtn = document.getElementById('answer-received');
            if (answerBtn) answerBtn.style.display = 'none';
            
            const masterBtn = document.getElementById('master-evaluation');
            if (masterBtn) masterBtn.style.display = 'none';
            
            const nextTurnBtn = document.getElementById('next-turn');
            if (nextTurnBtn) nextTurnBtn.style.display = 'none';
            
            document.querySelectorAll('.point-btn').forEach(btn => {
                btn.style.display = 'none';
            });
        }

        document.querySelectorAll('.deck').forEach(deck => {
            deck.style.cursor = 'default';
            deck.style.pointerEvents = 'none';
        });

        this.updateRollButton();

        if (this.gameMode === 'online') {
            const connectionInfo = document.createElement('div');
            connectionInfo.className = 'connection-info-bar';
            connectionInfo.innerHTML = `
                <div class="connection-status ${this.isConnected ? 'connected' : 'disconnected'}">
                    <i class="fas fa-circle"></i>
                    <span>${this.isConnected ? 'Подключено' : 'Не подключено'}</span>
                </div>
                <div class="room-info-bar">
                    <i class="fas fa-door-closed"></i>
                    <span>Комната: ${this.roomCode || 'Нет'}</span>
                </div>
                <div class="player-info-bar">
                    <i class="fas fa-user"></i>
                    <span>${this.playerName} (${this.getRoleName()})</span>
                </div>
            `;

            const topPanel = document.querySelector('.top-panel');
            if (topPanel) {
                topPanel.appendChild(connectionInfo);
            }
        }
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

    showWinner(team, winnerName, message) {
        // Создаем красивое поздравление
        const winnerModal = document.createElement('div');
        winnerModal.className = 'winner-modal';
        winnerModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
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
                <div style="font-size: 80px; margin-bottom: 20px;">
                    🏆
                </div>
                <h1 style="color: ${teamColor}; font-size: 36px; margin-bottom: 20px;">
                    ПОБЕДА!
                </h1>
                <h2 style="color: white; font-size: 28px; margin-bottom: 30px;">
                    ${message}
                </h2>
                <div style="
                    background: rgba(255, 255, 255, 0.1);
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 30px;
                ">
                    <p style="font-size: 20px; margin-bottom: 10px;">ФИНАЛЬНЫЙ СЧЕТ</p>
                    <div style="display: flex; justify-content: center; gap: 40px; margin-top: 20px;">
                        <div>
                            <h3 style="color: #2196F3;">Команда 1</h3>
                            <div style="font-size: 48px; font-weight: bold;">${this.scores[1]}</div>
                        </div>
                        <div style="font-size: 36px; align-self: center;">:</div>
                        <div>
                            <h3 style="color: #FF5722;">Команда 2</h3>
                            <div style="font-size: 48px; font-weight: bold;">${this.scores[2]}</div>
                        </div>
                    </div>
                </div>
                <button id="close-winner" class="btn" style="
                    background: ${teamColor};
                    padding: 15px 40px;
                    font-size: 18px;
                    margin-top: 20px;
                ">
                    <i class="fas fa-trophy"></i> Закрыть
                </button>
            </div>
        `;
        
        document.body.appendChild(winnerModal);
        
        // Запускаем салюты
        this.startFireworks(teamColor);
        
        // Добавляем обработчик закрытия
        winnerModal.querySelector('#close-winner').addEventListener('click', () => {
            winnerModal.remove();
            const fireworks = document.getElementById('fireworks');
            if (fireworks) {
                fireworks.style.display = 'none';
                fireworks.innerHTML = '';
            }
        });
        
        // Автоматическое закрытие через 10 секунд
        setTimeout(() => {
            if (winnerModal.parentNode) {
                winnerModal.remove();
                const fireworks = document.getElementById('fireworks');
                if (fireworks) {
                    fireworks.style.display = 'none';
                    fireworks.innerHTML = '';
                }
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
        alertDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
            <button class="close-alert">&times;</button>
        `;
        
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #f44336;
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            z-index: 10001;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideDown 0.3s ease-out;
        `;
        
        document.body.appendChild(alertDiv);
        
        alertDiv.querySelector('.close-alert').addEventListener('click', () => {
            alertDiv.remove();
        });
        
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
        notification.innerHTML = `
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : type === 'warning' ? '#FF9800' : '#2196F3'};
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            z-index: 10000;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: 300px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    getWelcomeMessage() {
        if (this.gameMode === 'local') {
            return 'Вы играете в локальном режиме';
        } else {
            return `Вы подключились как ${this.playerName} (${this.getRoleName()})`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
