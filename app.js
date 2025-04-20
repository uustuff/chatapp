const ws = new WebSocket('ws://chat-backend-h3jf.onrender.com');

const chatWindow = document.getElementById('chat-window');
const output = document.getElementById('output');
const feedback = document.getElementById('feedback');
const messageInput = document.getElementById('message');
const usernameInput = document.getElementById('username');
const sendButton = document.getElementById('send');
const adminLoginButton = document.getElementById('admin-login-btn');
const suggestionsContainer = document.getElementById('suggestions-container');
const suggestionsList = document.getElementById('suggestions-list');
const replyPreview = document.getElementById('reply-preview');
const replyContent = document.getElementById('reply-content');
const cancelReplyButton = document.getElementById('cancel-reply');

document.body.insertAdjacentHTML('afterbegin', '<div id="notification-container"></div>');
const notificationContainer = document.getElementById('notification-container');

let username = localStorage.getItem('username') || '';
let isAdmin = false;
let typingTimeout = null;
let onlineUsersList = [];
let lastAtPosition = -1;
let suggestionsVisible = false;
let replyingTo = null;

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
    if (e.key === 'Enter' && !suggestionsVisible) {
        sendMessage();
    }
});

sendButton.addEventListener('click', () => {
    sendMessage();
});

adminLoginButton.addEventListener('click', () => {
    adminLogin();
});

cancelReplyButton.addEventListener('click', () => {
    cancelReply();
});

messageInput.addEventListener('input', handleMessageInput);

function handleMessageInput(e) {
    if (!username) return;

    // Typing indicator logic
    ws.send(JSON.stringify({ type: 'typing', username }));
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        ws.send(JSON.stringify({ type: 'stop-typing', username }));
    }, 10000);

    // Mention suggestion logic
    const cursorPos = messageInput.selectionStart;
    const text = messageInput.value;
    const atPos = text.lastIndexOf('@', cursorPos);

    if (atPos >= 0 && (cursorPos === atPos + 1 || /^[\w\d]$/.test(text.charAt(atPos + 1)))) {
        lastAtPosition = atPos;
        const partial = text.substring(atPos + 1, cursorPos);
        showSuggestions(partial);
    } else if (suggestionsVisible) {
        hideSuggestions();
    }
}

function showSuggestions(partial) {
    if (!onlineUsersList.length) {
        hideSuggestions();
        return;
    }

    const filtered = onlineUsersList.filter(user => 
        user.toLowerCase().includes(partial.toLowerCase()) && user !== username
    );

    if (!filtered.length) {
        hideSuggestions();
        return;
    }

    suggestionsList.innerHTML = filtered.map(user => `
        <div class="suggestion-item" data-username="${user}">@${user}</div>
    `).join('');

    suggestionsContainer.style.display = 'block';
    suggestionsVisible = true;

    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            selectSuggestion(item.dataset.username);
        });
    });
}

function hideSuggestions() {
    suggestionsContainer.style.display = 'none';
    suggestionsVisible = false;
}

function selectSuggestion(selectedUsername) {
    const input = messageInput;
    const text = input.value;
    const newText = text.substring(0, lastAtPosition) + '@' + selectedUsername + ' ' + text.substring(input.selectionStart);
    
    input.value = newText;
    hideSuggestions();
    input.focus();
    input.selectionStart = input.selectionEnd = lastAtPosition + selectedUsername.length + 2;
}

messageInput.addEventListener('keydown', (e) => {
    if (!suggestionsVisible) return;

    const items = document.querySelectorAll('.suggestion-item');
    if (!items.length) return;

    let currentIndex = -1;
    items.forEach((item, index) => {
        if (item.classList.contains('highlighted')) {
            currentIndex = index;
            item.classList.remove('highlighted');
        }
    });

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[nextIndex].classList.add('highlighted');
        items[nextIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prevIndex].classList.add('highlighted');
        items[prevIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && currentIndex >= 0) {
        e.preventDefault();
        selectSuggestion(items[currentIndex].dataset.username);
    } else if (e.key === 'Escape') {
        hideSuggestions();
    }
});

document.addEventListener('click', (e) => {
    if (suggestionsVisible && !e.target.closest('#suggestions-container') && e.target !== messageInput) {
        hideSuggestions();
    }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && username) {
        const messageData = {
            type: 'user',
            username: username,
            message: message
        };

        if (replyingTo) {
            messageData.replyTo = replyingTo.id;
            messageData.replyUsername = replyingTo.username;
            messageData.replyMessage = replyingTo.message;
        }

        ws.send(JSON.stringify(messageData));
        messageInput.value = '';
        ws.send(JSON.stringify({ type: 'stop-typing', username }));
        hideSuggestions();
        cancelReply();
    }
}

