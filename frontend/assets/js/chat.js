// Simple chat client that uses Socket.IO and REST API
(function(){
  const backendUrl = (typeof BACKEND_URL !== 'undefined') ? BACKEND_URL : location.origin;
  const token = localStorage.getItem('token');
  const currentUserId = localStorage.getItem('userId');
  if (!currentUserId || !token) {
    console.warn('Chat: missing userId or token, redirecting to login');
    // Optionally redirect to login page if not authenticated
    // window.location.href = 'studentlogin.html';
    return;
  }

  // connect to socket.io
  let socket;
  try {
    socket = io(backendUrl, { query: { userId: currentUserId } });
  } catch (e) {
    console.warn('Socket.IO client not available', e);
  }

  function conversationIdFor(a, b){
    if (!a || !b) return null;
    return [a,b].sort().join('_');
  }

  function formatTime(date){
    try { return new Date(date).toLocaleTimeString(); } catch(e){ return '' }
  }

  function showNotification(senderName, messageText){
    const popup = document.createElement('div');
    popup.className = 'notification-popup';
    popup.innerHTML = `<strong>${escapeHtml(senderName)}</strong><br>${escapeHtml(messageText.substring(0, 50))}${messageText.length > 50 ? '...' : ''}`;
    document.body.appendChild(popup);
    setTimeout(() => { popup.remove(); }, 4000);
  }

  function renderMessages(container, messages, senderName){
    console.log('renderMessages called, count=', messages && messages.length);
    container.innerHTML = '';
    if (!messages || messages.length === 0) {
      container.innerHTML = `
        <div class="conversation-placeholder">
          <h4>No messages yet</h4>
          <p>Send the first message to start a thoughtful, professional conversation.</p>
        </div>
      `;
      container.scrollTop = container.scrollHeight;
      return;
    }

    messages.forEach(m => {
      const cls = (String(m.from._id || m.from) === String(currentUserId)) ? 'chat-msg-sent' : 'chat-msg-recv';
      const el = document.createElement('div');
      el.className = 'chat-msg '+cls;
      if (m._id) el.dataset.messageId = m._id;

      let html = '';
      if (cls === 'chat-msg-recv' && senderName) {
        html += `<div class="chat-sender-name">${escapeHtml(senderName)}</div>`;
      }
      html += `<div class="chat-text">${escapeHtml(m.text)}</div><div class="chat-meta">${formatTime(m.createdAt)}</div>`;
      el.innerHTML = html;

      el.addEventListener('click', () => handleMessageClick(m));
      container.appendChild(el);
    });
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

  async function loadConversationUI(convId, toUserId){
    console.log('loadConversationUI', { convId, toUserId, currentUserId });
    const container = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    if (!container || !input || !sendBtn) return;

    // join conversation room on socket
    if (socket && convId) {
      console.log('emitting joinConversation', convId);
      socket.emit('joinConversation', convId);
    }

    // fetch messages
    try{
      const res = await fetch(`${backendUrl}/api/messages/${encodeURIComponent(convId)}`, { headers: { 'Authorization': 'Bearer '+token } });
      if (res.ok){
        const msgs = await res.json();
        renderMessages(container, msgs, window.__currentConversationName);
      }
    }catch(e){ console.error('Load conv failed', e); }

    sendBtn.onclick = async ()=>{
      const text = input.value.trim();
      if (!text) return;
      if (!convId || !toUserId) {
        console.error('Cannot send message, conversation or recipient missing', { convId, toUserId });
        alert('Unable to send message: missing recipient.');
        return;
      }
      try{
        const res = await fetch(`${backendUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer '+token },
          body: JSON.stringify({ conversationId: convId, to: toUserId, text })
        });
        if (res.ok){
          const msg = await res.json();
          // success - update UI
          renderMessages(container, [...(await (async()=>{ const r=await fetch(`${backendUrl}/api/messages/${encodeURIComponent(convId)}`, { headers:{ 'Authorization':'Bearer '+token } }); return r.ok?await r.json():[] })() ), ], window.__currentConversationName);
          input.value = '';
        } else {
          const txt = await res.text();
          console.error('Send failed', txt);
          alert('Message send failed: '+txt);
        }
      }catch(e){ console.error('Send error', e); alert('Message send error: '+e.message); }
    };
  }

  // Expose loader so other pages (dashboards) can open a conversation programmatically
  window.loadConversationUI = loadConversationUI;

  // Append a single message if it belongs to current convo
  function appendMessageIfMatches(msg, currentConvId, senderName){
    if (!msg) return;
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const msgConv = msg.conversationId || conversationIdFor(msg.from, msg.to);
    if (msgConv !== currentConvId) return;
    const el = document.createElement('div');
    const cls = (String(msg.from._id || msg.from) === String(currentUserId)) ? 'chat-msg-sent' : 'chat-msg-recv';
    el.className = 'chat-msg '+cls;
    let html = '';
    if (cls === 'chat-msg-recv' && senderName) {
      html += `<div class="chat-sender-name">${escapeHtml(senderName)}</div>`;
    }
    html += `<div class="chat-text">${escapeHtml(msg.text)}</div><div class="chat-meta">${formatTime(msg.createdAt)}</div>`;
    el.innerHTML = html;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  // Listen for incoming messages
  if (socket){
    socket.on('newMessage', (msg)=>{
      const currentConvId = window.__currentConversationId;
      const senderName = msg.senderName || window.__currentConversationName || 'Someone';
      
      // Show notification popup
      if (String(msg.from) !== String(currentUserId)) {
        showNotification(senderName, msg.text);
        // Highlight the contact in sidebar
        const contactItem = document.querySelector(`[data-user-id="${msg.from}"]`);
        if (contactItem) contactItem.classList.add('unread');
      }
      
      appendMessageIfMatches(msg, currentConvId, senderName);
    });

    // listen for deletion events from server
    socket.on('messageDeleted', ({ messageId, conversationId }) => {
      if (conversationId !== window.__currentConversationId) return;
      const el = document.querySelector(`[data-message-id="${messageId}"]`);
      if (el) el.remove();
    });
  }

  // function invoked when a message element is clicked
  function handleMessageClick(msg) {
    if (!msg || !msg._id) return;
    const isSender = String(msg.from._id || msg.from) === String(currentUserId);
    if (isSender) {
      const choice = confirm('Delete this message for everyone? OK=Yes, Cancel will delete only for you.');
      if (choice) {
        deleteMessage(msg._id, 'everyone');
      } else {
        deleteMessage(msg._id, 'me');
      }
    } else {
      if (confirm('Delete this message for you?')) {
        deleteMessage(msg._id, 'me');
      }
    }
  }

  async function deleteMessage(messageId, scope) {
    try {
      const res = await fetch(`${backendUrl}/api/messages/${encodeURIComponent(messageId)}?scope=${scope}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer '+token }
      });
      if (res.ok) {
        if (scope === 'me') {
          // remove element from DOM immediately
          const el = document.querySelector(`[data-message-id="${messageId}"]`);
          if (el) el.remove();
        }
        // if deleted for everyone, the socket event will also clear it
      } else {
        console.error('Delete message failed', await res.text());
      }
    } catch (e) {
      console.error('Delete message error', e);
    }
  }

  // Expose a helper to initialize chat for a specific partner and load messages
  window.initChatWith = async function(partnerId, partnerName){
    const convId = conversationIdFor(currentUserId, partnerId);
    window.__currentConversationId = convId;
    window.__currentConversationName = partnerName || 'Chat';
    const titleEl = document.getElementById('chat-title');
    const subtitleEl = document.getElementById('chat-subtitle');
    if (titleEl) titleEl.textContent = partnerName || 'Conversation';
    if (subtitleEl) subtitleEl.textContent = partnerName ? `Professional conversation with ${partnerName}` : 'Select a contact to begin.';
    const box = document.getElementById('chat-box'); if (box) box.style.display = 'block';
    try { await loadConversationUI(convId, partnerId); } catch(e){ console.error('initChatWith load failed', e); }
  };

})();
