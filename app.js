const ws = new WebSocket('ws://192.168.31.86:3000');

const chatWindow = document.getElementById('chat-window');
const output = document.getElementById('output');
const feedback = document.getElementById('feedback');
const messageInput = document.getElementById('message');
const usernameInput = document.getElementById('username');
const sendButton = document.getElementById('send');
const adminLoginButton = document.getElementById('admin-login-btn');

let username = localStorage.getItem('username') || '';
let isAdmin = false;
let typingTimeout = null;

if (username) {
    usernameInput.value = username;
    usernameInput.disabled = true;
    adminLoginButton.style.display = 'inline-block';
}

usernameInput.addEventListener('blur', () => {
    username = usernameInput.value;
    localStorage.setItem('username', username);
    usernameInput.disabled = true;

    if (username.trim()) {
        adminLoginButton.style.display = 'inline-block';
    } else {
        adminLoginButton.style.display = 'none';
    }
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

sendButton.addEventListener('click', () => {
    sendMessage();
});

adminLoginButton.addEventListener('click', () => {
    adminLogin();
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && username) {
        ws.send(JSON.stringify({
            type: 'user',
            username: username,
            message: message
        }));
        messageInput.value = '';

        ws.send(JSON.stringify({ type: 'stop-typing', username })); // Stop typing when sent
    }
}

function adminLogin() {
    const password = prompt('Enter admin password:');
    ws.send(JSON.stringify({
        type: 'admin-login',
        username: 'admin',
        password: password
    }));
}

function deleteMessage(messageId) {
    if (isAdmin) {
        ws.send(JSON.stringify({
            type: 'delete-message',
            messageId: messageId
        }));
    }
}

messageInput.addEventListener('input', () => {
    if (!username) return;

    ws.send(JSON.stringify({ type: 'typing', username }));

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        ws.send(JSON.stringify({ type: 'stop-typing', username }));
    }, 10000);
});

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'init') {
        output.innerHTML = data.messages.map(msg => formatMessage(msg)).join('');
    } else if (data.type === 'user' || data.type === 'system') {
        feedback.innerHTML = '';
        output.innerHTML += formatMessage(data);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    } else if (data.type === 'delete-message') {
        const deletedMessage = document.getElementById(`msg-${data.messageId}`);
        if (deletedMessage) {
            deletedMessage.remove();
        }
    } else if (data.type === 'admin-login-success') {
        isAdmin = true;
        alert('Admin login successful.');
        document.querySelectorAll('.delete-message').forEach(button => {
            button.style.display = 'inline';
        });
    } else if (data.type === 'admin-login-failed') {
        alert('Admin login failed. Incorrect password.');
    } else if (data.type === 'typing') {
        if (data.username !== username) { // Hide for self
            feedback.innerHTML = `<p id="ti"><em>${data.username} is typing...</em></p>`;
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    } else if (data.type === 'stop-typing') {
        if (data.username !== username) { // Hide for self
            feedback.innerHTML = '';
        }
    }
};

function formatMessage(msg) {
    let messageContent = `<p id="msg-${msg.id}"><strong>${msg.username ? msg.username : ''}</strong>`;

    if (msg.isAdmin) {
        messageContent += ` (admin):`;
    } else {
        messageContent += `:`;
    }

    messageContent += ` ${msg.message}`;

    if (isAdmin || msg.type === 'user') {
        messageContent += ` <span class="delete-message" onclick="deleteMessage('${msg.id}')" style="display: ${isAdmin ? 'inline' : 'none'}">Delete</span>`;
    }

    messageContent += `</p>`;

    return messageContent;
}

ws.onerror = (error) => {
    console.error('WebSocket Error:', error);
};

ws.onclose = () => {
    console.log('WebSocket connection closed');
};