function setupReplyHandlers() {
    document.querySelectorAll('.reply-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const messageId = e.target.closest('.message-other, .message-self').id.replace('msg-', '');
            const message = messages.find(m => m.id == messageId);
            if (message) {
                setReply(message);
            }
        });
    });
}

function setReply(message) {
    replyingTo = {
        id: message.id,
        username: message.username,
        message: message.message
    };
    
    replyContent.innerHTML = `<strong>${message.username}</strong>: ${message.message.substring(0, 50)}${message.message.length > 50 ? '...' : ''}`;
    replyPreview.style.display = 'flex';
    messageInput.focus();
}

function cancelReply() {
    replyingTo = null;
    replyPreview.style.display = 'none';
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

function formatMessage(msg) {
    const isCurrentUser = msg.username === username;
    let messageClass = isCurrentUser ? 'message-self' : 'message-other';
    
    if (msg.isAdmin) {
        messageClass += ' message-admin';
    }
    
    // Highlight mentions in the message
    let formattedMessage = msg.message.replace(/@(\w+)/g, (match, username) => {
        const isOnline = onlineUsersList.includes(username);
        return `<span class="mention-highlight" ${isOnline ? 'title="User is online"' : ''}>@${username}</span>`;
    });

    let messageContent = `<div class="${messageClass}" id="msg-${msg.id}">`;

    // Add original message if this is a reply
    if (msg.replyTo) {
        const originalMessage = messages.find(m => m.id == msg.replyTo);
        if (originalMessage) {
            const originalText = originalMessage.message.substring(0, 50) + 
                              (originalMessage.message.length > 50 ? '...' : '');
            messageContent += `
                <div class="reply-container">
                    <div class="reply-original">
                        <strong>${originalMessage.username}</strong>: ${originalText}
                    </div>
                </div>`;
        }
    }

    messageContent += `<strong>${msg.username ? msg.username : ''}</strong>`;

    if (msg.isAdmin) {
        messageContent += ` (admin):`;
    } else {
        messageContent += `:`;
    }

    messageContent += ` ${formattedMessage}`;

    // Add reply button
    if (!isCurrentUser) {
        messageContent += ` <button class="reply-button" style="background: none; border: none; color: #4CAF50; cursor: pointer;">↩️</button>`;
    }

    if (isAdmin || msg.type === 'user') {
        messageContent += ` <span class="delete-message" onclick="deleteMessage('${msg.id}')" style="display: ${isAdmin ? 'inline' : 'none'}">Delete</span>`;
    }

    messageContent += `</div>`;

    return messageContent;
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notificationContainer.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 2000);
    }, 3000);
}

let messages = [];

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'init') {
        messages = data.messages;
        output.innerHTML = messages.map(msg => formatMessage(msg)).join('');
        chatWindow.scrollTop = chatWindow.scrollHeight;
        setupReplyHandlers();
    } else if (data.type === 'user' || data.type === 'system') {
        feedback.innerHTML = '';
        messages.push(data);
        output.innerHTML += formatMessage(data);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        setupReplyHandlers();

        if (data.message.includes(`@${username}`)) {
            showNotification(`You were mentioned by ${data.username}`);
        }
    } else if (data.type === 'delete-message') {
        const deletedMessage = document.getElementById(`msg-${data.messageId}`);
        if (deletedMessage) {
            deletedMessage.remove();
        }
        messages = messages.filter(msg => msg.id != data.messageId);
    } else if (data.type === 'admin-login-success') {
        isAdmin = true;
        showNotification('Admin login successful');
        document.querySelectorAll('.delete-message').forEach(button => {
            button.style.display = 'inline';
        });
    } else if (data.type === 'admin-login-failed') {
        showNotification('Admin login failed. Incorrect password.');
    } else if (data.type === 'typing') {
        if (data.username !== username) {
            feedback.innerHTML = `<p id="ti"><em>${data.username} is typing...</em></p>`;
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    } else if (data.type === 'stop-typing') {
        if (data.username !== username) {
            feedback.innerHTML = '';
        }
    } else if (data.type === 'online-users') {
        onlineUsersList = data.users.filter(user => user !== username);
    }
};

ws.onerror = (error) => {
    console.error('WebSocket Error:', error);
    showNotification('Connection error. Please refresh the page.');
};

ws.onclose = () => {
    console.log('WebSocket connection closed');
    showNotification('Connection lost. Attempting to reconnect...');
    setTimeout(() => window.location.reload(), 5000);
};
