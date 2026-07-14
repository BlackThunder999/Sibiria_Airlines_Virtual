(function() {
    const supabase = window.supabase.createClient(
        'https://iljsednetiogjtowlexo.supabase.co',
        'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
    );

    // ========== DOM ==========
    const nicknameDisplay = document.getElementById('nicknameDisplay');
    const nicknameText = document.getElementById('nicknameText');
    const avatarInitial = document.getElementById('avatarInitial');
    const editNicknameBtn = document.getElementById('editNicknameBtn');
    const nicknameEditor = document.getElementById('nicknameEditor');
    const nicknameInput = document.getElementById('nicknameInput');
    const saveNicknameBtn = document.getElementById('saveNicknameBtn');
    const cancelNicknameBtn = document.getElementById('cancelNicknameBtn');
    const composerNickname = document.getElementById('composerNickname');
    const composerAvatarInitial = document.getElementById('composerAvatarInitial');
    const postTextarea = document.getElementById('postTextarea');
    const charCount = document.getElementById('charCount');
    const publishBtn = document.getElementById('publishBtn');
    const composerError = document.getElementById('composerError');
    const composerErrorText = document.getElementById('composerErrorText');
    const postsFeed = document.getElementById('postsFeed');
    const feedLoading = document.getElementById('feedLoading');
    const feedEmpty = document.getElementById('feedEmpty');
    const feedError = document.getElementById('feedError');
    const retryBtn = document.getElementById('retryBtn');

    // ========== STATE ==========
    let currentNickname = '';
    let currentUserId = '';
    let isPublishing = false;
    let isAdmin = false;
    let likedPostIds = new Set();
    let bannedUserIds = new Set();
    let selectedImage = null;
    let refreshInterval = null;

    // ========== UTILS ==========
    function esc(s) {
        return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
    }
    function uid() {
        let id = localStorage.getItem('nobu_user_id');
        if (!id) { id = crypto.randomUUID(); localStorage.setItem('nobu_user_id', id); }
        return id;
    }
    function formatDate(d) {
        if (!d) return '';
        const date = new Date(d);
        const diff = Math.floor((Date.now() - date) / 1000);
        if (diff < 60) return 'только что';
        if (diff < 3600) return Math.floor(diff/60) + ' мин. назад';
        if (diff < 86400) return Math.floor(diff/3600) + ' ч. назад';
        return new Date(d).toLocaleDateString('ru-RU');
    }

    // ========== UI ==========
    function updateUI() {
        const nick = currentNickname || 'Гость';
        nicknameText.textContent = nick;
        composerNickname.textContent = nick;
        avatarInitial.textContent = nick.charAt(0).toUpperCase();
        composerAvatarInitial.textContent = nick.charAt(0).toUpperCase();
        const hasContent = postTextarea.value.trim().length > 0 || selectedImage;
        const blocked = bannedUserIds.has(currentUserId);
        publishBtn.disabled = blocked || !hasContent || !currentNickname || isPublishing;
        if (blocked) {
            composerError.classList.remove('hidden');
            composerErrorText.textContent = 'Вы заблокированы';
        } else {
            composerError.classList.add('hidden');
        }
    }

    // ========== BANS ==========
    async function loadBans() {
        const { data } = await supabase.from('banned_users').select('user_id');
        bannedUserIds = new Set(data ? data.map(r => r.user_id) : []);
        updateUI();
    }
    async function banUser(userId, nickname) {
        await supabase.from('banned_users').upsert({ user_id: userId, nickname: nickname });
        bannedUserIds.add(userId);
        document.querySelectorAll(`.post-card[data-user-id="${userId}"]`).forEach(c => c.remove());
    }

    // ========== LIKES ==========
    async function loadLikes() {
        if (!currentUserId) return;
        const { data } = await supabase.from('likes').select('post_id').eq('user_id', currentUserId);
        likedPostIds = new Set(data ? data.map(r => r.post_id) : []);
    }
    async function toggleLike(postId, btn) {
        const liked = likedPostIds.has(postId);
        likedPostIds[liked ? 'delete' : 'add'](postId);
        btn.classList.toggle('liked', !liked);
        const countEl = btn.querySelector('span');
        countEl.textContent = parseInt(countEl.textContent) + (liked ? -1 : 1);
        if (liked) await supabase.from('likes').delete().match({ post_id: postId, user_id: currentUserId });
        else await supabase.from('likes').insert({ post_id: postId, user_id: currentUserId });
    }

    // ========== POSTS ==========
    function createCard(post) {
        if (bannedUserIds.has(post.user_id)) return null;
        const card = document.createElement('div');
        card.className = 'post-card';
        card.dataset.postId = post.id;
        card.dataset.userId = post.user_id;
        card.dataset.nickname = post.nickname;
        const liked = likedPostIds.has(post.id);
        let imageHtml = '';
        if (post.image_url) {
            imageHtml = `<div class="post-image"><img src="${esc(post.image_url)}" alt="post image"></div>`;
        }
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar">${esc(post.nickname?.charAt(0) || '?')}</div>
                <div class="post-author-info">
                    <span class="post-nickname">${esc(post.nickname || 'Гость')}</span>
                    <span class="post-time">${formatDate(post.created_at)}</span>
                </div>
            </div>
            ${post.content ? `<div class="post-content">${esc(post.content)}</div>` : ''}
            ${imageHtml}
            <div class="post-actions">
                <button class="like-btn ${liked ? 'liked' : ''}">
                    <i class="fas fa-heart"></i> <span>${post.likes || 0}</span>
                </button>
            </div>`;
        card.querySelector('.like-btn').addEventListener('click', () => toggleLike(post.id, card.querySelector('.like-btn')));
        return card;
    }

    async function loadPosts() {
        feedLoading.classList.remove('hidden');
        feedError.classList.add('hidden');
        feedEmpty.classList.add('hidden');
        const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
        postsFeed.querySelectorAll('.post-card').forEach(c => c.remove());
        feedLoading.classList.add('hidden');
        if (!data || data.length === 0) { feedEmpty.classList.remove('hidden'); return; }
        data.forEach(post => {
            const card = createCard(post);
            if (card) {
                postsFeed.appendChild(card);
                if (isAdmin) addAdminButtons(card);
            }
        });
    }

    async function publish() {
        if (isPublishing || bannedUserIds.has(currentUserId)) return;
        const content = postTextarea.value.trim();
        if (!content && !selectedImage) return;
        isPublishing = true;
        publishBtn.disabled = true;
        composerError.classList.add('hidden');
        try {
            let imageUrl = null;
            if (selectedImage) {
                const path = `post-images/${currentUserId}_${Date.now()}.${selectedImage.name.split('.').pop()}`;
                const { error: upErr } = await supabase.storage.from('post-images').upload(path, selectedImage);
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
                imageUrl = urlData.publicUrl;
            }
            const { error: insErr } = await supabase.from('posts').insert({
                user_id: currentUserId,
                nickname: currentNickname,
                content: content,
                likes: 0,
                image_url: imageUrl
            });
            if (insErr) throw insErr;
            postTextarea.value = '';
            selectedImage = null;
            charCount.textContent = '0';
            document.querySelector('.image-preview-container')?.classList.remove('active');
            loadPosts();
        } catch (e) {
            console.error(e);
            composerError.classList.remove('hidden');
            composerErrorText.textContent = 'Ошибка: ' + (e.message || 'неизвестная');
        }
        isPublishing = false;
        updateUI();
    }

    // ========== IMAGE UPLOAD UI ==========
    function setupImageUpload() {
        const composerBody = document.querySelector('.composer-body');
        const toolbar = document.createElement('div');
        toolbar.className = 'composer-toolbar';
        const attachBtn = document.createElement('button');
        attachBtn.className = 'attach-btn';
        attachBtn.innerHTML = '<i class="fas fa-image"></i>';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        const previewContainer = document.createElement('div');
        previewContainer.className = 'image-preview-container';
        const previewImg = document.createElement('img');
        previewImg.className = 'image-preview';
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-image-btn';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        previewContainer.appendChild(previewImg);
        previewContainer.appendChild(removeBtn);
        toolbar.appendChild(attachBtn);
        composerBody.insertBefore(previewContainer, composerBody.querySelector('.composer-footer'));
        composerBody.insertBefore(toolbar, previewContainer);

        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectedImage = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (ev) => { previewImg.src = ev.target.result; previewContainer.classList.add('active'); };
                reader.readAsDataURL(e.target.files[0]);
                updateUI();
            }
        });
        removeBtn.addEventListener('click', () => {
            selectedImage = null;
            previewContainer.classList.remove('active');
            updateUI();
        });
    }

    // ========== ADMIN ==========
    function addAdminButtons(card) {
        const header = card.querySelector('.post-header');
        if (!card.querySelector('.delete-post-btn')) {
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-post-btn';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;margin-left:auto;';
            delBtn.addEventListener('click', async () => {
                if (confirm('Удалить пост?')) {
                    await supabase.from('posts').delete().match({ id: card.dataset.postId });
                    card.remove();
                }
            });
            header.appendChild(delBtn);
        }
        if (!card.querySelector('.block-user-btn')) {
            const blockBtn = document.createElement('button');
            blockBtn.className = 'block-user-btn';
            blockBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
            blockBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;';
            blockBtn.addEventListener('click', async () => {
                if (confirm(`Заблокировать ${card.dataset.nickname}?`)) {
                    await banUser(card.dataset.userId, card.dataset.nickname);
                }
            });
            header.appendChild(blockBtn);
        }
    }

    function setupAdmin() {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'admin-toggle-btn';
        toggleBtn.innerHTML = '<i class="fas fa-shield-haltered"></i>';
        document.body.appendChild(toggleBtn);

        const modal = document.createElement('div');
        modal.className = 'admin-modal';
        modal.innerHTML = `
            <h3>Админ-панель</h3>
            <input type="password" id="adminPasswordInput" placeholder="Пароль">
            <button id="adminLoginBtn">Войти</button>
            <div id="adminError" style="color:red;display:none;">Неверный пароль</div>
        `;
        document.body.appendChild(modal);

        toggleBtn.addEventListener('click', () => modal.classList.toggle('active'));
        document.getElementById('adminLoginBtn').addEventListener('click', () => {
            if (document.getElementById('adminPasswordInput').value === 'nobuadmin2024') {
                isAdmin = true;
                modal.classList.remove('active');
                toggleBtn.classList.add('active');
                document.querySelectorAll('.post-card').forEach(c => addAdminButtons(c));
            } else {
                document.getElementById('adminError').style.display = 'block';
            }
        });
    }

    // ========== INIT ==========
    async function init() {
        currentUserId = uid();
        currentNickname = localStorage.getItem('nobu_nickname') || '';
        await loadBans();
        await loadLikes();
        updateUI();
        if (!currentNickname) { nicknameDisplay.classList.add('hidden'); nicknameEditor.classList.remove('hidden'); }

        setupImageUpload();
        setupAdmin();

        editNicknameBtn.addEventListener('click', () => {
            nicknameDisplay.classList.add('hidden');
            nicknameEditor.classList.remove('hidden');
            nicknameInput.value = currentNickname;
        });
        saveNicknameBtn.addEventListener('click', () => {
            const nick = nicknameInput.value.trim();
            if (!nick) return;
            currentNickname = nick;
            localStorage.setItem('nobu_nickname', nick);
            updateUI();
            nicknameEditor.classList.add('hidden');
            nicknameDisplay.classList.remove('hidden');
        });
        cancelNicknameBtn.addEventListener('click', () => {
            if (!currentNickname) return;
            nicknameEditor.classList.add('hidden');
            nicknameDisplay.classList.remove('hidden');
        });
        postTextarea.addEventListener('input', () => {
            charCount.textContent = postTextarea.value.length;
            updateUI();
        });
        publishBtn.addEventListener('click', publish);
        retryBtn.addEventListener('click', loadPosts);

        await loadPosts();

        supabase.channel('posts-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => loadPosts())
            .subscribe();

        refreshInterval = setInterval(loadPosts, 5000);
        setInterval(loadBans, 10000);

        window.addEventListener('beforeunload', () => clearInterval(refreshInterval));
    }

    document.addEventListener('DOMContentLoaded', init);
})();