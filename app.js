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
const fileUploadInput = document.getElementById('file-upload');
const fileUploadLabel = document.getElementById('file-upload-label');

document.body.insertAdjacentHTML('afterbegin', '<div id="notification-container"></div>');
const notificationContainer = document.getElementById('notification-container');

let username = localStorage.getItem('username') || '';
let isAdmin = false;
let typingTimeout = null;
let onlineUsersList = [];
let lastAtPosition = -1;
let suggestionsVisible = false;
let replyingTo = null;
let messages = [];

if (username) {
    usernameInput.value = username;
    usernameInput.disabled = true;
    adminLoginButton.style.display = 'inline-block';
}

// Event Listeners
usernameInput.addEventListener('blur', handleUsernameBlur);
messageInput.addEventListener('keypress', handleMessageKeyPress);
sendButton.addEventListener('click', sendMessage);
adminLoginButton.addEventListener('click', adminLogin);
cancelReplyButton.addEventListener('click', cancelReply);
messageInput.addEventListener('input', handleMessageInput);
fileUploadInput.addEventListener('change', handleFileUpload);
document.addEventListener('click', handleDocumentClick);

function handleUsernameBlur() {
    username = usernameInput.value;
    localStorage.setItem('username', username);
    usernameInput.disabled = true;

    if (username.trim()) {
        adminLoginButton.style.display = 'inline-block';
    } else {
        adminLoginButton.style.display = 'none';
    }
}

function handleMessageKeyPress(e) {
    if (e.key === 'Enter' && !suggestionsVisible) {
        sendMessage();
    }
}

function handleDocumentClick(e) {
    if (suggestionsVisible && !e.target.closest('#suggestions-container')) {
        hideSuggestions();
    }
}

function handleMessageInput(e) {
    if (!username) return;

    // Typing indicator
    ws.send(JSON.stringify({ type: 'typing', username }));
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        ws.send(JSON.stringify({ type: 'stop-typing', username }));
    }, 10000);

    // Mention suggestions
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

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
        showNotification('File size exceeds 10MB limit');
        return;
    }

    if (!username) {
        showNotification('Please set a username before sending files');
        return;
    }

    const reader = new FileReader();
    
    // Create progress container
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressContainer.appendChild(progressBar);
    
    // Show upload in progress
    const tempMessage = document.createElement('div');
    tempMessage.className = username ? 'message-self' : 'message-other';
    tempMessage.innerHTML = `
        <strong>${username}</strong>: Uploading ${file.name}...
        ${progressContainer.outerHTML}
    `;
    output.appendChild(tempMessage);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    reader.onload = function(event) {
        const fileData = event.target.result;
        
        // Get file type
        const fileType = getFileType(file.type);
        
        // Create a unique ID for this file
        const fileId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        // Prepare the message data
        const messageData = {
            type: 'file',
            username: username,
            fileId: fileId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileData: fileData.split(',')[1], // Remove the data URL prefix
            fileCategory: fileType,
            isAdmin: false
        };

        if (replyingTo) {
            messageData.replyTo = replyingTo.id;
            messageData.replyUsername = replyingTo.username;
            messageData.replyMessage = replyingTo.message;
        }

        // Send the file data
        ws.send(JSON.stringify(messageData));
        
        // Remove the temporary message
        tempMessage.remove();
        
        // Reset the file input
        fileUploadInput.value = '';
    };

    reader.onprogress = function(event) {
        if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            progressBar.style.width = percent + '%';
        }
    };

    reader.onerror = function() {
        showNotification('Error reading file');
        tempMessage.remove();
    };

    reader.readAsDataURL(file);
}

function getFileType(mimeType) {
    if (!mimeType) return 'other';
    
    const type = mimeType.split('/')[0];
    const subtype = mimeType.split('/')[1];
    
    if (type === 'image') return 'image';
    if (type === 'video') return 'video';
    if (type === 'audio') return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return 'archive';
    if (mimeType.includes('text') || mimeType.includes('document') || mimeType.includes('word') || 
        mimeType.includes('excel') || mimeType.includes('powerpoint') || mimeType.includes('opendocument')) {
        return 'document';
    }
    
    return 'other';
}

