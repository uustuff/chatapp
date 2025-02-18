const ws = new WebSocket('ws://chat-backend-h3jf.onrender.com');

const chatWindow = document.getElementById('chat-window');
const output = document.getElementById('output');
const feedback = document.getElementById('feedback');
const messageInput = document.getElementById('message');
const usernameInput = document.getElementById('username');
const sendButton = document.getElementById('send');
const adminLoginButton = document.getElementById('admin-login-btn');

let username = localStorage.getItem('username') || '';
let isAdmin = false;

if (username) {
    usernameInput.value = username;
    usernameInput.disabled = true;
    // Example condition: Show admin login button if username is already set
    adminLoginButton.style.display = 'inline-block';
}

usernameInput.addEventListener('blur', () => {
    username = usernameInput.value;
    localStorage.setItem('username', username);
    usernameInput.disabled = true;
    // Example condition: Show admin login button if username is entered
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
    const message = messageInput.value.trim(); // Ensure no leading or trailing spaces
    if (message && username) {
        ws.send(JSON.stringify({
            type: 'user',
            username: username,
            message: message
        }));
        messageInput.value = '';
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

// Function to handle message deletion by admin
function deleteMessage(messageId) {
    if (isAdmin) {
        ws.send(JSON.stringify({
            type: 'delete-message',
            messageId: messageId
        }));
    }
}

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'init') {
        // Handle initial messages
        output.innerHTML = data.messages.map(msg => formatMessage(msg)).join('');
    } else if (data.type === 'user' || data.type === 'system') {
        feedback.innerHTML = '';
        output.innerHTML += formatMessage(data);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    } else if (data.type === 'delete-message') {
        // Handle message deletion
        const deletedMessage = document.getElementById(`msg-${data.messageId}`);
        if (deletedMessage) {
            deletedMessage.remove();
        }
    } else if (data.type === 'admin-login-success') {
        isAdmin = true;
        alert('Admin login successful.');
        // Show delete options for all existing messages
        document.querySelectorAll('.delete-message').forEach(button => {
            button.style.display = 'inline';
        });
    } else if (data.type === 'admin-login-failed') {
        alert('Admin login failed. Incorrect password.');
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
    
    // Check if user is admin, then add delete functionality
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