function getFileIcon(fileType) {
    switch(fileType) {
        case 'pdf':
            return `<svg class="file-icon pdf" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M10 11v5"></path><path d="M8 15h4"></path><path d="M16 15v-3a2 2 0 0 0-4 0"></path></svg>`;
        case 'image':
            return `<svg class="file-icon image" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
        case 'video':
            return `<svg class="file-icon video" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
        case 'audio':
            return `<svg class="file-icon audio" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a3 3 0 0 1 0 6"></path><path d="M12 8a3 3 0 0 1 0 6"></path><path d="M6 8a3 3 0 0 1 0 6"></path><line x1="3" y1="12" x2="3.01" y2="12"></line></svg>`;
        case 'document':
            return `<svg class="file-icon document" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
        case 'archive':
            return `<svg class="file-icon archive" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`;
        default:
            return `<svg class="file-icon other" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatMessage(msg) {
    const isCurrentUser = msg.username === username;
    let messageClass = isCurrentUser ? 'message-self' : 'message-other';
    
    if (msg.isAdmin) {
        messageClass += ' message-admin';
    }
    
    let messageContent = `<div class="${messageClass}" id="msg-${msg.id}">`;

    // Add original message if this is a reply
    if (msg.replyTo) {
        const originalMessage = messages.find(m => m.id == msg.replyTo);
        if (originalMessage) {
            const originalText = originalMessage.message ? 
                originalMessage.message.substring(0, 50) + (originalMessage.message.length > 50 ? '...' : '') :
                `Sent a file: ${originalMessage.fileName}`;
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

    if (msg.type === 'file') {
        const fileSize = formatBytes(msg.fileSize);
        messageContent += `
            <div class="file-message">
                ${msg.message || 'Sent a file:'}
                <div class="file-info">
                    ${getFileIcon(msg.fileCategory)}
                    <span>${msg.fileName}</span>
                    <span class="file-size">${fileSize}</span>
                    <a href="data:${msg.fileType};base64,${msg.fileData}" download="${msg.fileName}" class="file-download">Download</a>
                </div>
            </div>`;
    } else {
        // Highlight mentions in the message
        let formattedMessage = msg.message.replace(/@(\w+)/g, (match, username) => {
            const isOnline = onlineUsersList.includes(username);
            return `<span class="mention-highlight" ${isOnline ? 'title="User is online"' : ''}>@${username}</span>`;
        });
        messageContent += ` ${formattedMessage}`;
    }

    // Add reply button
    if (!isCurrentUser) {
        messageContent += ` <button class="reply-button" style="background: none; border: none; color: #4CAF50; cursor: pointer;">↩️</button>`;
    }

    if (isAdmin || msg.type === 'user' || msg.type === 'file') {
        messageContent += ` <span class="delete-message" onclick="deleteMessage('${msg.id}')" style="display: ${isAdmin ? 'inline' : 'none'}">Delete</span>`;
    }

    messageContent += `</div>`;

    return messageContent;
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
        message: message.message || `Sent a file: ${message.fileName}`
    };
    
    replyContent.innerHTML = `<strong>${message.username}</strong>: ${message.message ? message.message.substring(0, 50) + (message.message.length > 50 ? '...' : '') : `Sent a file: ${message.fileName}`}`;
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

// WebSocket Event Handlers
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'init') {
        messages = data.messages;
        output.innerHTML = messages.map(msg => formatMessage(msg)).join('');
        chatWindow.scrollTop = chatWindow.scrollHeight;
        setupReplyHandlers();
    } else if (data.type === 'user' || data.type === 'file' || data.type === 'system') {
        feedback.innerHTML = '';
        messages.push(data);
        output.innerHTML += formatMessage(data);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        setupReplyHandlers();

        if (data.message && data.message.includes(`@${username}`)) {
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